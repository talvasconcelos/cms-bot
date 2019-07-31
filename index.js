global.WebSocket = require('ws')
const Sockette = require('sockette')
const Slimbot = require('slimbot')
const api = require('binance')
const config = require('./config')
const Trader = require(`./strategies/${config.strategy}`)

const telegram = (apikey) => {
    const slimbot = new Slimbot(apikey)
    slimbot.startPolling()
    return slimbot
}

const slimbot = config.telegram ? telegram(config.telegramAPI) : null

const client = new api.BinanceRest({
    key: config.API_KEY, // Get this from your account on binance.com
    secret: config.API_SECRET, // Same for this
    timeout: 15000, // Optional, defaults to 15000, is the request time out in milliseconds
    recvWindow: 20000, // Optional, defaults to 5000, increase if you're getting timestamp errors
    disableBeautification: false,
    handleDrift: true
})

let CACHE = null

slimbot && slimbot.sendMessage(config.telegramUserID, `Trader started`, {parse_mode: 'Markdown'}).catch(console.error)

const cmsWS = new Sockette('wss://market-scanner.herokuapp.com', {
  timeout: 5e3,
  maxAttempts: 10,
  onopen: e => console.log('Connected!'),
  onmessage: e => { 
    const data = JSON.parse(e.data)
    if (!data.hasOwnProperty('to')) { return }
    return startTrader(data)
  },
  onreconnect: e => console.log('Reconnecting...'),
  onmaximum: e => console.log('Stop Attempting!'),
  onclose: e => console.log('Closed!'),
  onerror: e => console.log('Error:')
})

let bot = null

const telegramReport = (e) => {
    if (!config.telegram || !slimbot) { return }
    const ID = config.telegramUserID

    e.on('tradeStart', () => {
        let msg = `Buying ${bot.asset}.`
        slimbot.sendMessage(ID, msg, { parse_mode: 'Markdown' }).catch(console.error)
    })

    e.on('tradeInfo', () => {
        let pct = (e.lastPrice / e.buyPrice) - 1
        pct *= 100
        let msg = `*${e.product}*
        *${pct < 0 ? 'Down' : 'Up'}:* ${pct.toFixed(2)}%
        *Last Price:* ${e.lastPrice}
        *Buy Price:* ${e.buyPrice}
        *Sell Price:* ${e.sellPrice}
        *Stop Loss:* ${e.stopLoss}
        *Target Price:* ${e.targetPrice}`
        slimbot.sendMessage(ID, msg, { parse_mode: 'Markdown' }).catch(console.error)
    })

    e.on('tradeInfoStop', () => {
        let msg = `${e.asset} trade ended!`
        slimbot.sendMessage(ID, msg, { parse_mode: 'Markdown' }).catch(console.error)
    })

    e.on('traderCheckOrder', (msg) => {
        slimbot.sendMessage(ID, msg, { parse_mode: 'Markdown' }).catch(console.error)
    })

    e.on('traderPersistenceTrigger', (count) => {
        let msg = `Sell price triggered, persistence activated: ${count}!`
        slimbot.sendMessage(ID, msg, { parse_mode: 'Markdown' }).catch(console.error)
    })

    e.on('priceUpdate', (price) => {
        let upPct = (price / e.buyPrice) - 1
        upPct *= 100
        let msg = `Target price for ${e.asset} updated: ${price.toFixed(8)}. New target ${upPct.toFixed(2)}%`
        slimbot.sendMessage(ID, msg, { parse_mode: 'Markdown' }).catch(console.error)
    })

    e.on('traderSold', (price) => {
        let msg = `Sold ${e.asset} for ${price}!`
        slimbot.sendMessage(ID, msg, { parse_mode: 'Markdown' }).catch(console.error)
    })

    e.on('filledOrder', (price) => {
        let msg = `Bought ${e.asset} for ${price}!`
        slimbot.sendMessage(ID, msg, { parse_mode: 'Markdown' }).catch(console.error)
    })

    e.on('traderEnded', (restart) => {
        slimbot.sendMessage(ID, `Trader ended`, { parse_mode: 'Markdown' }).catch(console.error)
        if(!restart){ startTrader(CACHE) }
    })
}

const startTrader = async (data) => {
    if(bot && bot.isTrading) {
        console.log(`Bot is trading on ${bot.asset}`)
        return
    }
    const regex = RegExp(/(BTC)$/g)
    const websocket = new api.BinanceWS()

    bot = new Trader({
        test: false,
        client,
        base: config.currency,
        websocket,
        maxBalance: 0 //Percentage. 0 to disable
    })

    await bot.isLastTradeOpen()
    if(bot.isResuming) {
        bot.startTrading({ pair: bot.product, time: config.interval }).catch(console.error)
    }
    if (!bot.isResuming && data && data.hasOwnProperty('to') && data.to == 'trader') {
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
        
        console.log(pair)
        CACHE = pair
        let now = Date.now()
        let diff = new Date(now - data.timestamp).getMinutes()
        if (diff < 15) {
            let x = null
            for (let i = 0; i < pair.length; i++) {
                if(pair.prob < 0.998) {
                    break
                }
                await bot.startTrading({ pair: pair[i].pair, time: config.interval })
                    .then(res => {
                        x = res
                        console.log(pair[i], res)
                    }).catch(console.error)
                if (x) {
                    CACHE.splice(i, 1)
                    break
                }
            }
                // pair.some(p => {
                //     return bot.startTrading({pair: p.pair, time: 30000}).catch(console.error)
                // })
                // bot.startTrading({ pair: pair[0].pair, time: 30000 })
                // .then(res => {
                //     if(!res && pair[1].pair){
                //         bot.startTrading({ pair: pair[1].pair, time: 30000 })
                //     }
                // })
                // .catch(console.error)
            } else {
                console.log(`Signal is outdated! Sent ${diff} minutes ago!`)
            }
        }
        telegramReport(bot)
        return bot
}

process.on('SIGINT', async () => {
    console.log('Stopping Trader Bot')
    CACHE = null
    if(bot) {
        await bot.stopTrading({
            cancel: (bot.isBuying || bot.isSelling) ? true : false,
            userStop: true
            })
    }
    await cmsWS.close()
    process.exit(0)
})