# Güvenlik Politikası

Çınar Gold sitesinde bir güvenlik açığı bulduysanız lütfen **herkese açık issue açmayın**.
GitHub'ın "Report a vulnerability" (özel güvenlik bildirimi) özelliğini kullanın:
Depo sayfası → Security → Report a vulnerability.

## Bu sitenin güvenlik modeli (bilmeniz gerekenler)

- Site **statik** bir mağaza demosudur: hesaplar, sepet, stok ve siparişler yalnızca ziyaretçinin tarayıcısında (localStorage) tutulur.
  Sunucu olmadığı için bu veriler gerçek bir güvenlik sınırı oluşturmaz; **yönetici rolü de tarayıcıda saklanır** ve gerçek
  müşteri verisi/ödeme için kullanılmamalıdır.
- Gerçek kullanım (ödeme, çok kullanıcılı hesap, siparişlerin merkezi onayı) için sunucu tarafı bir arka uç gerekir.
- Tarayıcıda çalışan kod (HTML/CSS/JS) doğası gereği herkes tarafından görülebilir; sır (API anahtarı, şifre) kod içine konmaz.

## Uygulanan korumalar

- Her sayfada katı İçerik Güvenlik Politikası (CSP): yabancı betik, satır içi olay işleyicisi ve dış kaynaklı görseller engellenir
  (`tools/csp.py`, `tools/check.py` ile denetlenir).
- Kullanıcı/katalog metni DOM'a yalnızca `textContent` ile yazılır; `innerHTML` yalnızca sabit SVG için kullanılır.
- Şifreler PBKDF2-SHA256 (100.000 tur, rastgele tuz) ile hash'lenir; düz metin saklanmaz.
- GitHub Actions üçüncü taraf eylemleri commit özetine sabitlenmiştir; iş akışı yalnızca zamanlanmış/elle tetiklenir.
