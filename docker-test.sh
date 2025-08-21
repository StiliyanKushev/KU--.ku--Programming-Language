#!/bin/bash
# Helper script for testing KU Programming Language on macOS using Docker

set -e

echo "Building KU test environment..."
docker build -f Dockerfile.test -t ku-test .

echo "Running KU test environment..."
echo "This will mount your current directory and provide a Linux environment for testing."
echo ""

docker run -it --rm -v "$(pwd)":/ku-workspace ku-test bash -c "
    echo '=== KU Programming Language Test Environment ==='
    echo 'Installing dependencies...'
    ./install.sh
    echo ''
    echo 'Running compiler tests...'
    ./test.sh -c
    echo ''
    echo 'Testing hello world compilation...'
    ./kulang.sh examples/helloworld.ku -c -o hello_test
    echo 'Running hello world...'
    ./hello_test
    echo ''
    echo 'Test completed successfully!'
"
