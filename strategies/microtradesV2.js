const Trader = require('../trader')

class Bot extends Trader {
    constructor(options) {
        super(options)
        this.TP = 1.3
        this._TP_p = 1.02
        this._SL_p = 1.015
        this._TRAIL_p = 1.005
        this.targetPrice = null
        this.stopLoss = null
        this.persistence = 0
        this.initialPrices = true
        this.supportData = []
        this.support = null
        this.forcePriceUpdate(3600000)
    }

    executeStrategy() {
        if(!this.isTrading){ return }
        if(!this.support) {
            console.log('No support')
            return this.emaSupport()
        }
        if(!this.lastPrice || this.lastPrice === 'undefined'){
            this.websocketPrice()
        }
        if(this.initialPrices){ this.initPrices() }

        this.checkPrices()
        this.outputTradeInfo()

        return 
    }

    initPrices() {
        if(!this.support.length) {return}
        this.targetPrice = this.roundToNearest(this.buyPrice * this._TP_p, this.tickSize)
        this.stopLoss = this.roundToNearest(this.support[this.support.length - 1], this.tickSize)
        this.sellPrice = this.stopLoss + (this.tickSize * 2)
        this.initialPrices = false
    }

    checkPrices() {
        if(this.isSelling) {return}
        if(this.lastPrice >= this.buyPrice * this.TP) {
            console.log('Top target achieved. Selling!')
            return this.sell()
        }
        if(this.lastPrice >= this.targetPrice) {
            this.targetPrice = this.roundToNearest((this.targetPrice * this._TP_p), this.tickSize)
                        
            console.log('Target price updated:', this.targetPrice)
            this.emit('priceUpdate', this.targetPrice)
            return
        }
        if(this.lastPrice <= this.stopLoss) {
            console.log('Stop Loss trigered. Selling!')        
            return this.sell()
        }
        if(this.lastPrice < this.sellPrice) {
            if(this.persistence <= 2) {
                this.persistence++
                console.log(`Sell price triggered, persistence activated: ${this.persistence}`)
                this.emit('traderPersistenceTrigger', this.persistence)
                return 
            }
            console.log('Trailing Stop Loss trigered. Selling!')
            this.persistence = 0            
            return this.sell({type: 'LIMIT'})
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
            this.support = this.ema(this.supportData)
            console.log('emaSupport', this.support.slice(-1))
            this.websocket.onKline(this.product, '1h', (data) => {
                if (data.kline.final) {
                    this.supportData.shift()
                    this.supportData.push(this.hl2(data.kline.high, data.kline.low))
                    this.support = this.ema(this.supportData)
                    this.stopLoss = this.roundToNearest(this.support[this.support.length - 1], this.tickSize)
                    this.sellPrice = this.stopLoss + (this.tickSize * 2)
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