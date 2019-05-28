global.WebSocket = require('ws')
const Sockette = require('sockette')
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

const websocket = new api.BinanceWS()

let CACHE = null

const cmsWS = new Sockette('wss://market-scanner.herokuapp.com', {
  timeout: 5e3,
  maxAttempts: 10,
  onopen: e => console.log('Connected!'),
  onmessage: e => {
    const data = JSON.parse(e.data)
    CACHE = data
    return startTrader(data)
  },
  onreconnect: e => console.log('Reconnecting...'),
  onmaximum: e => console.log('Stop Attempting!'),
  onclose: e => console.log('Closed!'),
  onerror: e => console.log('Error:')
})

const startTrader = (data) => {
    const regex = RegExp(/(BTC)$/g)
    const bot = new Trader({
        test: false,
        client,
        base: config.currency,
        websocket
    })
    if (data.hasOwnProperty('to') && data.to == 'trader') {
        // console.log(data)
        if (bot && bot.is_trading) {
            console.log(`Bot is trading!`)
            return
        }
        const pair = data.data.sort((a, b) => {
            return b.prob - a.prob
        }).filter(p => (regex).test(p.pair))
        // console.log(pair)
        if (pair.length === 0) {
            console.log(new Date())
            console.log('No pairs to trade!')
            return
        }
        // if(pair[0].pair === 'BNBBTC'){
        //   pair.shift()
        // }
        console.log(pair)
        let now = Date.now()
        let diff = new Date(now - data.timestamp).getMinutes()
        if (pair[0].pair && diff < 45) {
            bot.startTrading({ pair: pair[0].pair, time: 30000 }).catch(console.error)
        } else {
            console.log(`Signal is outdated! Sent ${diff} minutes ago!`)
        }
    }
    return
}