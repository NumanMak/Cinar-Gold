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
10. **İzin penceresi:** kişisel bilgi alan her akıştan önce (kayıt, giriş, bildirim, sipariş) KVKK aydınlatması ve izinler sorulur; zorunlu izin verilmezse form gönderilmez.

## MVP'de olmayanlar (sonraki sürümler)

- Gerçek kart ödemesi.
- Sunucu tarafı hesap, stok ve sipariş kaydı (şu an yalnızca tarayıcı localStorage).
- "Bana bildir" kayıtları için gerçek e-posta / SMS gönderimi.
- Yönetici paneli (stok ve fiyat güncelleme); şimdilik `tools/gen_products.py` düzenlenir.
- Gerçek ürün fotoğrafları (şu an stok görseller yeniden kullanılıyor).

## Yayın sonrası görev

Site GitHub'a yüklendikten sonra her gün 19:00'da yeni issue'lar kontrol edilir. Tehdit içermeyenler incelenip düzeltilir; tehdit içerenlere dokunulmaz, sahibine bildirilir.
