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

let asm_text = ''
let asm_data = ''

const asm_final = () => `
\tsection .data
${asm_data}
\t
\tsection .text
\tglobal _start
\t_start:
\tpush ebp
\tmov ebp, esp
\t;; --- start of program --- ;;
\t
${asm_text}
\t;; --- end of program (exit 0) --- ;;
\tmov esp, ebp
\tpush ebp
\tmov eax, 1
\tmov ebx, 0
\tint 0x80
`

let can_write = true
let stored_label_inc = 0
const disable_writes = () => {
    stored_label_inc = _label_inc
    can_write = false
}
const enable_writes = () => {
    _label_inc = stored_label_inc
    can_write = true
}

// append text to the .text section
const write_code = text => {
    if(can_write) asm_text += '\t' + text + '\n'
}

// append text to the .data section
const write_data = text => {
    if(can_write) asm_data += '\t' + text + '\n'
}

// offsets on the stack in bytes
// note: if a type size is more than 4
// note: make sure to watch out for order of push/mov?
const types_offsets = {
    'num': 4,
    'bol': 4,
    'str': 4, // hold address of string
}

// universal function for preparing context of a scope
const create_context = (opt_extra = {}) => ({
    ...opt_extra,
    variables: new Map(), // map variable name to offset of ebp for parent's scope
    functions: new Map(), // map function name to function label
    var_offset: 0,        // incremented offset for each new local variable on stack
    max_var_offset: 0,    // precomputed maximum locally var offset. Used to calculate lookup var offsets.
})

// simple way to copy an existing context
// only really ever useful when calculating max_var_offset
// onto a dummy world that looks the exact same way
const copy_context = (src_context) => {
    let dest = {}
    Object.entries(src_context).forEach(([key, value]) => {
        if(value instanceof Map) {
            dest[key] = new Map(value)
        } else if(value instanceof Set) {
            dest[key] = new Set(value)
        } else if(typeof value == 'object'){
            dest[key] = {...value}
        } else {
            dest[key] = value
        }
    })
    return dest
}

// simple function to create a unique label name
let _label_inc = 0, create_label = () => '__' + (++_label_inc).toFixed(10).replace('.', '_')

const core_com = undefined // todo: some built in functions after _start

