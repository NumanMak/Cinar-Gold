# Çınar Gold Kuyumculuk web sitesi

Tek sayfalık, statik (sunucu tarafı kod gerektirmeyen) web sitesi. Herhangi bir statik barındırmaya
(Netlify, Vercel, GitHub Pages, cPanel vb.) klasör olduğu gibi yüklenebilir.

## Yerelde açmak

Mağaza sayfaları (`magaza.html`, `urun.html`, `sepet.html`, `hesap.html`) ES modülleri ve `fetch` kullanır,
bu yüzden çift tıklayarak (`file://`) açılmaz; yerel bir sunucu gerekir (GitHub Pages ve benzeri barındırmada sorun olmaz):

```
python -m http.server 8000
```

Ardından tarayıcıda `http://localhost:8000` adresini açın.

## Sık değiştirilen bilgiler

| Ne | Nerede |
| --- | --- |
| Telefon / WhatsApp numarası | `index.html` içinde `905073517347` ve `0507 351 73 47` geçen yerler, `assets/js/main.js` içinde `PHONE` |
| Çalışma saatleri ve kapalı günler | `assets/js/main.js` içinde `HOURS` (ör. Pazar kapalıysa `days` listesinden `0` çıkarılır) ve `index.html` içindeki JSON-LD `openingHoursSpecification` |
| Adres ve harita | `index.html` iletişim bölümü, harita `iframe` adresi ve JSON-LD `address` |
| Alan adı | `index.html` (canonical, og:url, og:image, JSON-LD), `robots.txt`, `sitemap.xml`. Şu an `https://www.cinargold.com.tr/` yazılı |
| Ana sayfadaki vitrin ürünleri | `index.html` içindeki `data-product` öğeleri: ad, açıklama, özellikler (`data-specs`, `|` ile ayrılır) ve görsel (`data-img`) |
| Mağaza kataloğu (60 ürün: gram, ayar, işçilik, stok, model) | `tools/gen_products.py` dosyasını düzenleyip `python tools/gen_products.py` çalıştırın; çıktı `assets/data/products.json`. Fiyat `gram x ayar fiyatı x (1 + işçilik) + taş bedeli`, ayar fiyatı Özsafir 22 ayar fiyatından tarayıcıda canlı hesaplanır |
| Ürün fotoğrafı | Görseller Pixabay'dan seçilmiş temsilî fotoğraflardır (`tools/photo_map.json`, ücretsiz ticari lisans). Kendi fotoğrafınız için `assets/img/products/<ürün-id>.webp` dosyasını değiştirin (kare, 900x900 önerilir). Yeniden üretmek: `python tools/build_photos.py` ve `python tools/gen_products.py`; yeni aday aramak için `$env:PIXABAY_KEY` ile `tools/img_pixabay.py` |
| Kupon kodu ve oranı | `assets/js/shop/coupon.js` |
| Kayan duyuru metni | `assets/js/shop/shell.js` içinde `PROMO_TEXT` |

## Özellikler

- Logo çizimiyle açılış ekranı (oturum başına bir kez), sayfa geçişlerinde yumuşak kararma
- Masaüstünde ağır çekim pırlanta videosu, telefonda dikey altın bilezik fotoğrafı
- Canlı altın fiyatları şeridi (gram, çeyrek, yarım, tam, Cumhuriyet, 22 ayar bilezik). Veri `finans.truncgil.com`
  adresinden 5 dakikada bir alınır. Ulaşılamazsa ziyaretçiye mağazayı araması söylenir.
- İletişim bölümünde canlı "Şu an açık / kapalı" durumu (Türkiye saatiyle)
- Ürün kartlarında 3D eğim ve ışık, tıklayınca detay penceresi ve ürüne özel WhatsApp mesajı
- Yumuşak kaydırma (Lenis), kaydırmayla beliren başlıklar, paralaks, altın parıltı efektleri
- "Hareketi azalt" tercihine saygı: animasyonlar kapanır, video yerine fotoğraf gösterilir
- SEO: başlık ve açıklama, Open Graph görseli, `JewelryStore` yapılandırılmış verisi, `sitemap.xml`, `robots.txt`

## Altın fiyatları (Özsafir Gold)

