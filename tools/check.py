"""Statik kontroller: JSON-LD, yinelenen id, kırık #bağlantılar, eksik dosyalar, katalog dağılımı.
Kullanım: python tools\\check.py
"""
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "magaza.html", "urun.html", "sepet.html", "hesap.html"]
ok = True

for page in PAGES:
    print(f"== {page}")
    html = (ROOT / page).read_text(encoding="utf-8")

    if page == "index.html":
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
    refs.update(re.findall(r'<script type="module" src="([^"]+)"', html))
    for link in re.findall(r'href="((?:magaza|urun|sepet|hesap|index)\.html)[^"]*"', html):
        refs.add(link)
    missing = sorted(r for r in refs if not (ROOT / r).is_file())
    print(f"referans verilen yerel dosya: {len(refs)}, eksik:", missing or "yok")
    ok &= not missing

    for name in ("—", "–"):
        if name in html:
            ok = False
            print("uzun tire bulundu:", repr(name))

print("== katalog")
products = json.loads((ROOT / "assets" / "data" / "products.json").read_text(encoding="utf-8"))
per_type = Counter(p["type"] for p in products)
per_model = Counter((p["type"], p["model"]) for p in products)
cat_ok = (len(products) == 60 and set(per_type.values()) == {15} and len(per_type) == 4
          and set(per_model.values()) == {3} and len(per_model) == 20)
print("ürün:", len(products), dict(per_type), "model başına:", sorted(set(per_model.values())), "TAMAM" if cat_ok else "SORUN")
ok &= cat_ok

print("== altın fiyatı")
gold = json.loads((ROOT / "assets" / "data" / "gold.json").read_text(encoding="utf-8"))
gold_ok = (set(gold["items"]) == {"gram22", "quarter", "half", "full", "ata", "resat"}
           and all(0 < v["buy"] <= v["sell"] for v in gold["items"].values()) and bool(gold.get("fetchedAt")))
print("gold.json:", gold.get("source"), gold.get("updatedAt"), "TAMAM" if gold_ok else "SORUN")
ok &= gold_ok

print("== metin")
for path in [*ROOT.glob("assets/js/shop/**/*.js"), ROOT / "assets" / "data" / "products.json"]:
    text = path.read_text(encoding="utf-8")
    if "—" in text or "–" in text:
        ok = False
        print("uzun tire bulundu:", path.relative_to(ROOT))

print("SONUÇ:", "TAMAM" if ok else "SORUN VAR")
raise SystemExit(0 if ok else 1)