module.exports.generate_asm = ast => {
    console.dir(ast, { depth: null })
    console.log('-'.repeat(process.stdout.columns))

    const util_string_to_hex_arr = (string) => {
        let arr = []
        for (let i = 0; i < string.length; i++) {
            const asciiCode = string.charCodeAt(i)
            const hexCode = asciiCode.toString(16)
            arr.push('0x' + hexCode)
        }
        return arr
    }

    const throw_fatal_error = (error, node, parent) => {
        exit_error(`\nerror: ${error}\nat: row: ${node?.location?.line} col: ${node?.location?.col}`)
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

    const throw_invalid_value_type = (node, parent) => {
        throw_fatal_error(
            "invalid value type", node, parent
        )
    }

    const throw_cannot_assign_different_type = (node, parent) => {
        throw_fatal_error(
            "cannot assign different type", node, parent
        )
    }

    const throw_binary_op_different_types = (node, parent) => {
        throw_fatal_error(
            `binary operation on different types`, node, parent)
    }

    const throw_unsupported_operation = (node, parent) => {
        throw_fatal_error(
            `binary operation not supported`, node, parent)
    }

    const throw_not_implemented = (node, parent) => {
        throw_fatal_error(
            `not implemented -> ${node.type}`, node, parent)
    }

    const type_default_value = (value_type) => {
        if(value_type == 'num') return 0
        if(value_type == 'bol') return 0
        if(value_type == 'str') return 0
    }

    const lookup_variable = (node, parent, name, ebp_offset = 0) => {
        // console.log('lookup_variable', ebp_offset, name, parent.parent?.context.max_var_offset)
        
        if(!parent) throw_variable_not_exist(node, parent)
        if(parent.context.variables.has(name)) {
            const value = parent.context.variables.get(name)
            return {
                parent: parent,
                value: value,
                ebp_offset: ebp_offset + value.offset
            }
        }

        // plus 8 where 4 is for the ip pushed by "call" and 4 for
        // the push of 'ebp' in each function context
        return lookup_variable(
            node, 
            parent.parent, 
            name, 
            ebp_offset - 8 - (parent.parent?.context.max_var_offset || 0))
    }

    const lookup_function = (node, parent, name) => {
        if(!parent) throw_function_not_exist(node, parent)
        if(parent.context.functions.has(name)) {
            const value = parent.context.functions.get(name)
            return {
                parent: parent,
                value: value,
            }
        }

        return lookup_function(
            node, parent.parent, name)
    }

    const read_value = (node, parent, opt_value_type) => {
        if(!node) {
            return {
                write_all: () => write_code(`mov eax, 0`)
            }
        }

        // we pass a custom write_all and type
        if(node.type == 'override') {
            return {
                ...node.override
            }
        }

        // note: opt_type is given when it's not a simple type (ex: str, num, bol)
        const check_value_type = opt_type => {
            if(opt_type && opt_value_type && opt_type != opt_value_type) {
                throw_invalid_value_type(node, parent)
            }
            if(!opt_type && node.type != opt_value_type) {
                throw_invalid_value_type(node, parent)
            }
        }

        if(node.type == 'num') {
            check_value_type(node.type)
            return {
                type: node.type,
                write_all: () => {
                    write_code(`;; num`)
                    write_code(`mov eax, ${node.value}`)
                }
            }
        } else if(node.type == 'str') {
            check_value_type(node.type)
            let string_label = create_label()
            let string_size = node.value.length
            let string_hex = util_string_to_hex_arr(node.value).join(', ')
            return {
                type: node.type,
                string_label,
                string_size,
                string_hex,
                write_all: () => {
                    write_code(`;; str`)
                    write_data(`${string_label}: db ${string_hex}`)
                    write_code(`mov eax, ${string_label}`)
                }
            }
        } else if(node.type == 'bol') {
            check_value_type(node.type)
            return {
                type: node.type,
                write_all: () => {
                    write_code(`;; bol`)
                    write_code(`mov eax, ${node.value ? 1 : 0}`)
                }
            }
        } else if(node.type == 'binary') {
            const com_value = read_binary(node, parent)
            check_value_type(com_value.type)
            return com_value
        } else if(node.type == 'var') {
            const found_var     = lookup_variable(node, parent, node.value)
            const var_name      = found_var.value.name
            const var_is_local  = parent.context.variables.has(var_name)
            check_value_type(found_var.value.type)
            return {
                type: found_var.value.type,
                name: var_name,
                write_all: () => {
                    write_code(`;; var val ${var_name}`)
                    if(var_is_local) {
                        write_code(`mov eax, [ebp - ${found_var.ebp_offset}]`)
                    } else {
                        write_code(`mov eax, [ebp - ${found_var.ebp_offset}]`)
                    }
                }
            }
        } else if(node.type == 'call') {
            const com_value = read_call_function(node, parent)
            check_value_type(com_value.type)
            return com_value
        } else if(node.type == 'signed') {
            const com_value = read_signed(node, parent)
            check_value_type(com_value.type)
            return com_value
        } else if(node.type == 'postfix') {
            const com_value = read_postfix(node, parent)
            check_value_type(com_value.type)
            return com_value
        } else if(node.type == 'prefix') {
            const com_value = read_prefix(node, parent)
            check_value_type(com_value.type)
            return com_value
        } else {
            throw_unknown_node_type(node, parent)
        }
    }

    const read_func = (node, parent) => {
        const label_start_func  = create_label()
        const label_end_func    = create_label()
        const label_ret_func    = create_label()
        const label_ret_none    = create_label()

        let name       = node.name
        let ret_type   = node.ret_type.value
        let ret_size   = types_offsets[ret_type]
        let args       = node.vars

        let data = {
            name, ret_type, ret_size, args,
            label_start_func,
            label_end_func,
            label_ret_func,
            label_ret_none
        }

        parent.context.functions.set(name, data)

        const world = {
            parent: parent,
            context: create_context({
                func_self: data
            }),
        }

        return {
            ...data,
            write_all: () => {
                // initially we always jump over the function
                // we only want to go in if it's called
                write_code(`jmp ${label_end_func}`)
                write_code(`${label_start_func}:`)
                write_code(`push ebp`)
                write_code(`mov ebp, esp`)

                write_code(`;; --- function declare "${name}" [${ret_type}] --- ;;`)
                node.vars.forEach((arg_var, i) => {
                    const arg_var_declare = {
                        type: 'var',
                        mode: 'declare',
                        name: arg_var.value,
                        value: {
                            type: 'override',
                            override: {
                                write_all: () => {
                                    // to get the value we need to skip
                                    // a few things over.
                                    // we skip the saved 'ebp'.
                                    // we skip the pushed by 'call' ip.
                                    // we skip each previous argument.
                                    write_code(`mov eax, [ebp + 8 + ${i * 4}]`)
                                }
                            }
                        },
                        location: arg_var.location,
                        value_type: arg_var.arg_type
                    }
                    read_var(arg_var_declare, world).write_all()
                })

                read_scope(node.body.prog, world.parent, world.context)
                
                write_code(`jmp ${label_ret_none}`)     // by default ret none
                write_code(`${label_ret_func}:`)        // if read "ret", go here
                write_code(`mov esp, ebp`)
                write_code(`pop ebp`)
                write_code(`ret`)
                write_code(`${label_ret_none}:`)
                write_code(`xor eax, eax`)
                write_code(`jmp ${label_ret_func}`)
                write_code(`${label_end_func}:`)
            }
        }
    }

    const read_call_function = (node, parent) => {
        const found_func    = lookup_function(node, parent, node.name)
        const name          = found_func.value.name
        const ret_type      = found_func.value.ret_type
        const ret_size      = found_func.value.ret_size
        const func_args     = found_func.value.args
        const _start_func   = found_func.value.label_start_func

        if(func_args.length > node.args.length) {
            throw_function_invalid_arguments_count(node, parent)
        }

        return {
            type: ret_type,
            name: name,
            ret_size: ret_size,
            write_all: () => {
                func_args.reverse().map((func_arg, ri) => {
                    let i = func_args.length - 1 - ri
                    let arg_type = func_arg.arg_type.value
                    const com_value = read_value(node.args[i], parent, arg_type)
                    com_value.write_all()
                    write_code(`push eax`)
                    // we push an arg, so we increase var offset
                    parent.context.var_offset += 4
                })

                // // offset_before_call as first argument always
                // parent.context.var_offset += 4
                // write_code(`mov eax, ${parent.context.var_offset}`)
                // write_code(`push eax`)

                write_code(`call ${_start_func}`)
            }
        }
    }

    const read_ret = (node, parent) => {
        const label_ret_func    = parent.context.func_self.label_ret_func
        const ret_type          = parent.context.func_self.ret_type

        // empty ret, return default value
        if(!node.value) {
            return {
                type: ret_type,
                write_all: () => {
                    write_code(`mov eax, ${type_default_value(ret_type)}`)
                    write_code(`jmp ${label_ret_func}`)
                }
            }
        }

        return {
            type: ret_type,
            ret_type: ret_type,
            write_all: () => {
                const com_value = read_value(node.value, parent, ret_type)
                com_value.write_all()
                write_code(`jmp ${label_ret_func}`)
            }
        }
    }

    const read_signed = (node, parent) => {
        // todo: support signed decimals
        const com_value = read_value(node.value, parent, 'num')
        com_value.write_all()
        return {
            type: 'num',
            write_all: () => {
                write_code(`;; signed num`)
                if(node.op.value == '-') {
                    write_code(`neg eax`)
                }
            }
        }
    }

    const read_binary = (node, parent) => {
        // we predefine the type based on the operator
        let type        // holds the final type
        let req_type    // holds possible required types on both ends
        if(node.operator == '+') {
            type = 'num'
            req_type = ['num']
        } else if(node.operator == '-') {
            type = 'num'
            req_type = ['num']
        } else if(node.operator == '*') {
            type = 'num'
            req_type = ['num']
        } else if(node.operator == '/') {
            type = 'num'
            req_type = ['num']
        } else if(node.operator == '%') {
            type = 'num'
            req_type = ['num']
        } else if(node.operator == '||') {
            type = 'bol'
            req_type = ['bol']
        } else if(node.operator == '&&') {
            type = 'bol'
            req_type = ['bol']
        } else if(node.operator == '<') {
            type = 'bol'
            req_type = ['num']
        } else if(node.operator == '>') {
            type = 'bol'
            req_type = ['num']
        } else if(node.operator == '<=') {
            type = 'bol'
            req_type = ['num']
        } else if(node.operator == '>=') {
            type = 'bol'
            req_type = ['num']
        } else if(node.operator == '==') {
            type = 'bol'
            req_type = ['num', 'bol']
        } else if(node.operator == '!=') {
            type = 'bol'
            req_type = ['num', 'bol']
        }

        const write_all = () => {
            write_code(`;; --- read binary --- ;;`)
            write_code(`push ebx`)
    
            const left = read_value(node.left, parent)
            const right = read_value(node.right, parent)
    
            // todo: maybe the language should support that?
            if(left.type !== right.type) {
                throw_binary_op_different_types(node, parent)
            }

            // ex: false > false
            if(!req_type.includes(left.type)) {
                throw_unsupported_operation(node, parent)
            }
    
            left.write_all()
            write_code(`mov ebx, eax`)
            right.write_all()

            // flip to left = eax and right = ebx
            write_code(`push ecx`)
            write_code(`mov ecx, eax`)
            write_code(`mov eax, ebx`)
            write_code(`mov ebx, ecx`)
            write_code(`pop ecx`)
            
            if(node.operator == '+') {
                if(type == 'num') {
                    write_code(`add eax, ebx ;; + `)
                } else {
                    throw_unsupported_operation(node, parent)
                }
            } else if(node.operator == '-') {
                if(type == 'num') {
                    write_code(`sub eax, ebx ;; -`)
                } else {
                    throw_unsupported_operation(node, parent)
                }
            } else if(node.operator == '*') {
                if(type == 'num') {
                    write_code(`mul ebx ;; *`)
                } else {
                    throw_unsupported_operation(node, parent)
                }
            } else if(node.operator == '/') {
                if(type == 'num') {
                    write_code(`div ebx ;; /`)
                } else {
                    throw_unsupported_operation(node, parent)
                }
            } else if(node.operator == '%') {
                if(type == 'num') {
                    write_code(`cdq ;; %`)
                    write_code(`idiv ebx`)
                    write_code(`mov eax, edx`)
                } else {
                    throw_unsupported_operation(node, parent)
                }
            } else if(node.operator == '||') {
                if(type == 'bol') {
                    write_code(`or eax, ebx ;; ||`)
                } else {
                    throw_unsupported_operation(node, parent)
                }
            } else if(node.operator == '&&') {
                if(type == 'bol') {
                    write_code(`and eax, ebx ;; &&`)
                } else {
                    throw_unsupported_operation(node, parent)
                }
            } else if(node.operator == '<') {
                if(type == 'bol') {
                    const nl = create_label()
                    const end = create_label()
                    write_code(`cmp eax, ebx ;; <`)
                    write_code(`jnl ${nl}`)
                    write_code(`mov eax, 1`)
                    write_code(`jmp ${end}`)
                    write_code(`${nl}:`)
                    write_code(`mov eax, 0`)
                    write_code(`${end}:`)
                } else {
                    throw_unsupported_operation(node, parent)
                }
            } else if(node.operator == '>') {
                if(type == 'bol') {
                    const nl = create_label()
                    const end = create_label()
                    write_code(`cmp eax, ebx ;; >`)
                    write_code(`jnl ${nl}`)
                    write_code(`mov eax, 0`)
                    write_code(`jmp ${end}`)
                    write_code(`${nl}:`)
                    write_code(`mov eax, 1`)
                    write_code(`${end}:`)
                } else {
                    throw_unsupported_operation(node, parent)
                }
            } else if(node.operator == '<=') {
                if(type == 'bol') {
                    const nl = create_label()
                    const end = create_label()
                    write_code(`cmp eax, ebx ;; <=`)
                    write_code(`jnle ${nl}`)
                    write_code(`mov eax, 1`)
                    write_code(`jmp ${end}`)
                    write_code(`${nl}:`)
                    write_code(`mov eax, 0`)
                    write_code(`${end}:`)
                } else {
                    throw_unsupported_operation(node, parent)
                }
            } else if(node.operator == '>=') {
                if(type == 'bol') {
                    const nl = create_label()
                    const end = create_label()
                    write_code(`cmp eax, ebx ;; >=`)
                    write_code(`jnle ${nl}`)
                    write_code(`mov eax, 0`)
                    write_code(`jmp ${end}`)
                    write_code(`${nl}:`)
                    write_code(`mov eax, 1`)
                    write_code(`${end}:`)
                } else {
                    throw_unsupported_operation(node, parent)
                }
            } else if(node.operator == '==') {
                if(type == 'bol') {
                    const eq = create_label()
                    const end = create_label()
                    write_code(`cmp eax, ebx ;; ==`)
                    write_code(`je ${eq}`)
                    write_code(`mov eax, 0`)
                    write_code(`jmp ${end}`)
                    write_code(`${eq}:`)
                    write_code(`mov eax, 1`)
                    write_code(`${end}:`)
                } else {
                    throw_unsupported_operation(node, parent)
                }
            } else if(node.operator == '!=') {
                if(type == 'bol') {
                    const eq = create_label()
                    const end = create_label()
                    write_code(`cmp eax, ebx ;; ==`)
                    write_code(`je ${eq}`)
                    write_code(`mov eax, 1`)
                    write_code(`jmp ${end}`)
                    write_code(`${eq}:`)
                    write_code(`mov eax, 0`)
                    write_code(`${end}:`)
                } else {
                    throw_unsupported_operation(node, parent)
                }
            }

            write_code(`pop ebx`)
        }

        return {
            type: type,
            write_all: write_all
        }
    }

    const read_var = (node, parent) => {
        if(node.mode == 'declare') {
            if(parent.context.variables.has(node.name)) {
                throw_variable_already_declared(node, parent)
            }

            let name       = node.name
            let type       = node.value_type.value
            let type_size  = types_offsets[type]
            let offset     = parent.context.var_offset += type_size

            return {
                name, type, type_size, offset,
                write_all: () => {
                    let com_value  = read_value(node.value, parent, type)
                    parent.context.variables.set(node.name, {
                        name, type, type_size, offset
                    })
        
                    write_code(`;; --- declare "${name}" [${type}] (${offset}) --- ;;`)
                    write_code(`sub esp, ${type_size}`)
                    com_value.write_all()
                    write_code(`mov [ebp-${offset}], eax`)
                }
            }
        }
        else if(node.mode == 'assign') {
            const found_var = lookup_variable(node, parent, node.name)
            const offset = found_var.ebp_offset
            const name = found_var.value.name
            const type = found_var.value.type

            return {
                name, type, offset,
                write_all: () => {
                    const new_value = read_value(node.value, parent, type)
                    write_code(`;; --- assign "${name}" [${type}] (${offset}) --- ;;`)
                    new_value.write_all()
                    write_code(`mov [ebp-${offset}], eax`)
                }
            }
        }
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
        const found_var = lookup_variable(node, parent, node.name)
        const type = found_var.value.type
        const name = found_var.value.name
        const offset = found_var.ebp_offset

        if(type !== 'num') {
            throw_prefix_non_numeric(node, parent)
        }

        return {
            type: 'num',
            write_all: () => {
                const op = node.op.value
                write_code(`;; --- postfix ${op} "${name}" [${type}] (${offset}) --- ;;`)
                write_code(`mov eax, [ebp-${offset}]`)
                if(op == '++') {
                    write_code(`inc eax`)
                    
                } else if(op == '--') {
                    write_code(`dec eax`)
                }
                write_code(`mov [ebp-${offset}], eax`)
                if(op == '++') {
                    write_code(`dec eax`)
                    
                } else if(op == '--') {
                    write_code(`inc eax`)
                }
            }
        }
    }

    const read_prefix = (node, parent) => {
        const found_var = lookup_variable(node, parent, node.name)
        const type = found_var.value.type
        const name = found_var.value.name
        const offset = found_var.ebp_offset

        if(type !== 'num') {
            throw_prefix_non_numeric(node, parent)
        }

        return {
            type: 'num',
            write_all: () => {
                const op = node.op.value
                write_code(`;; --- prefix ${op} "${name}" [${type}] (${offset}) --- ;;`)
                write_code(`mov eax, [ebp-${offset}]`)
                if(op == '++') {
                    write_code(`inc eax`)
                    
                } else if(op == '--') {
                    write_code(`dec eax`)
                }
                write_code(`mov [ebp-${offset}], eax`)
            }
        }
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

        const read_body_scope = given_world => {
            for(let node of prog) {
                if(node.type == 'func') {
                    read_func(node, given_world).write_all()
                } else if(node.type == 'var') {
                    read_var(node, given_world).write_all()
                } else if(node.type == 'call') {
                    read_call_function(node, given_world).write_all()
                } else if(node.type == 'if') {
                    // read_if(node, given_world)
                    throw_not_implemented(node, given_world)
                } else if(node.type == 'for') {
                    // read_for(node, given_world)
                    throw_not_implemented(node, given_world)
                } else if(node.type == 'while') {
                    // read_while(node, given_world)
                    throw_not_implemented(node, given_world)
                } else if(node.type == 'postfix') {
                    read_postfix(node, given_world).write_all()
                } else if(node.type == 'prefix') {
                    read_prefix(node, given_world).write_all()
                } else if(node.type == 'ret') {
                    return read_ret(node, given_world).write_all()
                } else if(node.type == 'kw' && node.value == 'break') {
                    // return read_break(node, given_world)
                    throw_not_implemented(node, given_world)
                } else if(node.type == 'kw' && node.value == 'continue') {
                    // return read_continue(node, given_world)
                    throw_not_implemented(node, given_world)
                } else if(node.type == 'internal') {
                    // only for core functionality
                    // exec_internal(node, given_world)
                    throw_not_implemented(node, given_world)
                } else {
                    throw_unknown_node_type(node, given_world)
                }
            }
        }

        // precompute max_var_offset here so that
        // later lookup_functions inside nested function calls
        // can find the exact location of the variable.
        world.context.max_var_offset = 0

        // to precompute we will "dummy" read the whole
        // scope's body, disabling the writing functions
        // and just taking a note of the final var_offset.
        const was_able_to_write = can_write
        if(was_able_to_write) disable_writes()
        const dummy_world = {
            parent: opt_parent,
            context: copy_context(world.context)
        }
        read_body_scope(dummy_world)
        world.context.max_var_offset = dummy_world.context.var_offset
        if(was_able_to_write) enable_writes()

        // now that we have precomputed the max_var_offset
        // we can proceed with reading the body and writing
        // to the asm text string with the correct offsets inside.
        read_body_scope(world)
    }

    read_scope(ast.prog, core_com)
    return asm_final()
}