Ana sayfadaki fiyat şeridi `assets/data/gold.json` dosyasını okur. Dosyayı `tools/fetch_gold.py` yazar: Özsafir Gold
sitesinin herkese açık fiyat tablosunu (görünen HTML) okur, API anahtarı veya gizli uç kullanmaz. GitHub'a yüklenince
`.github/workflows/gold.yml` bunu her 20 dakikada çalıştırır ve yalnızca fiyat değiştiğinde (ya da 12 saatte bir)
commit atar. Dosya 30 saatten eskiyse veya okunamazsa şerit Truncgil'e düşer, o da çalışmazsa mağazayı aramaya yönlendirir.
Yerelde denemek için: `python tools/fetch_gold.py`. Testler: `python -m unittest discover -s tools -p "test_*.py"`.

## Dil ve yönetici hesabı

- **Dil:** Üst çubuktaki EN / TR düğmesi dili değiştirir, seçim hatırlanır (`?lang=en` ile de açılabilir). Yeni metin eklerken
  Türkçe metni `t('...')` ile sarın ve İngilizcesini `assets/js/shop/i18n-en.js` dosyasına ekleyin; `node --test tests/` eksiği bulur.
- **Yönetici:** `admin.html` sayfası sipariş onayı, stok ve bildirim isteklerini yönetir. Canlı (Supabase) modda yönetici rolü yalnızca
  veritabanında SQL ile verilir (`supabase/README.md`); tarayıcıdan yönetici oluşturulamaz.

## Mağaza ve arka uç

Hesaplar, stok, siparişler, favoriler, "Bana bildir" kayıtları ve KVKK izinleri **Supabase** (Postgres + satır düzeyi güvenlik)
üzerinde merkezi olarak tutulur. Fiyat, kupon (CINAR10) ve stok düşümü sunucuda hesaplanır; tarayıcıdan gelen fiyat dikkate alınmaz.
Ödeme alınmaz; sipariş havale/WhatsApp ile onaylanır. Kurulum ve yönetici yetkilendirme: `supabase/README.md`.
Temel sürüm kapsamı için `MVP.md`, güvenlik modeli için `SECURITY.md` dosyasına bakın.

`assets/js/shop/config.js` içinde yalnızca herkese açık değerler (proje adresi ve publishable anahtar) bulunur. Geliştirirken
`localhost` üzerinde `localStorage.setItem('cg:dev-mode', 'local')` ile sunucusuz yerel moda geçilir (`python tools/e2e_shop.py` bunu kullanır).

Testler: `node --test tests/` (birim + sözleşme), `python tools/e2e_shop.py` (yerel mod, tarayıcı),
`python tools/e2e_supabase.py` ve `node tests/supabase.integration.mjs` (gerçek proje; `TEST_ADMIN_*` ve `SUPABASE_*` ortam değişkenleri gerekir).

- Katalog: 4 tür × 5 model × 3 ürün (60 ürün), tür/model/stok filtresi
- Stok bitince "Sepete ekle" yerine "Bana bildir"
- `CINAR10` kuponu (%10) ve soldan sağa kayan duyuru şeridi
- Koyu / açık tema (sistem tercihiyle başlar)
- Kişisel veri alınmadan önce izin penceresi (KVKK), izin hesap sayfasından geri alınabilir

## Görsel ve video lisansları

Tüm fotoğraflar Unsplash Lisansı, hero videosu Pexels Lisansı ile ticari kullanıma uygundur ve kaynak
gösterme zorunluluğu yoktur. Kaynak bağlantıları ve fotoğrafçılar `assets/img/manifest.json` dosyasında,
video ayrıntıları ise bu depoda yer almayan `tools/video/README.txt` dosyasında not edilmiştir.

Bunlar temsilî stok görsellerdir. Mağazanın kendi ürün fotoğrafları çekildiğinde `assets/img/` içindeki aynı
adlı dosyalarla değiştirilmesi önerilir (`tools/img_build.py` aynı ölçü ve renk düzenini uygular).

## Araçlar

- `python tools\check.py` : JSON-LD, yinelenen id, kırık bağlantı ve eksik dosya kontrolü
- `node --test tests/` : mağaza mantığı birim testleri (Node 20+)
- `python tools\e2e_shop.py` : Edge ile mağaza uçtan uca senaryosu (katalog, kupon, sipariş, izin, hesap)
- `python tools\qa.py` : Edge ile masaüstü, dizüstü, tablet ve telefonda ekran görüntüsü ve hata raporu
