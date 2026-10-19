# Çınar Gold Arka Uç: Tasarım

Tarih: 2026-10-19

## Amaç ve kapsam

Statik mağazayı, hesapların, siparişlerin ve stoğun merkezi tutulduğu gerçek bir mağazaya dönüştürmek. Ödeme **havale/EFT + WhatsApp onayı** olarak kalır (kart ödemesi yok). Alan adı yok; site `https://numanmak.github.io/Cinar-Gold/` adresinde kalır.

Başarı ölçütü: bir müşteri kayıt olup başka bir cihazdan giriş yaptığında hesabını, sepetini ve siparişlerini görür; yönetici tüm müşterilerin siparişlerini tek panelde görüp onaylar; stok tüm ziyaretçilerde aynıdır ve iki kişi son ürünü aynı anda satın alamaz.

## Mimari

- **Supabase** (ücretsiz katman): Postgres + Auth (e-posta/şifre) + satır düzeyinde yetki (RLS). Arayüz hâlâ statik; tarayıcıdan Supabase'e `@supabase/supabase-js` (CDN yerine depoya kopyalanmış tek dosya, CSP `script-src 'self'` korunur) ile bağlanır.
- **Depo deseni:** `assets/js/shop/` altındaki modüllerin (auth, orders, inventory, notify, wishlist) arayüzleri değişmez; arkalarına iki uygulama konur: `local` (bugünkü localStorage, testler ve çevrimdışı demo) ve `supabase`. `config.js` hangisinin kullanılacağını belirler. Böylece mevcut 135 birim testi ve tarayıcı senaryoları aynen çalışmaya devam eder.
- **Gizli anahtar yok:** Tarayıcıya yalnızca proje adresi ve herkese açık `anon` anahtar girer (RLS olmadan işe yaramaz, açık olması tasarım gereğidir). `service_role` anahtarı hiçbir zaman depoya veya tarayıcıya girmez.
- **Altın fiyatı** ve ürün kataloğu mevcut hâliyle (`gold.json`, `products.json`) kalır; katalog verisi herkese açıktır.

## Veri modeli (Postgres)

- `profiles(id uuid pk → auth.users, name, phone, role text default 'customer' check in ('customer','admin'), created_at)`
- `addresses(id, user_id, title, text, is_default)`
- `products_stock(product_id text pk, stock int check >= 0)`  (ürün bilgisi statik katalogda; yalnızca stok merkezi)
- `orders(id text pk 'CG-NNNNNN', user_id nullable, name, phone, payment, delivery, address, subtotal, discount, total, status check in ('beklemede','onaylandi','tamamlandi','iptal'), created_at, confirmed_at, completed_at, cancelled_at)`
- `order_lines(order_id, product_id, name, qty, unit_price)`
- `wishlist(user_id, product_id)`
- `stock_alerts(id, product_id, email, phone, created_at)`
- `consents(user_id nullable, kvkk bool, islem bool, iletisim bool, at)`  (izin kaydı)

## Yetki (RLS) ilkeleri

- Müşteri yalnızca **kendi** `profiles`, `addresses`, `orders`, `wishlist` satırlarını okur/yazar.
- `role` alanını müşteri **değiştiremez** (profil güncelleme politikası `role` kolonunu hariç tutar). Yönetici rolü yalnızca Supabase panelinden elle verilir.
- `products_stock` herkese **okunur**; yazma yalnızca yönetici ve sipariş fonksiyonları.
- `orders` doğrudan INSERT/UPDATE yapılamaz. Siparişler yalnızca **sunucu fonksiyonlarıyla** oluşur/değişir (aşağıda).
- Yönetici tüm `orders`, `order_lines`, `stock_alerts` satırlarını okur ve durum günceller.
- Misafir (girişsiz) sipariş: yalnızca `place_order` fonksiyonu üzerinden eklenir; misafir sonradan okuyamaz (sipariş numarası WhatsApp mesajında).

