const fs    = require('fs')
const os    = require('os')
const path  = require('path')
const cp    = require('child_process')
const {
    exit_error
} = require('./cmd')

module.exports.compile_asm = (asm, output) => {
    console.log(asm.split('\n').map((ln, i) => `${i + 1}: ${ln}`).join('\n'))
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
    console.log('-'.repeat(process.stdout.columns))
}

// ------------------------------------------------------------------------ //

let asm_text = '\n'
let asm_data = '\n'
let asm_func = '\n'

const asm_final = () => `
\tsection .data
${asm_data}
\t;; --- function defines :begin: --- ;;
${asm_func}
\t;; --- function defines :end: --- ;;\n
\tsection .text
\tglobal _start
\t_start:
\tpush ebp
\tmov ebp, esp
\n\t;; --- program :begin: --- ;;\n
${asm_text}
\t;; --- program :end: (exit 0) --- ;;
\tmov esp, ebp
\tpop ebp
\tmov eax, 1
\tmov ebx, 0
\tint 0x80
`

// append text to the .text section
let write_code = text => {
    asm_text += '\t' + text + '\n'
}

// append text to the .data section
let write_data = text => {
    asm_data += '\t' + text + '\n'
}

// append text to the functions section
let write_in_function = text => {
    asm_func += '\t' + text + '\n'
}

// offsets on the stack in bytes
// note: if a type size is more than 4
// note: make sure to watch out for order of push/mov?
const types_offsets = {
    'num': 4,
    'bol': 4,
    'str': 4, // hold address of string
}

// unique global counters used as id's
const counters = {
    free_id: 0
}

// simple function to create a unique label name
let _label_inc = 0, create_label = () => '__' + (++_label_inc).toFixed(10).replace('.', '_')

