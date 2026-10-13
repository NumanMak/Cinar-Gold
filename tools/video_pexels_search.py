import subprocess, re, sys, urllib.parse
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
def get(url):
    return subprocess.run(["curl", "-sL", "-A", UA, url], capture_output=True).stdout.decode("utf-8", "ignore")
ids = {}
for q in sys.argv[1:]:
    for eng in ["https://html.duckduckgo.com/html/?q=", "https://www.bing.com/search?q="]:
        h = get(eng + urllib.parse.quote("pexels video " + q))
        h = urllib.parse.unquote(h)
        for m in re.finditer(r"pexels\.com/(?:[a-z\-]+/)?video/([a-z0-9\-]+?)-(\d{5,9})/?", h):
            ids[m.group(2)] = m.group(1)
for k, v in ids.items():
    print(k, v)
