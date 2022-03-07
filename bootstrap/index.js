// import all file system related functions
const { getSourceText, generateAsm, compileAsm } = require('./fs')

const rawSource = getSourceText()           // Fetch the input file
const lex = require('./lexer')(rawSource)   // Split raw text to words
const tok = require('./tokenizer')(lex)     // Give each word a meaning (operant, keyword, variable, etc)
const par = require('./parser')(tok)        // Parse tokens into a program tree
const asm = generateAsm(par)                // Generate nasm x86-64 assembly
compileAsm(asm)                             // Compile the .asm file to native 