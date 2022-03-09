module.exports.help = () => {
    console.log('Usage: node index /path/to/file.sk')
    process.exit(0)
}

module.exports.error = err => {
    console.error(err)
    this.help()
}

module.exports.exit_error = err => {
    console.error(err)
    process.exit(0)
}