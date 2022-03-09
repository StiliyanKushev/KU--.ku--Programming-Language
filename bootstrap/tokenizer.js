module.exports = reader => {
    var current = null
    var keywords = ' if else elif for each while true false '
    
    // navigation functions
    const peek = () => current || (current = read_next())
    const next = () => { let tok = current; current = null; return tok || read_next() }
    const eof  = () => peek() == null

    // validation functions
    const is_whitespace = ch => ' \t\n'.indexOf(ch) >= 0
    const is_punc       = ch => ':,(){}[]'.indexOf(ch) >= 0
    const is_op_char    = ch => '+-*/%=&|<>!'.indexOf(ch) >= 0
    const is_id_start   = ch => /[a-z_A-Z]/i.test(ch)
    const is_digit      = ch => /[0-9]/i.test(ch)
    const is_keyword    = wd => keywords.indexOf(' ' + wd + ' ') >= 0
    
    // reads chars until new line
    const skip_comment = () => read_while(function(ch){ return ch != '\n' }) && reader.next()

    // returns string until rule(char) is true
    const read_while = rule => {
        let str = ''
        while (!reader.eof() && rule(reader.peek())) str += reader.next()
        return str
    }

    // returns keyword or identificator token
    const read_id = () => {
        let id = read_while(is_id_start)
        return { type: is_keyword(id) ? 'kw' : 'var', value: id }
    }

    // returns string token
    const read_string = () => { return { type: 'str', value: read_escaped('"') } }

    // returns number token
    const read_number = () => {
        let has_dot = false
        let number = read_while(ch => ch == '.' ? has_dot ? false : (has_dot = true) : is_digit(ch))
        return { type: 'num', value: parseFloat(number) }
    }

    // returns escaped by "end" string
    const read_escaped = end => {
        let escaped = false, str = '', ch = reader.next()
        while (!reader.eof()) {
            ch = reader.next()
            if(escaped) { str += ch ; escaped = false }
            else if (ch == '\\') escaped = true
            else if (ch == end) break
            else str += ch
        }
        return str
    }

    // core function of the tokenizer
    const read_next = () => {
        read_while(is_whitespace)
        if (reader.eof()) return null
        let ch = reader.peek()
        if (ch == '#') { skip_comment(); return read_next() }
        if (ch == '"') return read_string()
        if (is_digit(ch)) return read_number() 
        if (is_id_start(ch)) return read_id()
        if (is_punc(ch)) return { type: 'punc', value: reader.next() }
        if (is_op_char(ch)) return { type: 'op', value: read_while(is_op_char) }
        reader.croak("Can't handle character: " + ch)
    }

    // return navigation functions
    return { next, peek, eof, croak : reader.croak }
}