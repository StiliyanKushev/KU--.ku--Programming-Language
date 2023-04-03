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

// append text to the .text section
const write_code = text => {
    asm_text += '\t' + text + '\n'
}

// append text to the .data section
const write_data = text => {
    asm_data += '\t' + text + '\n'
}

// offsets on the stack in bytes
const types_offsets = {
    'num': 8,
    'bol': 4,
    'str': 4, // hold address of string
}

// universal function for preparing context of a scope
const create_context = () => ({
    variables: new Map(), // map variable name to offset of ebp for parent's scope
    functions: new Map(), // map function name to function label
    var_offset: 0,        // incremented offset for each new local variable on stack
})

// simple function to create a unique label name
let _label_inc = 0, create_label = () => '__' + (++_label_inc).toFixed(10).replace('.', '')

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

    const lookup_variable = (node, parent, name, ebp_offset = 0) => {
        if(!parent) throw_variable_not_exist(node, parent)
        if(parent.context.variables.has(name)) {
            const value = parent.context.variables.get(name)
            return {
                parent: parent,
                value: value,
                ebp_offset: ebp_offset + value.offset
            }
        }

        // plus 2 where 1 is for the ip pushed by "call" and 1 for
        // the push of 'ebp' in each function context
        return lookup_variable(
            node, parent.parent, ebp_offset - 2 - parent.parent?.var_offset)
    }

    const read_value = (node, parent, opt_value_type) => {
        if(!node) {
            return {
                write_all: () => write_code(`mov eax, 0`)
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
            const found_var = lookup_variable(node, parent, node.value)
            check_value_type(found_var.value.type)
            return {
                type: found_var.value.type,
                name: found_var.value.name,
                write_all: () => {
                    write_code(`;; var val`)
                    write_code(`mov eax, [ebp - ${found_var.ebp_offset}]`)
                }
            }
        } else if(node.type == 'call') {
            // check_value_type(read_call_function(node, parent))
        } else if(node.type == 'signed') {
            const com_value = read_signed(node, parent)
            return com_value
        } else if(node.type == 'postfix') {
            // check_value_type(read_postfix(node, parent))
        } else if(node.type == 'prefix') {
            // check_value_type(read_prefix(node, parent))
        } else {
            throw_unknown_node_type(node, parent)
        }
    }

    const read_func = (node, parent) => {
        // todo: implement
    }

    const read_signed = (node, parent) => {
        // todo: support signed decimals
        const com_value = read_value(node.value, parent, 'num')
        com_value.write_all()
        return {
            type: 'num',
            write_all: () => {
                write_code(`;; signed num`)
                console.log(node)
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
            let com_value  = read_value(node.value, parent, type)
            parent.context.variables.set(node.name, {
                name, type, type_size, offset
            })

            write_code(`;; --- declare "${name}" [${type}] (${offset}) --- ;;`)
            write_code(`sub esp, ${type_size}`)
            com_value.write_all()
            write_code(`mov [ebp-${offset}], eax`)
        }
        else if(node.mode == 'assign') {
            const found_var = lookup_variable(node, parent, node.name)
            const offset = found_var.ebp_offset
            const name = found_var.value.name
            const type = found_var.value.type
            const new_value = read_value(node.value, parent, type)
            write_code(`;; --- assign "${name}" [${type}] (${offset}) --- ;;`)
            new_value.write_all()
            write_code(`mov [ebp-${offset}], eax`)
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