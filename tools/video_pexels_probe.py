import subprocess, sys, re
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36"
def loc(i):
    r = subprocess.run(["curl", "-s", "-I", "-A", UA, f"https://www.pexels.com/download/video/{i}/"], capture_output=True, text=True, errors="ignore")
    m = re.search(r"(?im)^location: (\S+)", r.stdout)
    return m.group(1) if m else None
if __name__ == "__main__":
    a, b = int(sys.argv[1]), int(sys.argv[2])
    for i in range(a, b + 1):
        l = loc(i)
        if l: print(i, l, flush=True)
