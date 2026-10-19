"""Ürün görsellerini (SVG) üretir: assets/img/products/<ürün-id>.svg
Her model için ayrı bir çizim, metal rengine (sarı, rose, beyaz altın) göre üç renk varyantı.
Bunlar fotoğraf değil, özgün illüstrasyonlardır; gerçek ürün fotoğrafları aynı dosya adıyla (.webp/.jpg) değiştirilebilir
(tools/gen_products.py içindeki IMAGE_EXT ayarı).
Kullanım: python tools/gen_product_art.py
"""
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "img" / "products"

METALS = {
    "sari": ("#fff3cd", "#f0cf7a", "#c99a3e", "#80581a"),
    "rose": ("#ffe6d8", "#f0b196", "#c2705a", "#7f4232"),
    "beyaz": ("#ffffff", "#e6e9ef", "#aab0bd", "#6b7280"),
}
W, H = 800, 1000
CX, CY = 400, 560


def slug(text):
    return text.translate(str.maketrans('çğıöşüÇĞİÖŞÜ', 'cgiosuCGIOSU')).lower().replace(' ', '-')


def f(n):
    return f"{n:.1f}".rstrip("0").rstrip(".")


def defs(metal):
    l, m, d, x = METALS[metal]
    return f"""<defs>
<radialGradient id="bg" cx="50%" cy="36%" r="80%"><stop offset="0" stop-color="#32291f"/><stop offset=".55" stop-color="#16120e"/><stop offset="1" stop-color="#070605"/></radialGradient>
<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{l}"/><stop offset=".3" stop-color="{m}"/><stop offset=".65" stop-color="{d}"/><stop offset="1" stop-color="{x}"/></linearGradient>
<linearGradient id="metalR" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{l}"/><stop offset=".3" stop-color="{m}"/><stop offset=".65" stop-color="{d}"/><stop offset="1" stop-color="{x}"/></linearGradient>
<linearGradient id="metalV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{l}"/><stop offset=".5" stop-color="{m}"/><stop offset="1" stop-color="{d}"/></linearGradient>
<radialGradient id="gem" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#e3effb"/><stop offset="1" stop-color="#9fbbd9"/></radialGradient>
<radialGradient id="gemDark" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#2e5fa8"/><stop offset="1" stop-color="#0d2247"/></radialGradient>
<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="{m}" stop-opacity=".28"/><stop offset="1" stop-color="{m}" stop-opacity="0"/></radialGradient>
<filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>
</defs>"""


def page(metal, body, floor_y=860, dy=0):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{defs(metal)}'
            f'<rect width="{W}" height="{H}" fill="url(#bg)"/>'
            f'<ellipse cx="{CX}" cy="{CY}" rx="360" ry="360" fill="url(#glow)"/>'
            f'<ellipse cx="{CX}" cy="{floor_y}" rx="250" ry="26" fill="#000" opacity=".55" filter="url(#blur)"/>'
            f'<g transform="translate(0 {dy})">{body}</g></svg>')


# ---------------------------------------------------------------- parçalar
def star(cx, cy, r, op=0.95):
    return (f'<path d="M{f(cx)} {f(cy - r)} Q{f(cx)} {f(cy)} {f(cx + r)} {f(cy)} Q{f(cx)} {f(cy)} {f(cx)} {f(cy + r)} '
            f'Q{f(cx)} {f(cy)} {f(cx - r)} {f(cy)} Q{f(cx)} {f(cy)} {f(cx)} {f(cy - r)}Z" fill="#fff" opacity="{op}"/>')


