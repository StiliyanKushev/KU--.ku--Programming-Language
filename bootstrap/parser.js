module.exports = tokens => {
    // the z-index of operators basically
    const PRECEDENCE = {
        '=': 1, '||': 2, '&&': 3,
        '<': 7, '>': 7, '<=': 7, '>=': 7, '==': 7, '!=': 7,
        '+': 10, '-': 10,
        '*': 20, '/': 20, '%': 20,
    }

    // variables holding the current scope the parser is in
    let INSIDE_FUNCTION = false
    let INSIDE_LOOP     = false

    // token validating functions
    const is_bool_expr = expr => expr.type == 'bool' || (expr.type == 'binary' && is_bool_op(expr.operator))
    const is_bool_op   = op => ' && || == > < <= >= != '.indexOf(' ' + op + ' ') >= 0 
    const is_val       = cc => ' num str var '.indexOf(' ' + cc.type + ' ') >= 0
    const is_var       = () => { let tok = tokens.peek(); return tok && tok.type == 'var' }
    const is_str       = () => { let tok = tokens.peek(); return tok && tok.type == 'str' }
    const is_num       = () => { let tok = tokens.peek(); return tok && tok.type == 'num' }
    const is_punc      = ch => { let tok = tokens.peek(); return tok && tok.type == 'punc' && (!ch || tok.value == ch) }
    const is_kw        = kw => { let tok = tokens.peek(); return tok && tok.type == 'kw' && (!kw || tok.value == kw) }
    const is_op        = op => { let tok = tokens.peek(); return tok && tok.type == 'op' && (!op || tok.value == op) }
    
    // token skipping functions
    const skip_var    = () => is_var() ? tokens.next() : tokens.croak('Expecting variable name:')
    const skip_punc   = ch => is_punc(ch) ? tokens.next() : tokens.croak('Expecting punctuation: \'' + ch + '\'')
    const skip_kw     = kw => is_kw(kw) ? tokens.next() : tokens.croak('Expecting keyword: \'' + kw + '\'')
    const skip_op     = op => is_op(op) ? tokens.next() : tokens.croak('Expecting operator: \'' + op + '\'')
    
    // helper functions 
    const unexpected = () => tokens.croak('Unexpected token: ' + JSON.stringify(tokens.peek()))

    const parse_body = () => {
        skip_punc('{')
        const body = parse_prog(() => tokens.peek().value != '}')
        skip_punc('}')
        return body
    }
    
    const parse_handler = func => {
        const _old = tokens.save()
        const reject = () => { tokens.update(_old); return false }
        const result = func(reject)
        if(!result) reject()
        return result
    }

    const parse_delimited = (is_func, handler, divider) => {
        let arr = []
        while(true){
            if(!is_func(tokens.peek())) return arr
            arr.push(handler())
            if(!is_punc(divider)) break
            skip_punc(divider)
        }
        return arr
    }

    // parsing functions
    const parse_datatypes = (tok, allowVar = true) => {
        return parse_handler(reject => {
            const current = tok || tokens.next()
            if(current.type == 'var' && !allowVar) return
            if(is_val(current)) return current
            if(current.value == 'true' || current.value == 'false') return { type: 'bool', value: current.value == 'true' }
        })
    }

    const parse_assign = () => {
        return parse_handler(reject => {
            if(!is_var())       return; const name = skip_var()
            if(!is_op('='))     return

            skip_op('=')

            return {
                type: 'var',
                mode: 'assign',
                name: name.value,
                value: parse_atom()
            }
        })
    }

    const parse_declare = () => {
        return parse_handler(reject => {
            if(!is_punc(':'))   return;              skip_punc(':')
            if(!is_var())       return; const name = skip_var()

            if(!is_op('=')) return {
                type: 'var',
                mode: 'declare',
                name: name.value,
                value: undefined
            }

            skip_op('=')

            return {
                type: 'var',
                mode: 'declare',
                name: name.value,
                value: parse_atom()
            }
        })
    }

    const parse_binary = (left, prev_prec = 0) => {
        return parse_handler(reject => {
            if(is_punc('(') && !left){
                tokens.next()
                const exp = parse_atom()
                skip_punc(')')
                return parse_binary(exp)
            }

            if(!left){
                left = parse_call() || parse_prefix() || parse_postfix() || parse_datatypes() || parse_typeof()
                if(!left)       return 
                if(!is_op())    return
            }

            if(!is_op()) return left
            if(tokens.peek().value == '=') return parse_assign()

            const op = tokens.peek().value

            if(left.type == 'bool' && !is_bool_op(op)) unexpected()

            // do this if the current prec is bigger
            if(PRECEDENCE[op] > prev_prec) return parse_binary({
                type     : 'binary',
                operator : tokens.next().value,
                left     : left,
                right    : parse_binary(parse_prefix() || parse_postfix() || parse_datatypes(), PRECEDENCE[op])
            }, prev_prec)
            return left
        })
    }

    const parse_function = () => {
        return parse_handler(reject => {
            if(!is_var())       return; const name = skip_var().value
            if(!is_punc(':'))   return;              skip_punc(':')

            const vars = parse_delimited(is_var, tokens.next, ',')

            INSIDE_FUNCTION = true
            const body = parse_body()
            INSIDE_FUNCTION = false

            return {
                type: 'func',
                vars: vars,
                name: name,
                body: body,
            }
        })
    }

    const parse_call = () => {
        return parse_handler(reject => {
            if(!is_punc('@')) return; skip_punc('@')
            const name = skip_var().value
            const args = parse_delimited(() => {
                if(tokens.eof()) return false
                const _pre_args = tokens.save()
                const valid = parse_atom() != undefined
                tokens.update(_pre_args)
                return valid
            }, parse_atom, ',')

            return {
                type: 'call',
                name: name,
                args: args,
            }
        }) 
    }

    const parse_return = () => {
        if(!INSIDE_FUNCTION) return

        return parse_handler(reject => {
            if(!is_kw('ret')) return; skip_kw('ret')
            return {
                type: 'ret',
                value: parse_atom()
            }
        })
    }

    const parse_if = () => {
        return parse_handler(reject => {
            if(!is_kw('if')) return; skip_kw('if')

            const statement = parse_binary() || parse_datatypes()

            // return if it's not a boolean or a boolean binary
            if(!is_bool_expr(statement)) {
                reject()
                skip_kw('if')
                unexpected()
            }
            
            const body = parse_body()
            const _else = parse_else()

            return {
                type        : 'if',
                statement   : statement,
                body        : body,
                else        : _else
            }
        })
    }

    const parse_else = () => {
        return parse_handler(reject => {
            if(!is_kw('else')) return;  skip_kw('else')
            if(is_punc('{')) {
                const body = parse_body()
                return {
                    type: 'else',
                    body: body
                }
            }

            const else_if = parse_if()
            if(else_if) return else_if
        })
    }

    const parse_while = () => {
        return parse_handler(reject => {
            if(!is_kw('while')) return; skip_kw('while')

            const statement = parse_binary() || parse_datatypes()

            // return if it's not a boolean or a boolean binary
            if(!is_bool_expr(statement)) {
                reject()
                skip_kw('while')
                unexpected()
            }

            INSIDE_LOOP = true
            const body = parse_body()
            INSIDE_LOOP = false

            return {
                type        : 'while',
                statement   : statement,
                body        : body
            }
        })
    }

    const parse_for = () => {
        return parse_handler(reject => {
            if(!is_kw('for')) return;       skip_kw('for')
            const _var = parse_assign();    skip_punc(','); const s_var = tokens.save()
            if(!_var)                       unexpected()

            const _con = parse_binary();    skip_punc(',')
            if(!_con)                       unexpected()
            
            if(!is_bool_expr(_con)){
                reject()
                tokens.update(s_var)
                unexpected()
            }

            const post =    parse_assign() ||
                            parse_call()   ||
                            parse_prefix() ||
                            parse_postfix()
            
            const body = parse_body()

            return {
                type      : 'for',
                var       : _var,
                condition : _con,
                post      : post,
                body      : body
            }
        })
    }

    const parse_break = () => {
        if(!is_kw('break')) return
        if(!INSIDE_LOOP)   unexpected()
        return tokens.next()
    }

    const parse_continue = () => {
        if(!is_kw('continue')) return
        if(!INSIDE_LOOP)   unexpected()
        return tokens.next()
    }

    const parse_typeof = () => {
        return parse_handler(reject => {
            if(!is_kw('typeof')) return; skip_kw('typeof')
            if(!is_var())    unexpected()
            const name = skip_var().value

            return {
                type: 'typeof',
                name: name,
            }
        })
    }

    const parse_prefix = () => {
        return parse_handler(reject => {
            if(!is_op('++')) return;    skip_op('++')
            if(!is_var())    unexpected()
            const name = skip_var().value

            return {
                type: 'prefix',
                name: name,
            }
        })
    }

    const parse_postfix = () => {
        return parse_handler(reject => {
            if(!is_var())    return;    const name = skip_var().value
            if(!is_op('++')) return;    skip_op('++')
            return {
                type: 'postfix',
                name: name,
            }
        })
    }

    const parse_atom = () => {
        try {
            return (
                parse_typeof() ||
                parse_binary() ||
                parse_prefix() ||
                parse_postfix() ||
                parse_return() ||
                parse_call() ||
                parse_datatypes() || 
                undefined
            )
        } catch { unexpected() }
    }

    const parse_any = () => {
        try {
            return (
                parse_break() ||
                parse_continue() ||
                parse_if() ||
                parse_binary() ||
                parse_prefix() ||
                parse_postfix() ||
                parse_return() ||
                parse_call() ||
                parse_while() ||
                parse_for() ||
                parse_function() || 
                parse_assign() ||
                parse_declare() ||
                parse_datatypes(null, false) ||  
                unexpected()
            )
        } catch { return unexpected() }
    }

    const parse_prog = rule => {
        let prog = []
        while (!tokens.eof() && (rule ? rule() : true)) {
            let _tokens = parse_any()
            Array.isArray(_tokens) ? prog.push(..._tokens) : prog.push(_tokens)
        }
        return { type: 'prog', prog: prog }
    }

    return parse_prog
}