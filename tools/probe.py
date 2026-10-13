import img_fetch as f, re, urllib.parse as u, sys, html, http.cookiejar, urllib.request
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
H = {'User-Agent': f.UA, 'Accept-Language': 'en-US,en;q=0.9', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'}
def g(url):
    return op.open(urllib.request.Request(url, headers=H), timeout=30).read().decode('utf-8', 'ignore')
g('https://www.bing.com/?mkt=en-US')
q = sys.argv[1] if len(sys.argv) > 1 else 'gold ring black background'
for qq in [q + ' site:unsplash.com', q + ' site:pexels.com']:
    for url in ['https://www.bing.com/images/search?q=' + u.quote_plus(qq) + '&form=HDRSC2&first=1',
                'https://www.bing.com/images/async?q=' + u.quote_plus(qq) + '&first=0&count=35&mmasync=1']:
        t = html.unescape(g(url))
        murls = re.findall(r'"murl":"([^"]+)"', t)
        print(qq, url[25:40], len(t), len(murls), sum('unsplash' in m for m in murls), sum('pexels' in m for m in murls))
        for m in murls[:3]:
            print('   ', m[:100])
