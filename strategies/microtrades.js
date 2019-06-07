const Trader = require('../trader')

class Bot extends Trader {
    constructor(options) {
        super(options)
        this.TP = 1.3
        this._TP_p = 1.025
        this._SL_p = 1.035
        this._TRAIL_p = 1.005
        this.targetPrice = null
        this.stopLoss = null
        this.persistence = 0
        this.initialPrices = true
        this.forcePriceUpdate(3600000)
    }

    executeStrategy() {
        if(!this.isTrading){ return }
        if(!this.lastPrice || this.lastPrice === 'undefined'){
            this.websocketPrice()
        }
        if(this.initialPrices){ this.initPrices() }

        this.outputTradeInfo()

        this.checkPrices()
        return 
    }

    initPrices() {
        this.targetPrice = this.roundToNearest(this.buyPrice * this._TP_p, this.tickSize)
        this.stopLoss = this.roundToNearest(this.buyPrice / this._SL_p, this.tickSize)
        this.sellPrice = this.stopLoss
        this.initialPrices = false
    }

    checkPrices() {
        if(this.isSelling) {return}
        if(this.lastPrice >= this.buyPrice * this.TP) {
            console.log('Top target achieved. Selling!')
            return this.sell()
        }
        if(this.lastPrice >= this.targetPrice) {
            this.sellPrice = this.roundToNearest((this.targetPrice / this._TRAIL_p), this.tickSize)
            if((this.sellPrice / this.buyPrice) < this._TP_p){
                this.sellPrice = this.targetPrice - this.tickSize
            }
            this.targetPrice = this.roundToNearest((this.targetPrice * this._TP_p), this.tickSize)
            console.log('Sell price updated:', this.sellPrice)
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
            return this.sell()
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

}

module.exports = Bot