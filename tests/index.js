// loop all functions in the current directory
// and execute a specific command for each sub directory

const os              = require('os')
const fs              = require('fs')
const path            = require('path')
const { execSync }    = require('child_process')
const diff            = require('diff')

const compiler_path   = path.join(__dirname, '../bootstrap/index.js')
const tmp_path        = path.join(os.tmpdir(), `./${Math.random().toString().replace('.', '')}`)

fs.mkdirSync(tmp_path)

const should_test_compiler = process.argv.includes('-c')
const should_test_simulator = process.argv.includes('-s')

if(!should_test_compiler && !should_test_simulator) {
    console.log('No tests selected. Use -c to test the compiler and/or -s to test the simulator')
    process.exit(0)
}

function exec_tests(dir) {
    fs.readdirSync(dir).forEach(file => {
        const file_path = path.join(dir, file)
        const stat = fs.statSync(file_path)
    
        if (!stat.isDirectory()) {
            return
        }

        const correct = e => console.log(`\x1b[32m%s\x1b[0m`, '✓', ...e)
        const wrong = () => console.log(`\x1b[31m%s\x1b[0m`, '✗')
        const error = e => console.log(`\x1b[31m%s\x1b[0m`, e)
        const succsess = (size, time) => correct([`(${size} bytes) (${time}ms)`])

        const files = fs.readdirSync(file_path)
        const expect = files.find(file => file === 'expect.log')
        const source = files.find(file => file === 'source.ku')

        if (!expect || !source) {
            process.stdout.write(`failed test for "${file}": `)
            wrong()
            error('Missing expect.log and/or source.ku')
            return
        }

        const source_path = path.join(file_path, 'source.ku')
        const expect_path = path.join(file_path, 'expect.log')

        const test_folder = path.join(tmp_path, file)
        fs.mkdirSync(test_folder)
        const tmp_file_path = path.join(test_folder, 'out')

        const com_command = `node ${compiler_path} ${source_path} -c -o ${tmp_file_path}`
        const sim_command = `node ${compiler_path} ${source_path}`
        const expected = fs.readFileSync(expect_path).toString()

        const compare = result => {
            if (result !== expected) {
                wrong()
                error('Different output than expected')
                // print the differences between the expected and the actual output
                const diff_result = diff.diffChars(expected, result)
                diff_result.forEach(part => {
                    const green = '\x1b[32m'
                    const red = '\x1b[31m'
                    const gray = '\x1b[90m'
                    const color = part.added ? green : part.removed ? red : gray
    
                    // print part.value with color as encoding
                    process.stderr.write(color)
                    process.stderr.write(part.value)
                })
                console.log('\x1b[0m')
                return
            }
        }

        if (should_test_compiler) {
            process.stdout.write(`compilation test "${file}": `)
            try {
                execSync(com_command, { stdio: 'pipe' }).toString()
            } catch {
                wrong()
                error('Compilation failed')
                console.log('----------------------')
                try { execSync(com_command) } catch {  }
                console.log('\n----------------------')
                return
            }

            const start_time = Date.now()
            const result = execSync(tmp_file_path, { stdio: 'pipe' }).toString().replaceAll('\x01', '')
            const time = Date.now() - start_time

            compare(result)

            succsess(result.length, time)
        }

        if (should_test_simulator) {
            process.stdout.write(`simulation test "${file}": `)
            try {
                const start_time = Date.now()
                const result = execSync(sim_command, { stdio: 'pipe' }).toString()
                const time = Date.now() - start_time
                compare(result)
                succsess(result.length, time)
            } catch {
                wrong()
                error('Simulation failed')
                console.log('----------------------')
                try { execSync(sim_command) } catch {  }
                console.log('\n----------------------')
                return
            }
        }
    })
}

exec_tests(__dirname)
fs.rmSync(tmp_path, { recursive: true })