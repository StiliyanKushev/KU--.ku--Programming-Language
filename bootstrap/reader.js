const cmd = require('./cmd')

module.exports = raw => {
    // global information about read
    let pos = 0, line = 1, col = 0

    // get current char and goes to next position
    const next = () => [raw.charAt(pos++), raw.charAt(pos) == '\n' ? line++ && (col = 0) : col++ ][0]

    // get current char without moving position
    const peek = () => raw.charAt(pos)

    // throw error at current position
    const croak = msg => cmd.exit_error(`${msg} (${line}:${col})`)

    // returns true if we reached end of file
    const eof = () => peek() == ''

    return { next, peek, eof, croak }
}