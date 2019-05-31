const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')

const adapter = new FileSync(`./logs/log.json`)
const db = low(adapter)

// Set some defaults (required if your JSON file is empty)
db.defaults({
    balance: [],
    trades: [],
    errors: []
}).write()

module.exports = db