def gem(cx, cy, r, sparkle=True):
    """Pırlanta (üstten görünüm, sekiz kenarlı çizim, yüzeyler ve parıltı)."""
    ang = [math.pi / 8 + i * math.pi / 4 for i in range(8)]
    outer = [(cx + r * math.cos(a), cy + r * math.sin(a)) for a in ang]
    table = [(cx + r * .52 * math.cos(a), cy + r * .52 * math.sin(a)) for a in ang]
    pts = lambda ps: " ".join(f"{f(x)},{f(y)}" for x, y in ps)
    s = [f'<polygon points="{pts(outer)}" fill="url(#gem)" stroke="#7f9bbd" stroke-width="{f(max(r * .03, .8))}"/>']
    for i in range(8):
        j = (i + 1) % 8
        shade = "#ffffff" if i % 2 == 0 else "#7fa0c8"
        s.append(f'<polygon points="{pts([table[i], table[j], outer[j], outer[i]])}" fill="{shade}" opacity="{.5 if i % 2 == 0 else .28}"/>')
        s.append(f'<line x1="{f(table[i][0])}" y1="{f(table[i][1])}" x2="{f(outer[i][0])}" y2="{f(outer[i][1])}" stroke="#6d8bb0" stroke-width="{f(max(r * .018, .6))}" opacity=".7"/>')
    s.append(f'<polygon points="{pts(table)}" fill="#ffffff" opacity=".78" stroke="#9fb6d3" stroke-width="{f(max(r * .02, .6))}"/>')
    if sparkle:
        s.append(star(cx - r * .35, cy - r * .4, r * .55))
    return "".join(s)


def ring_band(cx, cy, ro, ri, fill="url(#metal)"):
    d = (f"M{f(cx - ro)} {f(cy)}a{f(ro)} {f(ro)} 0 1 0 {f(2 * ro)} 0a{f(ro)} {f(ro)} 0 1 0 {f(-2 * ro)} 0Z"
         f"M{f(cx - ri)} {f(cy)}a{f(ri)} {f(ri)} 0 1 1 {f(2 * ri)} 0a{f(ri)} {f(ri)} 0 1 1 {f(-2 * ri)} 0Z")
    mid = (ro + ri) / 2
    return (f'<path d="{d}" fill="{fill}" fill-rule="evenodd"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(ri)}" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="3"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(ro)}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2"/>'
            f'<path d="M{f(cx - mid * .72)} {f(cy - mid * .69)}A{f(mid)} {f(mid)} 0 0 1 {f(cx + mid * .1)} {f(cy - mid * .995)}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="{f((ro - ri) * .22)}" stroke-linecap="round"/>')


def prongs(cx, cy, r):
    s = []
    for dx in (-1, 1):
        s.append(f'<path d="M{f(cx + dx * r * .95)} {f(cy - r * .2)}l{f(dx * r * .25)} {f(r * .15)}l{f(-dx * r * .45)} {f(r * .9)}l{f(-dx * r * .22)} {f(-r * .1)}Z" fill="url(#metal)" stroke="#00000055" stroke-width="1.5"/>')
    return "".join(s)


def chain_path(d, width=11, link=14, gap=5):
    return (f'<path d="{d}" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="{width + 4}" stroke-linecap="round" transform="translate(0 4)"/>'
            f'<path d="{d}" fill="none" stroke="url(#metal)" stroke-width="{width}" stroke-linecap="round" stroke-dasharray="{link} {gap}"/>'
            f'<path d="{d}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-linecap="round" stroke-dasharray="{link} {gap}" transform="translate(0 -3)"/>')


def ell_pt(cx, cy, rx, ry, rot, t):
    x, y = rx * math.cos(t), ry * math.sin(t)
    c, s = math.cos(rot), math.sin(rot)
    return cx + x * c - y * s, cy + x * s + y * c


def bangle_base(rx, ry, width, rot=-14):
    """Bileziğin eğik (perspektifli) halkası: kalın bir elips çizgisi."""
    t = f'transform="rotate({rot} {CX} {CY})"'
    return (f'<g {t}>'
            f'<ellipse cx="{CX}" cy="{CY + 8}" rx="{rx}" ry="{ry}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="{width + 6}"/>'
            f'<ellipse cx="{CX}" cy="{CY}" rx="{rx}" ry="{ry}" fill="none" stroke="url(#metal)" stroke-width="{width}"/>'
            f'<ellipse cx="{CX}" cy="{CY}" rx="{rx}" ry="{ry}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="{f(width * .3)}" transform="translate(0 {f(-width * .22)})"/>'
            f'</g>')


# ---------------------------------------------------------------- yüzükler
def ring_tektas(metal, g):
    ro, ri = 215 + g, 172 + g * .6
    cy = 610
    top = cy - ro
    return (ring_band(CX, cy, ro, ri) + prongs(CX, top - 30, 70)
            + f'<path d="M{CX - 54} {f(top + 6)}L{CX - 40} {f(top - 52)}H{CX + 40}L{CX + 54} {f(top + 6)}Z" fill="url(#metalV)" stroke="#00000055" stroke-width="1.5"/>'
            + gem(CX, top - 78, 72))


