# Çınar Gold Mağaza: MVP (temel sürüm)

Bu dosya mağazanın ilk yayınlanabilir sürümündeki özellikleri ve bilerek dışarıda bırakılanları listeler.
Detaylı tasarım: `docs/superpowers/specs/2026-10-19-cinar-gold-store-design.md`.

## MVP'de olanlar

1. **Altın çember ana sayfa:** Neden (marka hikâyesi), Nasıl (hakkımızda, canlı altın fiyatı, özel tasarım, güven ilkeleri), Ne (koleksiyonlar ve ürünler) sırası.
2. **Katalog:** 4 tür (Yüzük, Kolye, Bilezik, Pırlanta) × 5 model × 3 ürün = 60 ürün; tür, model ve "yalnızca stokta" filtresi.
3. **Ürün detayı:** ayar, gram, fiyat, stok rozeti, adet seçimi.
4. **Stok:** sipariş verilince stoktan düşer; stok bitince "Sepete ekle" yerine **"Bana bildir"** butonu.
5. **Sepet ve online sipariş:** adet değiştirme, kupon, sipariş oluşturma (havale/EFT veya mağazada ödeme), WhatsApp ile onay bağlantısı.
6. **Kupon:** `CINAR10`, %10 açılış indirimi.
7. **Kayan duyuru şeridi:** sayfa üstünde soldan sağa kayan "Açılışa özel %10 indirim: CINAR10".
8. **Hesap:** kayıt, giriş, çıkış, siparişlerim (demo; veriler yalnızca o tarayıcıda).
9. **Koyu / açık tema:** sistem tercihiyle başlar, seçim hatırlanır.
10. **Hesap detayı:** profil (telefon, adres), siparişlerim (teslimat ve ödeme bilgisiyle), stok bildirimlerim, şifre değiştirme.
11. **Sepette teslimat:** mağazadan teslim veya adrese teslim (açık adres zorunlu), hesaptan ön doldurma.
12. **Mağaza araması ve sıralama:** Türkçe karakterden bağımsız arama, fiyat ve ada göre sıralama; ürün sayfasında benzer ürünler.
13. **Canlı altın fiyatı:** Özsafir Gold sitesinin herkese açık fiyat tablosu (`tools/fetch_gold.py`, `.github/workflows/gold.yml` her 20 dakikada çalıştırır); dosya eskirse Truncgil yedek kaynağı kullanılır.
14. **Giriş yap ve kullanıcı menüsü:** sağ üstte misafire "Giriş yap" düğmesi; girişten sonra avatar ve açılır menü (Siparişlerim, Favorilerim, Adreslerim, Hesap bilgilerim; ikincil: stok bildirimlerim, izinler, destek, çıkış). Menü klavye ile kullanılır (ok tuşları, Esc).
15. **Hesap bölümleri:** genel bakış, siparişler (iptal ve stok iadesi), favoriler, adres defteri, stok bildirimleri, bilgiler ve şifre, izinler.
16. **Katalog ve fiyat:** 60 ürün için kuyumculuk fiyatı `gram x ayar fiyatı x (1 + işçilik) + taş bedeli` ile Özsafir 22 ayar fiyatından canlı hesaplanır; ürün fotoğrafları Pixabay'dan (ücretsiz ticari lisans) seçilmiş temsilî fotoğraflardır; fotoğrafçı adı ürün sayfasında gösterilir.
17. **İzin penceresi:** kişisel bilgi alan her akıştan önce (kayıt, giriş, bildirim, sipariş) KVKK aydınlatması ve izinler sorulur; zorunlu izin verilmezse form gönderilmez.

## MVP'de olmayanlar (sonraki sürümler)

- Gerçek kart ödemesi.
- Sunucu tarafı hesap, stok ve sipariş kaydı (şu an yalnızca tarayıcı localStorage).
- "Bana bildir" kayıtları için gerçek e-posta / SMS gönderimi.
- Yönetici paneli (stok ve fiyat güncelleme); şimdilik `tools/gen_products.py` düzenlenir.
- Mağazanın kendi ürün fotoğrafları: şu an görseller temsilî Pixabay fotoğraflarıdır (`assets/img/products/<ürün-id>.webp`). Kendi fotoğraflarınızı aynı dosya adıyla (kare, 900x900 önerilir) değiştirebilirsiniz.

## Yayın sonrası görev

Site GitHub'a yüklendikten sonra her gün 19:00'da yeni issue'lar kontrol edilir. Tehdit içermeyenler incelenip düzeltilir; tehdit içerenlere dokunulmaz, sahibine bildirilir.
