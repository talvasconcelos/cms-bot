// const db = require('./logger')

// // Add a post
// db.get('trades')
//   .push({
//     timestamp: Date.now(),
//     pair: 'ABCBTC',
//     state: Math.random() < 0.5 ? 'opened' : 'closed'                            
//   })
//   .write()

// const x = db.get('trades')
//   .last()  
//   .value()

// // return x === 'closed' ? 'false' : 'true'
// // console.log(db.getState())
// console.log(x.state === 'closed' ? false : true, x.state)

const api = require('binance')
const config = require('./config')
const Trader = require(`./strategies/${config.strategy}`)

const client = new api.BinanceRest({
  key: config.API_KEY, // Get this from your account on binance.com
  secret: config.API_SECRET, // Same for this
  timeout: 15000, // Optional, defaults to 15000, is the request time out in milliseconds
  recvWindow: 20000, // Optional, defaults to 5000, increase if you're getting timestamp errors
  disableBeautification: false,
  handleDrift: true
})

const bot = new Trader({
  test: false,
  client,
  base: config.currency,
  websocket: null,
  maxBalance: 50 //Percentage. 0 to disable
})

async function test() {
  bot.asset = 'XLM'
  await bot.syncBalances()
  return bot.balances
}

test().then(console.log)
