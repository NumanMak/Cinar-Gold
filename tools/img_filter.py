r"""Filter candidates: python tools\img_filter.py <out> <regex on desc|q> [maxlum=110] [minle=1300]
Builds zoom-sheet of dark-dominant matches."""
import json, os, re, sys, subprocess
ROOT = os.path.dirname(os.path.abspath(__file__))
db = json.load(open(os.path.join(ROOT, 'img', 'candidates.json'), encoding='utf-8'))
out, rx = sys.argv[1], re.compile(sys.argv[2], re.I)
maxlum = int(sys.argv[3]) if len(sys.argv) > 3 else 110
minle = int(sys.argv[4]) if len(sys.argv) > 4 else 1300
ns = []
for c in sorted(db.values(), key=lambda c: c['n']):
    if c.get('bad') or max(c['w'], c['h']) < minle:
        continue
    col = (c.get('color') or '#000000').lstrip('#')
    r, g, b = int(col[0:2], 16), int(col[2:4], 16), int(col[4:6], 16)
    if 0.3 * r + 0.59 * g + 0.11 * b > maxlum:
        continue
    if rx.search(c['desc'] + ' ' + c['q']):
        ns.append(str(c['n']))
print(len(ns), ' '.join(ns))
subprocess.run([sys.executable, os.path.join(ROOT, 'img_zoom.py'), out] + ns[:36])
