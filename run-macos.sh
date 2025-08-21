#!/bin/bash
# Simple KU runner for macOS - makes kulang.sh work transparently

# Check if we're being called as a wrapper
if [[ "$1" == "--docker-wrapper" ]]; then
    shift
    # We're inside Docker, just run the original command
    exec "$@"
fi

# We're on macOS, run via Docker
INTERACTIVE=""
if [[ "$1" == *"snake.ku"* ]] || [[ "$1" == *"tetris.ku"* ]]; then
    INTERACTIVE="-it"
fi

exec docker run --platform linux/amd64 --rm $INTERACTIVE -v "$(pwd)":/workspace node:16-alpine sh -c "
    apk add --no-cache nasm build-base >/dev/null 2>&1
    cd /workspace
    $*
"