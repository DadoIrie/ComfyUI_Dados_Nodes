import argparse
import time
import xxhash

def test_xxhash_performance(file_path, iterations=10):
    """Test xxhash performance"""
    
    try:
        # Read file content
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read().encode('utf-8')
        
        print(f"Testing xxhash performance on: {file_path}")
        print(f"Content size: {len(content)} bytes")
        print(f"Iterations: {iterations}")
        print("-" * 40)
        
        # Warm up
        xxhash.xxh64(content).hexdigest()
        
        # Time multiple iterations
        start_time = time.perf_counter()
        
        for i in range(iterations):
            xxhash.xxh64(content).hexdigest()
        
        end_time = time.perf_counter()
        
        total_time = (end_time - start_time) * 1000  # milliseconds
        avg_time = total_time / iterations
        
        print(f"Total time: {total_time:.4f}ms")
        print(f"Average time per hash: {avg_time:.4f}ms")
        print(f"Hashes per second: {iterations / (total_time / 1000):.0f}")
        
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found")
    except Exception as e:
        print(f"Error: {e}")

def main():
    parser = argparse.ArgumentParser(description='Test xxhash performance')
    parser.add_argument('file_path', help='Path to the text file to hash')
    parser.add_argument('-t', '--times', type=int, default=10, help='Number of times to hash the file (default: 10)')
    
    args = parser.parse_args()
    test_xxhash_performance(args.file_path, args.times)


if __name__ == "__main__":
    main()