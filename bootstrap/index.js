const { 
    simulate_ast 
} = require('./simulate')
const { 
    generate_asm, 
    compile_asm
} = require('./compile')
const {
    get_options,
    get_source_code,
    help,
    version,
    print_ast
} = require('./cmd')

const options   = get_options()
const raw       = get_source_code(options.source)   // Fetch the input file
const reader    = require('./reader')(raw)          // Functions for handling reading input
const tokenizer = require('./tokenizer')(reader)    // Give each word a meaning (operant, keyword, variable, etc)
const ast       = require('./parser')(tokenizer)()  // Parse tokens into a program tree

if     (options.help)       help()
else if(options.version)    version()
else if(options.ast)        print_ast(ast)
else if(options.compile)    compile_asm(generate_asm(ast), options.output)
else if(!options.compile)   simulate_ast(ast)