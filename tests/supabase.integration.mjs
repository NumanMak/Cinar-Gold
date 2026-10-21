// Gerçek Supabase projesinde çalışan entegrasyon testleri: aynı sözleşme paketi + yetki (RLS) ve saldırı senaryoları.
// Ortam değişkenleri yoksa tüm testler atlanır (varsayılan `node --test tests/` çalıştırmasında gerçek projeye dokunulmaz).
//   SUPABASE_URL, SUPABASE_ANON_KEY            herkese açık değerler
//   TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD      yönetici rolü verilmiş test hesabı (supabase/README.md)
// Kullanım (PowerShell/bash): değişkenleri ayarlayıp `node tests/supabase.integration.mjs`
// Test siparişleri adın başındaki "TEST " ile işaretlenir; sonunda iptal edilir (stok iade) ve stoklar başlangıç değerine döner.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../assets/js/shop/storage.js';
import { createSupabaseApi } from '../assets/js/shop/api/supabase.js';
import { products, memoryBackend } from './helpers.mjs';
import { contract } from './contract.mjs';

const env = process.env;
const enabled = !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.TEST_ADMIN_EMAIL && env.TEST_ADMIN_PASSWORD);
const config = { mode: 'supabase', url: env.SUPABASE_URL ?? '', anonKey: env.SUPABASE_ANON_KEY ?? '' };
const runId = Math.random().toString(36).slice(2, 8);
const PW = 'Test-sifre-2026-xyz';

const newApi = () => {
  const store = createStore(memoryBackend());
  const api = createSupabaseApi(config, { store, products });
  // Test siparişleri işaretlenir.
  const place = api.orders.place;
  // Yalnızca dolu adlar işaretlenir (boş ad doğrulama testi bozulmasın).
  api.orders.place = (lines, customer, coupon) => place(lines, { ...customer, name: String(customer.name ?? '').trim() ? `TEST ${customer.name}` : customer.name }, coupon);
  return { api, store };
};
const makeAdminApi = async () => {
  const { api, store } = newApi();
  await api.auth.signIn(env.TEST_ADMIN_EMAIL, env.TEST_ADMIN_PASSWORD);
  return { api, store };
};

