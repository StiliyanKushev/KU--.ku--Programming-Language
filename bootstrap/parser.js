module.exports = tokens => {
    // the z-index of operators basically
    const PRECEDENCE = {
        '=': 1, '&': 1, '^': 1, '|': 1, '||': 2, '&&': 3,
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
    const is_val       = cc => ' num str var chr dec '.indexOf(' ' + cc.type + ' ') >= 0
    const is_var       = () => { let tok = tokens.peek(); return tok && tok.type == 'var' }
    const is_str       = () => { let tok = tokens.peek(); return tok && tok.type == 'str' }
    const is_dec       = () => { let tok = tokens.peek(); return tok && tok.type == 'dec' }
    const is_num       = () => { let tok = tokens.peek(); return tok && tok.type == 'num' }
    const is_punc      = ch => { let tok = tokens.peek(); return tok && tok.type == 'punc' && (!ch || tok.value == ch) }
    const is_kw        = kw => { let tok = tokens.peek(); return tok && tok.type == 'kw' && (!kw || tok.value == kw) }
    const is_op        = op => { let tok = tokens.peek(); return tok && tok.type == 'op' && (!op || tok.value == op) }
    const is_type      = () => is_kw('num') || is_kw('str') || is_kw('bol') || is_kw('chr') || is_kw('dec')

    // token skipping functions
    const skip_var    = () => is_var() ? tokens.next() : tokens.croak('Expecting variable name:')
    const skip_punc   = ch => is_punc(ch) ? tokens.next() : tokens.croak('Expecting punctuation: \'' + ch + '\'')
    const skip_kw     = kw => is_kw(kw) ? tokens.next() : tokens.croak('Expecting keyword: \'' + kw + '\'')
    const skip_op     = op => is_op(op) ? tokens.next() : tokens.croak('Expecting operator: \'' + op + '\'')
    const skip_type   = () => is_type() ? tokens.next() : tokens.croak('Expecting type name:')
    const skip_str    = () => is_str() ? tokens.next() : tokens.croak('Expecting string:')
    const skip_num    = () => is_num() ? tokens.next() : tokens.croak('Expecting number:')

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
                    type        : 'bol', 
                    value       : current.value == 'true', 
                    location    : location 
                }
            }
        })
    }

    const parse_signed = () => {
        return parse_handler(reject => {
            const location = tokens.save()

            if(!is_punc('(')) return; skip_punc('(')
            if(!is_op('-') && !is_op('+')) return; const op = tokens.next()
            const expr = parse_datatypes() || parse_call()
            if(!expr) return
            if(!is_punc(')')) return; skip_punc(')')

            return {
                type        : 'signed',
                op          : op,
                value       : expr,
                location    : location
            }
        })
    }

    const parse_assign = () => {
        return parse_handler(reject => {
            const location = tokens.save()
            if(!is_var())       return; const name = skip_var()
            if(!is_op('='))     return; skip_op('=')

            return {
                type        : 'var',
                mode        : 'assign',
                name        : name.value,
                value       : parse_atom(),
                location    : location
            }
        })
    }

    const parse_memory_assign = () => {
        return parse_handler(reject => {
            const location    = tokens.save()
            if(!is_punc(':'))   return; skip_punc(':')
            if(!is_punc(':'))   return; skip_punc(':')
            const address     = parse_atom()
            if(!is_op('/'))     return; skip_op('/')
            if(!is_type())      return; let as_type = skip_type()

            if(is_punc('[')) {
                as_type.value += '[]'
                skip_punc('[')
                skip_punc(']')
            }

            if(!is_op('='))     return; skip_op('=')

            return {
                type        : 'massign',
                address     : address,
                as_type     : as_type,
                value       : parse_atom() || 
                              parse_inline_array(as_type) ||
                              unexpected(),
                location    : location
            }
        })
    }

    function parse_inline_array(value_type) {
        if(!is_punc('[')) return
        const location = tokens.save()
        skip_punc('[')
        const values = parse_delimited(
            () => true, 
            () => ({ location: tokens.save(), value: parse_atom() }), 
            ',')
        skip_punc(']')
        return {
            type: 'inline_array',
            values: values,
            value_type: value_type,
            location
        }
    }

    const parse_declare = () => {
        return parse_handler(reject => {
            if(!is_punc(':'))   return; skip_punc(':')
            if(!is_var())       return; const name = skip_var()
            if(!is_op('/'))     return; skip_op('/')
            if(!is_type())      return; let value_type = skip_type()

            const location = tokens.save()
            let is_array, array_size

            if(is_punc('[')) {
                is_array = true
                value_type.value += '[]'
                skip_punc('[')
                is_num() && (array_size = skip_num())
                skip_punc(']')
            }

            if(is_array && array_size && is_op('=')) {
                unexpected()
            }

            if(is_array && !array_size && !is_op('=')) {
                unexpected()
            }

            // if an empty array with predefined size is
            // typed, we'll just mock an inline array (zero'ed out)
            function mock_inline_array() {
                if(!is_array || !array_size) {
                    return
                }
                return {
                    type: 'inline_array',
                    values: undefined,
                    array_size: array_size,
                    value_type: value_type,
                    location
                }
            }

            if(!is_op('=')) return {
                type        : 'var',
                mode        : 'declare',
                name        : name.value,
                value       : mock_inline_array() || undefined,
                value_type  : value_type,
            }

            skip_op('=')

            return {
                type        : 'var',
                mode        : 'declare',
                name        : name.value,
                value       : parse_atom() || 
                              parse_inline_array(value_type) ||
                              unexpected(),
                value_type  : value_type,
                location    : location,
            }
        })
    }

    const parse_binary = (left, prev_prec = 0) => {
        return parse_handler(reject => {
            const location = tokens.save()
            
            if(is_punc('(') && !left){
                // maybe it's "signed"
                // check first before we skip
                let exp = parse_signed()
                if(exp) {
                    return parse_binary(exp)
                }

                skip_punc('(')
                exp = parse_atom()
                skip_punc(')')
                return parse_binary(exp)
            }

            if(!left){
                left =  parse_call() || 
                        parse_prefix() || 
                        parse_postfix() || 
                        parse_indexed() ||
                        parse_datatypes() ||
                        parse_pointer() ||
                        parse_cast() ||
                        parse_sizeof() ||
                        parse_signed()
                if(!left)       return 
                if(!is_op())    return
            }

            if(!is_op()) return left
            if(tokens.peek().value == '=') return parse_assign()

            // specific to the memory assign syntax
            const is_slash_type = () => {
                return parse_handler(reject => {
                    if(!is_op('/'))     return; skip_op('/')
                    if(!is_type())      return;
                    reject()
                    return true
                })
            }

            if(is_slash_type()) {
                return left
            }

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
                    parse_indexed() ||
                    parse_datatypes() || 
                    parse_pointer() ||
                    parse_cast() ||
                    parse_sizeof() ||
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
            if(!is_type())      return; let ret_type = skip_type()

            // return type is an array
            if(is_punc('[')) {
                skip_punc('[')
                skip_punc(']')
                ret_type.value += '[]'
            }

            const location = tokens.save()

            const vars = parse_delimited(is_var, () => {
                let location = tokens.save()
                let arg_var = tokens.next()
                let arg_type = skip_type()
                
                // argument type is an array
                if(is_punc('[')) {
                    skip_punc('[')
                    skip_punc(']')
                    arg_type.value += '[]'
                }
                return { ...arg_var, location, arg_type: arg_type }
            }, ',')

            let ALREADY_INSIDE_FUNCTION = INSIDE_FUNCTION
            if(!ALREADY_INSIDE_FUNCTION) INSIDE_FUNCTION = true
            const body = parse_body()
            if(!ALREADY_INSIDE_FUNCTION) INSIDE_FUNCTION = false

            return {
                type        : 'func',
                vars        : vars,
                name        : name,
                body        : body,
                location    : location,
                ret_type    : ret_type
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
                type        : 'call',
                name        : name,
                args        : args,
                location    : location
            }
        }) 
    }

    const parse_return = () => {
        if(!INSIDE_FUNCTION) return

        return parse_handler(reject => {
            if(!is_kw('ret')) return; skip_kw('ret')
            const location = tokens.save()
            return {
                type        : 'ret',
                value       : parse_atom(),
                location    : location
            }
        })
    }

    const parse_if = () => {
        return parse_handler(reject => {
            if(!is_kw('if')) return; skip_kw('if')
            const location = tokens.save()

            const statement = 
                parse_binary() || 
                parse_signed() ||
                parse_datatypes() || 
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
                    type        : 'else',
                    body        : body,
                    location    : location
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
                parse_signed() ||
                parse_datatypes() || 
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
                parse_signed() ||
                parse_datatypes() || 
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

    const parse_include = () => {
        if(!is_kw('include')) return; skip_kw('include')
        const location = tokens.save()
        const fd = skip_str()
        return {
            type        : 'include',
            fd          : fd,
            location    : location
        }
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
                type        : 'prefix',
                name        : name,
                op          : op,
                location    : location
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
                type        : 'postfix',
                name        : name,
                op          : op,
                location    : location
            }
        })
    }

    const parse_pointer = () => {
        return parse_handler(reject => {
            const location = tokens.save()
            if(!is_op('&')) return;   skip_op('&')
            const name = skip_var().value

            return {
                type        : 'pointer',
                name        : name,
                location    : location
            }
        })
    }

    const parse_indexed = () => {
        return parse_handler(reject => {
            const location = tokens.save()

            if(!is_var())       return; const array_name = skip_var()
            if(!is_punc('['))   return;

            skip_punc('[')
            const index = parse_atom()
            skip_punc(']')

            return {
                type        : 'indexed',
                location    : location,
                array_name  : array_name,
                index       : index,
            }
        })
    }

    const parse_array_assign = () => {
        return parse_handler(reject => {
            if(!is_var())       return;     const array_name = skip_var()
            if(!is_punc('['))   return;     skip_punc('[')
            const location = tokens.save()

            const index = parse_atom()
            skip_punc(']')
            if(!is_op('=')) unexpected();   skip_op('=')
            const value = parse_atom()

            return {
                type        : 'array_assign',
                array_name  : array_name,
                index       : index,
                value       : value,
                location    : location
            }
        })
    }

    const parse_sizeof = () => {
        return parse_handler(reject => {
            const location = tokens.save()
            if(!is_punc('$')) return; skip_punc('$')
            if(!is_var() && !is_type()) return;
            
            if(is_type()) {
                return {
                    type        : 'sizeof',
                    value       : skip_type(),
                    location    : location
                }
            }
            
            return {
                type        : 'sizeof',
                value       : parse_atom(),
                location    : location
            }
        })
    }

    const parse_cast = () => {
        return parse_handler(reject => {
            const location = tokens.save()
            
            let immediate = false
            if(is_op('?')) skip_op('?') 
            else if(is_op('!')) (immediate = true) && skip_op('!')
            else return

            if(!is_type())  return;   
            let type = skip_type()

            if(is_punc('[')) {
                skip_punc('[')
                skip_punc(']')
                type.value += '[]'
            }

            const value = 
                parse_binary() || 
                parse_signed() ||
                parse_indexed() ||
                parse_datatypes() || 
                parse_call() ||
                parse_cast() ||
                parse_inline_array() ||
                parse_pointer()

            return {
                type        : 'cast',
                value       : value,
                cast_type   : type,
                location    : location,
                immediate   : immediate
            }
        })
    }

    const parse_atom = () => {
        try {
            return (
                parse_binary() ||
                parse_signed() ||
                parse_prefix() ||
                parse_postfix() ||
                parse_call() ||
                parse_indexed() ||
                parse_datatypes() || 
                parse_pointer() ||
                parse_cast() ||
                parse_sizeof() ||
                undefined
            )
        } catch { unexpected() }
    }

    const parse_any = () => {
        try {
            return (
                parse_include() ||
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
                parse_memory_assign() ||
                parse_assign() ||
                parse_declare() ||
                parse_pointer() ||
                parse_cast() ||
                parse_datatypes(null, false) ||
                parse_array_assign() ||
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