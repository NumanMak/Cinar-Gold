"""Statik kontroller: JSON-LD, yinelenen id, kırık #bağlantılar, eksik dosyalar.
Kullanım: python tools\\check.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
html = (ROOT / "index.html").read_text(encoding="utf-8")
ok = True

m = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
try:
    data = json.loads(m.group(1))
    print("JSON-LD ok:", [g["@type"] for g in data["@graph"]])
except Exception as e:  # noqa: BLE001
    ok = False
    print("JSON-LD HATA:", e)

ids = re.findall(r'\sid="([^"]+)"', html)
dups = sorted({i for i in ids if ids.count(i) > 1})
print("yinelenen id:", dups or "yok")
ok &= not dups

broken = sorted({h for h in re.findall(r'href="#([^"]+)"', html) if h not in ids})
print("kırık #bağlantı:", broken or "yok")
ok &= not broken

refs = set(re.findall(r'(?:src|href|data-src-hd|data-src-sd)="((?:assets/|site\.)[^"#?]+)"', html))
for srcset in re.findall(r'(?:srcset|imagesrcset)="([^"]+)"', html):
    refs.update(part.strip().split(" ")[0] for part in srcset.split(","))
for stem in re.findall(r'data-img="([^"]+)"', html):
    refs.update({f"assets/img/{stem}-640.webp", f"assets/img/{stem}-1080.webp"})
missing = sorted(r for r in refs if not (ROOT / r).is_file())
print(f"referans verilen yerel dosya: {len(refs)}, eksik:", missing or "yok")
ok &= not missing

for name in ("—", "–"):
    if name in html:
        ok = False
        print("uzun tire bulundu:", repr(name))

print("SONUÇ:", "TAMAM" if ok else "SORUN VAR")
raise SystemExit(0 if ok else 1)
