r"""Unsplash napi client that solves the Anubis PoW challenge (difficulty-1 sha256) to obtain a cookie.
Usage: python tools\unsplash_api.py "query" [pages]
"""
import hashlib, http.cookiejar, json, re, sys, time, urllib.parse, urllib.request

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def raw(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9'})
    try:
        r = op.open(req, timeout=30)
        return r.status, r.geturl(), r.read().decode('utf-8', 'ignore')
    except urllib.error.HTTPError as e:
        return e.code, url, e.read().decode('utf-8', 'ignore')


def solve(page, redir):
    ch = json.loads(re.search(r'id="anubis_challenge" type="application/json">(.*?)\n?</script>', page, re.S).group(1))
    c = ch['challenge']
    diff = ch['rules']['difficulty']
    rd = c['randomData']
    t0 = time.time()
    n = 0
    while True:
        h = hashlib.sha256((rd + str(n)).encode()).hexdigest()
        if h.startswith('0' * diff):
            break
        n += 1
    q = urllib.parse.urlencode({'id': c['id'], 'response': h, 'nonce': n, 'redir': redir,
                                'elapsedTime': int((time.time() - t0) * 1000) + 300})
    time.sleep(0.4)
    return raw('https://unsplash.com/.within.website/x/cmd/anubis/api/pass-challenge?' + q)


def napi(path):
    url = 'https://unsplash.com' + path
    for _ in range(3):
        st, u, body = raw(url)
        if 'anubis_challenge' in body:
            solve(body, path)
            continue
        return st, body
    return st, body


if __name__ == '__main__':
    q = sys.argv[1]
    st, body = napi('/napi/search/photos?query=' + urllib.parse.quote(q) + '&per_page=30')
    print(st, body[:500])
