module.exports = source => {
    let tokens = []        // hold array of tokens here
    let token = ''         // current token per each iterration
    let inComment = false  // wheather current pos is inside of comment

    for(let [lnI, line] of source.split('\n').entries()){
        for(let [chI, char] of (line + "\n").split('').entries()){
            // empty space
            if(!char.trim().length) {
                if(char == "\n") inComment = false
                if(inComment || token == '') continue

                tokens.push({ token, line: lnI, column: chI })
                token = ''
                continue
            }

            // skip comments
            if(char == "#" || inComment) { inComment = true; continue }

            // build current token
            token += char
        }
    }
    
    return tokens
}