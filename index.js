global.WebSocket = require('ws')
const Sockette = require('sockette')
const Slimbot = require('slimbot')
const api = require('binance')
const readline = require('readline')

const config = require('./config')
const Trader = require(`./strategies/${config.strategy}`)

readline.emitKeypressEvents(process.stdin)
process.stdin.setRawMode(true)

const ID = config.telegramUserID

const telegram = (apikey) => {
    const slimbot = new Slimbot(apikey)
    slimbot.startPolling()
    return slimbot
}

const helpMsg = `
/help: display this list
/info: shows the info for the trade
/pause: pause the trader
/resume: resume trader
/stop: shutdown bot (this will cancel open order and close bot)
/sell: make a limit sell order at the last price (if price not set, bot will try to sell at last price)
`

const infoMsg = (traderBot) => {
    let pct = (traderBot.lastPrice / traderBot.buyPrice) - 1
    pct *= 100
    let msg = `*${traderBot.product}*
    *${pct < 0 ? 'Down' : 'Up'}:* ${pct.toFixed(2)}%
    *Last Price:* ${traderBot.lastPrice}
    *Buy Price:* ${traderBot.buyPrice}
    *Sell Price:* ${traderBot.sellPrice}
    *Stop Loss:* ${traderBot.stopLoss}
    *Target Price:* ${traderBot.targetPrice}`
    return msg
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
const websocket = new api.BinanceWS()

let CACHE = []

slimbot && slimbot.sendMessage(config.telegramUserID, `Trader started`, {
    parse_mode: 'Markdown'
}).catch(console.error)

const cmsWS = new Sockette('wss://market-scanner.herokuapp.com', {
    timeout: 5e3,
    maxAttempts: 10,
    onopen: e => console.log('Connected!'),
    onmessage: e => {
        const data = JSON.parse(e.data)
        if (!data.hasOwnProperty('to')) {
            return
        }
        data.timestamp = Date.now()
        CACHE = data
        return startTrader(data)
    },
    onreconnect: e => console.log('Reconnecting...'),
    onmaximum: e => console.log('Stop Attempting!'),
    onclose: e => console.log('Closed!'),
    onerror: e => console.log('Error:')
})

let bot = null

function botReportTelegram(traderBot) {
    if (!config.telegram || !slimbot) {
        return
    } 
    traderBot.on('tradeStart', () => {
        let msg = `Buying ${traderBot.asset}.`
        slimbot.sendMessage(ID, msg, {
            parse_mode: 'Markdown'
        }).catch(console.error)
    })

    traderBot.on('tradeResume', () => {
        let msg = `Resuming ${traderBot.asset} trade.`
        slimbot.sendMessage(ID, msg, {
            parse_mode: 'Markdown'
        }).catch(console.error)
    })

    traderBot.on('tradeInfo', () => {
        let pct = (traderBot.lastPrice / traderBot.buyPrice) - 1
        pct *= 100
        let msg = `*${traderBot.product}*
        *${pct < 0 ? 'Down' : 'Up'}:* ${pct.toFixed(2)}%
        *Last Price:* ${traderBot.lastPrice}
        *Buy Price:* ${traderBot.buyPrice}
        *Sell Price:* ${traderBot.sellPrice}
        *Stop Loss:* ${traderBot.stopLoss}
        *Target Price:* ${traderBot.targetPrice}`
        slimbot.sendMessage(ID, msg, {
            parse_mode: 'Markdown'
        }).catch(console.error)
    })

    traderBot.on('tradeInfoStop', () => {
        let msg = `${traderBot.asset} trade ended!`
        slimbot.sendMessage(ID, msg, {
            parse_mode: 'Markdown'
        }).catch(console.error)
    })

    traderBot.on('traderCheckOrder', (msg) => {
        slimbot.sendMessage(ID, msg, {
            parse_mode: 'Markdown'
        }).catch(console.error)
    })

    traderBot.on('traderPersistenceTrigger', (count) => {
        let msg = `Sell price triggered, persistence activated: ${count}!`
        slimbot.sendMessage(ID, msg, {
            parse_mode: 'Markdown'
        }).catch(console.error)
    })

    traderBot.on('priceUpdate', (price) => {
        let upPct = (price / traderBot.buyPrice) - 1
        upPct *= 100
        let msg = `Target price for ${traderBot.asset} updated: ${price.toFixed(8)}. New target ${upPct.toFixed(2)}%`
        slimbot.sendMessage(ID, msg, {
            parse_mode: 'Markdown'
        }).catch(console.error)
    })

    traderBot.on('traderSold', (price) => {
        let msg = `Sold ${traderBot.asset} for ${price}!`
        slimbot.sendMessage(ID, msg, {
            parse_mode: 'Markdown'
        }).catch(console.error)
        // trader = null
    })

    traderBot.on('filledOrder', (price) => {
        let msg = `Bought ${traderBot.asset} for ${price}!`
        slimbot.sendMessage(ID, msg, {
            parse_mode: 'Markdown'
        }).catch(console.error)
    })

    traderBot.on('traderEnded', (restart) => {
        slimbot.sendMessage(ID, `Trader ended`, {
            parse_mode: 'Markdown'
        }).then(() => {
            if (!restart) {
                console.log(CACHE)
                startTrader(CACHE)
            }
        })
        .catch(console.error)
    })
}

function telegramCommand() {
    if (!config.telegram || !slimbot) {
        return
    }    
    const ID = config.telegramUserID
    console.debug('Reports started!')
    // TELEGRAM_REPORT = true
    slimbot.on('message', msg => {
        const action = msg.text.split()
        switch (true) {
            case action[0] === '/help':
                slimbot.sendMessage(ID, helpMsg, {
                    parse_mode: 'Markdown'
                })
                break
            case bot && action[0] === '/info':
                slimbot.sendMessage(ID, infoMsg(bot), {
                    parse_mode: 'Markdown'
                })
                break
            case action[0] === '/stop':
                slimbot.sendMessage(ID, 'Stopping Trader!', {
                    parse_mode: 'Markdown'
                })
                console.log('Telegram stop command!')
                close()
                break
            case bot && action[0] === '/sell':
                let price = action[1] ? action[1] : bot.lastPrice
                slimbot.sendMessage(ID, `Sell message received! Selling ${bot.asset} for ${price}.`)
                bot.sell({
                    price: price
                })
                break
            case bot && action[0] === '/pause':
                slimbot.sendMessage(ID, `Stopping trader! To resume write "resume".`)
                bot.stopTrading({
                    cancel: (bot.isBuying || bot.isSelling) ? true : false,
                    userStop: true
                })
                break
            case bot && action[0] === '/resume':
                slimbot.sendMessage(ID, `Resuming trader on ${bot.asset}!`)
                startTrader(null, true)
                break
            default:
                slimbot.sendMessage(ID, `Action not recognized! Type /help for a list of commands.`)
                break
        }
    })
}

async function close() {
    console.log('Stopping Trader Bot')
    CACHE = null
    if (bot) {
        await bot.stopTrading({
            cancel: (bot.isBuying || bot.isSelling) ? true : false,
            userStop: true
        })
    }
    await cmsWS.close()
    return process.exit(0)
}

function keypress() {
    if (!bot) {
        return setTimeout(keypress, 3000)
    }
    return process.stdin.on('keypress', (str, key) => {
        if (key.ctrl && key.name === 'c') {
            // process.exit()
            close()
        }        
        if (key.ctrl && key.name === 's') {
            if (!bot.isTrading || bot.isBuying || bot.isSelling) {
                console.log('Bot is not trading!')
            } else {
                console.log('Panic selling!!')
                bot.sell()
            }
        } else {
            console.log(`You pressed the "${str}" key`)
        }
    })
}

async function startTrader(data, telegramAction = false) {
    if (bot && bot.isTrading) {
        console.log(`Bot is trading on ${bot.asset}`)
        return
    }
    const regex = RegExp(/(BTC)$/g)
    if(!telegramAction){
        bot = new Trader({
            test: false,
            client,
            websocket,
            base: config.currency,
            TP: (config.TAKE_PROFIT / 100) + 1,
            TP_p: (config.PARTIAL_TP / 100) + 1,
            SL: (config.STOP_LIMIT / 100) + 1,
            TRAIL: (config.TRAILING_SL / 100) + 1,
            maxBalance: config.MAX_BALANCE
        })
    }

    await bot.isLastTradeOpen()
    if (bot.isResuming) {
        bot.startTrading({
            pair: bot.product,
            time: config.interval
        }).catch(console.error)
    }
    if(!bot.isResuming && !data) {return}
    if (!bot.isResuming && data && data.hasOwnProperty('to') && data.to == 'trader') {
        // console.log(data)
        if (bot && bot.is_trading) {
            console.log(`Bot is trading!`)
            return
        }
        const pair = data.data.sort((a, b) => {
                return b.prob - a.prob
            })
            .filter(p => p.prob > 0.9)
            .filter(p => (regex).test(p.pair))
            .filter(p => p.pair !== bot.lastPair) // don't trade on last pair
        // console.log(pair)
        if (pair.length === 0) {
            console.log(new Date())
            console.log('No pairs to trade!')
            return
        }
        console.log(pair)
        let now = Date.now()
        let diff = new Date(now - data.timestamp).getMinutes()
        if (diff < 15) { //if signal is more than 15 minutes, wait for next 
            let x = null
            for (let i = 0; i < pair.length; i++) {
                await bot.startTrading({
                        pair: pair[i].pair,
                        time: config.interval
                    })
                    .then(res => {
                        x = res
                        console.log(pair[i], res)
                    }).catch(console.error)
                if(x) {break}
            }
        } else {
            console.log(`Signal is outdated! Sent ${diff} minutes ago!`)
        }
    }
    return botReportTelegram(bot)
}

// startTrader()
keypress()
telegramCommand()
