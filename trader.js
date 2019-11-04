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
        this.isResuming = false
        this.log = db
        this.TP = opts.TP || 1.05
        this._TP_p = opts.TP_p || 1.025
        this._SL_p = opts.SL || 1.025
        this._TRAIL_p = opts.TRAIL || 1.005
        // this.keypress()
    }

    reset(){
        this.product = null
        this.buyPrice = null
        this.sellPrice = null
        this.isTrading = false
        this.isBuying = false
        this.isSelling = false
        this.support = null
        this.initialPrices = true
        this.persistence = 0
        this.targetPrice = null
        this.stopLoss = null
        this.persistence = 0
        this.initialPrices = true
        this.supportData = []
        this.support = null
        this.N = 40
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
        this.websocketPrice()
        // this.log.get('balance')
        //         .push(this.balances.base)
        //         .write()
    }

    isLastTradeOpen() {
        const last = this.log.get('trades').last().value()
        if(!last) {return false}
        if(last.state === 'closed') {
            this.lastPair = last.pair
            console.log('Last trade closed!')
            return false
        } else {
            console.log('Last trade open!')
            this.product = last.pair
            this.buyPrice = +last.price
            this.isResuming = true
            return last
        }
    }

    async startTrading(opts) {
        opts = opts || {}
        this.product = opts.pair
        opts.callback = this.executeStrategy.bind(this)
        if(this.isTrading) { return false }
        if(this.product === 'BNBBTC'){ return false } //don't trade on BNBBTC, cause I use it for fees

        const timer = new continuous(opts)
        timer.on('stopped', () => {
            this.isTrading = false
            this.emit('traderEnded', this.userStop)
            this.telegramInfoStop()
            console.log('Trader end.')
            if (!this.userStop) {
                this.log.get('balance')
                    .push(this.balances.base)
                    .write()
            }
            return
        })
        timer.on('started', () => {
            this.isTrading = true
            this.telegramInfoStart()
            console.log('Start strategy')
            return true
        })
        this.timer = timer        
        await this.initTrader()
        if(!this.isResuming){
            console.log('Not resuming last trade!')
            this.emit('tradeStart')
            const buy = await this.buy()
            if(!buy) { 
                await this.stopTrading()
                return false
            }
        } 
        if(this.isResuming) {
            this.emit('tradeResume')
        }
        timer.start()
        return true
    }

    stopTrading(opts) {
        if(!this.isTrading) { return }
        opts = opts || { cancel: false }
        this.userStop = opts.userStop ? true : false
        const cancel = opts.cancel ? this.cancelOrder(this.order) : Promise.resolve()
        return cancel.then(() => {
            // this.reset()
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
        const calcBalance = (bal) => {
            let maxBalance = (this.maxBalance / 100) * bal
            return maxBalance
        }
        const balance = this.maxBalance ? calcBalance(this.balances.base) : this.balances.base
        const price = this.roundToNearest(this.bestPrice, this.tickSize)
        const qty = this.roundToNearest((balance / price), this.minQty)
        
        if (price * qty < this._minOrder) {
            console.error('Minimum order must be', this._minOrder + '.')
            return false
        }
        if(price < 0.00000199){
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

    async sell(opts) {
        //Needs some refactoring on price and type
        opts = opts || {}
        await this.syncBalances()
        await this.midmarket_price()
        let price = this.roundToNearest(opts.price ? opts.price : this.bestPrice, this.tickSize)
        let qty = this.roundToNearest(this.balances.asset, this.minQty)
        return this.addOrder({
            side: 'SELL',
            price: price.toFixed(8),
            quantity: qty,
            type: opts.type || 'MARKET'
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
                if(result.side === 'BUY'){ this.buyPrice = result.price }
                /*if(result.status === 'FILLED'){
                    this.retry = 0
                    await this.syncBalances()
                    await this.ticker()
                    console.log('order filled')
                    this.log.get('trades')
                        .push({
                            timestamp: Date.now(),
                            pair: this.product,
                            price: result.side === 'BUY' ? this.buyPrice : this.bid,
                            state: result.side === 'BUY' ? 'opened' : 'closed'
                        })
                        .write()
                    if(result.side === 'SELL'){
                        this.emit('traderSold', this.bid)
                        return this.stopTrading()
                    }
                    this.emit('filledOrder', this.buyPrice)
                    return true
                }*/
                this.order = result
                // this.log.get('orders')
                //     .push({timestamp: Date.now(), order: this.order})
                //     .write()
                result.side === 'BUY' ? this.isBuying = true : this.isSelling = true
                return setTimeout(() => {
                    return this.checkOrder(this.order)
                }, 5000)
            })
            .catch(err => {
                console.error(err)
                this.log.get('errors')
                    .push({timestamp: Date.now(), pair: this.product, error: err})
                    .write()
                this.stopTrading()
                return false
            })
    }

    checkOrder(order) {
        this.retry++
        if(this.retry > 8 && this.isBuying) {
            return this.stopTrading({cancel: true})
        }
        return this.client.queryOrder({
            symbol: order.symbol,
            orderId : order.orderId
        }).then(async data => {
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
            Status: ${data.status}
            buying: ${this.isBuying}
            selling: ${this.isSelling}`
            this.emit('traderCheckOrder', msg)
            

            if(canceledManually) { return false }

            if(filled) { 
                this.retry = 0
                if(data.side === 'SELL') {
                    this.isSelling = false
                    await this.ticker()
                    await this.syncBalances()
                    console.log(data)
                    this.emit('traderSold', data.price)
                    this.log
                        .get('balance')
                        .push(this.balances.base)
                        .write()
                    this.log
                        .get('trades')
                        .push({
                            timestamp: Date.now(),
                            pair: this.product,
                            price: data.type === 'LIMIT' ? data.price : this.bid,
                            state: 'closed'
                        })
                        .write()
                    console.log(msg)
                    return this.stopTrading()
                } 
                if(data.side === 'BUY') {
                    this.isBuying = false
                    this.buyPrice = data.price
                    await this.syncBalances()
                    this.emit('filledOrder', this.buyPrice)
                    this.log
                        .get('trades')
                        .push({
                            timestamp: Date.now(),
                            pair: this.product,
                            price: this.buyPrice,
                            state: 'opened'                       
                        })
                        .write()
                    console.log(msg)
                }
                return true
            }

            // if(expired) {
            //     return data.side === 'BUY' ? this.buy() : this.sell()
            // }

            if(stillThere) {
                if(data.status === 'PARTIALLY_FILLED'){
                    this.partial = true
                    return setTimeout(() => this.checkOrder(this.order), 60000)
                }
                if(this.retry > 3 && data.side === 'BUY'){
                    return this.stopTrading({cancel: true})
                }
                if(this.retry > 5 && data.side === 'SELL'){
                    return this.cancelOrder(this.order)
                        .then(() => this.sell(this.retry > 10 ? {type: 'MARKET'} : {}))
                }
                return setTimeout(() => this.checkOrder(this.order), 60000)
            }
        })
        .catch(err => {
            console.error(err)
            this.log.get('errors')
                .push({timestamp: Date.now(), pair: this.product, error: err})
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
            // this.log
            //     .get('orders')
            //     .push({timestamp: Date.now(), order: data})
            //     .write()
        }).catch(console.error)
    }

    syncBalances() {
        return this.client.account()
            .then(data => {
                const base = data.balances.find(b => b.asset === this.base).free
                const asset = data.balances.find(b => b.asset === this.asset).free
                this.balances = {
                    base: base,
                    asset: asset
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

    ticker() {
        return this.client.bookTicker({symbol: this.product})
            .then(res => {
                this.bid = res.bidPrice
                this.ask = res.askPrice
            })
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

    telegramInfoStart(options) {
        options = options || {}
        let time = options.time || 1.8e+6
        this.telegramInfo = setInterval(() => {
            this.emit('tradeInfo')
        }, time)
    }

    telegramInfoStop() {
        clearInterval(this.telegramInfo)
        this.telegramInfo = null
        this.emit('tradeInfoStop')
    }
}

module.exports = Trader