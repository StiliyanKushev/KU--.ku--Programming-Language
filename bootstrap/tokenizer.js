module.exports = reader => {
    var keywords = ' if else for while true false ret break continue num str bol chr include '

    // navigation functions
    const next = () => read_next()
    const peek = () => { let _old = reader.save(); let _ret = next(); reader.update(_old); return _ret }
    const eof  = () => { let _old = reader.save(); let _ret = peek() == null; reader.update(_old); return _ret }
 
    // validation functions
    const is_whitespace = ch => ' \t\n'.indexOf(ch) >= 0
    const is_punc       = ch => ':,(){}[]@'.indexOf(ch) >= 0
    const is_op_char    = ch => '+-*/%=&|<>!?'.indexOf(ch) >= 0
    const is_id_start   = ch => /[a-z_A-Z]/i.test(ch)
    const is_digit      = ch => /[0-9]/i.test(ch)
    const is_keyword    = wd => keywords.indexOf(' ' + wd + ' ') >= 0
    
    // reads chars until new line
    const skip_comment = () => read_while(function(ch){ return ch != '\n' && ch != '#' }, true) && reader.next()

    // returns string until rule(char) is true
    const read_while = (rule, comment=false) => {
        if(comment && reader.peek() == '#') reader.next()
        let str = ''
        while (!reader.eof() && rule(reader.peek())) {
            str += reader.next()
        }
        return str
    }

    // returns keyword or identificator token
    const read_id = () => {
        // allow numbers in variable names (but not the first char)
        let id = read_while(ch => is_id_start(ch) || is_digit(ch))
        return { type: is_keyword(id) ? 'kw' : 'var', value: id }
    }
    // returns char token
    const read_char = () => ({ type: 'chr', value: read_escaped('\'') })

    // returns string token
    const read_string = () => ({ type: 'str', value: read_escaped('"') })

    // returns number token
    const read_number = () => {
        let has_dot = false
        let number = read_while(ch => ch == '.' ? has_dot ? false : (has_dot = true) : is_digit(ch))
        return { type: 'num', value: parseFloat(number) }
    }

    const read_as_escaped = ch => {
        const escape_map = {
            'n': '\n',
            't': '\t',
            'r': '\r',
            'f': '\f',
            'v': '\v',
            '1b': '\x1b'
            // todo: add more
        }
        return escape_map[ch] || ch
    }

    // returns escaped by "end" string
    const read_escaped = end => {
        let escaped = false, str = '', ch = reader.next()
        while (!reader.eof()) {
            ch = reader.next()
            if(escaped) { str += ch ; escaped = false }
            else if (ch == '\\' && reader.peek() == end) escaped = true
            else if (ch == '\\' && reader.peek() == 'x') {
                // special \x1b looking escape
                reader.next()
                str += read_as_escaped(reader.next() + reader.next())
            }
            else if (ch == '\\') str += read_as_escaped(reader.next())
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
        if (ch == '\'') return read_char()
        if (is_digit(ch)) return read_number() 
        if (is_id_start(ch)) return read_id()
        if (is_punc(ch)) return { type: 'punc', value: reader.next() }
        if (is_op_char(ch)) return { type: 'op', value: read_while(is_op_char) }
        reader.croak("Can't handle character: " + ch)
    }

    // return navigation functions
    return { next, peek, eof, croak : reader.croak, save: reader.save, update: reader.update }
}