const vm = require('node:vm')
const {
    exit_error
} = require('./cmd')

// universal function for preparing context of a scope
const create_context = () => ({
    variables: new Map(),
    functions: new Map(),
    flags: new Set()
})

// built in "core" variables and functions go here
const core_sim = new class {
    constructor() {
        this.parent = undefined
        this.context = create_context()
        this.context.functions.set("out", this.out)
    }

    make_f({ name, vars, code_func }) {
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
            }
        }
    }

    make_arg(name) {
        return {
            type: 'var',
            value: name,
            location: { 
                pos: 'internal', 
                line: 'internal', 
                col: 'internal' 
            }
        }
    }

    // prints to the stdout
    get out() {
         return this.make_f({
            name: 'out',
            vars: [ this.make_arg('data') ],
            code_func: function () {
                const data = this.context.variables.get('data')
                console.log(typeof data == 'undefined' ? '' : data)
            }
         })
    }
}

// only used to execute internal code from "core"
const exec_internal = (node, parent) => {
    const vm_context = vm.createContext({
        ...parent,
        // context is empty initially
        console: console
    })
    const result = vm.runInNewContext(node.code, vm_context)
    return result
}

module.exports.simulate_ast = ast => {
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
        if(!parent) throw_variable_not_exist(node, parent)
        if(parent.context.variables.has(name)) {
            return {
                parent: parent,
                value: parent.context.variables.get(name)
            }
        }
        return lookup_variable(node, parent.parent, name)
    }

    const lookup_function = (node, parent, name) => {
        if(!parent) throw_function_not_exist(node, parent)
        if(parent.context.functions.has(name)) {
            return {
                parent: parent,
                value: parent.context.functions.get(name)
            }
        }
        return lookup_function(node, parent.parent, name)
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

        func.vars.forEach((arg_var, i) => {
            const arg_var_declare = {
                type: 'var',
                mode: 'declare',
                name: arg_var.value,
                value: node.args[i],
                location: arg_var.location
            }
            read_var(arg_var_declare, world)
        })

        return read_scope(func.body.prog, parent, world.context)
    }

    const read_value = (node, parent) => {
        if(node.type == 'num') {
            return node.value
        } else if(node.type == 'str') {
            return node.value
        } else if(node.type == 'bool') {
            return node.value
        } else if(node.type == 'binary') {
            return read_binary(node, parent)
        } else if(node.type == 'var') {
            return lookup_variable(node, parent, node.value).value
        } else if(node.type == 'call') {
            return read_call_function(node, parent)
        } else if(node.type == 'signed') {
            return read_signed(node, parent)
        } else if(node.type == 'postfix') {
            return read_postfix(node, parent)
        } else if(node.type == 'prefix') {
            return read_prefix(node, parent)
        } else {
            throw_unknown_node_type(node, parent)
        }
    }

    const read_func = (node, parent) => {
        if(parent.context.functions.has(node.name)) {
            throw_function_already_declared(node, parent)
        }
        parent.context.functions.set(node.name, node)
    }

    const read_signed = (node, parent) => {
        const value = read_value(node.value, parent)
        if(typeof value !== 'number') {
            throw_signed_non_numeric(node, parent)
        }
        return node.operator == '+' ? value : -value
    }

    const read_binary = (node, parent) => {
        const left = read_value(node.left, parent)
        const right = read_value(node.right, parent)

        // todo: maybe the language should support that?
        if(typeof left !== typeof right) {
            throw_fatal_error(
                `binary operation on different types`, node, parent)
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
            parent.context.variables.set(
                node.name, node.value ? read_value(node.value, parent) : 0)
        }
        else if(node.mode == 'assign') {
            lookup_variable(node, parent, node.name).parent.context.variables.set(
                node.name, read_value(node.value, parent))
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
            location: node.var.location
        }
        read_var(var_declare, world)

        // add flag indicating this parent context is a loop
        // if it's ever removed then the look is "break"'ed
        world.context.flags.add('loop')

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
        // if it's ever removed then the look is "break"'ed
        world.context.flags.add('loop')

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

    const read_ret = (node, parent) => {
        return read_value(node.value, parent)
    }

    const read_break = (node, parent) => {
        lookup_flag(node, parent, 'loop').parent.context.flags.delete('loop')
    }

    const read_continue = (node, parent) => {
        lookup_flag(node, parent, 'loop').parent.context.flags.add('continue')
    }

    const read_scope = (prog, opt_parent, opt_context) => {
        const world = {
            parent: opt_parent,
            context: opt_context || create_context()
        }

        for(let node of prog) {
            if(world.context.flags.has('continue')) break

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

    return read_scope(ast.prog, core_sim)
}