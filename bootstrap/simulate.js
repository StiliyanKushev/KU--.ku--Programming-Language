const vm = require('node:vm')
const {
    exit_error
} = require('./cmd')

// built in "core" variables and functions go here
const core_sim = new class {
    constructor() {
        this.parent = undefined
        this.context = {
            variables: new Map(),
            functions: new Map(),
        }

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

    const lookup_variable = (node, parent, name) => {
        if(!parent) throw_variable_not_exist(node, parent)
        if(parent.context.variables.has(name)) {
            return parent.context.variables.get(name)
        }
        return lookup_variable(node, parent.parent, name)
    }

    const lookup_function = (node, parent, name) => {
        if(!parent) throw_function_not_exist(node, parent)
        if(parent.context.functions.has(name)) {
            return parent.context.functions.get(name)
        }
        return lookup_function(node, parent.parent, name)
    }

    const read_call_function = (node, parent) => {
        const func = lookup_function(node, parent, node.name)

        if(func.vars.length > node.args.length) {
            throw_function_invalid_arguments_count(node, parent)
        }

        const world = {
            parent: parent,
            context: {
                variables: new Map(),
                functions: new Map(),
            }
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
            return lookup_variable(node, parent, node.value)
        } else if(node.type == 'call') {
            return read_call_function(node, parent)
        } else if(node.type == 'signed') {
            return read_signed(node, parent)
        }  else {
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
                node.name, read_value(node.value, parent))
        }
        else if(node.mode == 'assign') {
            lookup_variable(node, parent, node.name)
            parent.context.variables.set(
                node.name, read_value(node.value, parent))
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
        return read_value(node.value, parent)
    }

    const read_scope = (prog, opt_parent, opt_context) => {
        const world = {
            parent: opt_parent,
            context: opt_context || {
                variables: new Map(),
                functions: new Map(),
            }
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