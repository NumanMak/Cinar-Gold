r"""Zoom sheet: python tools\img_zoom.py <out> n1 n2 n3 ...  (3 columns, 600px tiles)"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(ROOT, 'img')
db = json.load(open(os.path.join(IMG, 'candidates.json'), encoding='utf-8'))
byn = {c['n']: c for c in db.values()}
out = sys.argv[1]
ns = [int(x) for x in sys.argv[2:]]
cols, tw, th = 3, 600, 450
rows = (len(ns) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * (th + 26)), (40, 40, 40))
d = ImageDraw.Draw(sheet)
font = ImageFont.truetype('arialbd.ttf', 20)
for i, n in enumerate(ns):
    c = byn[n]
    im = Image.open(os.path.join(IMG, 'candidates', c['key'] + '.jpg')).convert('RGB')
    im = im.resize((min(tw - 4, int(im.width * (th - 4) / im.height)), th - 4) if im.width / im.height < (tw - 4) / (th - 4) else (tw - 4, int(im.height * (tw - 4) / im.width)), Image.LANCZOS)
    x, y = (i % cols) * tw, (i // cols) * (th + 26)
    sheet.paste(im, (x + (tw - im.width) // 2, y + (th - im.height) // 2))
    d.text((x + 4, y + th + 2), f"#{n} {c['w']}x{c['h']} {c['desc'][:38]}", fill=(255, 210, 90), font=font)
sheet.save(os.path.join(IMG, out + '.jpg'), quality=85)
