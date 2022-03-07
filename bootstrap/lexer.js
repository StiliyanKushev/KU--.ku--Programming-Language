module.exports = tokens => {
    for(let [i, token] of tokens.entries()){
        const text = token.text
        const first = text[0]
        const last = text[text.length - 1]

        if(first == ':')             tokens[i].type = 'declare'
        else if(first == '=')        tokens[i].type = 'assign'
        else if(!isNaN(token.text))  tokens[i].type = 'number'
        else if(first == '{')        tokens[i].type = 'lbrack'
        else if(first == '}')        tokens[i].type = 'rbrack'
        else if(first == '[')        tokens[i].type = 'lsbrack'
        else if(first == ']')        tokens[i].type = 'rsbrack'
        else if(first == '-')        tokens[i].type = 'aritmetic'
        else if(first == '+')        tokens[i].type = 'aritmetic'
        else if(first == '*')        tokens[i].type = 'aritmetic'
        else if(first == '/')        tokens[i].type = 'aritmetic'
        else if(first == '"')        tokens[i].type = 'stringstart'
        else if(last == '"')         tokens[i].type = 'stringend'
        else if(text == 'true')      tokens[i].type = 'bool'
        else if(text == 'false')     tokens[i].type = 'bool'
        else                         tokens[i].type = 'other'
    }
    console.log(tokens)
}