#!/bin/bash
# KU Programming Language - macOS Runner Script
# Runs KU programs on macOS using Docker with Rosetta 2 emulation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Show help
show_help() {
    echo "KU Programming Language - macOS Runner"
    echo "======================================"
    echo ""
    echo "Usage: $0 <ku_file> [output_name]"
    echo ""
    echo "Examples:"
    echo "  $0 examples/helloworld.ku"
    echo "  $0 examples/helloworld.ku hello"
    echo "  $0 testing/tests/assign/source.ku"
    echo ""
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -t, --test     Run all tests"
    echo "  --setup        Check and setup requirements"
    echo ""
    echo "Requirements:"
    echo "  - Docker Desktop with Rosetta 2 enabled"
    echo "  - macOS with Apple Silicon (M1/M2/M3)"
    echo ""
}

# Check requirements
check_requirements() {
    print_status "Checking macOS requirements..."
    
    # Check if we're on Apple Silicon
    if [[ $(uname -m) != "arm64" ]]; then
        print_warning "This script is optimized for Apple Silicon Macs"
    fi
    
    # Check if Docker is available and running
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker Desktop."
        echo "Download from: https://www.docker.com/products/docker-desktop/"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker Desktop."
        exit 1
    fi
    
    # Check if Rosetta 2 is installed
    if ! /usr/bin/pgrep oahd &> /dev/null; then
        print_warning "Rosetta 2 may not be installed or running."
        echo "To install Rosetta 2, run:"
        echo "  softwareupdate --install-rosetta --agree-to-license"
    fi
    
    print_success "All requirements satisfied!"
}

# Run KU program
run_ku_program() {
    local ku_file="$1"
    local output_name="${2:-$(basename "$ku_file" .ku)}"
    
    if [[ ! -f "$ku_file" ]]; then
        print_error "File not found: $ku_file"
        exit 1
    fi
    
    print_status "Compiling and running: $ku_file"
    
    docker run --platform linux/amd64 --rm -v "$(pwd)":/workspace node:16-alpine sh -c "
        # Install build tools quietly
        apk add --no-cache nasm build-base > /dev/null 2>&1
        
        cd /workspace
        
        # Compile the KU program
        echo '🔨 Compiling KU program...'
        ./kulang.sh '$ku_file' -c -o '$output_name'
        
        # Run the program
        echo '🚀 Running program:'
        echo '----------------------------------------'
        ./'$output_name'
        echo '----------------------------------------'
        
        # Clean up
        rm -f '$output_name'
    "
    
    print_success "Program executed successfully!"
}

# Run all tests
run_tests() {
    print_status "Running KU Programming Language tests..."
    
    docker run --platform linux/amd64 --rm -v "$(pwd)":/workspace node:16-alpine sh -c "
        apk add --no-cache nasm build-base > /dev/null 2>&1
        cd /workspace
        ./install.sh > /dev/null
        
        echo '🧪 Running compiler tests...'
        
        # Test each example
        for test_dir in testing/tests/*/; do
            if [[ -f \"\$test_dir/source.ku\" ]]; then
                test_name=\$(basename \"\$test_dir\")
                echo \"Testing \$test_name...\"
                
                ./kulang.sh \"\$test_dir/source.ku\" -c -o \"test_\$test_name\"
                output=\$(./\"test_\$test_name\" 2>&1 || true)
                expected=\$(cat \"\$test_dir/expect.log\" 2>/dev/null || echo '')
                
                if [[ \"\$output\" == \"\$expected\" ]]; then
                    echo \"✅ \$test_name: PASSED\"
                else
                    echo \"❌ \$test_name: FAILED\"
                    echo \"  Expected: \$expected\"
                    echo \"  Got: \$output\"
                fi
                
                rm -f \"test_\$test_name\"
            fi
        done
        
        echo ''
        echo '🎉 Test run completed!'
    "
}

# Main script logic
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    --setup)
        check_requirements
        exit 0
        ;;
    -t|--test)
        check_requirements
        run_tests
        exit 0
        ;;
    "")
        print_error "No input file specified"
        show_help
        exit 1
        ;;
    *)
        check_requirements
        run_ku_program "$1" "$2"
        ;;
esac
