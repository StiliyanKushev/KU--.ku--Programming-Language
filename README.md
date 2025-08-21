# Ku Lang

A compiled programming language made from scratch using solely Node.JS.

**Platform Support:**
- **Linux**: Native support (x86 32-bit)
- **macOS**: Supported via Docker with Rosetta 2 emulation
- **Windows**: Not supported



## Getting started

### Linux (Native)

1. Clone the repository:
   ```bash
   git clone https://github.com/StiliyanKushev/KU--.ku--Programming-Language.git
   cd KU--.ku--Programming-Language
   ```

2. Install dependencies:
   ```bash
   ./install.sh
   ```

3. Run hello world:
   ```bash
   ./kulang.sh examples/helloworld.ku -c -o hello && ./hello
   ```

### macOS (Docker + Rosetta 2)

1. **Prerequisites:**
   - Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   - Enable Rosetta 2: `softwareupdate --install-rosetta --agree-to-license`
   - In Docker Desktop settings, enable "Use Rosetta for x86/amd64 emulation"

2. Clone the repository:
   ```bash
   git clone https://github.com/StiliyanKushev/KU--.ku--Programming-Language.git
   cd KU--.ku--Programming-Language
   ```

3. **Use the wrapper scripts (works exactly like Linux):**
   ```bash
   # Compile and run hello world (automatically runs after compilation)
   ./kulang-macos.sh examples/helloworld.ku -c -o hello
   
   # View AST or assembly
   ./kulang-macos.sh examples/helloworld.ku -a
   ./kulang-macos.sh examples/helloworld.ku -c -o hello -m
   
   # Run games (automatically compiles and runs with interactive terminal)
   ./kulang-macos.sh examples/snake.ku -c -o snake
   ./kulang-macos.sh examples/tetris.ku -c -o tetris
   
   # Run tests
   ./test-macos.sh -c
   ```

   **That's it!** The wrapper scripts automatically:
   - Set up Docker with Rosetta 2 emulation
   - Install build tools (NASM, GCC) 
   - Compile your KU program
   - Run the program immediately (if compiled)
   - Handle interactive terminal for games

### Command Line Options

```
Usage: kulang.sh /path/to/file.ku [options]
Options:
  -h, --help                    Show this help message
  -v, --version                 Show version
  -o, --output                  Output file path
  -c, --compile                 Compile to native
  -a, --ast                     Print AST
  -m, --asm                     Print ASM
```

### Testing

- **Linux**: `./test.sh -c`
- **macOS**: `./run-macos.sh --test`

### VS Code Extension

Install syntax highlighting:
```bash
cp -r ./kulang-vscode-extension ~/.vscode/extensions
```

## Features

1. **Interpreter**: (deprecated)

   By default the program runs any given .ku file in an interpreted mode. 

   This will result in significant drop in performance (However, if you've used node.js before you're probably used to that.)

2. **Compiler**: 
   To run in compiled mode you'd have to use the `-c` option along with `-o`.

   You can then print the generated assembly using `-m`.



##### Example AST print:

```js
{
  type: 'prog',
  prog: [
    {
      type: 'include',
      fd: { type: 'str', value: '../libstd/std.ku' },
      location: { pos: 7, line: 1, col: 7 }
    },
    {
      type: 'call',
      name: 'outln',
      args: [
        {
          location: { pos: 48, line: 3, col: 21 },
          type: 'str',
          value: 'Hello World'
        }
      ],
      location: { pos: 34, line: 3, col: 7 }
    }
  ]
}
```



##### Example ASM print:

```assembly
1: 
2:      section .data
3: 
4:      __14_0000000000: db 0x0, 0x0
5:      __15_0000000000: db 0x0, 0x0
6:      __29_0000000000: db 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64, 0xa, 0x0
7: 
8:      section .text
9:      global _start
10:     _start:
11:     push ebp
12:     mov ebp, esp
13: 
14:     ;; --- program :begin: --- ;;
15: 
16: 
17:     ;; str
18:     mov eax, __29_0000000000
19:     push eax ;; sctrd arg 4
20:     ;; --- scattered arguments --- ;;
21:     mov eax, [ebp - 4]
22:     push eax
23:     push ebp
24:     call __out__begin__27_0000000000
25:     pop ebp
26:     add esp, 4 * 1
27:     ;; -- free_set_context -- ;;
28: 
29:     ;; --- program :end: (exit 0) --- ;;
30:     mov esp, ebp
31:     pop ebp
32:     mov eax, 1
33:     mov ebx, 0
34:     int 0x80
35:     ;; --- function defines :begin: --- ;;
36: 
37:     jmp __syscall__skip__1_0000000000
38:     __syscall__begin__2_0000000000:
39:     push ebp
40:     mov ebp, esp
41:     ;; --- function declare "syscall" [num] --- ;;
42:     ;; --- declare "arg_eax" [num] (4) --- ;;
...
...
...
507:    ;; -- free_set_context -- ;;
508:    mov eax, [ebp - 40]
509:    jmp __out__ret__28_0000000000
510:    __out__ret__28_0000000000:
511:    mov esp, ebp
512:    pop ebp
513:    ret
514:    __out__skip__26_0000000000:
515: 
516:    ;; --- function defines :end: --- ;;
517: 
518:
```





# Example programs



1. Snake game

   ![snake game](https://i.imgur.com/44Yhou8.gif)

2. Tetris game

   ![snake game](https://i.imgur.com/7aXG9B0.gif)



## Conclusion

This should not be used for anything more than some shitty example games.<br>
It lacks a lot of features that modern programming languages have.<br>
I simply created it to prove you can take javascript and create a faster<br>
(compiled) programming language (albeit shittier).<br>
