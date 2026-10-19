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
METAL_EN = {"sari": "Yellow gold", "rose": "Rose gold", "beyaz": "White gold"}
TYPE_EN = {"yuzuk": "Ring", "kolye": "Necklace", "bilezik": "Bracelet", "pirlanta": "Diamond"}
# (tür, model) -> (İngilizce model adı, İngilizce açıklama)
MODEL_EN = {
    ("yuzuk", "Tektaş"): ("Solitaire", "A classic solitaire setting that puts the spotlight on a single stone. A timeless ring for every day and special occasions."),
    ("yuzuk", "Telkari"): ("Filigree", "A filigree ring worked by hand from fine gold wire. It carries traditional craftsmanship with a distinctive character."),
    ("yuzuk", "Alyans"): ("Wedding Band", "A classic polished wedding band with a comfort-fit interior. A name and date can be engraved inside."),
    ("yuzuk", "Taşlı"): ("Gemstone", "A slim, elegant ring set with a row of stones. Wear it alone or stacked with other rings."),
    ("yuzuk", "Zarif"): ("Dainty", "A minimal design with a leaf motif on a slim band. Perfect for stacking."),
    ("kolye", "Madalyon"): ("Medallion", "A gold necklace with a hand-patterned round medallion pendant. A classic piece that looks great alone or layered."),
    ("kolye", "Taşlı"): ("Gemstone", "A gold necklace decorated with colorful stones. A natural-stone look that stands out on special occasions."),
    ("kolye", "Zincir"): ("Chain", "A double-strand chain necklace. A simple and strong piece you can wear alone or with a pendant."),
    ("kolye", "Damla"): ("Teardrop", "A simple fine-chain necklace with a teardrop-cut colored stone. Perfect for daily wear and gifting."),
    ("kolye", "Kalp"): ("Heart", "A heart pendant necklace, one of the most popular choices for gifts."),
    ("bilezik", "Burma"): ("Rope", "A classic gold bangle with a twisted pattern. Loved both as jewelry and as an investment for its weight and shine."),
    ("bilezik", "İşlemeli"): ("Ornate", "A wide ornate bangle decorated with floral motifs and dotted edge work."),
    ("bilezik", "Zincir"): ("Chain", "A sturdy link-chain bracelet. A classic that sits well on the wrist and suits any outfit."),
    ("bilezik", "Taşlı"): ("Gemstone", "A bracelet decorated with colorful, sparkling stones that catch the light."),
    ("bilezik", "Kelepçe"): ("Cuff", "An open-design cuff bracelet that slips easily onto the wrist."),
    ("pirlanta", "Küpe"): ("Earrings", "Diamond earrings. The stone cost is calculated from the total carat weight."),
    ("pirlanta", "Kolye"): ("Necklace", "An elegant pendant necklace made with diamonds and precious stones. The stone cost is calculated from the total carat weight."),
    ("pirlanta", "Bileklik"): ("Bracelet", "A bracelet with a continuous row of stones that catches the light from every angle."),
    ("pirlanta", "Halo Kolye"): ("Halo Necklace", "A halo necklace with a center stone surrounded by small diamonds. A design that multiplies the sparkle."),
    ("pirlanta", "Yüzük"): ("Ring", "A statement ring made with diamonds and precious stones. The stone cost is calculated from the total carat weight."),
}
# Pırlanta taş bedeli (toplam karata göre, TL)
CARAT_FEE = {0.10: 14000, 0.25: 36000, 0.50: 85000}

