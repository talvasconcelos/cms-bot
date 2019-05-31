const Trader = require('../trader')

class Bot extends Trader {
    constructor(options) {
        super(options)
        this.TP = 1.3
        this._TP_p = 1.02
        this._SL_p = 1.03
        this._TRAIL_p = 1.005
        this.targetPrice = null
        this.stopLoss = null
        this.persistence = 0
        this.initialPrices = true
        this.forcePriceUpdate(3600000)
    }

    executeStrategy() {
        if(!this.isTrading){ return }
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
        if(this.lastPrice > this.buyPrice * this.TP) {
            console.log('Top target achieved. Selling!')
            return this.sell()
        }
        if(this.lastPrice > this.targetPrice) {
            this.sellPrice = this.roundToNearest(this.targetPrice / this._TRAIL_p, this.tickSize)
            this.targetPrice = this.roundToNearest(this.targetPrice * this._TP_p, this.tickSize)
            console.log('Sell price updated:', this.sellPrice)
            console.log('Target price updated:', this.targetPrice)
            return
        }
        if(this.lastPrice <= this.stopLoss) {
            console.log('Stop Loss trigered. Selling!')
            
            return this.sell()
        }
        if(this.lastPrice <= this.sellPrice) {
            if(this.persistence <= 2) {
                console.log(`Sell price triggered, persistence activated: ${this.persistence}`)
                return this.persistence++
            }
            console.log('Trailing Stop Loss trigered. Selling!')
            this.persistence = 0
            
            return this.sell()
        }
        this.persistence > 0 ? this.persistence = 0 : null
        return
    }

    outputTradeInfo() {
        return console.log(`\nPair: ${this.asset} ${new Date().toTimeString()}\nLast Price: ${this.lastPrice}\nBuy Price: ${this.buyPrice}\nSell Price: ${this.sellPrice.toFixed(8)}\nStop Loss: ${this.stopLoss.toFixed(8)}\nTarget Price: ${this.targetPrice.toFixed(8)}\n`)
    }

    forcePriceUpdate(interval) {
        return setInterval(() => this.websocketPrice(), interval)
    }

}

module.exports = Bot