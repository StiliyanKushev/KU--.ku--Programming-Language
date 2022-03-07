module.exports.help = () => {
    console.log('Usage: node index /path/to/file.sk')
    process.exit(0)
}

module.exports.error = err => {
    console.error("[error] " + err + "!")
    this.help()
}