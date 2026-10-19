"""Katalog üretici: assets/data/products.json dosyasını deterministik olarak yazar.
Ürün fotoğrafları tools/photo_map.json ile eşlenir (indirme ve kırpma: python tools/build_photos.py).
Kullanım: python tools/gen_products.py
Ürün, gram, ayar, işçilik ve stokları düzenlemek için bu dosyayı değiştirip yeniden çalıştırın.

Fiyat formülü (assets/js/shop/pricing.js ile aynıdır):
  fiyat = gram x (22 ayar gram satış fiyatı x ayar / 22) x (1 + işçilik) + taş bedeli, 10 TL'ye yuvarlanır.
products.json içindeki "price", assets/data/gold.json'daki o günkü fiyattan hesaplanan bir ilk değerdir;
site canlı altın fiyatı geldikçe fiyatları tarayıcıda yeniden hesaplar.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "data" / "products.json"
GOLD = ROOT / "assets" / "data" / "gold.json"
PHOTOS = ROOT / "tools" / "photo_map.json"
GRAM22_FALLBACK = 6325

METAL_LABEL = {"sari": "Sarı altın", "rose": "Rose altın", "beyaz": "Beyaz altın"}
# Pırlanta taş bedeli (toplam karata göre, TL)
CARAT_FEE = {0.10: 14000, 0.25: 36000, 0.50: 85000}

# tür -> (etiket, [(model, gram, işçilik, taş bedeli, açıklama)], varyantlar)
# varyant: (metal, ayar, gram çarpanı, ek)   ek: pırlantada karat
CATALOG = {
    "yuzuk": ("Yüzük", [
        ("Tektaş", 2.6, 0.20, 0, "Tek bir taşın ışığını öne çıkaran klasik tektaş montür. Günlük kullanıma da özel günlere de uyan zamansız bir yüzük."),
        ("Telkari", 4.2, 0.28, 0, "İnce altın tellerin el işçiliğiyle işlendiği telkari yüzük. Geleneksel işçiliği taşıyan, karakterli bir duruşu var."),
        ("Alyans", 3.8, 0.12, 0, "İç yüzeyi konfor bombeli, parlak yüzeyli klasik alyans. İç yüzeye isim ve tarih yazdırılabilir."),
        ("Baget", 3.1, 0.22, 650, "Sıralı baget kesim zirkon taşlarla kanal montaj yapılmış, düz çizgili modern yüzük."),
        ("Zarif", 1.9, 0.20, 250, "İnce halka üzerinde yaprak motifli minimal tasarım. Katmanlı kullanıma çok uygun."),
    ], [("sari", 14, 1.00, None), ("rose", 14, 1.08, None), ("beyaz", 18, 1.12, None)]),
    "kolye": ("Kolye", [
        ("Güneş", 3.4, 0.22, 0, "Işın motifli güneş ucu ve ortasında zirkon taşı olan, ışıltılı bir kolye."),
        ("Nazar", 2.8, 0.20, 300, "Mineli nazar boncuğu ucu olan, hem şık hem koruyucu sembol taşıyan kolye."),
        ("Zincir", 7.5, 0.10, 0, "Çift sıra zincir kolye. Tek başına ya da uç takarak kullanılabilen, sade ve güçlü bir parça."),
        ("Damla", 2.2, 0.18, 250, "Damla kesim renkli taşlı, ince zincirli sade kolye. Günlük kullanıma ve hediyeye çok uygun."),
        ("Kalp", 2.6, 0.20, 150, "Kalp ucunun ortasında küçük bir taş olan, hediye için en çok seçilenlerden biri."),
    ], [("sari", 14, 1.00, None), ("rose", 14, 1.08, None), ("beyaz", 18, 1.12, None)]),
    "bilezik": ("Bilezik", [
        ("Burma", 14.0, 0.06, 0, "Burma desenli klasik altın bilezik. Ağırlığı ve parlaklığıyla yatırım ve takı olarak tercih edilir."),
        ("İşlemeli", 18.0, 0.09, 0, "Çiçek motifleri ve noktalı kenar işçiliğiyle süslenmiş, geniş yüzeyli işlemeli bilezik."),
        ("Hasır", 12.0, 0.08, 0, "Hasır örgü desenli, bileğe oturan şık ve dayanıklı bilezik."),
        ("Çiçek", 9.0, 0.12, 250, "İnce gövdesi üzerinde taşlı çiçek motifleri taşıyan zarif bilezik."),
        ("Kelepçe", 11.0, 0.07, 450, "Açık yapılı, üç taş detaylı kelepçe bilezik. Bileğe kolayca takılır."),
    ], [("sari", 14, 1.00, None), ("sari", 18, 1.04, None), ("sari", 22, 1.08, None)]),
    "pirlanta": ("Pırlanta", [
        ("Tektaş Küpe", 2.2, 0.15, 0, "Tek taş pırlanta küpe çifti. Taş bedeli toplam karata göre hesaplanır."),
        ("Beştaş Kolye", 3.0, 0.15, 0, "Beş pırlantanın yelpaze gibi dizildiği, boynu saran şık bir kolye."),
        ("Baget Bileklik", 7.5, 0.12, 0, "Boydan boya sıralı pırlantalarla hazırlanan, ışığı her açıdan yakalayan bileklik."),
        ("Halo Kolye", 3.2, 0.15, 0, "Ortadaki taşı küçük pırlantalar çevreleyen halo kolye. Parıltıyı katlayan bir tasarım."),
        ("Tria Yüzük", 3.4, 0.15, 0, "Üç taşlı trilogy yüzük; geçmişi, bugünü ve geleceği simgeler."),
    ], [("beyaz", 14, 1.00, 0.10), ("rose", 14, 1.08, 0.25), ("sari", 18, 1.14, 0.50)]),
}


def slug(s: str) -> str:
    return s.translate(str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")).lower().replace(" ", "-")


def gram22_price() -> int:
    try:
        return int(json.loads(GOLD.read_text(encoding="utf-8"))["items"]["gram22"]["sell"])
    except (OSError, KeyError, ValueError):
        return GRAM22_FALLBACK


def price_of(gram, karat, labor, stone, gram22):
    raw = gram * (gram22 * karat / 22) * (1 + labor) + stone
    return int(round(raw / 10.0) * 10)


def fmt_ct(ct):
    return f"{ct:.2f}".replace(".", ",")


def build() -> list[dict]:
    gram22 = gram22_price()
    photos = json.loads(PHOTOS.read_text(encoding="utf-8"))
    items = []
    for t, (label, models, variants) in CATALOG.items():
        for mi, (model, gram0, labor, stone0, desc) in enumerate(models):
            for vi, (_, karat, gmul, extra) in enumerate(variants):
                idx = mi * 3 + vi
                pid = f"{t}-{slug(model)}-{vi + 1}"
                photo = photos[pid]
                metal = photo["metal"]
                gram = round(gram0 * gmul, 2)
                stone = stone0 + (CARAT_FEE[extra] if extra else 0)
                if t == "pirlanta":
                    name = f"{model}, {fmt_ct(extra)} ct, {METAL_LABEL[metal]}"
                elif t == "bilezik":
                    name = f"{model} Bilezik, {karat} ayar"
                else:
                    name = f"{model} {label}, {METAL_LABEL[metal]}"
                items.append({
                    "id": pid,
                    "type": t,
                    "typeLabel": label,
                    "model": model,
                    "name": name,
                    "metal": METAL_LABEL[metal],
                    "karat": karat,
                    "gram": gram,
                    "laborRate": labor,
                    "stoneFee": stone,
                    "price": price_of(gram, karat, labor, stone, gram22),
                    "image": f"assets/img/products/{pid}.webp",
                    "imageCredit": {"author": photo["user"], "url": photo["page"], "source": "Pixabay"},
                    "stock": 0 if idx in {4, 11} else 1 + (idx * 5 + mi) % 12,
                    "desc": f"{desc} {karat} ayar {METAL_LABEL[metal].lower()}" + (f", toplam {fmt_ct(extra)} ct pırlanta." if extra else "."),
                })
    # Aynı adı taşıyan ürünler (ör. aynı metalde iki varyant) gramla ayırt edilir.
    names = [i["name"] for i in items]
    for i in items:
        if names.count(i["name"]) > 1:
            i["name"] += f", {str(i['gram']).replace('.', ',')} g"
    return items


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    items = build()
    OUT.write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT} yazıldı: {len(items)} ürün (22 ayar gram: {gram22_price()} TL)")


if __name__ == "__main__":
    main()
