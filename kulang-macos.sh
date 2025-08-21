#!/bin/bash
# macOS wrapper for kulang.sh - compile and run KU programs seamlessly

# Check if we're compiling (has -c flag and -o flag)
COMPILE_AND_RUN=false
OUTPUT_FILE=""

# Parse arguments to detect compilation
for ((i=1; i<=$#; i++)); do
    arg="${!i}"
    if [[ "$arg" == "-c" ]]; then
        # Look for -o flag
        next_i=$((i+1))
        next_next_i=$((i+2))
        if [[ "${!next_i}" == "-o" ]] && [[ -n "${!next_next_i}" ]]; then
            COMPILE_AND_RUN=true
            OUTPUT_FILE="${!next_next_i}"
            break
        fi
    fi
done

# Run via Docker
if [[ "$COMPILE_AND_RUN" == "true" ]]; then
    # Compile and run automatically
    docker run --platform linux/amd64 --rm -it -v "$(pwd)":/workspace node:16-alpine sh -c "
        apk add --no-cache nasm build-base >/dev/null 2>&1
        cd /workspace
        ./kulang.sh $* && ./$OUTPUT_FILE
    "
else
    # Just run the command (AST, help, etc.)
    docker run --platform linux/amd64 --rm -v "$(pwd)":/workspace node:16-alpine sh -c "
        apk add --no-cache nasm build-base >/dev/null 2>&1
        cd /workspace
        ./kulang.sh $*
    "
fi
