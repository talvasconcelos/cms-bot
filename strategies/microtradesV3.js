const Trader = require("../trader");

class Bot extends Trader {
  constructor(options) {
    super(options);
    this.forcePriceUpdate(3600000);
    this.armTarget = null;
    this.trailingStopArmed = false;
    this.stopLoss = 0;
  }

  async executeStrategy() {
    if (!this.isTrading || this.isBuying) {
      return;
    }
    if (!this.armTarget) {
      this.armTarget = this.roundToNearest(
        this.buyPrice * this._TP_p,
        this.tickSize
      );
    }
    if (!this.lastPrice || this.lastPrice === "undefined") {
      await this.ticker().then(() => (this.lastPrice = this.bid));
      this.websocketPrice();
    }
    if (this.trailingStopArmed) {
      this.checkTrade();
    } else {
      this.armTrailingStop();
    }
    this.outputTradeInfo();
  }

  checkTrade() {
    // Check if stop is hit
    if (this.lastPrice < this.stopLoss) {
      console.log("Sell price trigered. Selling!");
      this.sell({ type: "LIMIT", price: this.lastPrice });
    }
    const sellPrice = this.roundToNearest(
      this.lastPrice / this._TRAIL_p,
      this.tickSize
    );
    if (sellPrice > this.stopLoss) {
      this.stopLoss = sellPrice;
    }
  }

  armTrailingStop() {
    const isArmed = this.lastPrice > this.armTarget;
    this.trailingStopArmed = isArmed;
    if (isArmed) {
      this.stopLoss = this.roundToNearest(
        this.lastPrice / this._TRAIL_p,
        this.tickSize
      );
      console.log(`Trailing Stop Loss Armed.`);
    }
  }

  outputTradeInfo() {
    let pct = this.lastPrice / this.buyPrice - 1;
    pct *= 100;
    return console.log(
      `\nPair: ${this.asset} ${new Date().toTimeString()}\n${
        pct < 0 ? "Down" : "Up"
      }: ${pct.toFixed(2)}%\nLast Price: ${this.lastPrice}\nBuy Price: ${
        this.buyPrice
      }\nStop Loss: ${this.stopLoss.toFixed(8)}${
        !this.trailingStopArmed ? "\nTarget: " + this.armTarget : ""
      }`
    );
  }

  forcePriceUpdate(interval) {
    // Sometimes connection gets lost, this forces it to reconnect
    return setInterval(() => this.websocketPrice(), interval);
  }
}

module.exports = Bot;
