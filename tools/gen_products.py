"""Katalog üretici: assets/data/products.json dosyasını deterministik olarak yazar.
Kullanım: python tools/gen_products.py
Stok, fiyat ve açıklamaları düzenlemek için bu dosyayı değiştirip yeniden çalıştırın.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "data" / "products.json"

# tür: (etiket, tekil ad, görsel kökleri, model listesi, gram aralığı başlangıcı, gram başına TL, açıklama kalıbı)
TYPES = {
    "yuzuk": ("Yüzük", "Yüzük", ["p-ring", "p-solitaire", "p-bands"],
              ["Tektaş", "Telkari", "Alyans", "Baget", "Zarif"], 2.4, 3300,
              "{model} modelinden, el işçiliğiyle hazırlanan {metal} yüzük."),
    "kolye": ("Kolye", "Kolye", ["p-pendant", "p-chain"],
              ["Güneş", "Nazar", "Zincir", "Harf", "Kalp"], 3.1, 3300,
              "{model} modelinden, her gün rahatça taşınan {metal} kolye."),
    "bilezik": ("Bilezik", "Bilezik", ["p-bangle", "p-bracelet"],
                ["Burma", "İşlemeli", "Hasır", "Çiçek", "Kelepçe"], 6.2, 3250,
                "{model} modelinden, ağırlığı ve duruşuyla öne çıkan {metal} bilezik."),
    "pirlanta": ("Pırlanta", "Pırlanta", ["p-solitaire", "p-earrings", "p-ring"],
                 ["Tektaş", "Beştaş", "Baget", "Halo", "Tria"], 1.8, 5200,
                 "{model} modelinden, sertifikalı taşlarla hazırlanan {metal} pırlanta takı."),
}
METALS = ["Sarı altın", "Rose altın", "Beyaz altın"]
KARATS = [14, 18, 22]
SOLD_OUT = {4, 11}  # her türde stoğu 0 olacak ürünlerin sıra numaraları (0-14)


def slug(s: str) -> str:
    table = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    return s.translate(table).lower().replace(" ", "-")


def build() -> list[dict]:
    items = []
    for t, (label, single, imgs, models, gram0, per_gram, tmpl) in TYPES.items():
        for mi, model in enumerate(models):
            for n in range(3):
                idx = mi * 3 + n
                gram = round(gram0 + mi * 0.7 + n * 0.45, 2)
                karat = KARATS[(mi + n) % 3]
                price = int(round(gram * per_gram * (karat / 14) / 10.0) * 10)
                stock = 0 if idx in SOLD_OUT else 1 + (idx * 5 + mi) % 12
                items.append({
                    "id": f"{t}-{slug(model)}-{n + 1}",
                    "type": t,
                    "typeLabel": label,
                    "model": model,
                    "name": f"{model} {single}, {METALS[n]}",
                    "karat": karat,
                    "gram": gram,
                    "price": price,
                    "img": imgs[(mi + n) % len(imgs)],
                    "stock": stock,
                    "desc": tmpl.format(model=model, metal=f"{karat} ayar {METALS[n].lower()}"),
                })
    return items


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT} yazıldı: {len(build())} ürün")


if __name__ == "__main__":
    main()
