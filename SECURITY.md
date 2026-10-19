# Güvenlik Politikası

Çınar Gold sitesinde bir güvenlik açığı bulduysanız lütfen **herkese açık issue açmayın**.
GitHub'ın "Report a vulnerability" (özel güvenlik bildirimi) özelliğini kullanın:
Depo sayfası → Security → Report a vulnerability.

## Bu sitenin güvenlik modeli (bilmeniz gerekenler)

- Site statik sayfalardan ve **Supabase** arka ucundan oluşur. Hesap, stok, sipariş ve izin verileri Supabase'te tutulur; erişimi
  satır düzeyi güvenlik (RLS) belirler: müşteri yalnızca kendi verisini görür, fiyat/kupon/stok hesabı sunucudaki işlevlerde yapılır
  (`supabase/schema.sql`). Yönetici rolü yalnızca veritabanında SQL ile verilir; müşteri bunu tarayıcıdan değiştiremez.
- Tarayıcıda yalnızca herkese açık anahtar (publishable/anon) bulunur. Gizli anahtar (service_role/secret) ve veritabanı şifresi
  koda, depoya veya sohbete **asla** konmaz; sızarsa Supabase panelinden hemen yenilenir.
- Ödeme alınmaz (havale/WhatsApp). KVKK: izinler kayıt altına alınır, kullanıcı verisini indirebilir ve hesabını silebilir.
- Tarayıcıda çalışan kod (HTML/CSS/JS) doğası gereği herkes tarafından görülebilir; sır (API anahtarı, şifre) kod içine konmaz.

## Uygulanan korumalar

- Her sayfada katı İçerik Güvenlik Politikası (CSP): yabancı betik, satır içi olay işleyicisi ve dış kaynaklı görseller engellenir
  (`tools/csp.py`, `tools/check.py` ile denetlenir).
- Kullanıcı/katalog metni DOM'a yalnızca `textContent` ile yazılır; `innerHTML` yalnızca sabit SVG için kullanılır.
- Şifreler PBKDF2-SHA256 (100.000 tur, rastgele tuz) ile hash'lenir; düz metin saklanmaz.
- GitHub Actions üçüncü taraf eylemleri commit özetine sabitlenmiştir; iş akışı yalnızca zamanlanmış/elle tetiklenir.