def ring_telkari(metal, g):
    ro, ri = 228 + g, 164 + g * .6
    cy = 600
    s = [ring_band(CX, cy, ro, ri)]
    mid = (ro + ri) / 2
    for i in range(30):
        a = i * 2 * math.pi / 30
        x, y = CX + mid * math.cos(a), cy + mid * math.sin(a)
        s.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="9" fill="none" stroke="#5a3d10" stroke-opacity=".75" stroke-width="3"/>')
        s.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="3.2" fill="#fff" fill-opacity=".7"/>')
    top = cy - ro
    for k, rr in enumerate((62, 46, 30, 14)):
        s.append(f'<circle cx="{CX}" cy="{f(top - 20)}" r="{rr}" fill="{"url(#metal)" if k % 2 == 0 else "none"}" stroke="#5a3d10" stroke-opacity=".7" stroke-width="3"/>')
    for i in range(8):
        a = i * math.pi / 4
        s.append(f'<circle cx="{f(CX + 62 * math.cos(a))}" cy="{f(top - 20 + 62 * math.sin(a))}" r="9" fill="url(#metal)" stroke="#5a3d10" stroke-opacity=".7" stroke-width="2.5"/>')
    s.append(gem(CX, top - 20, 13, sparkle=False))
    return "".join(s)


def ring_alyans(metal, g):
    s = [ring_band(330, 640, 190 + g, 150 + g * .8), ring_band(470, 590, 190 + g, 150 + g * .8, fill="url(#metalR)")]
    return "".join(s)


def ring_baget(metal, g):
    ro, ri = 222 + g, 165 + g * .6
    cy = 610
    s = [ring_band(CX, cy, ro, ri)]
    mid = (ro + ri) / 2
    for k in range(-2, 3):
        a = -math.pi / 2 + k * 0.17
        x, y = CX + mid * math.cos(a), cy + mid * math.sin(a)
        deg = math.degrees(a) + 90
        s.append(f'<g transform="translate({f(x)} {f(y)}) rotate({f(deg)})"><rect x="-22" y="-38" width="44" height="76" rx="5" fill="url(#gem)" stroke="#6d8bb0" stroke-width="2.5"/>'
                 f'<rect x="-12" y="-27" width="24" height="54" rx="3" fill="#fff" opacity=".6"/><path d="M-12 -27L-22 -38M12 -27L22 -38M-12 27L-22 38M12 27L22 38" stroke="#6d8bb0" stroke-width="1.6"/></g>')
    s.append(star(CX - 30, cy - mid - 24, 22))
    return "".join(s)


def ring_zarif(metal, g):
    ro, ri = 215 + g, 192 + g
    cy = 620
    top = cy - ro
    leaf = ('<path d="M0 0C28 -34 74 -30 92 -4C60 12 22 18 0 0Z" fill="url(#metal)" stroke="#00000055" stroke-width="2"/>'
            '<path d="M8 -2C34 -14 58 -12 78 -6" stroke="#fff" stroke-opacity=".5" stroke-width="2" fill="none"/>')
    s = [ring_band(CX, cy, ro, ri),
         f'<g transform="translate({CX - 12} {f(top - 14)}) scale(-1 1) rotate(-8)">{leaf}</g>',
         f'<g transform="translate({CX + 12} {f(top - 14)}) rotate(-8)">{leaf}</g>',
         gem(CX, top - 24, 34), gem(CX - 84, top - 2, 13, sparkle=False), gem(CX + 84, top - 2, 13, sparkle=False)]
    return "".join(s)


# ---------------------------------------------------------------- kolyeler
CHAIN = "M120 130C140 423 660 423 680 130"
BAIL_Y = 350


def necklace_pendant(metal, g, pendant, k=1.6):
    # Kolye ucu, askı halkasının (zincirin en alçak noktası) etrafında büyütülür; uç zincirden aşağı sarkar.
    return chain_path(CHAIN, 13, 17, 6) + f'<g transform="translate({CX} {BAIL_Y}) scale({k}) translate({-CX} {-BAIL_Y})">{pendant}</g>'


