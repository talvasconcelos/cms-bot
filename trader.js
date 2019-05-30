const EventEmitter = require('events')
const continuous = require('continuous')
const db = require('./logger')

class Trader extends EventEmitter{
    constructor(opts){
        super(opts)
        this.test = opts.test
        this.client = opts.client
        this.websocket = opts.websocket
        this.maxBalance = opts.maxBalance || null
        this.base = opts.base || 'BTC'
        this.product = null
        this.buyPrice = null
        this.sellPrice = null
        this.log = db
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
        this.log.get('balance')
                .push(this.balances.base)
                .write()
    }

    async startTrading(opts) {
        opts = opts || {}
        this.product = opts.pair
        opts.callback = this.executeStrategy.bind(this)
        if(this.isTrading) { return false }

        const timer = new continuous(opts)
        timer.on('stopped', () => {
            this.isTrading = false
            console.log('Trader end.')
            this.log.get('balance')
                .push(this.balances.base)
                .write()
            return resolve()
        })
        timer.on('started', () => {
            this.isTrading = true
            this.websocketPrice()
            console.log('Start strategy')
            return true
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
        const balance = this.maxBalance ? this.maxBalance : this.balances.base
        const price = this.roundToNearest(this.bestPrice, this.tickSize)
        const qty = this.roundToNearest((balance / price), this.minQty)
        
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
        let price = Utils.roundToNearest(this.lastPrice, this.tickSize)
        let qty = this.roundToNearest(this.balances.asset, this.minQty)
        return this.addOrder({
            side: 'SELL',
            price: price.toFixed(8),
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
                if(result && result.code < 0) {
                    console.log(`Order as an error:`, result)
                    this.log.get('errors')
                        .push({timestamp: Date.now(), error: result})
                        .write()
                    return false
                }
                if(result && result.status === 'FILLED'){ 
                    this.retry = 0
                    this.buyPrice = result.price
                    this.syncBalances()
                    console.log('order filled')
                    return true 
                }
                this.order = result
                this.log.get('orders')
                    .push({timestamp: Date.now(), order: this.order})
                    .write()
                result.side === 'BUY' ? this.isBuying = true : this.isSelling = true
                return setTimeout(() => {
                    return this.checkOrder(this.order)
                }, 5000)
            })
            .catch(err => {
                console.error(err)
                this.log.get('errors')
                    .push({timestamp: Date.now(), error: err})
                    .write()
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
            OrderID: ${data.orderId}
            Price: ${data.price}
            Qty: ${data.executedQty}/${data.origQty}
            buying: ${this.isBuying}
            selling: ${this.isSelling}`
            console.log(msg)

            if(canceledManually) { return false }

            if(filled) { 
                data.side === 'BUY' ? this.isBuying = false : this.isSelling = false
                this.retry = 0
                this.buyPrice = data.price
                this.syncBalances()
                if(data.side === 'SELL') {
                    this.log
                        .get('balance')
                        .push(this.balances.base)
                        .get('orders')
                        .push({timestamp: Date.now(), order: this.order})
                        .write()
                } else {
                    this.log
                        .get('orders')
                        .push({timestamp: Date.now(), order: this.order})
                        .write()
                }
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
            this.log.get('errors')
                .push({timestamp: Date.now(), error: err})
                .write()
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
            this.log
                .get('orders')
                .push({timestamp: Date.now(), order: data})
                .write()
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
        if(!feed || !this.product) { return }
        feed.onAggTrade(this.product, msg => {
            this.lastPrice = msg.price
        })
    }
}

module.exports = Trader