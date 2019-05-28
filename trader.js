const EventEmitter = require('events')
const continuous = require('continuous')

class Trader extends EventEmitter{
    constructor(opts){
        super(opts)
        this.test = opts.test
        this.client = opts.client
        this.websocket = opts.websocket
        this.base = opts.base || 'BTC'
        this.product = null
        this.buyPrice = null
        this.sellPrice = null
    }

    async initTrader() {
        const market = await this.client.exchangeInfo().then(info => {
            return info.symbols.find(m => m.symbol === this.product.toUpperCase())
        })
        this.asset = market.baseAsset
        this.minQty = market.filters[2].minQty
        this.tickSize = market.filters[0].tickSize
        this.minOrder = market.filters[3].minNotional
        this.retry = 0
        await this.syncBalances()
        await this.midmarket_price()
    }

    async startTrading(opts) {
        opts = opts || {}
        this.product = opts.pair
        opts.callback = this.executeStrategy//.bind(this)
        if(this.isTrading) { return false }

        const timer = new continuous(opts)
        timer.on('stopped', () => {
            this.isTrading = false
            return resolve()
        })
        timer.on('started', () => {
            this.isTrading = true
        })
        this.timer = timer
        await this.initTrader()        
        const buy = await this.buy()
        if(!buy) { return this.stopTrading() }
        timer.start()
        return true
    }

    stopTrading(opts) {
        if(!this.isTrading) { return }
        opts = opts || { cancel: false }
        const cancel = opts.cancel ? this.cancelOrder(this.order) : Promise.resolve()
        return cancel.then(() => {
            this.timer.stop()
            return
        })
    }

    executeStrategy() {
        return Promise.resolve()
    }

    buy(opts) {
        opts = opts || {}
        if(!this.product) {
            console.log(`No pair specified!`)
            return false
        }
        if(this.balances.base < this.minOrder) {
            console.log(`Insuficient funds!`)
            return false
        }

        const price = this.roundToNearest(this.bestPrice, this.tickSize)
        const qty = this.roundToNearest((this.balances.base / price), this.minQty)
        
        if (price * qty < this._minOrder) {
            console.error('Minimum order must be', this._minOrder + '.')
            return false
        }
        if(price < 0.00000099){
            console.log('Price too low!')
            return false
        }
        const order = {
            side: 'BUY',
            quantity: qty,
            price: price.toFixed(8)
        }
        if(opts.market) {order.type = 'MARKET'}

        return this.addOrder(order)
    }

    sell() {
        let qty = this.roundToNearest(this.balances.asset, this.minQty)
        return this.addOrder({
            side: 'SELL',
            quantity: qty,
            type: 'MARKET'
        })
    }

    addOrder(opts) {
        console.log(this.product)
        console.log(`${opts.side.toLowerCase()}ing ${opts.quantity} ${this.asset} at ${opts.price}`)
        const order = {
            symbol: this.product,
            side: opts.side,
            type: opts.type || 'LIMIT',
            price: opts.price,
            timeInForce: opts.timeInForce || 'GTC',
            quantity: opts.quantity,
            timestamp: new Date().getTime()
        }
        
        if(opts.type === 'MARKET'){
            delete order.price
            delete order.timeInForce
        }
        const executeOrder = this.test ? this.client.testOrder(order) : this.client.newOrder(order)
        return executeOrder
            .then(result => {
                if(result && result.status === 'FILLED'){ 
                    this.retry = 0
                    return true 
                }
                result.side === 'BUY' ? this.isBuying = true : this.isSelling = true
                return setTimeout(() => {
                    return this.checkOrder(this.order)
                }, 5000)
            })
            .catch(err => {
                console.error(err)
                return false
            })
    }

    checkOrder(order) {
        this.retry++
        if(this.retry > 4) {
            return this.stopTrading({cancel: true})
        }
        return this.client.queryOrder({
            symbol: order.symbol,
            orderId : order.orderId
        }).then(data => {
            let filled = data.status === 'FILLED'
            let stillThere = data.status === 'NEW' || data.status === 'PARTIALLY_FILLED'
            let canceledManually = data.status === 'CANCELED' || data.status === 'REJECTED'
            let expired = data.status === 'EXPIRED'
            this.order = data

            let msg = `${data.side}: ${this.product}
            Status: ${data.status}
            OrderID: ${self._order_id}
            Price: ${data.price}
            Qty: ${data.executedQty}/${data.origQty}
            buying: ${self._is_buying}
            selling: ${self._is_selling}`
            console.log(msg)

            if(canceledManually) { return false }

            if(filled) { 
                data.side === 'BUY' ? this.isBuying = false : this.isSelling = false
                this.retry = 0
                return data.side === 'BUY' ? true : this.stopTrading()
            }

            if(expired) {
                return data.side === 'BUY' ? this.buy() : this.sell()
            }

            if(stillThere) {
                if(this.retry > 3){
                    return this.buy({market: true})
                }
                return setTimeout(this.checkOrder(this.order), 30000)
            }
        })
        .catch(err => {
            console.error(err)
            return false
        })
    }

    cancelOrder(order) {
        return this.client.cancelOrder({
            symbol: order.symbol,
            orderId : order.orderId
        }).then(data => {
            data.side === 'BUY' ? this.isBuying = false : this.isSelling = false
            console.log(`Order canceled!`)
        }).catch(console.error)
    }

    syncBalances() {
        return this.client.account()
            .then(data => {
                const base = data.balances.find(b => b.asset === this.base).free
                const asset = data.balances.find(b => b.asset === this.asset).free
                this.balances = {
                    base,
                    asset
                }
                // console.log(this.balances)
            })
    }

    roundToNearest(numToRound, numToRoundTo) {
        numToRoundTo = 1 / (numToRoundTo)
        let nearest = Math.floor(numToRound * numToRoundTo) / numToRoundTo
        return Math.round(nearest * 100000000) / 100000000
    }

    milliToMin(time) {
        let minutes = Math.floor(time / 60000)
        let seconds = ((time % 60000) / 1000).toFixed(0)
        return (seconds == 60 ? (minutes + 1) + ":00" : minutes + ":" + (seconds < 10 ? "0" : "") + seconds)
    }

    midmarket_price() {
        return this.client.bookTicker({symbol: this.product})
        .then(book => {
            const bid = book.bidPrice
            const ask = book.askPrice
            if (bid && ask) {
                this.bestPrice = (0.5 * (+bid + +ask)).toFixed(8)
            }
            else {
                this.bestPrice = false
            }
        })
        .catch(console.error)
    }

    websocketPrice() {
        const feed = this.websocket
        if(!feed) { return }
        feed.onAggTrade(this.product, msg => {
            this.lastPrice = msg.price
        })
    }
}

module.exports = Trader