def kolye_gunes(metal, g):
    cx, cy = CX, BAIL_Y + 112
    rays = "".join(f'<path d="M{f(cx + 66 * math.cos(a - .12))} {f(cy + 66 * math.sin(a - .12))}L{f(cx + 104 * math.cos(a))} {f(cy + 104 * math.sin(a))}L{f(cx + 66 * math.cos(a + .12))} {f(cy + 66 * math.sin(a + .12))}Z" fill="url(#metal)" stroke="#00000044" stroke-width="1.5"/>' for a in [i * math.pi / 8 for i in range(16)])
    body = (f'<circle cx="{cx}" cy="{cy - 112}" r="9" fill="none" stroke="url(#metal)" stroke-width="6"/>{rays}'
            f'<circle cx="{cx}" cy="{cy}" r="70" fill="url(#metal)" stroke="#00000055" stroke-width="2"/><circle cx="{cx}" cy="{cy}" r="48" fill="url(#metalR)" stroke="#fff" stroke-opacity=".4" stroke-width="2"/>'
            f'{gem(cx, cy, 26)}')
    return necklace_pendant(metal, g, body)


def kolye_nazar(metal, g):
    cx, cy = CX, BAIL_Y + 100
    body = (f'<circle cx="{cx}" cy="{cy - 100}" r="9" fill="none" stroke="url(#metal)" stroke-width="6"/>'
            f'<circle cx="{cx}" cy="{cy}" r="80" fill="url(#metal)" stroke="#00000055" stroke-width="2"/>'
            f'<circle cx="{cx}" cy="{cy}" r="64" fill="#1c55a8"/><circle cx="{cx}" cy="{cy}" r="46" fill="#fbfcff"/><circle cx="{cx}" cy="{cy}" r="31" fill="#59a9e8"/><circle cx="{cx}" cy="{cy}" r="15" fill="#08183a"/>'
            f'<circle cx="{cx - 20}" cy="{cy - 24}" r="10" fill="#fff" opacity=".55"/>')
    return necklace_pendant(metal, g, body)


def kolye_zincir(metal, g):
    return (chain_path("M120 130C140 600 660 600 680 130", 15, 18, 6) + chain_path("M170 120C180 470 620 470 630 120", 12, 15, 5)
            + f'<circle cx="{CX}" cy="{482}" r="13" fill="url(#metal)" stroke="#00000055" stroke-width="2"/>'
            + f'<circle cx="{CX}" cy="{382}" r="10" fill="url(#metalR)" stroke="#00000055" stroke-width="2"/>'
            + f'<circle cx="120" cy="124" r="14" fill="none" stroke="url(#metal)" stroke-width="7"/><circle cx="680" cy="124" r="14" fill="none" stroke="url(#metal)" stroke-width="7"/>')


def kolye_harf(metal, g, letter="A"):
    cx, cy = CX, BAIL_Y + 96
    body = (f'<circle cx="{cx}" cy="{cy - 96}" r="9" fill="none" stroke="url(#metal)" stroke-width="6"/>'
            f'<rect x="{cx - 70}" y="{cy - 80}" width="140" height="160" rx="30" fill="url(#metal)" stroke="#00000055" stroke-width="2"/>'
            f'<rect x="{cx - 56}" y="{cy - 66}" width="112" height="132" rx="22" fill="url(#metalR)" stroke="#fff" stroke-opacity=".4" stroke-width="2"/>'
            f'<text x="{cx}" y="{cy + 34}" text-anchor="middle" font-family="Georgia, \'Times New Roman\', serif" font-size="104" font-weight="700" fill="#5a3d10" fill-opacity=".85">{letter}</text>'
            f'<text x="{cx - 1}" y="{cy + 32}" text-anchor="middle" font-family="Georgia, \'Times New Roman\', serif" font-size="104" font-weight="700" fill="#fff" fill-opacity=".35">{letter}</text>'
            f'{gem(cx + 48, cy + 58, 12, sparkle=False)}')
    return necklace_pendant(metal, g, body)


HEART = "M0 62C-96 -6 -64 -86 -26 -80C-8 -78 0 -62 0 -62C0 -62 8 -78 26 -80C64 -86 96 -6 0 62Z"


