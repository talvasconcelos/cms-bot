const Trader = require('../trader')

class Bot extends Trader {
    constructor(options) {
        super(options)
        this.forcePriceUpdate(3600000)
    }

    executeStrategy() {
        // This runs once every minute
        // Your startegy runs here
    }

    forcePriceUpdate(interval) {
        // Sometimes connection gets lost, this forces it to reconnect
        return setInterval(() => this.websocketPrice(), interval)
    }

}

module.exports = Bot