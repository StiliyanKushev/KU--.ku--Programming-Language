// import all file system related functions
const { getSourceText, generateAsm, compileAsm } = require('./fs')

const raw       = getSourceText()                 // Fetch the input file
const reader    = require('./reader')(raw)        // Functions for handling reading input
const tokenizer = require('./tokenizer')(reader)  // Give each word a meaning (operant, keyword, variable, etc)

console.log(tokenizer.peek())
while(tokenizer.next()) console.log(tokenizer.peek())


// const par       = require('./parser')(lex)        // Parse tokens into a program tree
// const asm       = generateAsm(par)                // Generate nasm x86-64 assembly
// compileAsm(asm)                                   // Compile the .asm file to native 