"""Pixabay API ile ürün fotoğrafı adayları toplar ve kontak sayfaları üretir.
Anahtar ortam değişkeninden okunur (repoya yazılmaz): $env:PIXABAY_KEY
Kullanım:
  python tools/img_pixabay.py aday   -> tools/img/px/<tür>/<model>/NN.jpg + tools/img/px/aday.json
  python tools/img_pixabay.py sayfa  -> tools/img/px/<tür>_sayfaN.jpg (numaralı kontak sayfaları)
Pixabay lisansı: ücretsiz ticari kullanım, atıf zorunlu değil. Görseller indirilip kendi sunucumuzdan verilir (hotlink yasak).
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent / "img" / "px"
API = "https://pixabay.com/api/"
UA = "CinarGoldCatalog/1.0"

QUERIES = {
    ("yuzuk", "tektas"): ["solitaire diamond ring", "engagement ring gold", "diamond ring"],
    ("yuzuk", "telkari"): ["filigree gold ring", "ornate gold ring", "gold ring jewelry"],
    ("yuzuk", "alyans"): ["gold wedding band", "wedding rings gold", "wedding rings"],
    ("yuzuk", "baget"): ["eternity ring diamond", "diamond band ring", "gemstone ring"],
    ("yuzuk", "zarif"): ["delicate gold ring", "minimalist gold ring", "thin gold ring"],
    ("kolye", "gunes"): ["sun pendant necklace", "gold coin pendant necklace", "round gold pendant", "gold disc necklace", "gold medallion pendant"],
    ("kolye", "yeni"): ["gold necklace white background", "gold pendant on chain isolated", "rose gold necklace", "gold circle pendant necklace", "gold bar necklace", "dainty gold necklace", "gold chain necklace product", "gold choker necklace", "gold necklace pendant stone", "diamond pendant gold necklace"],
    ("kolye", "zincir"): ["gold chain necklace", "gold necklace jewelry", "layered gold necklace"],
    ("kolye", "harf"): ["initial pendant necklace", "alphabet necklace", "gold initial pendant", "name necklace gold", "letter charm necklace"],
    ("kolye", "kalp"): ["heart pendant necklace gold", "heart necklace", "gold heart necklace"],
    ("bilezik", "burma"): ["gold bangle bracelet", "gold bangles", "gold bracelet"],
    ("bilezik", "islemeli"): ["ornate gold bangle", "indian gold bangles", "gold bangles jewelry"],
    ("bilezik", "hasir"): ["gold mesh bracelet", "braided gold bracelet", "gold chain bracelet"],
    ("bilezik", "cicek"): ["flower bracelet gold", "charm bracelet gold", "gold bracelet gemstone"],
    ("bilezik", "kelepce"): ["gold cuff bracelet", "cuff bracelet", "open bangle gold"],
    ("pirlanta", "tektas-kupe"): ["diamond stud earrings", "stud earrings", "diamond earrings"],
    ("pirlanta", "bestas-kolye"): ["diamond necklace", "diamond pendant necklace", "diamond jewelry necklace"],
    ("pirlanta", "baget-bileklik"): ["diamond bracelet", "tennis bracelet", "silver bracelet diamonds"],
    ("pirlanta", "halo-kolye"): ["halo diamond pendant", "diamond pendant", "gemstone pendant necklace"],
    ("pirlanta", "tria-yuzuk"): ["three stone diamond ring", "diamond ring white gold", "diamond engagement ring"],
}


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        data = r.read()
    return data if binary else json.loads(data.decode("utf-8"))


def search(key, q):
    params = {"key": key, "q": q, "image_type": "photo", "per_page": 24, "safesearch": "true", "min_width": 900, "order": "popular"}
    time.sleep(0.7)  # dakikada 100 istek sınırı
    return get(API + "?" + urllib.parse.urlencode(params)).get("hits", [])


def candidates(only=None):
    key = os.environ["PIXABAY_KEY"]
    out = json.loads((OUT / "aday.json").read_text(encoding="utf-8")) if only and (OUT / "aday.json").exists() else {}
    for (kind, model), queries in QUERIES.items():
        if only and f"{kind}/{model}" not in only:
            continue
        seen, hits = set(), []
        for q in queries:
            for h in search(key, q):
                if h["id"] in seen:
                    continue
                seen.add(h["id"])
                hits.append({"id": h["id"], "user": h["user"], "page": h["pageURL"], "tags": h["tags"], "w": h["imageWidth"], "h": h["imageHeight"],
                             "web": h["webformatURL"], "large": h["largeImageURL"], "query": q})
        folder = OUT / kind / model
        folder.mkdir(parents=True, exist_ok=True)

        def dl(args):
            i, h = args
            try:
                (folder / f"{i:02d}.jpg").write_bytes(get(h["web"], binary=True))
            except Exception as e:  # noqa: BLE001
                h["error"] = str(e)

        with ThreadPoolExecutor(6) as ex:
            list(ex.map(dl, enumerate(hits)))
        out[f"{kind}/{model}"] = hits
        print(kind, model, len(hits))
    (OUT / "aday.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")


def sheets():
    data = json.loads((OUT / "aday.json").read_text(encoding="utf-8"))
    for key, hits in data.items():
        kind, model = key.split("/")
        cols, cw, ch = 6, 200, 230
        rows = (len(hits) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cw, rows * ch), "white")
        d = ImageDraw.Draw(sheet)
        for i, h in enumerate(hits):
            f = OUT / kind / model / f"{i:02d}.jpg"
            try:
                im = Image.open(f).convert("RGB")
            except Exception:  # noqa: BLE001
                continue
            im.thumbnail((cw - 6, ch - 20))
            x, y = (i % cols) * cw + 3, (i // cols) * ch + 3
            sheet.paste(im, (x, y + 16))
            d.text((x, y + 2), f"{i:02d}", fill="red")
        sheet.save(OUT / f"{kind}_{model}.jpg", quality=78)
    print("sayfalar yazıldı")


if __name__ == "__main__":
    {"aday": lambda: candidates(sys.argv[2:] or None), "sayfa": sheets}[sys.argv[1]]()
