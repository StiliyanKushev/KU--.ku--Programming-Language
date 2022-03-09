const cmd = require('./cmd')

module.exports = tokens => {
    console.log(tokens)

    let program = []        // holds the parsed tree of the program
    let idx = 0             // holds current index of tokens

    // returns true if token is a begining of another expression
    let endExpression = token => ['declare', 'keyword', 'identifier'].includes(token.type)

    //// "string"
    //// "my string"
    // true
    // false
    // (true and true or false)
    // true and false
    //// 1
    // (1 + 1)
    // 2 + 3
    // myFunc
    // mySumFunc 2, 5

    const parseValueExpression = i => {
        if(tokens[i].type == 'string') {
            idx = i
            return { type: 'literal', value: tokens[i].text.substring(1,tokens[i].text.length - 1) }
        }
        if(tokens[i].type == 'number') {
            let t = i
            let expr = {left: parseValueExpression, right:null, operand:null}
            while(endExpression(tokens[++t])) str += tokens[t].text
            str += tokens[t].text.substring(0, tokens[t].text.length - 1)
            idx = t
            return { type: 'literal', value: str }
        }
        if(tokens[i].type == 'stringstart') {
            let t = i
            let str = tokens[i].text.substring(1)
            while(tokens[++t].type != 'stringend') str += tokens[t].text
            str += tokens[t].text.substring(0, tokens[t].text.length - 1)
            idx = t
            return { type: 'literal', value: str }
        }
    }

    const parseDeclare = i => {
        if(tokens[i + 1].type == 'assign') {
            idx = i
            return { 
                type:   'variableDeclaration', 
                var:    tokens[i].text.substring(1), 
                value:  parseValueExpression(i + 2)
            }
        }
        else if(endExpression(tokens[i + 1]) && tokens[i].text.substring(1).trim().length > 0){
            idx = i
            return {
                type:   'variableDeclaration',
                var:    tokens[i].text.substring(1),
                value:  undefined
            }
        }
        else if(tokens[i].text.substring(1).trim().length == 0) cmd.invalidToken(tokens[i])
        else cmd.invalidToken(tokens[i + 1])
    }

    const parseKeyword = i => {
        // todo
    }

    const parseIdentifier = i => {
        // todo
    } 

    while(tokens[idx]){
        if(tokens[idx].type == 'declare')            program.push(parseDeclare(idx))
        else if(tokens[idx].type == 'keyword')       program.push(parseKeyword(idx))
        else if(tokens[idx].type == 'identifier')    program.push(parseIdentifier(idx))
        else                                         cmd.invalidToken(tokens[idx])
        idx++
    }

    console.log(program)
}