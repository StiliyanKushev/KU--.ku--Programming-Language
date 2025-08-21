#!/bin/bash
# macOS wrapper for test.sh - transparent Docker execution

# Run tests via Docker with Rosetta 2
exec docker run --platform linux/amd64 --rm -v "$(pwd)":/workspace node:16-alpine sh -c "
    apk add --no-cache nasm build-base >/dev/null 2>&1
    cd /workspace
    ./install.sh >/dev/null
    ./test.sh $*
"
