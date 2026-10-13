# Çınar Gold Kuyumculuk web sitesi

Tek sayfalık, statik (sunucu tarafı kod gerektirmeyen) web sitesi. Herhangi bir statik barındırmaya
(Netlify, Vercel, GitHub Pages, cPanel vb.) klasör olduğu gibi yüklenebilir.

## Yerelde açmak

`index.html` dosyasına çift tıklamak çalışır, ancak video ve harita gibi bazı özellikler en doğru şekilde
yerel bir sunucuyla görünür:

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
| Ürünler | `index.html` içindeki `data-product` öğeleri: ad, açıklama, özellikler (`data-specs`, `|` ile ayrılır) ve görsel (`data-img`) |

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

## Görsel ve video lisansları

Tüm fotoğraflar Unsplash Lisansı, hero videosu Pexels Lisansı ile ticari kullanıma uygundur ve kaynak
gösterme zorunluluğu yoktur. Kaynak bağlantıları ve fotoğrafçılar `assets/img/manifest.json` dosyasında,
video ayrıntıları ise bu depoda yer almayan `tools/video/README.txt` dosyasında not edilmiştir.

Bunlar temsilî stok görsellerdir. Mağazanın kendi ürün fotoğrafları çekildiğinde `assets/img/` içindeki aynı
adlı dosyalarla değiştirilmesi önerilir (`tools/img_build.py` aynı ölçü ve renk düzenini uygular).

## Araçlar

- `python tools\check.py` : JSON-LD, yinelenen id, kırık bağlantı ve eksik dosya kontrolü
- `python tools\qa.py` : Edge ile masaüstü, dizüstü, tablet ve telefonda ekran görüntüsü ve hata raporu