# tür -> (etiket, [(model, gram, işçilik, taş bedeli, açıklama)], varyantlar)
# varyant: (metal, ayar, gram çarpanı, ek)   ek: pırlantada karat
CATALOG = {
    "yuzuk": ("Yüzük", [
        ("Tektaş", 2.6, 0.20, 0, "Tek bir taşın ışığını öne çıkaran klasik tektaş montür. Günlük kullanıma da özel günlere de uyan zamansız bir yüzük."),
        ("Telkari", 4.2, 0.28, 0, "İnce altın tellerin el işçiliğiyle işlendiği telkari yüzük. Geleneksel işçiliği taşıyan, karakterli bir duruşu var."),
        ("Alyans", 3.8, 0.12, 0, "İç yüzeyi konfor bombeli, parlak yüzeyli klasik alyans. İç yüzeye isim ve tarih yazdırılabilir."),
        ("Taşlı", 3.1, 0.22, 650, "Sıralı taşlarla süslenmiş, ince hatlı şık yüzük. Tek başına ya da diğer yüzüklerle birlikte kullanılabilir."),
        ("Zarif", 1.9, 0.20, 250, "İnce halka üzerinde yaprak motifli minimal tasarım. Katmanlı kullanıma çok uygun."),
    ], [("sari", 14, 1.00, None), ("rose", 14, 1.08, None), ("beyaz", 18, 1.12, None)]),
    "kolye": ("Kolye", [
        ("Madalyon", 3.4, 0.22, 0, "El işçiliği desenli yuvarlak madalyon uçlu altın kolye. Tek başına da katmanlı da şık duran, klasik bir parça."),
        ("Taşlı", 6.5, 0.20, 450, "Renkli taşlarla süslenmiş altın kolye. Doğal taş görünümüyle dikkat çeken, özel günler için seçilen bir model."),
        ("Zincir", 7.5, 0.10, 0, "Çift sıra zincir kolye. Tek başına ya da uç takarak kullanılabilen, sade ve güçlü bir parça."),
        ("Damla", 2.2, 0.18, 250, "Damla kesim renkli taşlı, ince zincirli sade kolye. Günlük kullanıma ve hediyeye çok uygun."),
        ("Kalp", 2.6, 0.20, 150, "Kalp ucunun ortasında küçük bir taş olan, hediye için en çok seçilenlerden biri."),
    ], [("sari", 14, 1.00, None), ("rose", 14, 1.08, None), ("beyaz", 18, 1.12, None)]),
    "bilezik": ("Bilezik", [
        ("Burma", 14.0, 0.06, 0, "Burma desenli klasik altın bilezik. Ağırlığı ve parlaklığıyla yatırım ve takı olarak tercih edilir."),
        ("İşlemeli", 18.0, 0.09, 0, "Çiçek motifleri ve noktalı kenar işçiliğiyle süslenmiş, geniş yüzeyli işlemeli bilezik."),
        ("Zincir", 12.0, 0.08, 0, "Sağlam halkalı zincir bilezik. Bileğe oturan, dayanıklı ve her kıyafete uyan klasik bir model."),
        ("Taşlı", 9.0, 0.12, 250, "Renkli ve pırıltılı taşlarla süslenmiş, ışığı yakalayan bilezik."),
        ("Kelepçe", 11.0, 0.07, 450, "Açık yapılı, üç taş detaylı kelepçe bilezik. Bileğe kolayca takılır."),
    ], [("sari", 14, 1.00, None), ("sari", 18, 1.04, None), ("sari", 22, 1.08, None)]),
    "pirlanta": ("Pırlanta", [
        ("Küpe", 2.2, 0.15, 0, "Pırlanta küpe. Taş bedeli toplam karata göre hesaplanır."),
        ("Kolye", 3.0, 0.15, 0, "Pırlanta ve değerli taşlarla hazırlanan, zarif kolye ucu. Taş bedeli toplam karata göre hesaplanır."),
        ("Bileklik", 7.5, 0.12, 0, "Boydan boya sıralı taşlarla hazırlanan, ışığı her açıdan yakalayan bileklik."),
        ("Halo Kolye", 3.2, 0.15, 0, "Ortadaki taşı küçük pırlantalar çevreleyen halo kolye. Parıltıyı katlayan bir tasarım."),
        ("Yüzük", 3.4, 0.15, 0, "Pırlanta ve değerli taşlarla hazırlanan, gösterişli bir yüzük. Taş bedeli toplam karata göre hesaplanır."),
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
                model_en, desc_en = MODEL_EN[(t, model)]
                if t == "pirlanta":
                    name_en = f"Diamond {model_en}, {fmt_ct(extra).replace(',', '.')} ct, {METAL_EN[metal]}"
                elif t == "bilezik":
                    name_en = f"{model_en} Bracelet, {karat}K"
                elif model_en.endswith("Band"):
                    name_en = f"{model_en}, {METAL_EN[metal]}"
                else:
                    name_en = f"{model_en} {TYPE_EN[t]}, {METAL_EN[metal]}"
                if t == "pirlanta":
                    name = f"Pırlanta {model}, {fmt_ct(extra)} ct, {METAL_LABEL[metal]}"
                elif t == "bilezik":
                    name = f"{model} Bilezik, {karat} ayar"
                else:
                    name = f"{model} {label}, {METAL_LABEL[metal]}"
                items.append({
                    "id": pid,
                    "type": t,
                    "typeLabel": label,
                    "typeLabelEn": TYPE_EN[t],
                    "model": model,
                    "modelEn": model_en,
                    "name": name,
                    "nameEn": name_en,
                    "metal": METAL_LABEL[metal],
                    "metalEn": METAL_EN[metal],
                    "karat": karat,
                    "gram": gram,
                    "laborRate": labor,
                    "stoneFee": stone,
                    "price": price_of(gram, karat, labor, stone, gram22),
                    "image": f"assets/img/products/{pid}.webp",
                    "imageCredit": {"author": photo["user"], "url": photo["page"], "source": "Pixabay"},
                    "stock": 0 if idx in {4, 11} else 1 + (idx * 5 + mi) % 12,
                    "desc": f"{desc} {karat} ayar {METAL_LABEL[metal].lower()}" + (f", toplam {fmt_ct(extra)} ct pırlanta." if extra else "."),
                    "descEn": f"{desc_en} {karat}K {METAL_EN[metal].lower()}" + (f", {fmt_ct(extra).replace(',', '.')} ct total diamond weight." if extra else "."),
                })
    # Aynı adı taşıyan ürünler (ör. aynı metalde iki varyant) gramla ayırt edilir.
    names = [i["name"] for i in items]
    for i in items:
        if names.count(i["name"]) > 1:
            i["name"] += f", {str(i['gram']).replace('.', ',')} g"
    names_en = [i["nameEn"] for i in items]
    for i in items:
        if names_en.count(i["nameEn"]) > 1:
            i["nameEn"] += f", {i['gram']} g"
    return items


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    items = build()
    OUT.write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT} yazıldı: {len(items)} ürün (22 ayar gram: {gram22_price()} TL)")


if __name__ == "__main__":
    main()
