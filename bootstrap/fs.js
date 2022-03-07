const fs = require('fs')
const path = require('path')
const cmd = require('./cmd')

module.exports.getSourceText = () => {
    let filePath = process.argv[2]
    filePath = filePath ? path.resolve(filePath) : null
    if(!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile || !filePath.endsWith('.ku'))
        return cmd.error('Invalid source file path')
    return fs.readFileSync(filePath)
}

module.exports.compileAsm = asm => {
    // todo
}

module.exports.generateAsm = tree => {
    // todo
}