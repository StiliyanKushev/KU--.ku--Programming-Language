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
    const is_str    = () => { let tok = tokens.peek(); return tok && tok.type == 'str' }
    const is_num    = () => { let tok = tokens.peek(); return tok && tok.type == 'num' }
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

    const maybe_function = prev => {
        // it's a function with no arguments
        if(is_punc('{')){
            skip_punc('{')
            let _prog = []
            while(!tokens.eof() && !is_punc('}')){
                _prog.push(parse_any())
            }
            skip_punc('}')

            return {
                type: 'func',
                name: prev.name,
                vars: [],
                body: _prog
            }
        }

        // it's not a function at all
        return prev
    }

    const maybe_call = prev => {
        tokens.next()

        // this is a variable or a literal argument to a call
        if(is_var() || is_str() || is_num()) {
            let _args = []
            
            const fill_args = () => {
                _args.push(maybe_binary(tokens.next(), 0))
                if(is_punc(',')){
                    skip_punc(',')
                    fill_args()
                }
            }

            fill_args()

            return {
                type: 'call',
                name: prev.value,
                args: _args,
            }
        }

        return prev
    }

    // parsing functions
    const parse_simple = (throw_err = false, goNext=true) => {
        // handle warpped expressions
        if(is_punc('(')) {
            tokens.next()
            let exp = maybe_binary(parse_simple(), 0)
            skip_punc(')')
            return exp
        }

        // handle booleans
        if(is_kw('true') || is_kw('false')) return { type: 'bool', value: tokens.next().value == 'true' }

        // handle strings and numbers
        let tok = goNext ? tokens.next() : tokens.peek()
        if(tok.type == 'num' || tok.type == 'str') return tok

        // it could be a variable name, or a function call
        if(tok.type == 'var') return maybe_call(tok)

        if(throw_err) unexpected()
    }

    const parse_any = () => {
        // handle simple expressions first
        let _expr = parse_simple(false, false)
        if(_expr) {
            if(_expr.type != 'var') return _expr
            
            // the var is either a varable trynna be set to a value
            // or a function initialization (with or without arguments)
            let _v = maybe_function(parse_delcare(false, _expr))
            return _v
        }

        // handle variable and object declarations
        if(is_punc(':')) return parse_delcare()

        unexpected()
    }

    const parse_object_body = () => {
        skip_punc('{')
        let _list = []
        while(!tokens.eof() && !is_punc('}')){
            _list.push(parse_delcare(true))
        }
        skip_punc('}')
        return {
            type: 'object',
            value: _list
        }
    }
    
    const parse_delcare = (skipPunc = true, wasVar=undefined) => {
        if(skipPunc) skip_punc(':')
        let _var = wasVar || skip_var()
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

            // variable is object
            if(is_punc('{')){
                let _value = parse_object_body()
                _value.name = _var.value
                return _value
            }

            let _value = maybe_binary(parse_simple(true), 0)

            // don't allow stuff like this -> :a = b = 1
            if(_value.type == 'assign') unexpected()
            else return {
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