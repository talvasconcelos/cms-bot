const utils = {
    roundToNearest: (numToRound, numToRoundTo) => {
        numToRoundTo = 1 / (numToRoundTo)
        let nearest = Math.floor(numToRound * numToRoundTo) / numToRoundTo
        return Math.round(nearest * 100000000) / 100000000
    }
}

module.exports = utils