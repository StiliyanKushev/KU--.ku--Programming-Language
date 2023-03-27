const fs    = require('fs')
const os    = require('os')
const path  = require('path')
const cmd   = require('./cmd')
const cp    = require('child_process')

let filePath = process.argv[2]
let fileName = filePath ? filePath.split(path.sep).pop().split('.')[0] : null

module.exports.getSourceText = () => {
    filePath = filePath ? path.resolve(filePath) : null
    if(!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile || !filePath.endsWith('.ku'))
        return cmd.error('Invalid source file path')
    return fs.readFileSync(filePath).toString()
}

module.exports.compileAsm = asm => {
    let working_dir = path.join(os.tmpdir(), `./${Math.random()}`)
    fs.mkdirSync(working_dir)
    
    const asm_path  = path.join(working_dir, './nasm.asm')
    const obj_path  = path.join(working_dir, './object.o')
    const exe_path  = path.join(process.cwd(), `./${fileName}`)

    const nasm_cmd  = `nasm -felf64 "${asm_path}" -o "${obj_path}"`
    const link_cmd  = `ld -o "${exe_path}" "${obj_path}"`
    const chmod_cmd = `chmod +x "${exe_path}"`

    fs.writeFileSync(asm_path, asm)
    cp.execSync(nasm_cmd)           ; console.log(nasm_cmd)
    cp.execSync(link_cmd)           ; console.log(link_cmd)
    cp.execSync(chmod_cmd)          ; console.log(chmod_cmd)
    fs.rmSync(working_dir, { recursive: true, force: true })
    try {cp.execFileSync(exe_path)} 
    catch (err) {console.log(err.stderr.toString())}
}

module.exports.generateAsm = ast => {
    console.dir(ast, { depth: null })

    return `
        section .text
        global _start
        _start:
            mov rax, 60
            mov rdi, 0
            syscall 
    `
}