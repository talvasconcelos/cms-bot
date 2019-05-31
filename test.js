const db = require('./logger')

// Add a post
db.get('trades')
  .push({
    timestamp: Date.now(),
    pair: 'ABCBTC',
    state: Math.random() < 0.5 ? 'opened' : 'closed'                            
  })
  .write()

const x = db.get('trades')
  .last()  
  .value()

// return x === 'closed' ? 'false' : 'true'
// console.log(db.getState())
console.log(x.state === 'closed' ? false : true, x.state)
  