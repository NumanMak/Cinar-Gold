import math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

STOPS = [(0, (0xf8, 0xe7, 0xb0)), (.42, (0xdc, 0xb6, 0x5c)), (.7, (0xb8, 0x89, 0x3a)), (1, (0xf1, 0xd5, 0x89))]

def lerp_stops(t):
    for (a, ca), (b, cb) in zip(STOPS, STOPS[1:]):
        if t <= b:
            k = (t - a) / (b - a)
            return tuple(round(ca[i] + (cb[i] - ca[i]) * k) for i in range(3))
    return STOPS[-1][1]

def gradient(w, h):
    """Diagonal gold gradient (top-left light -> bottom-right)."""
    small = Image.new("RGB", (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            t = max(0, min(1, (x / 63 * 40 + y / 63 * 56) / 96))
            px[x, y] = lerp_stops(t)
    return small.resize((w, h), Image.BILINEAR)

def mark_mask(size, boost=1.0, ss=8):
    """Alpha mask of the mark drawn in 64-unit space onto size x size."""
    S = size * ss
    k = S / 64
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    cx, cy, r = 31.93, 28, 19
    w = 3 * boost
    bb = [(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k]
    d.arc(bb, 45, 315, fill=255, width=max(1, round(w * k)))
    # adjust arc width centered on radius
    for ang in (45, 315):
        a = math.radians(ang)
        ex, ey = cx + (r - w / 2) * math.cos(a), cy + (r - w / 2) * math.sin(a)
        rr = w / 2 * k
        d.ellipse([ex * k - rr, ey * k - rr, ex * k + rr, ey * k + rr], fill=255)
    def poly(pts, width, closed=False):
        P = [(x * k, y * k) for x, y in pts]
        if closed: P = P + [P[0], P[1]]
        d.line(P, fill=255, width=max(1, round(width * k)), joint="curve")
        for x, y in P:
            rr = width * k / 2
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=255)
    poly([(27, 49.2), (37, 49.2), (40, 52.5), (32, 61), (24, 52.5)], 2 * boost, closed=True)
    if boost < 1.6:  # facets only where legible
        poly([(24.4, 52.5), (39.6, 52.5)], 1.1 * boost)
        poly([(29.6, 49.2), (27.9, 52.5), (32, 61), (36.1, 52.5), (34.4, 49.2)], 1.1 * boost)
    return m.resize((size, size), Image.LANCZOS)

def gold_mark(size, boost=1.0):
    g = gradient(size, size).convert("RGBA")
    g.putalpha(mark_mask(size, boost))
    return g

def rounded_bg(size, radius_frac=0.22, color=(0, 0, 0)):
    ss = 4
    m = Image.new("L", (size * ss, size * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size * ss - 1, size * ss - 1], radius=size * ss * radius_frac, fill=255)
    bg = Image.new("RGBA", (size, size), color + (255,))
    bg.putalpha(m.resize((size, size), Image.LANCZOS))
    return bg

def icon(size, scale=1.0, boost=1.0, rounded=True, opaque=False):
    """Mark slightly shifted up (mark spans y 9..61) to optical centre."""
    base = rounded_bg(size) if rounded and not opaque else Image.new("RGBA", (size, size), (0, 0, 0, 255))
    ms = round(size * scale)
    mk = gold_mark(ms, boost)
    off = ((size - ms) // 2, (size - ms) // 2 - round(ms * 3 / 64))
    base.alpha_composite(mk, off)
    return base

ICONS = "assets/icons/"
i16 = icon(16, 1.12, boost=2.0)
i32 = icon(32, 1.08, boost=1.5)
i48 = icon(48, 1.05, boost=1.25)
i16.save(ICONS + "_p16.png"); i32.save(ICONS + "_p32.png")
i48.save(ICONS + "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[i16, i32])
icon(180, 0.86, opaque=True).convert("RGB").save(ICONS + "apple-touch-icon.png")
icon(192, 0.92).save(ICONS + "icon-192.png")
icon(512, 0.92).save(ICONS + "icon-512.png")
icon(512, 0.66, opaque=True).convert("RGB").save(ICONS + "icon-maskable-512.png")

# ---------- OG image ----------
W, H = 1200, 630
FONT = "tools/fonts/Inter.ttf"
def font(px, wght, opsz=32):
    f = ImageFont.truetype(FONT, px)
    axes = {a["name"].decode() if isinstance(a["name"], bytes) else a["name"]: a for a in f.get_variation_axes()}
    vals = []
    for a in f.get_variation_axes():
        n = a["name"]; n = n.decode() if isinstance(n, bytes) else n
        vals.append(wght if n.lower().startswith("weight") else min(max(opsz, a["minimum"]), a["maximum"]))
    f.set_variation_by_axes(vals)
    return f

img = Image.new("RGB", (W, H), (0, 0, 0))
# warm radial glow
glow = Image.new("L", (W, H), 0)
ImageDraw.Draw(glow).ellipse([W / 2 - 430, H / 2 - 260, W / 2 + 430, H / 2 + 260], fill=255)
glow = glow.filter(ImageFilter.GaussianBlur(170))
img = Image.composite(Image.new("RGB", (W, H), (46, 34, 14)), img, glow)
# grain
random.seed(7)
noise = Image.effect_noise((W, H), 7).point(lambda v: v - 128 + 128)
grain = Image.merge("RGB", [noise] * 3)
img = ImageChops.add(img, ImageChops.subtract(grain, Image.new("RGB", (W, H), (126, 126, 126))), 1, 0)
img = img.convert("RGBA")

def tracked(text, f, tracking):
    widths = [f.getlength(c) for c in text]
    total = sum(widths) + tracking * (len(text) - 1)
    return widths, total

def draw_text(canvas, text, f, y, tracking=0, fill=None, grad=False):
    widths, total = tracked(text, f, tracking)
    asc, desc = f.getmetrics()
    h = asc + desc
    mask = Image.new("L", (int(total) + 4, h), 0)
    d = ImageDraw.Draw(mask)
    x = 0
    for c, w in zip(text, widths):
        d.text((x, 0), c, font=f, fill=255); x += w + tracking
    layer = gradient(mask.width, mask.height).convert("RGBA") if grad else Image.new("RGBA", mask.size, fill + (255,))
    layer.putalpha(mask)
    canvas.alpha_composite(layer, (round((W - total) / 2), round(y)))

mk = gold_mark(150)
img.alpha_composite(mk, ((W - 150) // 2, 92))
draw_text(img, "ÇINAR GOLD", font(76, 250), 262, tracking=24, grad=True)
draw_text(img, "KUYUMCULUK", font(19, 400), 368, tracking=13, fill=(0xc9, 0xa3, 0x4e))
# hairline divider
d = ImageDraw.Draw(img)
d.line([(W / 2 - 36, 425), (W / 2 + 36, 425)], fill=(0x8e, 0x6b, 0x26), width=1)
draw_text(img, "Şıklığın ve Güvenin Adresi", font(30, 300), 450, tracking=1, fill=(0xf2, 0xee, 0xe6))
draw_text(img, "Fethiye / Muğla  ·  1996'dan beri", font(19, 400), 506, tracking=3, fill=(0x8d, 0x8a, 0x84))
img.convert("RGB").save("assets/img/og-image.jpg", quality=88, optimize=True, progressive=True)
print("ok")
