const vm = require('node:vm')
const {
    exit_error
} = require('./cmd')

// universal function for preparing context of a scope
const create_context = () => ({
    variables: new Map(),
    functions: new Map(),
    flags: new Map()
})
// built in "core" variables and functions go here
const core_sim = new class {
    constructor() {
        this.parent = undefined
        this.context = create_context()

        this.context.functions.set("strapnd", this.strapnd)
        this.context.functions.set("strlen", this.strlen)

        // stdio 
        this.context.functions.set("out", this.out)
        this.context.functions.set("outln", this.outln)

        // cast 
        this.context.functions.set("bol2str", this.bol2str)
        this.context.functions.set("num2str", this.num2str)
        this.context.functions.set("str2num", this.str2num)
        this.context.functions.set("str2bol", this.str2bol)
    }

    make_f({ name, vars, code_func, ret_type }) {
        return {
            type: 'func',
            vars: vars,
            name: name,
            body: {
                type: 'prog',
                prog: [{
                    type: 'internal',
                    code: '(' + code_func + ')()',
                }]
            },
            location: {
                pos: 'internal',
                line: 'internal',
                col: 'internal'
            },
            ret_type: {
                type: 'kw',
                value: ret_type
            }
        }
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

    // prints to the stdout
    get out() {
        return this.make_f({
            name: 'out',
            vars: [this.make_arg('data', 'str')],
            code_func: function () {
                const data = '' + this.context.variables.get('data')
                process.stdout.write(typeof data == 'undefined' ? '' : data)
                return true
            },
            ret_type: 'bol'
        })
    }

    // prints to the stdout and writes new line
    get outln() {
        return this.make_f({
            name: 'outln',
            vars: [this.make_arg('data', 'str')],
            code_func: function () {
                const data = '' + this.context.variables.get('data')
                process.stdout.write(typeof data == 'undefined' ? '\n' : data + '\n')
                return true
            },
            ret_type: 'bol'
        })
    }

    // converts boolean value to string
    get bol2str() {
        return this.make_f({
            name: 'out',
            vars: [this.make_arg('data', 'bol')],
            code_func: function () {
                const data = this.context.variables.get('data')
                return '' + data
            },
            ret_type: 'str'
        })
    }

    // converts number value to string
    get num2str() {
        return this.make_f({
            name: 'out',
            vars: [this.make_arg('data', 'num')],
            code_func: function () {
                const data = this.context.variables.get('data')
                return '' + data
            },
            ret_type: 'str'
        })
    }

    // converts string value to number
    get str2num() {
        return this.make_f({
            name: 'out',
            vars: [this.make_arg('data', 'str')],
            code_func: function () {
                const data = this.context.variables.get('data')
                return Number(data)
                // todo: throw error
            },
            ret_type: 'num'
        })
    }

    // converts string value to boolean
    get str2bol() {
        return this.make_f({
            name: 'out',
            vars: [this.make_arg('data', 'str')],
            code_func: function () {
                const data = this.context.variables.get('data')
                if (data.toLowerCase().trim() == 'true') {
                    return true
                } else {
                    return false
                }
                // todo: throw error
            },
            ret_type: 'bol'
        })
    }

    // returns length of a given string
    get strlen() {
        return this.make_f({
            name: 'strlen',
            vars: [this.make_arg('data', 'str')],
            code_func: function () {
                const data = this.context.variables.get('data')
                if (data.length) {
                    return data.length
                } else {
                    return -1
                }
            },
            ret_type: 'num'
        })
    }

    // appends two strings together and returns the result
    get strapnd() {
        return this.make_f({
            name: 'strapnd',
            vars: [this.make_arg('l', 'str'), this.make_arg('r', 'str')],
            code_func: function () {
                const l = this.context.variables.get('l')
                const r = this.context.variables.get('r')
                return l + r
            },
            ret_type: 'str'
        })
    }
}

// only used to execute internal code from "core"
const exec_internal = (node, parent) => {
    const vm_context = vm.createContext({
        ...parent,
        // context is empty initially
        process: process
    })
    const result = vm.runInNewContext(node.code, vm_context)
    return result
}

module.exports.simulate_ast = ast => {
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

    const type_default_value = (value_type) => {
        if(value_type == 'number') return 0
        if(value_type == 'boolean') return false
        if(value_type == 'string') return ''
    }

    const lookup_variable = (node, parent, name) => {
        if(!parent) throw_variable_not_exist(node, parent)
        if(parent.context.variables.has(name)) {
            return {
                parent: parent,
                value: parent.context.variables.get(name)
            }
        }
        return lookup_variable(node, parent.parent, name)
    }

    const lookup_function = (node, parent, name, opt_throw = true) => {
        if(!parent) return opt_throw ? throw_function_not_exist(node, parent) : undefined
        if(parent.context.functions.has(name)) {
            return {
                parent: parent,
                value: parent.context.functions.get(name)
            }
        }
        return lookup_function(node, parent.parent, name, opt_throw)
    }

    const lookup_flag = (node, parent, name) => {
        if(!parent) throw_flag_not_exist(node, parent)
        if(parent.context.flags.has(name)) {
            return {
                parent: parent,
            }
        }
        return lookup_flag(node, parent.parent, name)
    }

    const read_call_function = (node, parent) => {
        const func = lookup_function(node, parent, node.name).value

        if(func.vars.length > node.args.length) {
            throw_function_invalid_arguments_count(node, parent)
        }

        const world = {
            parent: parent,
            context: create_context()
        }

        // store the function return type as a flag so we can check in "read_ret"
        world.context.flags.set('ret_type', func.ret_type)

        func.vars.forEach((arg_var, i) => {
            const arg_var_declare = {
                type: 'var',
                mode: 'declare',

                // important not to set the name of the var
                // right away because it may be the same as 
                // a variable name from above, but because we
                // declare the args one by one, an error might occur
                // if the next argument is a binary operation on the 
                // variable from the above context with the same name
                // as the previous argument
                name: ' '.repeat(i + 1),
                
                value: node.args[i],
                location: arg_var.location,
                value_type: arg_var.arg_type
            }
            read_var(arg_var_declare, world)
        })

        // now we restore the correct variable names
        // mentioned above, before we continue reading the scope.
        func.vars.forEach((arg_var, i) => {
            world.context.variables.set(
                arg_var.value, world.context.variables.get(' '.repeat(i + 1)))
            world.context.variables.delete(' '.repeat(i + 1))
        })

        return read_scope(func.body.prog, parent, world.context)
    }

    const read_value = (node, parent, opt_value_type) => {
        const check_value_type = value => {
            if(!opt_value_type) return value
            if(typeof value == opt_value_type) return value
            throw_invalid_value_type(node, parent)
        }

        if(node.type == 'num') {
            return check_value_type(node.value)
        } else if(node.type == 'str') {
            return check_value_type(node.value)
        } else if(node.type == 'bol') {
            return check_value_type(node.value)
        } else if(node.type == 'binary') {
            return check_value_type(read_binary(node, parent))
        } else if(node.type == 'var') {
            return check_value_type(lookup_variable(node, parent, node.value).value)
        } else if(node.type == 'call') {
            return check_value_type(read_call_function(node, parent))
        } else if(node.type == 'signed') {
            return check_value_type(read_signed(node, parent))
        } else if(node.type == 'postfix') {
            return check_value_type(read_postfix(node, parent))
        } else if(node.type == 'prefix') {
            return check_value_type(read_prefix(node, parent))
        } else {
            throw_unknown_node_type(node, parent)
        }
    }

    const read_func = (node, parent) => {
        if(lookup_function(node, parent, node.name, false)) {
            throw_function_already_declared(node, parent)
        }
        parent.context.functions.set(node.name, node)
    }

    const read_signed = (node, parent) => {
        const value = read_value(node.value, parent)
        if(typeof value !== 'number') {
            throw_signed_non_numeric(node, parent)
        }
        return node.op.value == '+' ? value : -value
    }

    const read_binary = (node, parent) => {
        const left = read_value(node.left, parent)
        const right = read_value(node.right, parent)

        // todo: maybe the language should support that?
        if(typeof left !== typeof right) {
            throw_binary_op_different_types(node, parent)
        }

        if(node.operator == '+') {
            return left + right
        } else if(node.operator == '-') {
            return left - right
        } else if(node.operator == '*') {
            return left * right
        } else if(node.operator == '/') {
            return left / right
        } else if(node.operator == '%') {
            return left % right
        } else if(node.operator == '||') {
            return left || right
        } else if(node.operator == '&&') {
            return left && right
        } else if(node.operator == '<') {
            return left < right
        } else if(node.operator == '>') {
            return left > right
        } else if(node.operator == '<=') {
            return left <= right
        } else if(node.operator == '>=') {
            return left >= right
        } else if(node.operator == '==') {
            return left == right
        } else if(node.operator == '!=') {
            return left != right
        } 
    }

    const read_var = (node, parent) => {        
        if(node.mode == 'declare') {
            if(parent.context.variables.has(node.name)) {
                throw_variable_already_declared(node, parent)
            }
            let value_type = read_type(node.value_type)
            let value = node.value ?
                read_value(node.value, parent, value_type) :
                type_default_value(value_type)
            parent.context.variables.set(node.name, value)
        }
        else if(node.mode == 'assign') {
            const found_var = lookup_variable(node, parent, node.name) 
            const new_value = read_value(node.value, parent)

            if(typeof new_value != typeof found_var.value) {
                throw_cannot_assign_different_type(node, parent)
            }

            found_var.parent.context.variables.set(
                node.name, new_value)
        }
    }

    const read_boolean = (node, parent, value) => {
        if(value === 1 || (typeof value == 'boolean' && value == true)) {
            return true
        } else if(typeof value != 'boolean') {
            throw_statement_not_boolean(node, parent)
        }
        return false
    }

    const read_if = (node, parent) => {
        const value = read_boolean(
            node.statement, 
            parent, 
            read_value(node.statement, parent))

        if(value) {
            read_scope(node.body.prog, parent)
        } else if(node.else) {
            if(node.else.type == 'if') {
                read_if(node.else, parent)
            } else {
                read_scope(node.else.body.prog, parent)
            }
        }
    }

    const read_for = (node, parent) => {
        const world = {
            parent: parent,
            context: create_context()
        }

        const var_declare = {
            type: 'var',
            mode: 'declare',
            name: node.var.name,
            value: node.var.value,
            location: node.var.location,
            value_type: { type: 'kw', value: 'num' }
        }
        read_var(var_declare, world)

        // add flag indicating this parent context is a loop
        // if it's ever removed then the loop is "break"'ed
        world.context.flags.set('loop')

        while(
            read_boolean(
                node.statement,
                parent, 
                read_value(node.statement, world))) {
            read_scope(node.body.prog, parent, world.context)
            if(!world.context.flags.has('loop')) break
            if(world.context.flags.has('continue')) {
                world.context.flags.delete('continue')
            }
            read_value(node.post, world)

            // preserve var value before cleanup
            const preserve = lookup_variable({}, world, node.var.name).value
            world.context.variables = new Map()
            world.context.variables.set(node.var.name, preserve)
        }
    }

    const read_while = (node, parent) => {
        const world = {
            parent: parent,
            context: create_context()
        }

        // add flag indicating this parent context is a loop
        // if it's ever removed then the loop is "break"'ed
        world.context.flags.set('loop')

        while(
            read_boolean(
                node.statement,
                parent, 
                read_value(node.statement, world))) {
            read_scope(node.body.prog, parent, world.context)
            if(!world.context.flags.has('loop')) break
            if(world.context.flags.has('continue')) {
                world.context.flags.delete('continue')
            }
            world.context.variables = new Map()
        }
    }

    const read_postfix = (node, parent) => {
        const variable = lookup_variable(node, parent, node.name)
        
        if(typeof variable.value !== 'number') {
            throw_postfix_non_numeric(node, parent)
        }

        if(node.op.value == '++') {
            variable.parent.context.variables.set(node.name, variable.value + 1)
        } else if(node.op.value == '--') {
            variable.parent.context.variables.set(node.name, variable.value - 1)
        }

        return variable.value
    }

    const read_prefix = (node, parent) => {
        const variable = lookup_variable(node, parent, node.name)
        
        if(typeof variable.value !== 'number') {
            throw_prefix_non_numeric(node, parent)
        }

        if(node.op.value == '++') {
            variable.parent.context.variables.set(node.name, variable.value + 1)
        } else if(node.op.value == '--') {
            variable.parent.context.variables.set(node.name, variable.value - 1)
        }

        return variable.parent.context.variables.get(node.name)
    }

    const read_type = (node, parent) => {
        if(node.value == 'num') {
            return typeof 0
        } else if(node.value == 'bol') {
            return typeof true
        } else if(node.value == 'str') {
            return typeof ''
        }
    }

    const read_ret = (node, parent) => {
        const found_func = lookup_flag(node, parent, 'ret_type').parent
        const found_type = found_func.context.flags.get('ret_type')
        const ret_type = read_type(found_type)
        
        let ret_value
        if(node.value) {
            ret_value = read_value(node.value, parent, ret_type)
        } else {
            ret_value = type_default_value(ret_type)
        }

        found_func.context.flags.set('ret_value', ret_value)
        return ret_value
    }

    const read_break = (node, parent) => {
        lookup_flag(node, parent, 'loop').parent.context.flags.delete('loop')
    }

    const read_continue = (node, parent) => {
        lookup_flag(node, parent, 'loop').parent.context.flags.set('continue')
    }

    const read_scope = (prog, opt_parent, opt_context) => {
        const world = {
            parent: opt_parent,
            context: opt_context || create_context()
        }

        const was_loop = world.context.flags.has('loop')

        for(let node of prog) {
            if(world.context.flags.has('continue')) break
            if(!world.context.flags.has('loop') && was_loop) break
            if(world.context.flags.has('ret_value')) {
                return world.context.flags.get('ret_value')
            }

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
                return exec_internal(node, world)
            } else {
                throw_unknown_node_type(node, world)
            }
        }
    }

    return read_scope(ast.prog, core_sim)
}