## Sunucu fonksiyonları (SECURITY DEFINER)

- `place_order(lines jsonb, customer jsonb, coupon text) -> order`: tek işlemde (transaction) stok kilitler, yetersizse hata verir, fiyatı **sunucuda** katalog+altın fiyatından yeniden hesaplar (tarayıcının gönderdiği fiyata güvenilmez), `CINAR10` kuponunu sunucuda doğrular, siparişi ve satırlarını yazar, stoğu düşürür. İki kişi son ürünü aynı anda alamaz.
- `cancel_my_order(id)`: yalnızca sahibi ve yalnızca `beklemede` iken; stok geri verilir.
- `admin_set_order_status(id, status)`: yalnızca yönetici; geçiş kuralları bugünkü `setOrderStatus` ile aynı; `iptal` stok iade eder.
- `admin_set_stock(product_id, qty)`: yalnızca yönetici.
- Fiyat hesabı için katalog verisi (gram, ayar, işçilik, taş bedeli) ve günlük altın fiyatı fonksiyona verilmelidir: katalog bir kez `products_catalog` tablosuna yüklenir (`tools/gen_products.py` çıktısı), altın fiyatı `gold_price` tablosuna GitHub Actions iş akışıyla yazılır (ek gizli anahtar: yalnızca Actions deposu sırrında, tarayıcıda değil).

## Arayüz değişiklikleri

- Giriş/kayıt gerçek Supabase Auth ile; e-posta doğrulama ve "şifremi unuttum" Supabase'in hazır akışıyla.
- Sepet yine tarayıcıda (oturum açmadan da çalışır); sipariş anında `place_order` çağrılır.
- Favoriler ve adresler oturum açıksa veritabanında, değilse tarayıcıda; girişte birleştirilir.
- Yönetim paneli tüm siparişleri gösterir; yeni sipariş gelince panelde görünür (gerçek zamanlı abonelik) ve yönetici WhatsApp'tan müşteriyle onaylar.
- "Bana bildir" kayıtları `stock_alerts` tablosuna yazılır; şimdilik yönetici panelinde listelenir. Otomatik e-posta gönderimi bu aşama dışıdır.
- CSP: `connect-src`'a yalnızca proje adresi eklenir; `script-src` değişmez.

## KVKK ve gizlilik

- Mevcut izin penceresi, onay kayıtları `consents` tablosuna yazılacak şekilde genişler; aydınlatma metni gerçek veriyi işlediğimiz için güncellenir (veri sorumlusu, amaç, saklama süresi, haklar, iletişim).
- Hesap silme ve verilerini dışa aktarma işlevleri eklenir.
- Metinlerin bir hukukçu tarafından gözden geçirilmesi önerilir; bu belge hukuki danışmanlık değildir.

## Test

- Mevcut birim testleri `local` uygulaması üzerinde aynen çalışır; `supabase` uygulaması için aynı sözleşme testleri bir test projesinde koşturulur.
- RLS testleri: müşteri A, müşteri B'nin siparişini okuyamaz/değiştiremez; müşteri `role` alanını `admin` yapamaz; doğrudan `orders` INSERT'i reddedilir; negatif stok oluşamaz; fiyat tarayıcıdan manipüle edilemez.
- Tarayıcı senaryosu iki "kullanıcı" ve bir yönetici ile uçtan uca genişler.

## Aşamalar

1. Supabase projesi, şema ve RLS (SQL dosyaları `supabase/` klasöründe, depoda).
2. `local`/`supabase` depo deseni ve hesap + adres + favori.
3. Sipariş ve stok (`place_order` vb.), yönetim paneli.
4. KVKK metni, hesap silme/dışa aktarma, yayın ve doğrulama.

## Kapsam dışı

Kart ödemesi, alan adı, otomatik e-posta/SMS gönderimi, kargo entegrasyonu, çoklu mağaza.
