const db = require('./logger')

// Add a post
db.get('balance')
  .push(5.6)
  .write()

console.log(db.getState())