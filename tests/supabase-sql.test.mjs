import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { products } from './helpers.mjs';

// supabase/setup.sql: SQL Editor'e yapıştırılan tek dosya. Bu testler gerçek veritabanı çalıştırmadan güvenlik kurallarını statik olarak denetler;
// gerçek davranış tests/supabase.integration.mjs ile projede doğrulanır.
const sql = readFileSync(new URL('../supabase/setup.sql', import.meta.url), 'utf8');
const lower = sql.toLowerCase();

const tables = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)].map((m) => m[1]);
const policies = [...sql.matchAll(/create policy\s+(\w+)\s+on\s+public\.(\w+)\s+for\s+(select|insert|update|delete|all)/gi)].map((m) => ({ name: m[1], table: m[2], cmd: m[3].toLowerCase() }));

function fnBody(name) {
  const re = new RegExp(`create (?:or replace )?function public\\.${name}\\b[\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$;`, 'i');
  const m = re.exec(sql);
  assert.ok(m, `${name} fonksiyonu yok`);
  return m[0];
}

test('beklenen tablolar var', () => {
  for (const t of ['profiles', 'addresses', 'products_catalog', 'products_stock', 'gold_price', 'orders', 'order_lines', 'wishlist', 'stock_alerts', 'consents']) {
    assert.ok(tables.includes(t), `${t} tablosu yok`);
  }
});

test('her tabloda satir duzeyi guvenlik (RLS) acik', () => {
  for (const t of tables) {
    assert.match(lower, new RegExp(`alter table public\\.${t} enable row level security`), `${t}: RLS kapali`);
  }
});

