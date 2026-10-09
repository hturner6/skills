import sys

def count_lines(path):
    f = open(path)
    n = 0
    for line in f:
        n = n + 1
    return n

if __name__ == "__main__":
    print(count_lines(sys.argv[1]))
