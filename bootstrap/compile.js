const fs    = require('fs')
const os    = require('os')
const path  = require('path')
const cp    = require('child_process')
const {
    exit_error
} = require('./cmd')

module.exports.compile_asm = (asm, output) => {
    console.log(asm)
    console.log('-'.repeat(process.stdout.columns))

    let working_dir = path.join(os.tmpdir(), `./${Math.random()}`)
    fs.mkdirSync(working_dir)
    
    const asm_path  = path.join(working_dir, './nasm.asm')
    const obj_path  = path.join(working_dir, './object.o')
    const exe_path  = path.join(process.cwd(), `./${output}`)

    const nasm_cmd  = `nasm -felf32 -g "${asm_path}" -o "${obj_path}"`
    const link_cmd  = `ld -m elf_i386 -o "${exe_path}" "${obj_path}"`
    const chmod_cmd = `chmod +x "${exe_path}"`

    fs.writeFileSync(asm_path, asm)
    cp.execSync(nasm_cmd)           ; console.log(nasm_cmd)
    cp.execSync(link_cmd)           ; console.log(link_cmd)
    cp.execSync(chmod_cmd)          ; console.log(chmod_cmd)
    fs.rmSync(working_dir, { recursive: true, force: true })
    try {cp.execFileSync(exe_path)} 
    catch (err) {console.log(err.stderr.toString())}
}

// ------------------------------------------------------------------------ //

let asm_text = '', asm_final = () => `
section .text
global _start
_start:
push ebp
mov ebp, esp
;; --- start of program --- ;;

${asm_text}
;; --- end of program (exit 0) --- ;;
mov esp, ebp
push ebp
mov eax, 1
mov ebx, 0
int 0x80
`

const write = (text) => {
    asm_text += text + '\n'
}

// universal function for preparing context of a scope
const create_context = () => ({
    variables: new Map(), // map variable name to offset of ebp for parent's scope
    functions: new Map(), // map function name to function label
    var_offset: 0,
    var_offset_inc: 8,
})

// simple function to create a unique label name
let _label_inc = 0, create_label = () => '__' + (++_label_inc).toFixed(10).replace('.', '')

const core_com = undefined // todo: some built in functions after _start

module.exports.generate_asm = ast => {
    console.dir(ast, { depth: null })
    console.log('-'.repeat(process.stdout.columns))

    const throw_fatal_error = (error, node, parent) => {
        exit_error(`error: ${error}\nat: row: ${node?.location?.line} col: ${node?.location?.col}`)
    }

    const throw_variable_not_exist = (node, parent) => {
        throw_fatal_error(
            'variable does not exit', node, parent)
    }

    const throw_function_not_exist = (node, parent) => {
        throw_fatal_error(
            'function does not exist', node, parent)
    }

    const throw_flag_not_exist = (node, parent) => {
        throw_fatal_error(
            'flag does not exist', node, parent)
    }

    const throw_variable_already_declared = (node, parent) => {
        throw_fatal_error(
            'variable already declared', node, parent)
    }

    const throw_function_already_declared = (node, parent) => {
        throw_fatal_error(
            'function already declared', node, parent)
    }

    const throw_unknown_node_type = (node, parent) => {
        throw_fatal_error(
            "unknown node type", node, parent)
    }

    const throw_function_invalid_arguments_count = (node, parent) => {
        throw_fatal_error(
            "invalid arguments count", node, parent)
    }

    const throw_signed_non_numeric = (node, parent) => {
        throw_fatal_error(
            "invalid signed non numeric value", node, parent)
    }

    const throw_postfix_non_numeric = (node, parent) => {
        throw_fatal_error(
            "invalid postfix non numeric value", node, parent)
    }

    const throw_prefix_non_numeric = (node, parent) => {
        throw_fatal_error(
            "invalid prefix non numeric value", node, parent)
    }

    const throw_statement_not_boolean = (node, parent) => {
        throw_fatal_error(
            "statement is not a boolean", node, parent)
    }

    const lookup_variable = (node, parent, name) => {
        // todo: implement
    }

    const lookup_function = (node, parent, name) => {
        // todo: implement
    }

    const read_call_function = (node, parent) => {
        // todo: implement
    }

    const read_value = (node, parent) => {
        // todo: implement
    }

    const read_func = (node, parent) => {
        // todo: implement
    }

    const read_signed = (node, parent) => {
        // todo: implement
    }

    const read_binary = (node, parent) => {
        // todo: implement
    }

    const read_var = (node, parent) => {
        if(node.mode == 'declare') {
            if(parent.context.variables.has(node.name)) {
                throw_variable_already_declared(node, parent)
            }

            const offset = parent.context.var_offset += parent.context.var_offset_inc
            parent.context.variables.set(node.name, offset)

            write(`;; --- declare "${node.name}" (${offset}) --- ;;`)
            write(`sub esp, 8`)
            node.value ? read_value(node.value, parent) : write(`mov eax, 0`)
            write(`mov [ebp-${offset}], eax`)
        }
        else if(node.mode == 'assign') {
            lookup_variable(node, parent, node.name).parent.context.variables.set(
                node.name, read_value(node.value, parent))
        }
    }

    const read_boolean = (node, parent, value) => {
        // todo: implement
    }

    const read_if = (node, parent) => {
        // todo: implement
    }

    const read_for = (node, parent) => {
        // todo: implement
    }

    const read_while = (node, parent) => {
        // todo: implement
    }

    const read_postfix = (node, parent) => {
        // todo: implement
    }

    const read_prefix = (node, parent) => {
        // todo: implement
    }

    const read_ret = (node, parent) => {
        // todo: implement
    }

    const read_break = (node, parent) => {
        // todo: implement
    }

    const read_continue = (node, parent) => {
        // todo: implement
    }

    const read_scope = (prog, opt_parent, opt_context) => {
        const world = {
            parent: opt_parent,
            context: opt_context || create_context()
        }

        for(let node of prog) {
            if(node.type == 'func') {
                read_func(node, world)
            } else if(node.type == 'var') {
                read_var(node, world)
            } else if(node.type == 'call') {
                read_call_function(node, world)
            } else if(node.type == 'if') {
                read_if(node, world)
            } else if(node.type == 'for') {
                read_for(node, world)
            } else if(node.type == 'while') {
                read_while(node, world)
            } else if(node.type == 'postfix') {
                read_postfix(node, world)
            } else if(node.type == 'prefix') {
                read_prefix(node, world)
            } else if(node.type == 'ret') {
                return read_ret(node, world)
            } else if(node.type == 'kw' && node.value == 'break') {
                return read_break(node, world)
            } else if(node.type == 'kw' && node.value == 'continue') {
                return read_continue(node, world)
            } else if(node.type == 'internal') {
                // only for core functionality
                exec_internal(node, world)
            } else {
                throw_unknown_node_type(node, world)
            }
        }
    }

    read_scope(ast.prog, core_com)
    return asm_final()
}