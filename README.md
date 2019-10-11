# Coin Market Scanner Bot

### Coin Market Scanner Bot, or CMS Bot, is a command line cryptocurrency trading bot using  NodeJS.

CMS Bot currently works on Binance's BTC pairs only. It gets AI signals (different ones from website) from [Coin Market Scanner](https:coinmarketscanner.app), and trades them with the rules defined in the strategy.

## Disclaimer
CMS Bot is in Alpha version and it has bugs. Use this only if you understand the code and what it does. 

Running a bot, and trading in general requires careful study of the risks and parameters involved. A wrong setting can cause you a major loss.

__USE IT AT YOUR OWN RISK.__

## Getting Started
In you console run:
```
git clone https://github.com/talvasconcelos/cms-bot.git
cd cms-bot && npm i
```
Inside the bot folder, create a config file by copying the *sample_config.js* file and rename it to *config.js*. 

- View and edit your configuration file.
- There is no paper trading, yet. You'll be trading live!
- You must add your exchange (Binance) API keys.
- API keys do NOT need deposit/withdrawal permissions.

## Start CMS Bot
To start the bot, if everything is configured, just type on your console or terminal:
```
npm start
```
While running, the bot will log to the console and if configured, to Telegram. 

In the console, you can trigger a panic sell by hitting the "s" key. On Telegram enter *"/help"* to see a list of possible commands.

## Strategies
Choose a strategy from the *strategies* folder or create one for your trading style.

## Contributions 
I'll 

## Donate
I'll take donations in BTC only at:

bc1qgmcx92mx60kglywavrdnu0hlvh6q3v7vxz5aqv

