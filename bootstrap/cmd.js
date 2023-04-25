const fs    = require('fs')
const path  = require('path')
const cmd   = require('./cmd')

module.exports.help = () => {
    console.log('Usage: node index /path/to/file.ku [options]')
    console.log('Options:')
    console.log('  -h, --help\t\t\tShow this help message')
    console.log('  -v, --version\t\t\tShow version')
    console.log('  -o, --output\t\t\tOutput file path')
    console.log('  -c, --compile\t\t\tCompile to native')
    console.log('  -a, --ast\t\t\tPrint AST')
    console.log('  -m, --asm\t\t\tPrint ASM')
    process.exit(0)
}

module.exports.get_source_code = source => {
    source = source ? path.resolve(source) : null
    if(!source || !fs.existsSync(source) || !fs.statSync(source).isFile || !source.endsWith('.ku'))
        return cmd.error('Invalid source file path')
    return fs.readFileSync(source).toString()
}

module.exports.get_options = () => {
    if(!process.argv[2]) {
        this.error('No source file specified')
    }

    let options = {}
    options.source = process.argv[2]

    for(let i = 3; i < process.argv.length; i++) {
        let arg = process.argv[i]
        if(arg.startsWith('-')) {
            if(arg == '-h' || arg == '--help') {
                options.help = true
            } else if(arg == '-v' || arg == '--version') {
                options.version = true
            } else if(arg == '-o' || arg == '--output') {
                options.output = process.argv[++i]
            } else if(arg == '-c' || arg == '--compile') {
                options.compile = true
            } else if(arg == '-a' || arg == '--ast') {
                options.ast = true
            } else if(arg == '-m' || arg == '--asm') {
                options.asm = true
            } else {
                this.error(`Invalid option: ${arg}`)
            }
        } else {
            this.error(`Invalid option: ${arg}`)
        }
    }

    // check for required options
    if((options.compile && !options.output) || (!options.compile && options.output)) {
        this.error('Invalid options: --compile and --output must be used together')
    }
    if(options.asm && !options.compile) {
        this.error('Invalid options: --asm can only be used with --compile')
    }

    return options
}

module.exports.print_ast = ast => {
    console.dir(ast, { depth: null })
    console.log('-'.repeat(process.stdout.columns))
}

module.exports.error = err => {
    console.error(err)
    this.help()
}

module.exports.exit_error = err => {
    console.error(err)
    process.exit(1)
}