module.exports = tokens => {
    // the global scope of the program
    let prog = []

    // the z-index of operators basically
    const PRECEDENCE = {
        '=': 1, '||': 2, '&&': 3,
        '<': 7, '>': 7, '<=': 7, '>=': 7, '==': 7, '!=': 7,
        '+': 10, '-': 10,
        '*': 20, '/': 20, '%': 20,
    }

    // validating functions
    const is_var    = () => { let tok = tokens.peek(); return tok && tok.type == 'var' }
    const is_punc   = ch => { let tok = tokens.peek(); return tok && tok.type == 'punc' && (!ch || tok.value == ch) && tok }
    const is_kw     = kw => { let tok = tokens.peek(); return tok && tok.type == 'kw' && (!kw || tok.value == kw) && tok }
    const is_op     = op => { let tok = tokens.peek(); return tok && tok.type == 'op' && (!op || tok.value == op) && tok }
    
    // token skipping functions
    const skip_var  = () => is_var() ? tokens.next() : tokens.croak('Expecting variable name:')
    const skip_punc = ch => is_punc(ch) ? tokens.next() : tokens.croak('Expecting punctuation: \'' + ch + '\'')
    const skip_kw   = kw => is_kw(kw) ? tokens.next() : tokens.croak('Expecting keyword: \'' + kw + '\'')
    const skip_op   = op => is_op(op) ? tokens.next() : tokens.croak('Expecting operator: \'' + op + '\'')
    
    // helper functions 
    const unexpected = () => tokens.croak('Unexpected token: ' + JSON.stringify(tokens.peek()))
    const maybe_binary = (left, my_prec) => {
        let tok = is_op()
        if (tok) {
            let his_prec = PRECEDENCE[tok.value]
            if (his_prec > my_prec) {
                tokens.next()
                return maybe_binary({
                    type     : tok.value == '=' ? 'assign' : 'binary',
                    operator : tok.value,
                    left     : left,
                    right    : maybe_binary(parse_simple(), his_prec)
                }, my_prec)
            }
        }
        return left
    }

    const parse_simple = (throw_err = false, goNext=true) => {
        // handle warpped expressions
        if (is_punc('(')) {
            tokens.next()
            let exp = maybe_binary(parse_simple(), 0)
            skip_punc(')')
            return exp
        }

        // handle booleans
        if (is_kw('true') || is_kw('false')) return { type: 'bool', value: tokens.next().value == 'true' }

        // return simple tokens such as values or variables
        let tok = goNext ? tokens.next() : tokens.peek()
        if(tok.type == 'var' || tok.type == 'num' || tok.type == 'str') return tok

        if(throw_err) unexpected()
    }

    const parse_any = () => {
        // handle simple expressions first
        let _expr = parse_simple(false, false)
        if(_expr) {
            if(!_expr.type == 'var') return _expr
            
            // variable assign
            return parse_delcare(false)
        }

        // handle variable and object declarations
        if(is_punc(':')) return parse_delcare()

        unexpected()
    }
    
    const parse_delcare = (skipPunc = true) => {
        if(skipPunc) skip_punc(':')
        let _var = skip_var()
        let next = tokens.peek()

        // if on last line
        if(!next) {
            return {
                type: 'var',
                name: _var.value,
                value: undefined
            }
        }

        // handle variable declaration
        if(next.value == '=') {
            tokens.next()
            let _value = parse_simple(true)
            _value = maybe_binary(_value, 0)

            return {
                type: 'var',
                name: _var.value,
                value: _value
            }
        }

        // handle empty varable declaration
        else {
            return {
                type: 'var',
                name: _var.value,
                value: undefined
            }
        }
    }

    return () => {
        prog = []
        while (!tokens.eof()) prog.push(parse_any())
        return { type: 'prog', prog: prog }
    }
}