def kolye_kalp(metal, g):
    cx, cy = CX, BAIL_Y + 100
    body = (f'<circle cx="{cx}" cy="{cy - 100}" r="9" fill="none" stroke="url(#metal)" stroke-width="6"/>'
            f'<g transform="translate({cx} {cy})"><path d="{HEART}" fill="url(#metal)" stroke="#00000055" stroke-width="2"/>'
            f'<path d="{HEART}" fill="url(#metalR)" transform="scale(.74)" stroke="#fff" stroke-opacity=".4" stroke-width="2.5"/>'
            f'<path d="M-52 -40C-44 -62 -22 -66 -14 -56" stroke="#fff" stroke-opacity=".6" stroke-width="5" stroke-linecap="round" fill="none"/></g>'
            f'{gem(cx, cy + 6, 22)}')
    return necklace_pendant(metal, g, body)


# ---------------------------------------------------------------- bilezikler
def bilezik_burma(metal, g):
    w = 62 + g
    s = bangle_base(300, 205, w)
    s += (f'<g transform="rotate(-14 {CX} {CY})"><ellipse cx="{CX}" cy="{CY}" rx="300" ry="205" fill="none" stroke="#3b2608" stroke-opacity=".55" stroke-width="{w}" stroke-dasharray="3 15"/>'
          f'<ellipse cx="{CX}" cy="{CY}" rx="300" ry="205" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="{f(w * .8)}" stroke-dasharray="2 16" stroke-dashoffset="8"/></g>')
    return s


def bilezik_islemeli(metal, g):
    w = 72 + g
    s = bangle_base(300, 205, w)
    out = []
    n = 14
    for i in range(n):
        t = i * 2 * math.pi / n
        x, y = ell_pt(CX, CY, 300, 205, math.radians(-14), t)
        out.append(f'<g transform="translate({f(x)} {f(y)})"><circle r="16" fill="none" stroke="#4a3009" stroke-opacity=".8" stroke-width="3"/>'
                   + "".join(f'<ellipse cx="{f(11 * math.cos(k * math.pi / 3))}" cy="{f(11 * math.sin(k * math.pi / 3))}" rx="6" ry="3.2" transform="rotate({k * 60} {f(11 * math.cos(k * math.pi / 3))} {f(11 * math.sin(k * math.pi / 3))})" fill="#fff" fill-opacity=".5"/>' for k in range(6))
                   + '</g>')
    s += (f'<g transform="rotate(-14 {CX} {CY})"><ellipse cx="{CX}" cy="{CY}" rx="300" ry="205" fill="none" stroke="#3b2608" stroke-opacity=".55" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round" transform="translate(0 {f(-w * .3)})"/>'
          f'<ellipse cx="{CX}" cy="{CY}" rx="300" ry="205" fill="none" stroke="#3b2608" stroke-opacity=".55" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round" transform="translate(0 {f(w * .3)})"/></g>')
    return s + "".join(out)


def bilezik_hasir(metal, g):
    w = 66 + g
    s = bangle_base(300, 205, w)
    out = []
    n = 70
    for i in range(n):
        t = i * 2 * math.pi / n
        x, y = ell_pt(CX, CY, 300, 205, math.radians(-14), t)
        ang = math.degrees(t) * 0 + (35 if i % 2 == 0 else -35)
        out.append(f'<line x1="{f(x - w * .42)}" y1="{f(y)}" x2="{f(x + w * .42)}" y2="{f(y)}" transform="rotate({ang + math.degrees(math.radians(-14) + t + math.pi / 2) % 360} {f(x)} {f(y)})" stroke="#3b2608" stroke-opacity=".6" stroke-width="3.4" stroke-linecap="round"/>')
        out.append(f'<line x1="{f(x - w * .42)}" y1="{f(y + 3)}" x2="{f(x + w * .42)}" y2="{f(y + 3)}" transform="rotate({ang + math.degrees(math.radians(-14) + t + math.pi / 2) % 360} {f(x)} {f(y)})" stroke="#fff" stroke-opacity=".4" stroke-width="2" stroke-linecap="round"/>')
    return s + "".join(out)


