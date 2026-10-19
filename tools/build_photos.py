"""Ürün fotoğraflarını tools/photo_map.json dosyasından indirip kare (900x900) WebP olarak assets/img/products/ altına yazar.
photo_map.json: ürün-id -> { pixabayId, user, page, large, metal, fx, fy }   (fx, fy: kırpma odağı, 0-1)
Kaynak: Pixabay (Pixabay İçerik Lisansı: ücretsiz ticari kullanım, atıf zorunlu değil). Orijinaller tools/img/px/orig/ altında önbelleğe alınır.
Kullanım: python tools/build_photos.py            (eksik olanları indirir, hepsini yeniden üretir)
          python tools/build_photos.py sayfa      (tools/img/px/sonuc_N.jpg kontak sayfaları)
"""
import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / "tools" / "photo_map.json"
CACHE = ROOT / "tools" / "img" / "px" / "orig"
OUT = ROOT / "assets" / "img" / "products"
SIZE = 900
UA = "CinarGoldCatalog/1.0"


def square_crop(im: Image.Image, fx: float, fy: float) -> Image.Image:
    w, h = im.size
    s = min(w, h)
    left = round((w - s) * min(max(fx, 0), 1))
    top = round((h - s) * min(max(fy, 0), 1))
    return im.crop((left, top, left + s, top + s)).resize((SIZE, SIZE), Image.LANCZOS)


def build():
    data = json.loads(MAP.read_text(encoding="utf-8"))
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for pid, m in data.items():
        src = CACHE / f"{m['pixabayId']}.jpg"
        if not src.exists():
            req = urllib.request.Request(m["large"], headers={"User-Agent": UA})
            src.write_bytes(urllib.request.urlopen(req, timeout=60).read())
        im = Image.open(src).convert("RGB")
        square_crop(im, m.get("fx", 0.5), m.get("fy", 0.5)).save(OUT / f"{pid}.webp", "WEBP", quality=82, method=6)
    print(len(data), "görsel yazıldı:", OUT)


def sheets():
    data = json.loads(MAP.read_text(encoding="utf-8"))
    ids = list(data)
    per, cols, cs = 20, 5, 230
    for n in range(0, len(ids), per):
        chunk = ids[n:n + per]
        rows = (len(chunk) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cs, rows * (cs + 16)), "white")
        d = ImageDraw.Draw(sheet)
        for i, pid in enumerate(chunk):
            im = Image.open(OUT / f"{pid}.webp").convert("RGB").resize((cs - 6, cs - 6))
            x, y = (i % cols) * cs + 3, (i // cols) * (cs + 16) + 3
            sheet.paste(im, (x, y + 14))
            d.text((x, y), pid, fill="red")
        sheet.save(ROOT / "tools" / "img" / "px" / f"sonuc_{n // per}.jpg", quality=82)
    print("kontak sayfaları yazıldı")


if __name__ == "__main__":
    sheets() if sys.argv[1:] == ["sayfa"] else build()