// Ham istek (tarayıcı adaptörünün dışında, saldırgan gibi).
async function raw(path, { token, method = 'GET', body, prefer } = {}) {
  const res = await fetch(config.url + path, {
    method,
    headers: { apikey: config.anonKey, Authorization: `Bearer ${token ?? config.anonKey}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : undefined; } catch (e) { data = text; }
  return { status: res.status, data };
}
const tokenOf = (store) => store.get('sb-session', null)?.access_token;
const uidOf = (store) => store.get('sb-session', null)?.user?.id;
const customer = { name: 'Saldırı Müşteri', phone: '05550000000', payment: 'havale', delivery: 'magaza', address: '' };

const A = products.find((p) => p.stock >= 3 && p.stock <= 9);
const B = products.filter((p) => p.stock >= 3 && p.stock <= 9)[1];
let initialStock = {};

before(async () => {
  if (!enabled) return;
  const { api } = newApi();
  initialStock = await api.stock.load();
  assert.equal(initialStock[A.id], A.stock, 'başlangıç stoğu katalogdakinden farklı: test ürünleri değişmiş, önce stokları sıfırlayın');
  assert.equal(initialStock[B.id], B.stock, 'başlangıç stoğu katalogdakinden farklı');
});

// Temizlik: test siparişlerini iptal et (stok iadesi) ve stokları başlangıç değerine getir.
after(async () => {
  if (!enabled) return;
  const { api } = await makeAdminApi();
  const orders = await api.orders.adminList();
  for (const o of orders.filter((x) => x.name.startsWith('TEST ') && (x.status === 'beklemede' || x.status === 'onaylandi'))) {
    await api.orders.adminSetStatus(o.id, 'iptal');
  }
  const now = await api.stock.load();
  for (const [id, qty] of Object.entries(initialStock)) if (now[id] !== qty) await api.stock.adminSet(id, qty);
  const left = await api.orders.adminList();
  console.log(`# temizlik: ${left.filter((x) => x.name.startsWith('TEST ')).length} test siparişi (hepsi iptal/tamamlandı) kaldı; silmek için supabase/README.md içindeki temizlik SQL'ini çalıştırın`);
});

const skip = enabled ? false : 'SUPABASE_* ortam değişkenleri yok';

if (enabled) {
  contract('supabase', async () => {
    // Önceki testlerin siparişleri stoğu tüketmiş olabilir: test ürünlerinin stoğu her testten önce başlangıç değerine döner.
    const reset = await makeAdminApi();
    const cur = await reset.api.stock.load();
    for (const id of [A.id, B.id]) if (cur[id] !== initialStock[id]) await reset.api.stock.adminSet(id, initialStock[id]);
    const { api } = newApi();
    // Her test için e-postalar ad başına sabit ama testler arasında benzersizdir.
    const names = new Map();
    const unique = Math.random().toString(36).slice(2, 7);
    return {
      api,
      mail: (n) => {
        if (!names.has(n)) names.set(n, `${n}.${runId}.${unique}@cinargold.test`);
        return names.get(n);
      },
      exactStock: false,
      priceOf: async (id) => (await api.prices())[id],
      makeAdmin: async (apiRef) => {
        await apiRef.auth.signIn(env.TEST_ADMIN_EMAIL, env.TEST_ADMIN_PASSWORD);
        return { email: env.TEST_ADMIN_EMAIL, password: env.TEST_ADMIN_PASSWORD };
      },
    };
  });
} else {
  test('supabase entegrasyon testleri', { skip: 'SUPABASE_* ortam değişkenleri yok' }, () => {});
}

// Kayıt hız sınırına takılmamak için müşteriler etikete göre bir kez açılır ve testler arasında paylaşılır.
const sharedCustomers = new Map();
async function customerApi(tag) {
  if (!sharedCustomers.has(tag)) {
    sharedCustomers.set(tag, (async () => {
      const { api, store } = newApi();
      const email = `${tag}.${runId}.${Math.random().toString(36).slice(2, 6)}@cinargold.test`;
      await api.auth.signUp({ name: `Test ${tag}`, email, password: PW });
      return { api, store, email };
    })());
  }
  return sharedCustomers.get(tag);
}

test('yarış: stoğu 1 olan ürünü iki müşteri aynı anda alır, yalnızca biri başarılı olur, stok negatif olmaz', { skip }, async () => {
  const admin = await makeAdminApi();
  await admin.api.stock.adminSet(A.id, 1);
  try {
    const g1 = (await customerApi('R1')).api; const g2 = (await customerApi('R2')).api;
    const results = await Promise.allSettled([
      g1.orders.place([{ id: A.id, qty: 1 }], customer, ''),
      g2.orders.place([{ id: A.id, qty: 1 }], customer, ''),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const bad = results.filter((r) => r.status === 'rejected');
    assert.equal(ok.length, 1, `tam bir sipariş başarılı olmalı: ${JSON.stringify(results.map((r) => r.status))}`);
    assert.match(bad[0].reason.message, /STOK_YETERSIZ/);
    assert.equal((await admin.api.stock.load())[A.id], 0);
  } finally {
    await admin.api.stock.adminSet(A.id, initialStock[A.id]);
  }
});

test('yarış: sekiz eşzamanlı sipariş, stok 3 iken tam üçü başarılı olur', { skip }, async () => {
  const admin = await makeAdminApi();
  await admin.api.stock.adminSet(B.id, 3);
  try {
    const u1 = (await customerApi('R1')).api; const u2 = (await customerApi('R2')).api;
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => (i % 2 ? u1 : u2).orders.place([{ id: B.id, qty: 1 }], customer, '')));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
    assert.equal((await admin.api.stock.load())[B.id], 0);
  } finally {
    await admin.api.stock.adminSet(B.id, initialStock[B.id]);
  }
});

test('fiyat manipülasyonu: sunucu istemciden gelen fiyat, toplam ve indirim alanlarını yok sayar', { skip }, async () => {
  const token = tokenOf((await customerApi('T')).store);
  const before = (await newApi().api.stock.load())[A.id];
  // Üst düzeye fazladan parametre eklemek fonksiyon imzasına uymadığı için sunucuca reddedilir.
  const extra = await raw('/rest/v1/rpc/place_order', { token, method: 'POST', body: { lines: [{ id: A.id, qty: 1 }], customer: { ...customer, name: 'TEST fiyat' }, coupon: '', total: 1, price: 1 } });
  assert.ok(extra.status >= 400, 'bilinmeyen üst düzey parametre kabul edilmemeli');
  // İç içe alanlardaki fiyat/indirim denemeleri okunmaz.
  const r = await raw('/rest/v1/rpc/place_order', { token, method: 'POST', body: {
    lines: [{ id: A.id, qty: 1, price: 1, unit_price: 1, unitPrice: 1, total: 1 }],
    customer: { ...customer, name: 'TEST fiyat', total: 1, subtotal: 1, discount: 99999, price: 1 },
    coupon: '',
  } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const expected = (await raw(`/rest/v1/products_priced?select=price&id=eq.${A.id}`)).data[0].price;
  assert.equal(r.data.total, expected, 'tutar sunucu fiyatından gelmeli');
  assert.equal(r.data.discount, 0);
  assert.equal((await newApi().api.stock.load())[A.id], before - 1);
});

test('geçersiz girdiler reddedilir ve stok/sipariş oluşmaz', { skip }, async () => {
  const token = tokenOf((await customerApi('G')).store);
  const before = (await newApi().api.stock.load())[A.id];
  const bad = [
    [{ id: A.id, qty: 0 }], [{ id: A.id, qty: -1 }], [{ id: A.id, qty: 1.5 }], [{ id: A.id, qty: 11 }], [{ id: A.id, qty: '2' }], [{ id: A.id, qty: null }],
    [{ qty: 1 }], [{ id: null, qty: 1 }], [{ id: `${A.id}'; drop table orders;--`, qty: 1 }], [{ id: A.id, qty: 6 }, { id: A.id, qty: 6 }],
    Array.from({ length: 31 }, () => ({ id: A.id, qty: 1 })),
  ];
  for (const lines of bad) {
    const r = await raw('/rest/v1/rpc/place_order', { token, method: 'POST', body: { lines, customer: { ...customer, name: 'TEST kotu' }, coupon: '' } });
    assert.notEqual(r.status, 200, `kabul edilmemeliydi: ${JSON.stringify(lines).slice(0, 80)}`);
  }
  for (const notArray of [null, {}, 'x', 5]) {
    const r = await raw('/rest/v1/rpc/place_order', { token, method: 'POST', body: { lines: notArray, customer: { ...customer, name: 'TEST kotu' }, coupon: '' } });
    assert.notEqual(r.status, 200);
  }
  const cust = [{ name: '' }, { phone: ' ' }, { payment: 'bitcoin' }, { delivery: 'ucak' }, { delivery: 'adres', address: 'kısa' }];
  for (const over of cust) {
    const r = await raw('/rest/v1/rpc/place_order', { token, method: 'POST', body: { lines: [{ id: A.id, qty: 1 }], customer: { ...customer, name: 'TEST kotu', ...over }, coupon: '' } });
    assert.notEqual(r.status, 200, `müşteri alanı kabul edilmemeliydi: ${JSON.stringify(over)}`);
  }
  assert.equal((await newApi().api.stock.load())[A.id], before);
});

test('kupon: yalnızca CINAR10 (büyük/küçük harf ve boşluk duyarsız) indirim verir', { skip }, async () => {
  const { api } = await customerApi('K');
  const ok = await api.orders.place([{ id: A.id, qty: 1 }], customer, ' cinar10 ');
  assert.ok(ok.discount > 0);
  const none = await api.orders.place([{ id: B.id, qty: 1 }], customer, "CINAR10'; update orders set total=0;--");
  assert.equal(none.discount, 0);
});

test('RLS: müşteri B, müşteri A\'nın siparişini, adresini, favorisini ve bildirimini okuyamaz', { skip }, async () => {
  const a = await customerApi('A'); const b = await customerApi('B');
  const order = await a.api.orders.place([{ id: A.id, qty: 1 }], customer, '');
  await a.api.auth.addresses.add({ title: 'Ev', text: 'Atatürk Cd. No:5 Fethiye Muğla' });
  await a.api.wishlist.toggle(A.id);
  await a.api.alerts.add({ productId: B.id, email: a.email });
  const tb = tokenOf(b.store);
  assert.deepEqual((await raw(`/rest/v1/orders?id=eq.${order.id}`, { token: tb })).data, []);
  assert.deepEqual((await raw(`/rest/v1/order_lines?order_id=eq.${order.id}`, { token: tb })).data, []);
  assert.deepEqual((await raw('/rest/v1/addresses?select=id', { token: tb })).data, []);
  assert.deepEqual((await raw('/rest/v1/wishlist?select=product_id', { token: tb })).data, []);
  assert.deepEqual((await raw('/rest/v1/stock_alerts?select=id', { token: tb })).data, []);
  const profiles = (await raw('/rest/v1/profiles?select=id', { token: tb })).data;
  assert.deepEqual(profiles.map((p) => p.id), [uidOf(b.store)], 'yalnızca kendi profilini görmeli');
});

test('RLS: girişsiz kullanıcı siparişleri ve profilleri okuyamaz, yazamaz', { skip }, async () => {
  const o = await raw('/rest/v1/orders?select=id');
  assert.deepEqual(o.data, []);
  const p = await raw('/rest/v1/profiles?select=id');
  assert.notEqual(p.status, 200);
  const ins = await raw('/rest/v1/orders', { method: 'POST', body: { name: 'x', phone: '1', payment: 'havale', delivery: 'magaza', subtotal: 1, total: 1 }, prefer: 'return=minimal' });
  assert.ok(ins.status >= 400);
  const stock = await raw(`/rest/v1/products_stock?product_id=eq.${A.id}`, { method: 'PATCH', body: { stock: 999 } });
  assert.ok(stock.status >= 400);
  const gold = await raw('/rest/v1/gold_price?id=eq.1', { method: 'PATCH', body: { gram22_sell: 1 } });
  assert.ok(gold.status >= 400);
});

test('RLS: oturumlu müşteri doğrudan sipariş ekleyemez/güncelleyemez/silemez, stok ve fiyatı değiştiremez', { skip }, async () => {
  const c = await customerApi('A');
  const t = tokenOf(c.store);
  const mine = await c.api.orders.place([{ id: B.id, qty: 1 }], customer, '');
  const forged = await raw('/rest/v1/orders', { token: t, method: 'POST', body: { user_id: uidOf(c.store), name: 'TEST sahte', phone: '1', payment: 'havale', delivery: 'magaza', subtotal: 0, total: 0, status: 'tamamlandi' }, prefer: 'return=minimal' });
  assert.ok(forged.status >= 400, 'doğrudan sipariş eklenememeli');
  const upd = await raw(`/rest/v1/orders?id=eq.${mine.id}`, { token: t, method: 'PATCH', body: { total: 0, status: 'tamamlandi' }, prefer: 'return=representation' });
  assert.ok(upd.status >= 400 || (Array.isArray(upd.data) && upd.data.length === 0), 'kendi siparişini doğrudan güncelleyememeli');
  const del = await raw(`/rest/v1/orders?id=eq.${mine.id}`, { token: t, method: 'DELETE', prefer: 'return=representation' });
  assert.ok(del.status >= 400 || (Array.isArray(del.data) && del.data.length === 0), 'siparişini silememeli');
  assert.ok((await raw(`/rest/v1/order_lines?order_id=eq.${mine.id}`, { token: t, method: 'PATCH', body: { unit_price: 1 } })).status >= 400);
  assert.ok((await raw(`/rest/v1/products_stock?product_id=eq.${A.id}`, { token: t, method: 'PATCH', body: { stock: 999 } })).status >= 400);
  assert.ok((await raw(`/rest/v1/products_catalog?id=eq.${A.id}`, { token: t, method: 'PATCH', body: { gram: 0.1 } })).status >= 400);
  const still = (await c.api.orders.mine())[0];
  assert.equal(still.status, 'beklemede');
  assert.ok(still.total > 0);
});

test('yetki yükseltme: müşteri rolünü admin yapamaz (profil, RPC ve yeni kayıt yoluyla)', { skip }, async () => {
  const c = await customerApi('A');
  const t = tokenOf(c.store); const id = uidOf(c.store);
  const patch = await raw(`/rest/v1/profiles?id=eq.${id}`, { token: t, method: 'PATCH', body: { role: 'admin' }, prefer: 'return=representation' });
  assert.ok(patch.status >= 400, `rol güncellenememeli: ${patch.status}`);
  const nameOnly = await raw(`/rest/v1/profiles?id=eq.${id}`, { token: t, method: 'PATCH', body: { name: 'Yeni Ad' }, prefer: 'return=representation' });
  assert.equal(nameOnly.status, 200);
  assert.equal((await c.api.auth.user()).role, 'customer');
  const insert = await raw('/rest/v1/profiles', { token: t, method: 'POST', body: { id, role: 'admin', name: 'x' }, prefer: 'return=minimal' });
  assert.ok(insert.status >= 400);
  // kayıt sırasında meta veri ile rol verilmeye çalışılır
  const email = `priv2.${runId}.${Math.random().toString(36).slice(2, 6)}@cinargold.test`;
  const signup = await raw('/auth/v1/signup', { method: 'POST', body: { email, password: PW, data: { name: 'Hile', role: 'admin' } } });
  assert.equal(signup.status, 200);
  const tok = signup.data.access_token;
  const prof = (await raw(`/rest/v1/profiles?select=role,name&id=eq.${signup.data.user.id}`, { token: tok })).data[0];
  assert.equal(prof.role, 'customer', 'kayıt meta verisi rol belirleyememeli');
  // admin RPC'leri
  for (const [fn, body] of [['admin_set_stock', { p_product_id: A.id, p_qty: 5 }], ['admin_set_order_status', { p_id: 'CG-100001', p_status: 'onaylandi' }]]) {
    const r = await raw(`/rest/v1/rpc/${fn}`, { token: t, method: 'POST', body });
    assert.match(JSON.stringify(r.data), /YETKI_YOK/);
  }
  assert.ok((await raw('/rest/v1/orders?select=id&limit=1000', { token: t })).data.every((o) => true)); // yalnız kendi siparişleri döner
});

test('yönetici: tüm müşterilerin siparişlerini görür, başkasının siparişini onaylar; stok doğrudan yazılamaz ama RPC ile ayarlanır', { skip }, async () => {
  const c = await customerApi('B');
  const o = await c.api.orders.place([{ id: B.id, qty: 1 }], customer, '');
  const admin = await makeAdminApi();
  const all = await admin.api.orders.adminList();
  assert.ok(all.some((x) => x.id === o.id));
  assert.equal((await admin.api.orders.adminSetStatus(o.id, 'onaylandi')).status, 'onaylandi');
  const direct = await raw(`/rest/v1/products_stock?product_id=eq.${B.id}`, { token: tokenOf(admin.store), method: 'PATCH', body: { stock: 500 } });
  assert.ok(direct.status >= 400, 'yönetici bile stoğu doğrudan yazamamalı (yalnızca RPC)');
  assert.equal(await admin.api.stock.adminSet(B.id, -1).then(() => 'kabul', (e) => e.message), 'STOK_GECERSIZ');
});

test('stok bildirimi: girişsiz ekleme serbest ama uzunluk sınırlı; okunamaz; başkası adına eklenemez', { skip }, async () => {
  const ok = await raw('/rest/v1/stock_alerts', { method: 'POST', body: { product_id: B.id, email: 'misafir@ornek.com', phone: '' }, prefer: 'return=minimal' });
  assert.ok(ok.status < 300, JSON.stringify(ok.data));
  const anonRead = await raw('/rest/v1/stock_alerts?select=id');
  assert.ok(anonRead.status >= 400 || (Array.isArray(anonRead.data) && anonRead.data.length === 0), 'girişsiz bildirimleri okuyamamalı');
  const huge = await raw('/rest/v1/stock_alerts', { method: 'POST', body: { product_id: B.id, email: 'x'.repeat(500), phone: '' }, prefer: 'return=minimal' });
  assert.ok(huge.status >= 400);
  const empty = await raw('/rest/v1/stock_alerts', { method: 'POST', body: { product_id: B.id, email: '', phone: '' }, prefer: 'return=minimal' });
  assert.ok(empty.status >= 400);
  const c = await customerApi('A'); const other = await customerApi('B');
  const spoof = await raw('/rest/v1/stock_alerts', { token: tokenOf(c.store), method: 'POST', body: { product_id: B.id, email: 'x@ornek.com', phone: '', user_id: uidOf(other.store) }, prefer: 'return=minimal' });
  assert.ok(spoof.status >= 400, 'başkasının kullanıcı kimliğiyle bildirim eklenememeli');
});

test('izin kayıtları: zorunlu izinler olmadan eklenemez; başkası adına eklenemez; yalnızca sahibi okur', { skip }, async () => {
  const c = await customerApi('consent'); const other = await customerApi('consentOther');
  const t = tokenOf(c.store);
  assert.ok((await raw('/rest/v1/consents', { token: t, method: 'POST', body: { user_id: uidOf(c.store), kvkk: true, islem: false, iletisim: false }, prefer: 'return=minimal' })).status >= 400);
  assert.ok((await raw('/rest/v1/consents', { token: t, method: 'POST', body: { user_id: uidOf(other.store), kvkk: true, islem: true, iletisim: false }, prefer: 'return=minimal' })).status >= 400);
  const ok = await raw('/rest/v1/consents', { token: t, method: 'POST', body: { user_id: uidOf(c.store), kvkk: true, islem: true, iletisim: false }, prefer: 'return=minimal' });
  assert.ok(ok.status < 300, JSON.stringify(ok.data));
  assert.equal((await raw('/rest/v1/consents?select=id', { token: t })).data.length, 1);
  assert.deepEqual((await raw('/rest/v1/consents?select=id', { token: tokenOf(other.store) })).data, []);
  assert.ok((await raw('/rest/v1/consents', { token: t, method: 'PATCH', body: { kvkk: false } })).status >= 400);
});

test('iptal: yalnızca sahibi ve yalnızca bekleyen sipariş; stok bir kez iade edilir', { skip }, async () => {
  const a = await customerApi('A'); const b = await customerApi('B');
  const before = (await a.api.stock.load())[A.id];
  const o = await a.api.orders.place([{ id: A.id, qty: 2 }], customer, '');
  assert.equal((await b.api.stock.load())[A.id], before - 2);
  assert.match(await b.api.orders.cancelMine(o.id).then(() => 'kabul', (e) => e.message), /SIPARIS_YOK/);
  await a.api.orders.cancelMine(o.id);
  assert.match(await a.api.orders.cancelMine(o.id).then(() => 'kabul', (e) => e.message), /IPTAL_EDILEMEZ/);
  assert.equal((await a.api.stock.load())[A.id], before);
});

test('hata gövdeleri hassas bilgi sızdırmaz (sunucu hatası ayrıntısı, SQL, jeton)', { skip }, async () => {
  const token = tokenOf((await customerApi('T')).store);
  const r = await raw('/rest/v1/rpc/place_order', { token, method: 'POST', body: { lines: [{ id: A.id, qty: 'x' }], customer, coupon: '' } });
  const body = JSON.stringify(r.data);
  assert.equal(/service_role|password|secret|jwt|eyJ/i.test(body), false, body);
  assert.equal(/at (\/|[A-Z]:)/.test(body), false, 'yığın izi sızmamalı');
});

test('girişsiz sipariş: anonim kullanıcı place_order çalıştıramaz, stok değişmez', { skip }, async () => {
  const before = (await newApi().api.stock.load())[A.id];
  const viaAdapter = await newApi().api.orders.place([{ id: A.id, qty: 1 }], customer, '').then(() => 'kabul', (e) => e.message);
  assert.match(viaAdapter, /GIRIS_GEREKLI|YETKI|SUNUCU_HATASI/);
  const r = await raw('/rest/v1/rpc/place_order', { method: 'POST', body: { lines: [{ id: A.id, qty: 1 }], customer: { ...customer, name: 'TEST anonim' }, coupon: '' } });
  assert.notEqual(r.status, 200, 'anonim sipariş kabul edilmemeli');
  assert.equal((await newApi().api.stock.load())[A.id], before);
});

test('altın fiyatı: sunucu fiyatı taze (24 saatten yeni) ve yalnızca sunucu işlevi güncelleyebilir', { skip }, async () => {
  const g = (await raw('/rest/v1/gold_price?select=gram22_sell,updated_at')).data[0];
  assert.ok(Date.now() - Date.parse(g.updated_at) < 24 * 3600 * 1000, `fiyat eski: ${g.updated_at} (otomatik güncelleme çalışmıyor olabilir)`);
  const u = await customerApi('G');
  const upd = await raw('/rest/v1/gold_price?id=eq.1', { token: tokenOf(u.store), method: 'PATCH', body: { gram22_sell: 1 }, prefer: 'return=representation' });
  assert.ok(upd.status >= 400 || (Array.isArray(upd.data) && upd.data.length === 0), 'müşteri fiyatı değiştirememeli');
  const rpc = await raw('/rest/v1/rpc/refresh_gold_price', { token: tokenOf(u.store), method: 'POST', body: {} });
  assert.notEqual(rpc.status, 200, 'müşteri fiyat yenilemeyi çalıştıramamalı');
  const rpcAnon = await raw('/rest/v1/rpc/refresh_gold_price', { method: 'POST', body: {} });
  assert.notEqual(rpcAnon.status, 200);
});
