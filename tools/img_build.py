r"""Build final graded WebP set + manifest.  python tools\img_build.py [stem ...]
Pillow only (numpy blocked by app control)."""
import json, os, sys, io, subprocess
from PIL import Image, ImageChops, ImageFilter, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(ROOT)
IMG = os.path.join(ROOT, 'img')
ORIG = os.path.join(IMG, 'originals')
OUT = os.path.join(PROJ, 'assets', 'img')
os.makedirs(ORIG, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
db = json.load(open(os.path.join(IMG, 'candidates.json'), encoding='utf-8'))
byn = {c['n']: c for c in db.values()}

# stem: n, aspect, widths, crop (cx, cy, zoom), focal css, alt_tr, desc_en, [compose]
# compose = (x0, y0, x1, y1) fractions of output canvas where the cropped source is placed with feathered edges
S = {
 'hero':       dict(n=365, a=(16, 9), w=[1280, 1920, 2560], c=(0.5, 0.5, 1.0), comp=(0.30, 0.0, 1.0, 1.0), f='66% 50%',
                    alt='Siyah zemin üzerinde dramatik ışıkla parlayan işlemeli altın bilezikler',
                    d='Stack of ornate yellow-gold bangles on a dark reflective surface, subject right of center, dark negative space left'),
 'hero-m':     dict(n=365, a=(9, 16), w=[720, 1080], c=(0.40, 0.5, 1.0), pre=[1, 1], comp=(0.0, 0.10, 1.0, 0.62), f='50% 35%', budget=220,
                    alt='Siyah zemin üzerinde işlemeli altın bilezikler',
                    d='Portrait crop of the hero bangles, subject upper-middle, dark space below'),
 'about':      dict(n=203, a=(4, 5), w=[640, 1080], c=(0.45, 0.5, 1.0), f='45% 50%',
                    alt='Kuyumcu tezgahında el işçiliğiyle mücevher işleyen usta eller',
                    d='Jeweler hands working a small piece at the bench, dark workshop'),
 'craft':      dict(n=170, a=(16, 9), w=[1280, 1920], c=(0.5, 0.5, 1.0), f='50% 50%',
                    alt='Kuyumcu şalumosu alevi altında şekillenen altın yüzük',
                    d='Jeweler torch flame heating a ring on the bench, dramatic warm light'),
 'cat-ring':   dict(n=128, a=(3, 4), w=[480, 800], c=(0.5, 0.5, 1.0), f='50% 50%',
                    alt='Koyu zemin üzerinde işlemeli altın yüzük koleksiyonu',
                    d='Collection of ornate yellow-gold rings on dark charcoal'),
 'cat-necklace': dict(n=545, a=(3, 4), w=[480, 800], c=(0.38, 0.55, 1.0), f='40% 55%',
                    alt='Siyah zemin üzerinde işlemeli altın kolye',
                    d='Ornate yellow-gold necklace arc on black'),
 'cat-bracelet': dict(n=663, a=(3, 4), w=[480, 800], c=(0.30, 0.5, 1.0), f='35% 50%',
                    alt='Yansıtıcı koyu zeminde işlemeli altın bilezikler',
                    d='Gold bangles stacked on a dark reflective surface'),
 'cat-diamond': dict(n=417, a=(3, 4), w=[480, 800], c=(0.5, 0.5, 1.0), f='50% 50%',
                    alt='Siyah zemin üzerinde yansımalı pırlanta taş',
                    d='Single faceted diamond with reflection on black'),
 'p-solitaire': dict(n=489, a=(4, 5), w=[640, 1080], c=(0.5, 0.5, 1.6), f='50% 50%',
                    alt='Saten üzerinde altın tektaş pırlanta yüzük',
                    d='Yellow-gold solitaire diamond ring on dark satin'),
 'p-bands':    dict(n=129, a=(4, 5), w=[640, 1080], c=(0.5, 0.5, 1.0), f='50% 50%',
                    alt='Koyu yansıtıcı zeminde iki altın alyans',
                    d='Two gold wedding bands on a dark reflective surface'),
 'p-chain':    dict(n=600, a=(4, 5), w=[640, 1080], c=(0.6, 0.5, 1.0), f='60% 50%',
                    alt='Koyu zemin üzerinde çapraz uzanan ince altın zincir',
                    d='Thin gold chain angled across a dark background'),
 'p-pendant':  dict(n=363, a=(4, 5), w=[640, 1080], c=(0.5, 0.5, 1.0), f='50% 50%',
                    alt='Siyah zemin üzerinde güneş motifli altın kolye ucu',
                    d='Gold chain with sun pendant on black'),
 'p-bangle':   dict(n=666, a=(4, 5), w=[640, 1080], c=(0.5, 0.5, 1.0), f='50% 50%',
                    alt='Kömür taşları üzerinde işlemeli altın bilezik',
                    d='Ornate gold bangle resting on dark charcoal'),
 'p-bracelet': dict(n=691, a=(4, 5), w=[640, 1080], c=(0.5, 0.5, 1.0), f='50% 50%',
                    alt='Koyu zeminde çiçek motifli altın bileklik',
                    d='Gold chain bracelet with flower charm on dark charcoal'),
 'p-earrings': dict(n=392, a=(4, 5), w=[640, 1080], c=(0.5, 0.5, 1.0), f='50% 50%',
                    alt='Siyah kumaş üzerinde işlemeli altın küpeler',
                    d='Pair of ornate gold jhumka earrings on black fabric'),
 'p-ring':     dict(n=22, a=(4, 5), w=[640, 1080], c=(0.5, 0.5, 1.0), f='50% 50%',
                    alt='Kömür taşları üzerinde telkari altın yüzük',
                    d='Intricate gold filigree ring on dark charcoal'),
}
for k, v in S.items():
    v.update({kk: vv for kk, vv in json.load(open(os.path.join(ROOT, 'img_overrides.json'))).get(k, {}).items()}) if os.path.exists(os.path.join(ROOT, 'img_overrides.json')) else None


def original(n):
    c = byn[n]
    p = os.path.join(ORIG, f"{n}_{c['key']}.jpg")
    if not os.path.exists(p):
        w = min(c['w'], 4500)
        subprocess.run(['curl', '-sL', '-o', p, f"{c['raw']}?w={w}&q=90&fm=jpg"], check=True)
    return Image.open(p).convert('RGB')


def crop(im, aspect, cx, cy, zoom):
    W, H = im.size
    ar = aspect[0] / aspect[1]
    cw, ch = (W, W / ar) if W / H < ar else (H * ar, H)
    cw, ch = cw / zoom, ch / zoom
    x = min(max(cx * W - cw / 2, 0), W - cw)
    y = min(max(cy * H - ch / 2, 0), H - ch)
    return im.crop((round(x), round(y), round(x + cw), round(y + ch)))


def lut_curve():
    out = []
    for i in range(256):
        x = i / 255
        x = max(0.0, (x - 0.035) / 0.965)          # deeper blacks
        s = x * x * (3 - 2 * x)                     # smoothstep S
        y = 0.72 * x + 0.28 * s
        out.append(round(min(1, y) * 255))
    return out


CURVE = lut_curve()


def grade(im):
    im = im.point(CURVE * 3)
    # warm highlights: lift R, trim B progressively above mid
    r = [min(255, round(i + 10 * max(0, (i - 110) / 145))) for i in range(256)]
    g = [min(255, round(i + 3 * max(0, (i - 110) / 145))) for i in range(256)]
    b = [max(0, round(i - 12 * max(0, (i - 90) / 165))) for i in range(256)]
    im = im.point(r + g + b)
    # desaturate non-gold hues
    h, s, v = im.convert('HSV').split()
    def gold_w(x):  # hue 0..255 ; gold ~ 15..40
        d = 0 if 14 <= x <= 40 else min(abs(x - 14), abs(x - 40))
        return round(255 * max(0, 1 - d / 8))
    mask = h.point([gold_w(i) for i in range(256)])
    s2 = Image.composite(s, s.point(lambda x: round(x * 0.4)), mask)
    im = Image.merge('HSV', (h, s2, v)).convert('RGB')
    return im


def vignette(im, strength=0.28):
    g = Image.radial_gradient('L').resize(im.size, Image.BILINEAR)  # 0 center .. 255 edge
    m = g.point(lambda x: round(255 * (1 - strength * min(1, (x / 255) ** 2 * 1.4))))
    return ImageChops.multiply(im, Image.merge('RGB', (m, m, m)))


def feather_mask(size, fx, fy):
    w, h = size
    m = Image.new('L', size, 255)
    d = ImageDraw.Draw(m)
    for i in range(fx):
        a = round(255 * (i / fx) ** 1.6)
        d.line([(i, 0), (i, h)], fill=a)
        d.line([(w - 1 - i, 0), (w - 1 - i, h)], fill=a)
    m2 = Image.new('L', size, 255)
    d2 = ImageDraw.Draw(m2)
    for i in range(fy):
        a = round(255 * (i / fy) ** 1.6)
        d2.line([(0, i), (w, i)], fill=a)
        d2.line([(0, h - 1 - i), (w, h - 1 - i)], fill=a)
    return ImageChops.multiply(m, m2)


FEATHER = 0.18
def compose(src, aspect, box, base_w):
    W = base_w
    H = round(W * aspect[1] / aspect[0])
    x0, y0, x1, y1 = box
    bw, bh = round((x1 - x0) * W), round((y1 - y0) * H)
    part = crop(src, (bw, bh), 0.5, 0.5, 1.0).resize((bw, bh), Image.LANCZOS)
    # background color = darkest-ish corner average of the part
    bg = part.resize((1, 1), Image.BOX).getpixel((0, 0))
    bg = tuple(round(c * 0.25) for c in bg)
    canvas = Image.new('RGB', (W, H), bg)
    fx = round(bw * FEATHER) if (x0 > 0 or x1 < 1) else 0
    fy = round(bh * 0.22) if (y0 > 0 or y1 < 1) else 0
    m = feather_mask((bw, bh), fx, fy)
    if x1 >= 1 and x0 > 0:  # feather only the left edge, keep right edge touching the frame
        m = feather_mask((bw * 2, bh), fx, fy).crop((0, 0, bw, bh))
    canvas.paste(part, (round(x0 * W), round(y0 * H)), m)
    return canvas


def save_webp(im, path, kb):
    for q in (82, 80, 77, 74, 70, 66, 62, 58):
        buf = io.BytesIO()
        im.save(buf, 'WEBP', quality=q, method=6)
        if buf.tell() <= kb * 1024:
            break
    open(path, 'wb').write(buf.getvalue())
    return buf.tell() // 1024, q


def build(stem, v, man):
    c = byn[v['n']]
    src = original(v['n'])
    maxw = max(v['w'])
    if v.get('comp'):
        pre = v.get('pre')  # optional pre-crop aspect, e.g. [3, 4]
        base = crop(src, tuple(pre), *v['c']) if pre else src
        im = compose(base, v['a'], v['comp'], maxw)
    else:
        im = crop(src, v['a'], *v['c'])
        if im.width > maxw * 1.0:
            im = im.resize((maxw, round(maxw * v['a'][1] / v['a'][0])), Image.LANCZOS)
    im = grade(im)
    if v.get('exp'):
        im = im.point(lambda x: round(x * v['exp']))
    im = vignette(im, v.get('vig', 0.28))
    sizes = {}
    for w in sorted(v['w'], reverse=True):
        h = round(w * v['a'][1] / v['a'][0])
        r = im.resize((w, h), Image.LANCZOS) if im.width != w else im
        r = r.filter(ImageFilter.UnsharpMask(radius=1.0, percent=45, threshold=2))
        if stem == 'hero':
            kb = {2560: 450, 1920: 300}.get(w, 170)
        else:
            kb = v.get('budget', 170) if w == maxw else 120
        sizes[w] = save_webp(r, os.path.join(OUT, f'{stem}-{w}.webp'), kb)
        if stem == 'hero' and w == 1920:
            og = crop(r, (1200, 630), 0.5, 0.5, 1.0).resize((1200, 630), Image.LANCZOS)
            og.save(os.path.join(OUT, 'og-photo.jpg'), quality=84, optimize=True, progressive=True)
    avg = im.resize((1, 1), Image.BOX).getpixel((0, 0))
    man[stem] = dict(widths=sorted(v['w']), aspect=f"{v['a'][0]}:{v['a'][1]}", width=maxw,
                     height=round(maxw * v['a'][1] / v['a'][0]), color='#%02x%02x%02x' % avg, focal=v['f'],
                     alt_tr=v['alt'], desc_en=v['d'], source_url=c['page'], photographer=c['user'],
                     license='Unsplash License (free commercial use, no attribution required)')
    print(stem, {w: f'{s[0]}KB q{s[1]}' for w, s in sizes.items()})


if __name__ == '__main__':
    mp = os.path.join(OUT, 'manifest.json')
    man = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else {}
    stems = sys.argv[1:] or list(S)
    for st in stems:
        build(st, S[st], man)
    man = {k: man[k] for k in S if k in man}
    json.dump(man, open(mp, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    # review sheet
    tiles = []
    for st in S:
        if st in man:
            w = man[st]['widths'][0]
            tiles.append((st, Image.open(os.path.join(OUT, f'{st}-{w}.webp')).convert('RGB')))
    sheet = Image.new('RGB', (1800, 2400), (60, 60, 60))
    x = y = 0; rowh = 0
    for st, t in tiles:
        t.thumbnail((440, 360))
        if x + t.width > 1800:
            x, y = 0, y + rowh + 30; rowh = 0
        sheet.paste(t, (x, y)); ImageDraw.Draw(sheet).text((x + 4, y + t.height + 4), st, fill=(255, 210, 90))
        x += t.width + 10; rowh = max(rowh, t.height)
    sheet.crop((0, 0, 1800, y + rowh + 30)).save(os.path.join(IMG, 'final_sheet.jpg'), quality=85)
