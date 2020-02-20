const Trader = require('../trader')

class Bot extends Trader {
    constructor(options) {
        super(options)
        this.targetPrice = null
        this.stopLoss = null
        this.persistence = 0
        this.initialPrices = true
        this.supportData = []
        this.support = null
        this.N = 40
        this.pctOk = false
        this.forcePriceUpdate(3600000)
    }

    executeStrategy() {
        if(!this.isTrading || this.isBuying){ return }
        if(!this.support) {
            console.log('No support')
            return this.emaSupport()
        }
        if(!this.lastPrice || this.lastPrice === 'undefined'){
            this.ticker().then(() => this.lastPrice = this.bid)
        }
        if(this.initialPrices){ this.initPrices() }

        this.checkPrices()
        this.outputTradeInfo()
        
        return 
    }

    initPrices() {
        if(!this.support.length) {return}
        this.websocketPrice()
        this.targetPrice = this.roundToNearest(this.buyPrice * this._TP_p, this.tickSize)
        this.hardStopLoss = this.roundToNearest(this.buyPrice / this._SL_p, this.tickSize)
        this.emaStopLoss = this.roundToNearest(this.support[this.support.length - 1], this.tickSize)
        this.stopLoss = this.roundToNearest(this.support[this.support.length - 1], this.tickSize)
        this.stopLoss = Math.min(this.hardStopLoss, this.emaStopLoss)
        this.sellPrice = 0
        this.initialPrices = false
        console.log(this._SL_p, this.hardStopLoss)
        this.emit('tradeInfo')
    }

    checkPrices() {
        if(this.isSelling && !this.partial && this.lastPrice > this.sellPrice) {
            return this.cancelOrder(this.order)
        }
        if(!this.pctOk){
            this.pctOk = (this.lastPrice / this.buyPrice) > (this._TP_p + this._TRAIL_p) - 1
            this.pctOk && console.log('Minimum profit ok:', this.lastPrice / this.buyPrice, (this._TP_p + this._TRAIL_p) - 1)
        }
        
        if(this.lastPrice >= this.buyPrice * this.TP) {
            console.log('Top target achieved.')
            this.N = 3
            // return this.sell()
        }

        if(this.pctOk){
            if(!this.sellPriceIsSet){
                this.sellPrice = this.roundToNearest(this.buyPrice * 1.015, this.tickSize)
                this.sellPriceIsSet = true
            }
            if(!this.N === 3){
                this.N = 10
            }
        }

        if(this.lastPrice >= this.targetPrice) {
            let sellP = this.targetPrice / this._TRAIL_p
            // sellP = sellP > this.lastPrice ? (this.buyPrice * this._TP_p) * this._TRAIL_p : sellP
            this.sellPrice = this.pctOk ? this.roundToNearest(sellP, this.tickSize) : this.sellPrice
            this.targetPrice = this.roundToNearest((this.targetPrice * this._TP_p), this.tickSize)
            // this.sellPrice = this.pctOk ? this.roundToNearest((this.targetPrice / this._TRAIL_p), this.tickSize) : this.stopLoss
            console.log('Target price updated:', this.targetPrice, this.pctOk, (this.lastPrice / this.buyPrice), (this._TP_p + this._TRAIL_p) - 1)
            this.emit('priceUpdate', this.targetPrice)
            this.emit('tradeInfo')
            return
        }
        
        if(this.lastPrice < this.sellPrice && !this.isSelling) {
            if(this.persistence < 1) {
                this.persistence++
                console.log(`Sell price triggered, persistence activated: ${this.persistence}`)
                this.emit('traderPersistenceTrigger', this.persistence)
                return 
            }
            console.log('Sell price trigered. Selling!')                        
            this.sell({type: 'LIMIT', price: this.lastPrice})
            this.persistence = 0
            return 
        }
        this.persistence > 0 ? this.persistence = 0 : null
        return
    }

    outputTradeInfo() {
        let pct = (this.lastPrice / this.buyPrice) - 1
        pct *= 100
        return console.log(`\nPair: ${this.asset} ${new Date().toTimeString()}\n${pct < 0 ? 'Down' : 'Up'}: ${pct.toFixed(2)}%\nLast Price: ${this.lastPrice}\nBuy Price: ${this.buyPrice}\nSell Price: ${this.sellPrice.toFixed(8)}\nStop Loss: ${this.stopLoss.toFixed(8)}\nTarget Price: ${this.targetPrice.toFixed(8)}\n`)
    }

    forcePriceUpdate(interval) {
        return setInterval(() => this.websocketPrice(), interval)
    }

    emaSupport() {
        this.client.klines({
            symbol: this.product,
            interval: '1h',
            limit: 50
        })
        .then(res => res.map(c => this.supportData.push(this.hl2(c.high, c.low))))
        .then(() => {
            this.support = this.ema(this.supportData, this.N)
            console.log('emaSupport', this.support.slice(-1), this.N)
            const kline = this.websocket.onKline(this.product, '1h', (data) => {
                if (data.kline.final) {
                    // console.debug(data.kline)
                    this.supportData.shift()
                    this.supportData.push(this.hl2(data.kline.high, data.kline.low))
                    this.support = this.ema(this.supportData, this.N)
                    
                    //this.roundToNearest(this.buyPrice / this._SL_p, this.tickSize)
                    
                    // this.sellPrice = this.stopLoss
                    if (+data.kline.close < this.stopLoss) {
                        console.log('Stop Loss trigered. Selling!', +data.kline.close, this.stopLoss)
                        this.sell()
                        kline.close()
                    }
                    //   console.log(EMA(support), data.kline.high)
                }
            })
        }).catch(console.error)
    }

    ema(arr, n = 10) {
        const k = 2 / (n + 1)
        let emaArr = [arr[0]]
        for (let i = 1; i < arr.length; i++) {
            emaArr.push(arr[i] * k + emaArr[i - 1] * (1 - k))
        }
        return emaArr
    }

    hl2(h, l) {
        return (+h + +l) / 2
    }
}

module.exports = Bot