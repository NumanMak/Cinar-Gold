r"""Collect candidates via Unsplash napi search (Anubis PoW solved in unsplash_api.py).
Skips Unsplash+ (premium/plus) images. Downloads 400px previews.
Usage: python tools\img_fetch.py "query one" "query two" ...   (append ::N to a query for N pages, default 1 page of 30)
"""
import json, os, sys, urllib.parse, urllib.request, concurrent.futures as cf
import unsplash_api as U

ROOT = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(ROOT, 'img')
CAND = os.path.join(IMG, 'candidates')
DB = os.path.join(IMG, 'candidates.json')
os.makedirs(CAND, exist_ok=True)


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={'User-Agent': U.UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def load():
    return json.load(open(DB, encoding='utf-8')) if os.path.exists(DB) else {}


def save(db):
    json.dump(db, open(DB, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)


def search(q, pages=1):
    out = []
    for p in range(1, pages + 1):
        if q.startswith('@'):
            st, body = U.napi(f'/napi/users/{q[1:]}/photos?per_page=30&page={p}')
        else:
            st, body = U.napi('/napi/search/photos?query=' + urllib.parse.quote(q) + f'&per_page=30&page={p}')
        if st != 200:
            print('ERR', q, st)
            break
        data = json.loads(body)
        for r in (data if isinstance(data, list) else data['results']):
            if r.get('premium') or r.get('plus') or 'plus.unsplash.com' in r['urls']['raw']:
                continue
            raw = r['urls']['raw'].split('?')[0]
            out.append({'key': r['id'], 'raw': raw, 'w': r['width'], 'h': r['height'],
                        'desc': r.get('alt_description') or r.get('description') or '',
                        'user': r['user']['name'], 'username': r['user']['username'],
                        'page': r['links']['html'], 'color': r.get('color'), 'q': q})
    return out


def preview(c):
    p = os.path.join(CAND, c['key'] + '.jpg')
    if os.path.exists(p):
        return True
    try:
        open(p, 'wb').write(get(c['raw'] + '?w=400&q=70&fm=jpg'))
        return True
    except Exception as e:
        print('ERR prev', c['key'], e)
        return False


def main(qs):
    db = load()
    new = []
    for q in qs:
        pages = 1
        if '::' in q:
            q, pages = q.split('::')
            pages = int(pages)
        n0 = len(new)
        for c in search(q, pages):
            if c['key'] not in db:
                c['n'] = len(db)
                db[c['key']] = c
                new.append(c)
        print(f'{q!r}: +{len(new)-n0}')
    with cf.ThreadPoolExecutor(12) as ex:
        ok = list(ex.map(preview, new))
    for c, k in zip(new, ok):
        if not k:
            c['bad'] = True
    save(db)
    print('new', len(new), 'ok', sum(ok), 'total', len(db), 'range', new[0]['n'] if new else '-', '-', new[-1]['n'] if new else '-')


if __name__ == '__main__':
    main(sys.argv[1:])