def bilezik_cicek(metal, g):
    w = 34 + g * .5
    s = bangle_base(300, 205, w)
    out = []
    for t in [math.pi * (0.62 + k * 0.19) for k in range(5)]:
        x, y = ell_pt(CX, CY, 300, 205, math.radians(-14), t)
        petals = "".join(f'<ellipse cx="0" cy="-30" rx="15" ry="27" transform="rotate({k * 60})" fill="url(#metal)" stroke="#00000055" stroke-width="2"/>' for k in range(6))
        out.append(f'<g transform="translate({f(x)} {f(y)})">{petals}<circle r="15" fill="url(#metalR)" stroke="#00000055" stroke-width="2"/>{gem(0, 0, 10, sparkle=False)}</g>')
    return s + "".join(out)


def bilezik_kelepce(metal, g):
    w = 54 + g
    rot = -14
    gap = 0.9
    # açık kelepçe: çevrenin bir kısmı boş
    circ = 2 * math.pi * 250
    arc = circ * (1 - gap / (2 * math.pi) * 1.0)
    s = (f'<g transform="rotate({rot} {CX} {CY})">'
         f'<ellipse cx="{CX}" cy="{CY + 8}" rx="300" ry="205" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="{w + 6}" stroke-dasharray="{f(arc)} 2000" stroke-linecap="round" transform="rotate(-80 {CX} {CY})"/>'
         f'<ellipse cx="{CX}" cy="{CY}" rx="300" ry="205" fill="none" stroke="url(#metal)" stroke-width="{w}" stroke-dasharray="{f(arc)} 2000" stroke-linecap="round" transform="rotate(-80 {CX} {CY})"/>'
         f'<ellipse cx="{CX}" cy="{CY}" rx="300" ry="205" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="{f(w * .3)}" stroke-dasharray="{f(arc)} 2000" stroke-linecap="round" transform="rotate(-80 {CX} {CY}) translate(0 {f(-w * .22)})"/></g>')
    for k, tt in enumerate((0.34, 0.41, 0.48)):
        x, y = ell_pt(CX, CY, 300, 205, math.radians(rot - 80), 2 * math.pi * tt)
        s += gem(x, y, 18 if k == 1 else 13, sparkle=k == 1)
    return s


# ---------------------------------------------------------------- pırlanta
def pirlanta_tektas_kupe(metal, g):
    s = []
    for cx in (250, 550):
        cy = 560
        s.append(f'<path d="M{cx - 84} {cy - 20}H{cx + 84}L{cx + 54} {cy + 54}H{cx - 54}Z" fill="url(#metalV)" stroke="#00000055" stroke-width="2"/>')
        s.append(f'<circle cx="{cx}" cy="{cy - 6}" r="104" fill="url(#metal)" stroke="#00000055" stroke-width="2"/>')
        s.append(gem(cx, cy - 6, 84))
        for a in range(4):
            ang = a * math.pi / 2 + math.pi / 4
            s.append(f'<circle cx="{f(cx + 94 * math.cos(ang))}" cy="{f(cy - 6 + 94 * math.sin(ang))}" r="11" fill="url(#metalR)" stroke="#00000066" stroke-width="2"/>')
        s.append(f'<rect x="{cx - 6}" y="{cy - 190}" width="12" height="88" rx="6" fill="url(#metalV)" stroke="#00000055" stroke-width="2"/>')
    return "".join(s)


def pirlanta_bestas_kolye(metal, g):
    cx = CX
    s = [chain_path("M130 130C150 440 650 440 670 130", 10, 14, 5)]
    s.append(f'<circle cx="{cx}" cy="{366}" r="9" fill="url(#metalR)" stroke="#00000055" stroke-width="2"/>')
    pos = [(cx - 168, 424, 30), (cx - 84, 474, 36), (cx, 508, 44), (cx + 84, 474, 36), (cx + 168, 424, 30)]
    for x, y, r in pos:
        s.append(f'<path d="M{cx} 366L{x} {y - r - 8}" stroke="url(#metal)" stroke-width="5" fill="none" stroke-linecap="round"/>')
    for x, y, r in pos:
        s.append(f'<circle cx="{x}" cy="{y}" r="{r + 11}" fill="url(#metal)" stroke="#00000055" stroke-width="2"/>')
        s.append(gem(x, y, r))
    return "".join(s)


