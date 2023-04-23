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
    const is_bool_expr = expr => expr.type == 'bol' || (expr.type == 'binary' && is_bool_op(expr.operator))
    const is_bool_op   = op => ' && || == > < <= >= != '.indexOf(' ' + op + ' ') >= 0 
    const is_val       = cc => ' num str var '.indexOf(' ' + cc.type + ' ') >= 0
    const is_var       = () => { let tok = tokens.peek(); return tok && tok.type == 'var' }
    const is_str       = () => { let tok = tokens.peek(); return tok && tok.type == 'str' }
    const is_num       = () => { let tok = tokens.peek(); return tok && tok.type == 'num' }
    const is_punc      = ch => { let tok = tokens.peek(); return tok && tok.type == 'punc' && (!ch || tok.value == ch) }
    const is_kw        = kw => { let tok = tokens.peek(); return tok && tok.type == 'kw' && (!kw || tok.value == kw) }
    const is_op        = op => { let tok = tokens.peek(); return tok && tok.type == 'op' && (!op || tok.value == op) }
    const is_type      = () => is_kw('num') || is_kw('str') || is_kw('bol')

    // token skipping functions
    const skip_var    = () => is_var() ? tokens.next() : tokens.croak('Expecting variable name:')
    const skip_punc   = ch => is_punc(ch) ? tokens.next() : tokens.croak('Expecting punctuation: \'' + ch + '\'')
    const skip_kw     = kw => is_kw(kw) ? tokens.next() : tokens.croak('Expecting keyword: \'' + kw + '\'')
    const skip_op     = op => is_op(op) ? tokens.next() : tokens.croak('Expecting operator: \'' + op + '\'')
    const skip_type   = () => is_type() ? tokens.next() : tokens.croak('Expecting type name:')

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

    const parse_datatypes = (tok, allowVar = true) => {
        return parse_handler(reject => {
            const current = tok || tokens.next()
            const location = tokens.save()
            if(current.type == 'var' && !allowVar) return
            if(is_val(current)) return { location, ...current }
            if(current.value == 'true' || current.value == 'false') {
                return { 
                    type: 'bol', 
                    value: current.value == 'true', 
                    location: location 
                }
            }
        })
    }

    const parse_signed = () => {
        return parse_handler(reject => {
            const location = tokens.save()
            if(!is_op('-') && !is_op('+')) return; const op = tokens.next()
            const expr = parse_datatypes() || parse_call()
            if(!expr || ['bol','str'].includes(expr.type)) return
            return {
                type: 'signed',
                op: op,
                value: expr,
                location: location
            }
        })
    }

    const parse_assign = () => {
        return parse_handler(reject => {
            const location = tokens.save()
            if(!is_var())       return; const name = skip_var()
            if(!is_op('='))     return

            skip_op('=')

            return {
                type: 'var',
                mode: 'assign',
                name: name.value,
                value: parse_atom(),
                location: location
            }
        })
    }

    const parse_declare = () => {
        return parse_handler(reject => {
            if(!is_punc(':'))   return; skip_punc(':')
            if(!is_var())       return; const name = skip_var()
            if(!is_op('/'))     return; skip_op('/')
            if(!is_type())      return; const value_type = skip_type()
            const location = tokens.save()

            if(!is_op('=')) return {
                type: 'var',
                mode: 'declare',
                name: name.value,
                value: undefined,
                value_type: value_type
            }

            skip_op('=')

            return {
                type: 'var',
                mode: 'declare',
                name: name.value,
                value: parse_atom(),
                value_type: value_type,
                location: location
            }
        })
    }

    const parse_binary = (left, prev_prec = 0) => {
        return parse_handler(reject => {
            const location = tokens.save()
            
            if(is_punc('(') && !left){
                tokens.next()
                const exp = parse_atom()
                skip_punc(')')
                return parse_binary(exp)
            }

            if(!left){
                left =  parse_call() || 
                        parse_prefix() || 
                        parse_postfix() || 
                        parse_datatypes() ||
                        parse_signed()
                if(!left)       return 
                if(!is_op())    return
            }

            if(!is_op()) return left
            if(tokens.peek().value == '=') return parse_assign()

            const op = tokens.peek().value

            if(left.type == 'bol' && !is_bool_op(op)) unexpected()

            // do this if the current prec is bigger
            if(PRECEDENCE[op] > prev_prec) return parse_binary({
                type     : 'binary',
                operator : tokens.next().value,
                left     : left,
                right    : parse_binary(
                    parse_call() || 
                    parse_prefix() || 
                    parse_postfix() || 
                    parse_datatypes() || 
                    parse_signed(), PRECEDENCE[op]),
                location : location
            }, prev_prec)
            return left
        })
    }

    const parse_function = () => {
        return parse_handler(reject => {
            if(!is_var())       return; const name = skip_var().value
            if(!is_punc(':'))   return; skip_punc(':')
            if(!is_op('/'))     return; skip_op('/')
            if(!is_type())      return; const ret_type = skip_type()
            const location = tokens.save()

            const vars = parse_delimited(is_var, () => {
                const arg_var = tokens.next()
                const arg_type = skip_type()
                const location = tokens.save()
                return { ...arg_var, location, arg_type: arg_type }
            }, ',')

            let ALREADY_INSIDE_FUNCTION = INSIDE_FUNCTION
            if(!ALREADY_INSIDE_FUNCTION) INSIDE_FUNCTION = true
            const body = parse_body()
            if(!ALREADY_INSIDE_FUNCTION) INSIDE_FUNCTION = false

            return {
                type: 'func',
                vars: vars,
                name: name,
                body: body,
                location: location,
                ret_type: ret_type
            }
        })
    }

    const parse_call = () => {
        return parse_handler(reject => {
            if(!is_punc('@')) return; skip_punc('@')
            const name = skip_var().value
            const location = tokens.save()
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
                location: location
            }
        }) 
    }

    const parse_return = () => {
        if(!INSIDE_FUNCTION) return

        return parse_handler(reject => {
            if(!is_kw('ret')) return; skip_kw('ret')
            const location = tokens.save()
            return {
                type: 'ret',
                value: parse_atom(),
                location: location
            }
        })
    }

    const parse_if = () => {
        return parse_handler(reject => {
            if(!is_kw('if')) return; skip_kw('if')
            const location = tokens.save()

            const statement = 
                parse_binary() || 
                parse_datatypes() || 
                parse_signed() ||
                parse_call()

            const body = parse_body()
            const _else = parse_else()

            return {
                type        : 'if',
                statement   : statement,
                body        : body,
                else        : _else,
                location    : location
            }
        })
    }

    const parse_else = () => {
        return parse_handler(reject => {
            if(!is_kw('else')) return; skip_kw('else')
            const location = tokens.save()

            if(is_punc('{')) {
                const body = parse_body()
                return {
                    type: 'else',
                    body: body,
                    location: location
                }
            }

            const else_if = parse_if()
            if(else_if) return else_if
        })
    }

    const parse_while = () => {
        return parse_handler(reject => {
            if(!is_kw('while')) return; skip_kw('while')
            const location = tokens.save()

            const statement = 
                parse_binary() || 
                parse_datatypes() || 
                parse_signed() ||
                parse_call()

            // return if it's not a boolean or a boolean binary
            if(!is_bool_expr(statement)) {
                reject()
                skip_kw('while')
                unexpected()
            }

            let ALREADY_INSIDE_LOOP = INSIDE_LOOP
            if(!ALREADY_INSIDE_LOOP) INSIDE_LOOP = true
            const body = parse_body()
            if(!ALREADY_INSIDE_LOOP) INSIDE_LOOP = false

            return {
                type        : 'while',
                statement   : statement,
                body        : body,
                location    : location
            }
        })
    }

    const parse_for = () => {
        return parse_handler(reject => {
            if(!is_kw('for')) return; skip_kw('for')
            const location = tokens.save()
            const _var = parse_declare(); skip_punc(',');
            if(!_var) unexpected()

            const statement = 
                parse_binary() || 
                parse_datatypes() || 
                parse_signed() ||
                parse_call()

            skip_punc(',')
            if(!statement) unexpected()

            const post = parse_assign() ||
                         parse_call()   ||
                         parse_prefix() ||
                         parse_postfix()
            
            let ALREADY_INSIDE_LOOP = INSIDE_LOOP
            if(!ALREADY_INSIDE_LOOP) INSIDE_LOOP = true
            const body = parse_body()
            if(!ALREADY_INSIDE_LOOP) INSIDE_LOOP = false

            return {
                type      : 'for',
                var       : _var,
                statement : statement,
                post      : post,
                body      : body,
                location  : location
            }
        })
    }

    const parse_break = () => {
        if(!is_kw('break')) return
        const location = tokens.save()
        if(!INSIDE_LOOP) unexpected()
        return { ...tokens.next(), location }
    }

    const parse_continue = () => {
        if(!is_kw('continue')) return
        const location = tokens.save()
        if(!INSIDE_LOOP) unexpected()
        return { ...tokens.next(), location }
    }

    const parse_prefix = () => {
        return parse_handler(reject => {
            if(!is_op('++') && !is_op('--')) return;
            const location = tokens.save()
            let op     
            if(is_op('++'))         op = skip_op('++')
            else if(is_op('--'))    op = skip_op('--')
            if(!is_var())           unexpected()
            const name = skip_var().value

            return {
                type: 'prefix',
                name: name,
                op: op,
                location: location
            }
        })
    }

    const parse_postfix = () => {
        return parse_handler(reject => {
            if(!is_var())                    return; const name = skip_var().value
            if(!is_op('++') && !is_op('--')) return;

            const location = tokens.save()
            let op     
            if(is_op('++'))         op = skip_op('++')
            else if(is_op('--'))    op = skip_op('--')

            return {
                type: 'postfix',
                name: name,
                op: op,
                location: location
            }
        })
    }

    const parse_atom = () => {
        try {
            return (
                parse_binary() ||
                parse_prefix() ||
                parse_postfix() ||
                parse_call() ||
                parse_datatypes() || 
                parse_signed() ||
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