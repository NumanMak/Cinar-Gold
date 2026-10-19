# Supabase kurulumu

1. Supabase paneli → projeniz → **SQL Editor** → **New query**.
2. `supabase/setup.sql` dosyasının **tamamını** yapıştırın ve **Run** düğmesine basın. "Success. No rows returned" görmelisiniz.
   Dosya yeniden çalıştırılabilir; mevcut stok değerlerini ezmez.
3. Yönetici hesabı: siteden normal bir hesap açın, sonra SQL Editor'de aşağıdaki satırı (e-postayı değiştirerek) çalıştırın.
   Yönetici rolü yalnızca buradan verilebilir; tarayıcıdan değiştirilemez.

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'yonetici@ornek.com');
```

4. Authentication → Sign In / Providers → Email: **Confirm email** açık kalsın (test sırasında geçici kapatılabilir).
5. Authentication → URL Configuration → **Site URL**: `https://numanmak.github.io/Cinar-Gold/`
   (Redirect URLs listesine aynı adresi ve geliştirme için `http://localhost:8000/*` ekleyin).

`tools/gen_supabase_seed.py` katalog değiştiğinde `supabase/seed.sql` ve `supabase/setup.sql` dosyalarını yeniden üretir.
`python tools/check_sql.py` SQL sözdizimini denetler.

## Entegrasyon testleri (`tests/supabase.integration.mjs`)

Gerçek projede yarış, fiyat manipülasyonu, yetki yükseltme ve RLS saldırı senaryolarını çalıştırır. Önce **Confirm email** geçici kapalı olmalı ve
bir test yöneticisi (yukarıdaki SQL ile `role = 'admin'`) bulunmalıdır. Değişkenler:
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`. Ardından: `node tests/supabase.integration.mjs`.
Kayıt hız sınırı nedeniyle ardışık çalıştırmalar arasında 3-5 dakika bekleyin. Testler siparişleri "TEST " ile işaretler, sonunda iptal eder ve stokları geri yükler.

### Test verilerini silme (testten sonra)

```sql
-- test siparişleri ve test kullanıcıları (gerçek müşteriler etkilenmez: e-postası @cinargold.test olanlar)
delete from public.orders where name like 'TEST %' or name = 'silindi';  -- 'silindi': tarayıcı testinin silinen hesabından kalan anonim siparişler
delete from auth.users where email like '%@cinargold.test';
```

Test yöneticisini de aynı sorgu siler; gerçek yöneticinizi kendi e-postanızla açıp yetkilendirin.