def pirlanta_baget_bileklik(metal, g):
    s = bangle_base(300, 205, 34)
    n = 22
    out = []
    for i in range(n):
        t = i * 2 * math.pi / n
        x, y = ell_pt(CX, CY, 300, 205, math.radians(-14), t)
        out.append(f'<g transform="translate({f(x)} {f(y)})">{gem(0, 0, 21, sparkle=False)}</g>')
    return s + "".join(out)


def pirlanta_halo_kolye(metal, g):
    cx, cy = CX, 480
    s = [chain_path("M130 130C150 470 650 470 670 130", 10, 14, 5), f'<circle cx="{cx}" cy="{cy - 100}" r="8" fill="none" stroke="url(#metal)" stroke-width="5"/>',
         f'<circle cx="{cx}" cy="{cy}" r="96" fill="url(#metal)" stroke="#00000055" stroke-width="2"/>']
    for i in range(12):
        a = i * math.pi / 6
        s.append(gem(cx + 72 * math.cos(a), cy + 72 * math.sin(a), 15, sparkle=False))
    s.append(f'<circle cx="{cx}" cy="{cy}" r="52" fill="url(#metalR)" stroke="#00000055" stroke-width="2"/>')
    s.append(gem(cx, cy, 44))
    return "".join(s)


def pirlanta_tria_yuzuk(metal, g):
    ro, ri = 215 + g, 175 + g * .6
    cy = 620
    top = cy - ro
    s = [ring_band(CX, cy, ro, ri)]
    s.append(f'<path d="M{CX - 150} {f(top + 10)}Q{CX} {f(top - 50)} {CX + 150} {f(top + 10)}L{CX + 120} {f(top + 44)}H{CX - 120}Z" fill="url(#metalV)" stroke="#00000055" stroke-width="2"/>')
    s.append(gem(CX - 100, top - 16, 36, sparkle=False))
    s.append(gem(CX + 100, top - 16, 36, sparkle=False))
    s.append(gem(CX, top - 36, 58))
    return "".join(s)


DESIGNS = {
    ("yuzuk", "Tektaş"): ring_tektas, ("yuzuk", "Telkari"): ring_telkari, ("yuzuk", "Alyans"): ring_alyans,
    ("yuzuk", "Baget"): ring_baget, ("yuzuk", "Zarif"): ring_zarif,
    ("kolye", "Güneş"): kolye_gunes, ("kolye", "Nazar"): kolye_nazar, ("kolye", "Zincir"): kolye_zincir,
    ("kolye", "Harf"): kolye_harf, ("kolye", "Kalp"): kolye_kalp,
    ("bilezik", "Burma"): bilezik_burma, ("bilezik", "İşlemeli"): bilezik_islemeli, ("bilezik", "Hasır"): bilezik_hasir,
    ("bilezik", "Çiçek"): bilezik_cicek, ("bilezik", "Kelepçe"): bilezik_kelepce,
    ("pirlanta", "Tektaş Küpe"): pirlanta_tektas_kupe, ("pirlanta", "Beştaş Kolye"): pirlanta_bestas_kolye,
    ("pirlanta", "Baget Bileklik"): pirlanta_baget_bileklik, ("pirlanta", "Halo Kolye"): pirlanta_halo_kolye,
    ("pirlanta", "Tria Yüzük"): pirlanta_tria_yuzuk,
}


def render(kind, model, metal, grams_scale=0.0, letter="A"):
    fn = DESIGNS[(kind, model)]
    body = fn(metal, grams_scale, letter) if fn is kolye_harf else fn(metal, grams_scale)
    dy = 120 if (kind == 'kolye' or model.endswith('Kolye')) else 0
    return page(metal, body, dy=dy)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # Önizleme: her model için üç metal
    for (kind, model), _ in DESIGNS.items():
        for metal in METALS:
            name = f"{kind}-{slug(model)}-{metal}"
            (OUT / f"_onizleme-{name}.svg").write_text(render(kind, model, metal), encoding="utf-8")
    print("önizleme dosyaları yazıldı:", len(list(OUT.glob('_onizleme-*.svg'))))


if __name__ == "__main__":
    main()
