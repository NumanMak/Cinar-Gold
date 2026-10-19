# Çınar Gold Mağaza: Tasarım

Tarih: 2026-10-19

## Amaç ve kapsam

Mevcut tek sayfalık Çınar Gold Kuyumculuk sitesini (siyah/altın tema, Fethiye) online alışverişe açık, statik bir mağazaya genişletmek. Aynı klasörde, düz HTML/CSS/JS ile; GitHub Pages'e olduğu gibi yüklenebilir. Sunucu yoktur. Hesap, sepet, stok ve bildirim verisi tarayıcıda (localStorage) tutulur ve demo seviyesindedir.

Başarı ölçütü: bir ziyaretçi izin verip hesap açabilir, ürünü filtreleyip sepete ekleyebilir, `CINAR10` kuponuyla %10 indirimli sipariş oluşturabilir; stok biten üründe "Bana bildir" görür; koyu/açık tema çalışır.

## Altın çember (Neden → Nasıl → Ne)

Ana sayfa bu sırayla ilerler:

- **Neden:** "Her takı bir hikâyeyi taşır. 1996'dan beri o hikâyeleri güvenle emanet alıyoruz." (Metin sahibi tarafından değiştirilebilir.)
- **Nasıl:** Şeffaf ayar ve gram bilgisi, canlı altın fiyatı, ustalık ve özel tasarım.
- **Ne:** Mağaza ve ürünler.

## Sayfalar

| Dosya | İçerik |
| --- | --- |
| `index.html` | Mevcut sayfa; Neden/Nasıl/Ne sırasına getirilir, duyuru şeridi, tema düğmesi, hesap ve sepet bağlantıları eklenir |
| `magaza.html` | Katalog; tür, model ve stok filtresi |
| `urun.html?id=…` | Ürün detayı, stok durumu, sepete ekle / Bana bildir |
| `sepet.html` | Sepet, kupon, sipariş oluşturma |
| `hesap.html` | Giriş, kayıt, siparişlerim |

## Veri ve mantık

- `assets/data/products.json`: 4 tür (Yüzük, Kolye, Bilezik, Pırlanta) × 15 ürün = 60 ürün. Her türde 5 model, her modelde 3 ürün. Alanlar: id, tür, model, ad, ayar, gram, fiyat, görsel, stok.
- `assets/js/store.js`: sepet, kullanıcı, stok, bildirim listesi, tema ve izin durumunu yönetir. Tek bir yerde, arayüzden bağımsız.
- Görseller mevcut `assets/img` stok fotoğraflarının yeniden kullanımıdır; gerçek ürün fotoğrafları sonradan aynı adlarla değiştirilir.

## Özellikler

1. **Kayan duyuru:** Sayfa üstünde soldan sağa kayan "Açılışa özel %10 indirim: CINAR10". `prefers-reduced-motion` altında durur.
2. **Tema:** Koyu ve açık mod; varsayılan sistem tercihi, seçim hatırlanır.
3. **Hesap:** E-posta + şifre ile kayıt/giriş. Şifre WebCrypto ile hash'lenerek saklanır. Demodur, gerçek güvenlik sağlamaz.
4. **Stok:** Sipariş stoktan düşer. Stok 0 ise "Sepete ekle" yerine "Bana bildir" gösterilir; istek yerelde kaydedilir (e-posta gönderimi sunucu gerektirir, MVP dışı).
5. **Online alışveriş:** Sepet, `CINAR10` (büyük/küçük harf duyarsız, %10), sipariş oluşturma. Ödeme simüle edilir (havale/EFT veya mağazada ödeme, WhatsApp ile onay). Kart ödemesi MVP dışı.
6. **İzin pop-up'ı:** Kişisel bilgi alan her akıştan önce (kayıt, giriş, bildirim, sipariş) KVKK aydınlatma metni ve izinler gösterilir. Zorunlu izin verilmezse form açılmaz. İzin tarihiyle kaydedilir.

## MVP kaydı

`MVP.md` dosyası temel sürümün özelliklerini listeler (yukarıdaki 1–6, katalog ve filtre).

## Test

- Mevcut `tools/check.py` ve `tools/qa.py` genişletilir.
- Tarayıcı testi: stok düşmesi, kupon hesabı, stok 0'da "Bana bildir", izin kapısı.
- 60 ürünün dağılımı (tür başına 15, model başına 3) veri doğrulamasıyla denetlenir.

## Sonraki adım: günlük issue kontrolü

Site GitHub'a yüklendikten sonra kurulur: her gün 19:00'da yeni issue'lar kontrol edilir; tehdit içeren iletiler düzeltilmeden sahibine bildirilir, diğerleri düzeltilir. Gereksinimler: GitHub deposu, çalışan `gh` girişi ya da yenilenmiş GitHub MCP token'ı (şu an 401 veriyor).

## Kapsam dışı (MVP sonrası)

Gerçek kart ödemesi, sunucu tarafı hesap/stok, e-posta ile stok bildirimi, yönetici paneli, gerçek ürün fotoğrafları.
