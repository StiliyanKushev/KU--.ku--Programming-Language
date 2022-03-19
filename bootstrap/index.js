// import all file system related functions
const { getSourceText, generateAsm, compileAsm } = require('./fs')

const raw       = getSourceText()                 // Fetch the input file
const reader    = require('./reader')(raw)        // Functions for handling reading input
const tokenizer = require('./tokenizer')(reader)  // Give each word a meaning (operant, keyword, variable, etc)
const ast       = require('./parser')(tokenizer)  // Parse tokens into a program tree
const asm       = generateAsm(ast())              // Generate nasm x86-64 assembly
compileAsm(asm)                                   // Compile the .asm file to native