module.exports.generate_asm = ast => {
    console.dir(ast, { depth: null })
    console.log('-'.repeat(process.stdout.columns))

    // list of types that require their memory address
    // to be freed right before the scope dies.
    // each one has a function that free's the data from eax.
    // the size of the memory region to free depends on the
    // data type and it's value.
    const types_should_be_freed = new Map(Object.entries({
        'str': (node, parent) => {
            // free length of string
            write_code(';; free str')
            write_code('mov ebx, eax')
            read_call_function({
                name: 'strlen',
                args: [{
                    type: 'override',
                    override: {
                        write_all: () => {}
                    },
                }],
            }, parent).write_all()
            write_code('push ecx')
            write_code('mov ecx, eax')
            write_code('mov eax, ebx')
            write_code('mov ebx, ecx')
            write_code('pop ecx')
            write_code(';; end free str')
        },
        // todo: add custom structs as types here?
    }))
 
    // general function that will keep track of eax
    // address and lazily adds it to a cache. the scope
    // then goes through that cache and frees all entries.
    // note: this function expects the address to be at eax
    // note: this function expects the size/length to be at ebx
    const lazy_free = (context, unique_id) => {
        write_code(`;; -- lazy_free -- ;;`)
        const addr_offset = context.var_offset += 4
        const size_offset = context.var_offset += 4
        write_code(`sub esp, 4`)
        write_code(`mov [ebp - ${addr_offset}], eax`)
        write_code(`sub esp, 4`)
        write_code(`mov [ebp - ${size_offset}], ebx`)
        context.free_set.set(unique_id, [addr_offset, size_offset])
    }

    const free_manually = () => {
        write_code(`push eax`)
        write_code(`push ebx`)
        write_code(`mov ecx, ebx`)
        write_code(`mov ebx, eax`)
        write_code(`mov eax, 91`)
        write_code(`mov edx, 0`)
        write_code(`int 0x80`)
        write_code(`pop ebx`)
        write_code(`pop eax`)
    }

    // this function will typically run at the end of a scope.
    // it will loop the free_set set and "free" each of the stored entries.
    const free_set_context = (parent, opt_excludes = []) => {
        // in a scenario where a local variable is assigned
        // from whitin a nested scope, and the value has to 
        // be freed, it is on us here to find such variables
        // and add them to the free_set before we clear them
        for(let var_data of parent.context.variables.values()) {
            if(typeof var_data.free_id == 'undefined') {
                continue
            }
            if(parent.context.free_set.has(var_data.free_id)) {
                continue
            }
            if(opt_excludes.includes(var_data.free_id)) {
                continue
            }
            // before we are able to free the var type we have to
            // load the variable into eax
            read_value({
                type: 'var',
                value: var_data.name
            }, parent).write_all()
            types_should_be_freed.get(var_data.type)(null, parent)
            lazy_free(parent.context, var_data.free_id)
        }

        write_code(`;; -- free_set_context -- ;;`)
        const sets = Object.values(Object.fromEntries(parent.context.free_set))
        if(sets.length == 0) return
        write_code(`push eax`)
        write_code(`push ebx`)
        for(let [ addr_offset, size_offset ] of sets) {
            write_code(`mov eax, [ebp - ${addr_offset}]`)
            write_code(`mov ebx, [ebp - ${size_offset}]`)
            write_code(`mov ecx, ebx`)
            write_code(`mov ebx, eax`)
            write_code(`mov eax, 91`)
            write_code(`mov edx, 0`)
            write_code(`int 0x80`)
        }
        write_code(`pop ebx`)
        write_code(`pop eax`)
    }

    // universal function for preparing context of a scope
    const create_context = (opt_extra = {}) => ({
        ...opt_extra,
        variables: new Map(), // map variable name to var data such as offset, type, etc
        functions: new Map(), // map function name to function label
        var_offset: 0,        // incremented offset for each new local variable on stack
        free_set: new Map(),  // map unique key to set that contains [addr_offset, size_offset] elements
    })

    const util_string_to_hex_arr = (string) => {
        let arr = []
        for (let i = 0; i < string.length; i++) {
            const asciiCode = string.charCodeAt(i)
            const hexCode = asciiCode.toString(16)
            arr.push('0x' + hexCode)
        }
        arr.push('0x0')
        return arr
    }

    const hardcoded_strings = new Map()

    const get_cached_hardcoded_string = (hex) => {
        return hardcoded_strings.get(hex)
    }

    const set_cached_hardcoded_string = (label, hex) => {
        hardcoded_strings.set(hex, label)
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

    const throw_loop_not_exist = (node, parent) => {
        throw_fatal_error(
            'loop does not exist', node, parent)
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

    const type_default_value = (parent, value_type) => {
        if(value_type == 'num') return read_value({
            type: 'num',
            value: 0
        }, parent, value_type)
        if(value_type == 'bol') return read_value({
            type: 'bol',
            value: false
        }, parent, value_type)
        if(value_type == 'str') return read_value({
            type: 'str',
            value: ''
        }, parent, value_type)
    }

    const lookup_variable = (node, parent, name, lookup_index = 0) => {
        if(!parent) throw_variable_not_exist(node, parent)
        if(parent.context.variables.has(name)) {
            const value = parent.context.variables.get(name)
            return {
                parent: parent,
                value: value,
                ebp_offset: value.offset,
                lookup_index: lookup_index
            }
        }

        return lookup_variable(
            node, 
            parent.parent, 
            name, 
            lookup_index + 1)
    }

    const lookup_function = (node, parent, name, lookup_index = 0) => {
        if(!parent) throw_function_not_exist(node, parent)
        if(!name) {
            // we're only looking for the closest scope above
            // that is a function.
            if(parent.context.func_self) {
                return {
                    parent: parent,
                    lookup_index: lookup_index
                }
            }
        }
        else if(parent.context.functions.has(name)) {
            const value = parent.context.functions.get(name)
            return {
                parent: parent,
                value: value,
                lookup_index: lookup_index
            }
        }

        return lookup_function(
            node, parent.parent, name, lookup_index + 1)
    }

    const lookup_loop = (node, parent, lookup_index = 0) => {
        if(!parent) throw_loop_not_exist(node, parent)
        if(parent.context.loop_self) {
            return {
                parent: parent,
                lookup_index: lookup_index
            }
        }

        return lookup_loop(
            node, parent.parent, lookup_index + 1)
    }

    const execute_in_above_scope_context = (parent, func, above_scope_index) => {
        let curr = parent
        for(let lookup_index = 1; lookup_index <= above_scope_index; lookup_index++) {
            if(!curr) break
            curr = curr.parent
        }
        func(curr)
    }

    const execute_in_above_scope = (func, above_scope_index) => {
        const is_local = above_scope_index == 0
        !is_local && write_code(`push ebp`)
        for(let i = 0; i < above_scope_index; i++) {
            write_code(`mov ebp, [ebp]`)
        }
        func()
        !is_local && write_code(`pop ebp`)
    }

    const read_value = (node, parent, opt_value_type) => {
        if(!node) {
            return {
                write_all: () => write_code(`xor eax, eax`)
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
            let string_hex = util_string_to_hex_arr(node.value).join(', ')
            let cached_label = get_cached_hardcoded_string(string_hex)
            let string_label = cached_label || create_label()
            if(!cached_label) {
                set_cached_hardcoded_string(string_label, string_hex)
            }
            return {
                type: node.type,
                write_all: () => {
                    write_code(`;; str`)
                    if(!cached_label) {
                        write_data(`${string_label}: db ${string_hex}`)
                    }
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
            check_value_type(found_var.value.type)
            return {
                type: found_var.value.type,
                name: var_name,
                free_id: found_var.value.free_id, // can be undefined
                write_all: () => {
                    write_code(`;; var val ${var_name}`)
                    execute_in_above_scope(() => {
                        write_code(`mov eax, [ebp - ${found_var.ebp_offset}]`)
                    }, found_var.lookup_index)
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
        let name       = node.name
        let ret_type   = node.ret_type.value
        let ret_size   = types_offsets[ret_type]
        let args       = node.vars

        const label_start_func  = `__${name}__begin` + create_label()
        const label_end_func    = `__${name}__skip` + create_label()
        const label_ret_func    = `__${name}__ret` + create_label()

        let data = {
            name, ret_type, ret_size, args,
            label_start_func,
            label_ret_func,
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
                let old_write_code = write_code
                write_code = write_in_function
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
                                    // write_code(`mov eax, [ebp + 8 + ${(i * 4) + 4}]`)
                                }
                            }
                        },
                        location: arg_var.location,
                        value_type: arg_var.arg_type
                    }
                    read_var(arg_var_declare, world).write_all()
                })

                if(node.internal_code) {
                    node.internal_code(world, data)
                } else {
                    read_scope(node.body.prog, world.parent, world.context)
                }
                
                // return default value for ret_type
                // if we got to here then `ret` wasn't called
                read_ret({ type: 'ret' }, world).write_all()

                write_code(`${label_ret_func}:`)
                write_code(`mov esp, ebp`)
                write_code(`pop ebp`)
                write_code(`ret`)
                write_code(`${label_end_func}:`)
                write_code = old_write_code
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

        let free_id = undefined

        if(types_should_be_freed.has(ret_type)) {
            // create a unique key
            // that can be linked to the entry in the free set
            // then return that unique key in the below return
            // so that after that we check that in the read_ret
            // and remove it from the free_set (as it's returned)
            // also, handle variables.
            free_id = typeof node.opt_free_id != 'undefined'
                ? node.opt_free_id
                : counters.free_id++
        }

        return {
            type: ret_type,
            name: name,
            ret_size: ret_size,
            free_id: free_id,
            write_all: () => {
                let ebx_store_offset = null
                if(types_should_be_freed.has(ret_type)) {
                    // value is a pointer to a type that should be freed
                    // as the memory at the said pointer is mapped to the heap.
                    // this means the called function will store the length at ebx,
                    // so we have to store/restore it after the function call.
                    ebx_store_offset = parent.context.var_offset += 4
                    write_code(`push ebx ;; ${parent.context.var_offset}`)
                }
                
                // note: Pretty much the same reason as in read_binary,
                // note: we can't really push eax and expect the stack
                // note: not to change in between com_value.write_all
                // note: and push eax calls. If such thing were to happen,
                // note: then the pushed arguments would be spread apart
                // note: and we would not be passing the correct arguments
                // note: to the function. That's why we have to store them
                // note: in the local stack frame temporarily, then push
                // note: them in the correct order, and clear them afterwards.
                let scattered_args = []

                func_args.reverse().map((func_arg, ri) => {
                    let i = func_args.length - 1 - ri
                    let arg_type = func_arg.arg_type.value
                    const com_value = read_value(node.args[i], parent, arg_type)
                    com_value.write_all()
                    // we push an arg, so we increase var offset
                    parent.context.var_offset += 4
                    scattered_args.push(parent.context.var_offset)
                    
                    write_code(`push eax ;; sctrd arg ${parent.context.var_offset}`)
                })

                write_code(`;; --- scattered arguments --- ;;`)
                scattered_args.forEach(arg_offset => {
                    write_code(`mov eax, [ebp - ${arg_offset}]`)
                    write_code(`push eax`)
                    parent.context.var_offset += 4
                })

                write_code(`call ${_start_func}`)
                
                // clear args from local space now
                parent.context.var_offset -= 4 * func_args.length
                write_code(`add esp, 4 * ${func_args.length}`)

                if(types_should_be_freed.has(ret_type)) {
                    // calculate size to unmap
                    types_should_be_freed.get(ret_type)(node, parent)
                    // value is a pointer to a type that should be freed
                    // as the memory at the said pointer is mapped to the heap.
                    lazy_free(parent.context, free_id)
                    write_code(`mov ebx, [ebp - ${ebx_store_offset}]`)
                }
            }
        }
    }

    const read_ret = (node, parent) => {
        const found_func = lookup_function(node, parent)

        const lookup_index      = found_func.lookup_index
        const label_ret_func    = found_func.parent.context.func_self.label_ret_func
        const ret_type          = found_func.parent.context.func_self.ret_type

        return {
            type: ret_type,
            ret_type: ret_type,
            write_all: () => {
                let com_value

                if(!node.value) {
                    com_value = type_default_value(parent, ret_type)
                } else {
                    com_value = read_value(node.value, parent, ret_type)
                }
                com_value.write_all()

                // free_set_context may or may not also dynamically
                // add some variables to be freed, and this will 
                // temper with the value of the eax register, and 
                // therefor we'll lose the return value of the function.
                // to patch that, store it, and it's temporary offset.
                const return_offset = parent.context.var_offset += 4
                write_code(`push eax`)

                // loop each scope up until the first function scope
                // that we will return the value of. for each scope,
                // check if com_value is in the free set, and remove it.
                // after that for each scope execute the free_set_context
                // and then jmp to the label_ret_func.
                // the label_ret_func has to be of the first function,
                // not nessesarily the current scope.
                for(let i = 0; i <= lookup_index; i++) {
                    execute_in_above_scope_context(parent, t_parent => {
                        // we want to exclude the return value
                        // from the free set, if the return value is
                        // there.
                        let temp_val = undefined
                        if(t_parent.context.free_set.has(
                            com_value.free_id)) {
                            temp_val = t_parent.context.free_set.get(
                                com_value.free_id)
                            t_parent.context.free_set.delete(
                                com_value.free_id)
                        }

                        execute_in_above_scope(() => {
                            // scope will die now. free any mapped data from it.
                            free_set_context(t_parent, [com_value.free_id])
                        }, i)

                        // if the "ret" is inside of a nested scope
                        // we want to bring it back after we've successfully
                        // written out the correct free_set_context
                        // That's because in case we don't hit this "ret"
                        // in-code, we should not have removed it from the
                        // free set.
                        if(i > 0 && temp_val) {
                            t_parent.context.free_set.set(
                                com_value.free_id, temp_val)
                        }
                    }, i)
                }

                // bring back the return value
                write_code(`mov eax, [ebp - ${return_offset}]`)

                // if the current scope is nested condition
                // or loop, we want to leave the frame stack
                // before we return.
                // note: we want to do that for every nested scope.
                for(let i = 0; i < lookup_index; i++) {
                    write_code(`mov esp, ebp`)
                    write_code(`pop ebp`)
                }

                write_code(`jmp ${label_ret_func}`)
            }
        }
    }

    const read_signed = (node, parent) => {
        // todo: support signed decimals
        return {
            type: 'num',
            write_all: () => {
                const com_value = read_value(node.value, parent, 'num')
                com_value.write_all()
                write_code(`;; signed num`)
                if(node.op.value == '-') {
                    write_code(`neg eax`)
                }
            }
        }
    }

    const read_binary = (node, parent) => {
        // note: We have something like:
        // note:
        // note: push ebx
        // note: ...
        // note: pop ebx
        // note: 
        // note: Inside of the `...` if we ever
        // note: modify the stack size by doing
        // note: sub esp, 4
        // note: for whatever reason, ex: when
        // note: we call lazy_free, this would
        // note: resolve in weird bugs because
        // note: the top of the stack is no
        // note: longer ebx, and when calling
        // note: pop ebx, we actually load
        // note: something else into the ebx
        // note: register.

        // note: to mitigate this problem,
        // note: instead of simple push ebx,
        // note: pop ebx, we will keep track
        // note: of the shifted var_offset
        // note: and do: mov ebx, [esp - shift]
        // note: check `post_binary_read_var_offset`
        // note: and `pre_binary_read_var_offset`

        const left = read_value(node.left, parent)
        const right = read_value(node.right, parent)
    
        // todo: maybe the language should support that?
        if(left.type !== right.type) {
            throw_binary_op_different_types(node, parent)
        }

        // we predefine the type based on the operator
        let type        // holds the final type
        let req_type    // holds possible required types on both ends
        if(node.operator == '+') {
            if(left.type == 'str') {
                // string concatination
                type = 'str'
                req_type = ['str']
            } else {
                type = 'num'
                req_type = ['num']
            }
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

        // we may or may not need a predefined
        // free id if ever one of the binary operations
        // calls a function that needs to be freed.
        // ex: string appending
        // note: without this, the call will still be 
        // note: added to the free set, but the returned
        // note: binary value will not have the free id
        // note: and we'll not be able to remove it from 
        // note: the free set if ever we have to return that.
        let opt_free_id = undefined

        if(node.operator == '+' && type == 'str') {
            opt_free_id = counters.free_id++
        }

        const write_all = () => {
            write_code(`;; --- read binary --- ;;`)
            write_code(`push ebx ;; ${parent.context.var_offset + 4}`)
            const pre_binary_read_var_offset = parent.context.var_offset += 4

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
                } else if (type == 'str') {
                    write_code(`mov ecx, eax`)
                    read_call_function({
                        name: 'strapnd',
                        args: [{
                            type: 'override',
                            override: {
                                write_all: () => {
                                    write_code(`mov eax, ebx`)
                                }
                            }
                        }, {
                            type: 'override',
                            override: {
                                write_all: () => {
                                    write_code(`mov eax, ecx`)
                                }
                            }
                        }].reverse(),
                        opt_free_id: opt_free_id
                    }, parent).write_all()
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

            const post_binary_read_var_offset = parent.context.var_offset
            const stack_shift = post_binary_read_var_offset - pre_binary_read_var_offset
            write_code(`mov ebx, [esp + ${stack_shift}]`)
        }

        return {
            type: type,
            free_id: opt_free_id,
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
                    let com_value
                    if(!node.value) {
                        com_value = type_default_value(parent, type)
                    } else {
                        com_value  = read_value(node.value, parent, type)
                    }
                    
                    parent.context.variables.set(node.name, {
                        name, type, type_size, offset,
                        free_id: com_value.free_id
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

                    // update the free id in-case the new assigned value is to be lazy
                    // freed later on
                    found_var.parent.context.variables.get(
                        node.name).free_id = new_value.free_id
                    write_code(`;; --- assign "${name}" [${type}] (${offset}) --- ;;`)
                    new_value.write_all()

                    // we're going to assign a variable, so we have to make sure
                    // we immediately free (not lazy_free) the old value or else
                    // we'll have memory overflows.
                    if(types_should_be_freed.has(type)) {
                        write_code(`push eax`)
                        const new_value_offset = parent.context.var_offset += 4
                        execute_in_above_scope(() => {
                            write_code(`mov eax, [ebp - ${offset}]`)
                        }, found_var.lookup_index)
                        types_should_be_freed.get(type)(null, parent)
                        free_manually()
                        write_code(`mov eax, [ebp - ${new_value_offset}]`)
                    }

                    if(found_var.lookup_index > 0) {
                        // we assign to a variable
                        // from parent scope.
                        // don't free it's value in the
                        // current scope.
                        if(parent.context.free_set.has(
                            new_value.free_id)) {
                                parent.context.free_set.delete(
                                    new_value.free_id)
                        }
                    }

                    execute_in_above_scope(() => {
                        write_code(`mov [ebp-${offset}], eax`)
                    }, found_var.lookup_index)
                }
            }
        }
    }

    const read_if = (node, parent) => {
        const expr = read_value(node.statement, parent)
        if(expr.type != 'bol') {
            throw_statement_not_boolean(node, parent)
        }

        return {
            write_all: () => {
                // load the value to eax
                expr.write_all()

                const else_label = create_label()
                const exit_label = create_label()

                write_code(`cmp eax, 1`)
                write_code(`jne ${else_label}`)
                
                const world_if = {
                    parent: parent,
                    context: create_context(),
                }

                write_code(`push ebp`)
                write_code(`mov ebp, esp`)
                read_scope(node.body.prog, world_if.parent, world_if.context)
                free_set_context(world_if)
                write_code(`mov esp, ebp`)
                write_code(`pop ebp`)

                write_code(`jmp ${exit_label}`)
                write_code(`${else_label}:`)
                
                const world_else = {
                    parent: parent,
                    context: create_context(),
                }

                if(node.else?.type == 'else') {
                    write_code(`push ebp`)
                    write_code(`mov ebp, esp`)
                    read_scope(
                        node.else.body.prog, 
                        world_else.parent, 
                        world_else.context)
                    free_set_context(world_else)
                    write_code(`mov esp, ebp`)
                    write_code(`pop ebp`)
                } else if(node.else?.type == 'if') {
                    read_if(node.else, parent).write_all()
                }

                write_code(`jmp ${exit_label}`)
                write_code(`${exit_label}:`)
            }
        }
    }

    const read_for = (node, parent) => {
        // todo: implement
    }

    const read_while = (node, parent) => {
        const loop_label = create_label()
        const exit_label = create_label()
        const continue_label = create_label()

        return {
            exit_label: exit_label,
            write_all: () => {
                write_code(`${loop_label}:`)
                        
                const world = {
                    parent: parent,
                    context: create_context({
                        loop_self: {
                            loop_label,
                            exit_label,
                            continue_label
                        }
                    }),
                }

                write_code(`push ebp`)
                write_code(`mov ebp, esp`)
                
                const expr = read_value(node.statement, world)
                if(expr.type != 'bol') {
                    throw_statement_not_boolean(node, parent)
                }
                // load the value to eax
                expr.write_all()

                write_code(`cmp eax, 1`)
                write_code(`jne ${exit_label}`)
                
                read_scope(node.body.prog, world.parent, world.context)
                write_code(`${continue_label}:`)
                free_set_context(world)

                write_code(`mov esp, ebp`)
                write_code(`pop ebp`)

                write_code(`jmp ${loop_label}`)
                write_code(`${exit_label}:`)
                write_code(`mov esp, ebp`)
                write_code(`pop ebp`)
            }
        }
    }

    const read_postfix = (node, parent) => {
        const found_var = lookup_variable(node, parent, node.name)
        const type = found_var.value.type
        const name = found_var.value.name
        const ebp_offset = found_var.ebp_offset
        const lookup_index = found_var.lookup_index

        if(type !== 'num') {
            throw_prefix_non_numeric(node, parent)
        }

        return {
            type: 'num',
            write_all: () => {
                const op = node.op.value
                write_code(`;; --- postfix ${op} "${name}" [${type}] (${ebp_offset}) --- ;;`)
                execute_in_above_scope(() => {
                    write_code(`mov eax, [ebp-${ebp_offset}]`)
                    if(op == '++') {
                        write_code(`inc eax`)
                        
                    } else if(op == '--') {
                        write_code(`dec eax`)
                    }
                    write_code(`mov [ebp-${ebp_offset}], eax`)
                    if(op == '++') {
                        write_code(`dec eax`)
                        
                    } else if(op == '--') {
                        write_code(`inc eax`)
                    }
                }, lookup_index)
            }
        }
    }

    const read_prefix = (node, parent) => {
        const found_var = lookup_variable(node, parent, node.name)
        const type = found_var.value.type
        const name = found_var.value.name
        const ebp_offset = found_var.ebp_offset
        const lookup_index = found_var.lookup_index

        if(type !== 'num') {
            throw_prefix_non_numeric(node, parent)
        }

        return {
            type: 'num',
            write_all: () => {
                const op = node.op.value
                write_code(`;; --- prefix ${op} "${name}" [${type}] (${ebp_offset}) --- ;;`)
                execute_in_above_scope(() => {
                    write_code(`mov eax, [ebp-${ebp_offset}]`)
                    if(op == '++') {
                        write_code(`inc eax`)
                        
                    } else if(op == '--') {
                        write_code(`dec eax`)
                    }
                    write_code(`mov [ebp-${ebp_offset}], eax`)
                }, lookup_index)
            }
        }
    }

    const read_break = (node, parent) => {
        const found_loop    = lookup_loop(node, parent)
        const lookup_index  = found_loop.lookup_index
        const exit_label    = found_loop.parent.context.loop_self.exit_label

        return {
            write_all: () => {
                // loop each scope up until the first loop scope.
                // after that for each scope execute the free_set_context
                // and then jmp to the exit_label.
                for(let i = 0; i <= lookup_index; i++) {
                    execute_in_above_scope_context(parent, t_parent => {
                        execute_in_above_scope(() => {
                            // scope will die now. free any mapped data from it.
                            free_set_context(t_parent)
                        }, i)
                    }, i)
                }

                // if the current scope is nested condition
                // or loop, we want to leave the frame stack
                // before we return.
                // note: we want to do that for every nested scope.
                for(let i = 0; i < lookup_index; i++) {
                    write_code(`mov esp, ebp`)
                    write_code(`pop ebp`)
                }

                write_code(`jmp ${exit_label}`)
            }
        }
    }

    const read_continue = (node, parent) => {
        const found_loop        = lookup_loop(node, parent)
        const lookup_index      = found_loop.lookup_index
        const continue_label    = found_loop.parent.context.loop_self.continue_label

        return {
            write_all: () => {
                // loop each scope up until the first loop scope.
                // after that for each scope execute the free_set_context
                // and then jmp to the continue_label.
                for(let i = 1; i <= lookup_index; i++) {
                    execute_in_above_scope_context(parent, t_parent => {
                        execute_in_above_scope(() => {
                            // scope will die now. free any mapped data from it.
                            free_set_context(t_parent)
                        }, i)
                    }, i)
                }

                // if the current scope is nested condition
                // or loop, we want to leave the frame stack
                // before we return.
                // note: we want to do that for every nested scope.
                for(let i = 0; i < lookup_index; i++) {
                    write_code(`mov esp, ebp`)
                    write_code(`pop ebp`)
                }

                write_code(`jmp ${continue_label}`)
            }
        }
    }

    const read_scope = (prog, opt_parent, opt_context) => {
        const world = {
            parent: opt_parent,
            context: opt_context || create_context()
        }

        for(let node of prog) {
            if(node.type == 'func') {
                read_func(node, world).write_all()
            } else if(node.type == 'var') {
                read_var(node, world).write_all()
            } else if(node.type == 'call') {
                read_call_function(node, world).write_all()
            } else if(node.type == 'if') {
                read_if(node, world).write_all()
            } else if(node.type == 'for') {
                // read_for(node, world)
                throw_not_implemented(node, world)
            } else if(node.type == 'while') {
                read_while(node, world).write_all()
            } else if(node.type == 'postfix') {
                read_postfix(node, world).write_all()
            } else if(node.type == 'prefix') {
                read_prefix(node, world).write_all()
            } else if(node.type == 'ret') {
                return read_ret(node, world).write_all()
            } else if(node.type == 'kw' && node.value == 'break') {
                return read_break(node, world).write_all()
            } else if(node.type == 'kw' && node.value == 'continue') {
                return read_continue(node, world).write_all()
            } else {
                throw_unknown_node_type(node, world)
            }
        }

        return world
    }

    // define all core functions/constants
    const core_com = new class {
        constructor() {
            this.parent = undefined
            this.context = create_context()
    
            this.context.functions.set("strlen", this.strlen)
            this.context.functions.set("strapnd", this.strapnd)

            // stdio 
            this.context.functions.set("out", this.out)
            this.context.functions.set("outln", this.outln)
    
            // cast 
            this.context.functions.set("bol2str", this.bol2str)
            this.context.functions.set("num2str", this.num2str)
            this.context.functions.set("str2num", this.str2num)
            this.context.functions.set("str2bol", this.str2bol)
        }
    
        make_arg(name, type) {
            return {
                type: 'var',
                value: name,
                location: { 
                    pos: 'internal', 
                    line: 'internal', 
                    col: 'internal' 
                },
                arg_type: {
                    type: 'kw',
                    value: type
                } 
            }
        }
    
        make_func({ name, args, write_internal, ret_type }) {
            const func_def = read_func({
                name,
                ret_type: { value: ret_type },
                internal_code: write_internal,
                vars: args
            }, this)
            func_def.write_all()
            return func_def
        }
    
        get strlen() {
            const loop_start = create_label()
            const loop_end = create_label()
            return this.make_func({
                name: 'strlen',
                ret_type: 'num',
                args: [ this.make_arg('data', 'str') ],
                write_internal: (_, data) => {
                    write_code(`xor ecx, ecx`)
                    write_code(`mov eax, [ebp + 8]`)
                    write_code(`${loop_start}:`)
                    write_code(`cmp byte [eax], 0`)
                    write_code(`je ${loop_end}`)
                    write_code(`inc eax`)
                    write_code(`inc ecx`)
                    write_code(`jmp ${loop_start}`)
                    write_code(`${loop_end}:`)
                    write_code(`mov eax, ecx`)
                    write_code(`jmp ${data.label_ret_func}`)
                }
            })
        }

        get strapnd() {
            return this.make_func({
                name: 'strapnd',
                ret_type: 'str',
                args: [ this.make_arg('l', 'str'), this.make_arg('r', 'str') ],
                write_internal: (world, data) => {
                    const l_loop_label = create_label()
                    const r_loop_label = create_label()
                    
                    // get length of left and store to a varaible
                    read_var({
                        mode: 'declare',
                        name: 'l_length',
                        value_type: { value: 'num' },
                        value: {
                            type: 'call',
                            name: 'strlen',
                            args: [{
                                type: 'var',
                                value: 'l'
                            }],
                        }
                    }, world).write_all()

                    // get length of right and store to a varaible
                    read_var({
                        mode: 'declare',
                        name: 'r_length',
                        value_type: { value: 'num' },
                        value: {
                            type: 'call',
                            name: 'strlen',
                            args: [{
                                type: 'var',
                                value: 'r'
                            }],
                        }
                    }, world).write_all()

                    // store the total length into a variable
                    read_var({
                        mode: 'declare',
                        name: 'total_length',
                        value_type: { value: 'num' },
                        value: {
                            type: 'binary',
                            operator: '+',
                            left: {
                                type: 'var',
                                value: 'l_length',
                            },
                            right: {
                                type: 'var',
                                value: 'r_length',
                            }
                        }
                    }, world).write_all()

                    // allocate space for that string and store to eax
                    write_code(`push ebp`)
                    write_code(`xor ebx, ebx`)
                    write_code(`mov ecx, eax`)
                    write_code(`mov edx, 0x3`)
                    write_code(`mov esi, 0x22`)
                    write_code(`mov edi, -1`)
                    write_code(`xor ebp, ebp`)
                    write_code(`mov eax, 192`)
                    write_code(`int 0x80`)
                    write_code(`pop ebp`)
                    
                    // store the allocated space address to a variable
                    read_var({
                        mode: 'declare',
                        name: 'addr',
                        value_type: { value: 'str' },
                        value: {
                            type: 'override',
                            override: {
                                write_all: () => {} // default eax
                            }
                        }
                    }, world).write_all()

                    // temporary store for the current char to put
                    // to the new address space.
                    read_var({
                        mode: 'declare',
                        name: 'temp',
                        value_type: { value: 'str' },
                        value: null
                    }, world).write_all()
                    const temp_offset = world.context.variables.get('temp').offset

                    // current index variable
                    read_var({
                        mode: 'declare',
                        name: 'index',
                        value_type: { value: 'num' },
                        value: null
                    }, world).write_all()

                    // fill the allocated space with the left string
                    write_code(`${l_loop_label}:`)
                    // load the pointer of the "l" variable to eax
                    read_value({
                        type: 'var',
                        value: 'l'
                    }, world).write_all()
                    write_code(`mov ebx, eax`)
                    read_value({
                        type: 'var',
                        value: 'index'
                    }, world).write_all()
                    write_code(`add ebx, eax`)
                    // we now have a pointer to the char of "l" at "index" in eax
                    write_code(`mov eax, ebx`)
                    // assign "temp" the ascii "char" at that pointer
                    write_code(`mov bl, byte [eax]`)
                    write_code(`mov byte [ebp - ${temp_offset}], bl`)
                    // load index to eax again
                    read_value({
                        type: 'var',
                        value: 'index'
                    }, world).write_all()
                    write_code(`mov ebx, eax`)
                    read_value({
                        type: 'var',
                        value: 'addr'
                    }, world).write_all()
                    write_code(`add ebx, eax`)
                    // we now have a pointer to the dest addr at the correct index
                    write_code(`mov eax, ebx`)
                    // load the "temp" character to the dest addr space
                    write_code(`mov bl, byte [ebp - ${temp_offset}]`)
                    write_code(`mov byte [eax], bl`)
                    // increase the index
                    read_postfix({
                        type: 'prefix',
                        name: 'index',
                        op: { type: 'op', value: '++' },
                    }, world).write_all()
                    // conditionally, loop back until we load the entire "l" string
                    read_value({
                        type: 'var',
                        value: 'index'
                    }, world).write_all()
                    write_code(`mov ebx, eax`)
                    read_value({
                        type: 'var',
                        value: 'l_length'
                    }, world).write_all()
                    write_code(`cmp ebx, eax`)
                    write_code(`jl ${l_loop_label}`)

                    read_var({
                        mode: 'assign',
                        name: 'index',
                        value: null
                    }, world).write_all()

                    // fill the allocated space with the right string
                    write_code(`${r_loop_label}:`)
                    // load the pointer of the "r" variable to eax
                    read_value({
                        type: 'var',
                        value: 'r'
                    }, world).write_all()
                    write_code(`mov ebx, eax`)
                    read_value({
                        type: 'var',
                        value: 'index'
                    }, world).write_all()
                    write_code(`add ebx, eax`)
                    // we now have a pointer to the char of "r" at "index" in eax
                    write_code(`mov eax, ebx`)
                    // assign "temp" the ascii "char" at that pointer
                    write_code(`mov bl, byte [eax]`)
                    write_code(`mov byte [ebp - ${temp_offset}], bl`)
                    // load index to eax again
                    read_value({
                        type: 'var',
                        value: 'index'
                    }, world).write_all()
                    write_code(`mov ebx, eax`)
                    read_value({
                        type: 'var',
                        value: 'addr'
                    }, world).write_all()
                    write_code(`add ebx, eax`)
                    // add the length of 'left' to index for new address space
                    read_value({
                        type: 'var',
                        value: 'l_length'
                    }, world).write_all()
                    write_code(`add ebx, eax`)
                    // we now have a pointer to the dest addr at the correct index
                    write_code(`mov eax, ebx`)
                    // load the "temp" character to the dest addr space
                    write_code(`mov bl, byte [ebp - ${temp_offset}]`)
                    write_code(`mov byte [eax], bl`)
                    // increase the index
                    read_postfix({
                        type: 'prefix',
                        name: 'index',
                        op: { type: 'op', value: '++' },
                    }, world).write_all()
                    // conditionally, loop back until we load the entire "r" string
                    read_value({
                        type: 'var',
                        value: 'index'
                    }, world).write_all()
                    write_code(`mov ebx, eax`)
                    read_value({
                        type: 'var',
                        value: 'r_length'
                    }, world).write_all()
                    write_code(`cmp ebx, eax`)
                    write_code(`jl ${r_loop_label}`)

                    // returns the pointer to the string in eax
                    // and also store the size of mapped data to ebx (for lazy free)
                    read_value({
                        type: 'var',
                        value: 'addr'
                    }, world).write_all()
                    write_code(`mov ecx, eax`)
                    read_value({
                        type: 'var',
                        value: 'total_length'
                    }, world).write_all()
                    write_code(`mov ebx, eax`)
                    write_code(`mov eax, ecx`)
                    write_code(`jmp ${data.label_ret_func}`)
                }
            })
        }

        get out() {
            return this.make_func({
                name: 'out',
                ret_type: 'bol',
                args: [ this.make_arg('data', 'str') ],
                write_internal: world => {
                    read_call_function({
                        name: 'strlen',
                        args: [{
                            type: 'var',
                            value: 'data',
                        }],
                    }, world).write_all()
                    write_code('mov edx, eax')
                    write_code(`mov eax, [ebp + 8]`)
                    write_code('mov ecx, eax')
                    write_code('mov eax, 4')
                    write_code('mov ebx, 1')
                    write_code('int 0x80')
                }
            })
        }

        get outln() {
            return this.make_func({
                name: 'outln',
                ret_type: 'bol',
                args: [ this.make_arg('data', 'str') ],
                write_internal: world => {
                    read_call_function({
                        name: 'out',
                        args: [{
                            type: 'var',
                            value: 'data',
                        }],
                    }, world).write_all()
                    read_call_function({
                        name: 'out',
                        args: [{
                            type: 'str',
                            value: '\n',
                        }],
                    }, world).write_all()
                }
            })
        }
        
        get str2num() {
            return this.make_func({
                name: 'str2num',
                ret_type: 'num',
                args: [ this.make_arg('data', 'str') ],
                write_internal: () => {
                    // todo:
                    write_code('xor eax, eax')
                    write_code('xor eax, eax')
                    write_code('xor eax, eax')
                }
            })
        }

        get str2bol() {
            return this.make_func({
                name: 'str2bol',
                ret_type: 'bol',
                args: [ this.make_arg('data', 'str') ],
                write_internal: () => {
                    // todo:
                    write_code('xor eax, eax')
                    write_code('xor eax, eax')
                    write_code('xor eax, eax')
                }
            })
        }

        get bol2str() {
            return this.make_func({
                name: 'bol2str',
                ret_type: 'str',
                args: [ this.make_arg('data', 'bol') ],
                write_internal: () => {
                    // todo:
                    write_code('xor eax, eax')
                    write_code('xor eax, eax')
                    write_code('xor eax, eax')
                }
            })
        }

        get num2str() {
            return this.make_func({
                name: 'num2str',
                ret_type: 'str',
                args: [ this.make_arg('data', 'num') ],
                write_internal: (world, data) => {
                    const count_digits_label = create_label()
                    write_code(`mov eax, [ebp - 4]`)
                    write_code(`xor ecx, ecx`)
                    write_code(`mov ebx, 10`)
                    write_code(`${count_digits_label}:`)
                    write_code(`xor edx, edx`)
                    write_code(`div ebx`)
                    write_code(`inc ecx`)
                    write_code(`cmp eax, 0`)
                    write_code(`jne ${count_digits_label}`)
                    // number of digits in eax
                    write_code(`mov eax, ecx`)

                    // store length to local var
                    write_code(`sub esp, 4`)
                    write_code(`mov [ebp - 8], ecx`)
                    
                    // allocate a char per digit + null terminator
                    write_code(`push ebp`)
                    write_code(`mov ebx, 4`)
                    write_code(`mul ebx`)
                    write_code(`add eax, 4`)
                    write_code(`xor ebx, ebx`)
                    write_code(`mov ecx, eax`)
                    write_code(`mov edx, 0x3`)
                    write_code(`mov esi, 0x22`)
                    write_code(`mov edi, -1`)
                    write_code(`xor ebp, ebp`)
                    write_code(`mov eax, 192`)
                    // pointer to address space is now in eax
                    write_code(`int 0x80`)
                    write_code(`pop ebp`)

                    // add null terminator at the end
                    write_code(`push ebx`)
                    write_code(`mov ebx, [ebp - 8]`)
                    write_code(`mov [eax + ebx], byte 0x1`)
                    write_code(`pop ebx`)

                    // store address
                    write_code(`sub esp, 4`)
                    write_code(`mov [ebp - 12], eax`)

                    // fill the mapped space with the ascii of each digit
                    const fill_loop = create_label()
                    write_code(`mov eax, [ebp - 4]`)
                    write_code(`xor ecx, ecx`)
                    write_code(`mov ebx, 10`)
                    write_code(`${fill_loop}:`)
                    write_code(`xor edx, edx`)
                    write_code(`div ebx`)
                    write_code(`push eax`)
                    write_code(`push ebx`)
                    write_code(`mov eax, [ebp - 12]`)
                    write_code(`mov ebx, [ebp - 8]`)
                    write_code(`add eax, ebx`)
                    write_code(`sub eax, 1`)
                    write_code(`sub eax, ecx`)
                    write_code(`mov ebx, eax`)
                    write_code(`mov eax, edx`)
                    write_code(`add eax, byte '0'`)
                    write_code(`mov byte [ebx], al`)
                    write_code(`pop ebx`)
                    write_code(`pop eax`)
                    write_code(`inc ecx`)
                    write_code(`cmp eax, 0`)
                    write_code(`jne ${fill_loop}`)

                    // returns the pointer to the string in eax
                    write_code(`mov eax, [ebp - 12]`)
                    write_code(`jmp ${data.label_ret_func}`)
                }
            })
        }
    }

    const program_scope = read_scope(ast.prog, core_com)
    free_set_context(program_scope)
    return asm_final()
}