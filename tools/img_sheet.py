r"""Contact sheet builder. Usage: python tools\img_sheet.py <out_name> <n_from> <n_to> [min_long_edge]
Tiles labeled with candidate index n, source dims. Skips images below min long edge (default 1300)."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(ROOT, 'img')
db = json.load(open(os.path.join(IMG, 'candidates.json'), encoding='utf-8'))
out, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
minle = int(sys.argv[4]) if len(sys.argv) > 4 else 1300
items = sorted([c for c in db.values() if a <= c['n'] <= b and not c.get('bad') and max(c['w'], c['h']) >= minle],
               key=lambda c: c['n'])
cols, tw, th = 6, 300, 300
rows = (len(items) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * (th + 22)), (40, 40, 40))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('arialbd.ttf', 18)
except Exception:
    font = ImageFont.load_default()
for i, c in enumerate(items):
    try:
        im = Image.open(os.path.join(IMG, 'candidates', c['key'] + '.jpg')).convert('RGB')
    except Exception:
        continue
    im.thumbnail((tw - 4, th - 4))
    x, y = (i % cols) * tw, (i // cols) * (th + 22)
    sheet.paste(im, (x + (tw - im.width) // 2, y + (th - im.height) // 2))
    d.text((x + 4, y + th), f"#{c['n']}  {c['w']}x{c['h']}", fill=(255, 210, 90), font=font)
sheet.save(os.path.join(IMG, out + '.jpg'), quality=82)
print(len(items), 'tiles ->', out)