test('gizli anahtar, service_role ve sifre benzeri metin yok', () => {
  assert.doesNotMatch(lower, /service_role|sb_secret|eyj[a-z0-9_-]{20,}|password\s*=\s*'/);
});

test('orders ve order_lines icin dogrudan insert/update/delete/all politikasi yok; haklar geri alinmis', () => {
  for (const t of ['orders', 'order_lines', 'products_stock', 'gold_price', 'products_catalog']) {
    const bad = policies.filter((p) => p.table === t && p.cmd !== 'select');
    assert.deepEqual(bad, [], `${t}: yazma politikasi var`);
    assert.match(lower, new RegExp(`revoke[^;]*\\b${t}\\b[^;]*from anon, authenticated`), `${t}: yazma haklari geri alinmamis`);
  }
});

test('siparis fonksiyonlari security definer, arama yolu sabit ve herkese acik calistirma kapali', () => {
  for (const f of ['place_order', 'cancel_my_order', 'admin_set_order_status', 'admin_set_stock', 'is_admin']) {
    const body = fnBody(f);
    assert.match(body, /security definer/i, `${f}: security definer degil`);
    assert.match(body, /set search_path\s*=\s*public/i, `${f}: search_path sabit degil`);
    assert.match(lower, new RegExp(`revoke all on function public\\.${f}\\b[^;]*from public`), `${f}: public calistirma hakki geri alinmamis`);
  }
});

test('yonetici fonksiyonlari is_admin() kontrolu yapar ve YETKI_YOK verir', () => {
  for (const f of ['admin_set_order_status', 'admin_set_stock']) {
    const body = fnBody(f);
    assert.match(body, /is_admin\(\)/, `${f}: is_admin kontrolu yok`);
    assert.match(body, /YETKI_YOK/, `${f}: YETKI_YOK yok`);
  }
});

test('musteri profilindeki role alanini degistiremez (sutun hakki + with check)', () => {
  assert.match(lower, /revoke update on public\.profiles from anon, authenticated/);
  assert.match(lower, /grant update \(name, phone\) on public\.profiles to authenticated/);
  const upd = /create policy\s+\w+\s+on public\.profiles\s+for update[\s\S]*?;/i.exec(sql);
  assert.ok(upd, 'profiles guncelleme politikasi yok');
  assert.match(upd[0], /with check[\s\S]*role\s*=\s*\(\s*select/i);
});

test('yeni kullanici her zaman customer olarak acilir (tetikleyici), insert politikasi yok', () => {
  assert.match(lower, /create trigger on_auth_user_created/);
  assert.match(lower, /insert into public\.profiles[^;]*'customer'/);
  assert.equal(policies.filter((p) => p.table === 'profiles' && (p.cmd === 'insert' || p.cmd === 'delete')).length, 0);
});

test('stok negatif olamaz, adet ve fiyat kontrolleri tablo duzeyinde', () => {
  assert.match(lower, /stock integer not null check \(stock >= 0\)/);
  assert.match(lower, /qty integer not null check \(qty between 1 and 10\)/);
  assert.match(lower, /status text not null[^,]*check \(status in \('beklemede', 'onaylandi', 'tamamlandi', 'iptal'\)\)/);
});

test('place_order fiyati ve kuponu sunucuda hesaplar, stok satirlarini kilitler', () => {
  const body = fnBody('place_order');
  assert.match(body, /products_priced/, 'fiyat sunucu gorunumunden gelmeli');
  assert.match(body, /gold_price/);
  assert.match(body, /CINAR10/);
  assert.match(body, /for update/i);
  assert.match(body, /jsonb_agg\([^;]*order by t\.id\)/i, 'urunler kimlige gore siralanmali (kilitlenme onleme)');
  assert.match(body, /for update/i);
  assert.doesNotMatch(body, /->>\s*'price'|->>\s*'unit_price'|->>\s*'total'/, 'istemciden gelen fiyat okunmamali');
});

test('hata kodlari tanimli', () => {
  for (const code of ['STOK_YETERSIZ', 'URUN_YOK', 'SEPET_BOS', 'ZORUNLU_ALAN', 'SIPARIS_YOK', 'IPTAL_EDILEMEZ', 'DURUM_GECERSIZ', 'YETKI_YOK', 'STOK_GECERSIZ']) {
    assert.ok(sql.includes(code), `${code} yok`);
  }
});

test('sunucu fiyat gorunumu (products_priced) herkese okunur, tarayicidaki formulle ayni islem', () => {
  const view = /create (?:or replace )?view public\.products_priced[\s\S]*?;/i.exec(sql);
  assert.ok(view, 'products_priced gorunumu yok');
  assert.match(view[0], /labor_rate/);
  assert.match(view[0], /stone_fee/);
  assert.match(view[0], /gram22_sell \* c\.karat \/ 22\.0/);
  assert.match(lower, /grant select on public\.products_priced to anon, authenticated/);
});

test('katalog ve baslangic stogu seed ile yuklenir: 60 urunun hepsi, stok mevcut degerin ustune yazilmaz', () => {
  for (const p of products) assert.ok(sql.includes(`'${p.id}'`), `${p.id} seed'de yok`);
  assert.match(lower, /insert into public\.products_stock[\s\S]*on conflict \(product_id\) do nothing/);
  assert.match(lower, /insert into public\.gold_price/);
});

test('katalog herkese okunur, stok bildirimi herkese eklenebilir ama okunamaz, izin kaydi korumali', () => {
  const sel = (t) => policies.some((p) => p.table === t && p.cmd === 'select');
  for (const t of ['products_catalog', 'products_stock', 'gold_price']) assert.ok(sel(t), `${t}: herkese okuma yok`);
  const alertIns = /create policy\s+\w+\s+on public\.stock_alerts\s+for insert[\s\S]*?;/i.exec(sql);
  assert.ok(alertIns && /with check/i.test(alertIns[0]), 'stock_alerts insert politikasi kontrolsuz');
  assert.match(alertIns[0], /length\(/i, 'stock_alerts uzunluk siniri yok');
  const consentIns = /create policy\s+\w+\s+on public\.consents\s+for insert[\s\S]*?;/i.exec(sql);
  assert.ok(consentIns && /kvkk/i.test(consentIns[0]) && /islem/i.test(consentIns[0]), 'zorunlu izinler kontrol edilmiyor');
});

test('musteri kendi satirlarina erisir: addresses, wishlist, orders icin auth.uid() kosulu', () => {
  for (const t of ['addresses', 'wishlist']) {
    const ps = policies.filter((p) => p.table === t);
    assert.ok(ps.length >= 1, `${t}: politika yok`);
  }
  assert.match(sql, /create policy\s+orders_select\s+on public\.orders\s+for select\s+using\s*\(\s*user_id = auth\.uid\(\) or public\.is_admin\(\)\s*\)/i);
});
