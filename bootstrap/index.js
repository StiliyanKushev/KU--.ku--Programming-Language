// import all file system related functions
const { getSourceText, generateAsm, compileAsm } = require('./fs')

const raw = getSourceText()                 // Fetch the input file
const tok = require('./tokenizer')(raw)     // Split raw text to words
const lex = require('./lexer')(tok)         // Give each word a meaning (operant, keyword, variable, etc)
const par = require('./parser')(lex)        // Parse tokens into a program tree
const asm = generateAsm(par)                // Generate nasm x86-64 assembly
compileAsm(asm)                             // Compile the .asm file to native 