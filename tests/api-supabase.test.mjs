import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../assets/js/shop/storage.js';
import { createSupabaseApi } from '../assets/js/shop/api/supabase.js';
import { products, memoryBackend } from './helpers.mjs';

const URL_ = 'https://proje.supabase.co';
const ANON = 'sb_publishable_test_anahtar';
const config = { mode: 'supabase', url: URL_, anonKey: ANON };

// Betikli sahte fetch: her çağrıyı kaydeder, yönlendirici (route) yanıtı belirler.
function harness(route) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const out = await route(call, calls);
    if (out instanceof Error) throw out;
    const { status = 200, body } = out;
    const text = body === undefined ? '' : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) };
  };
  const store = createStore(memoryBackend());
  const api = createSupabaseApi(config, { fetchFn, store, products });
  return { api, calls, store };
}

const session = (over = {}) => ({
  access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600,
  user: { id: 'u1', email: 'ayse@ornek.com', user_metadata: { name: 'Ayşe' } }, ...over,
});
const customerRoutes = (call) => {
  if (call.url.includes('/auth/v1/token?grant_type=password')) return { body: session() };
  if (call.url.includes('/rest/v1/profiles')) return { body: [{ name: 'Ayşe', phone: '', role: 'customer' }] };
  if (call.url.includes('/rest/v1/addresses')) return { body: [] };
  if (call.url.includes('/rest/v1/wishlist')) return { body: [] };
  return { status: 404, body: { message: 'beklenmeyen: ' + call.url } };
};
const adminRoutes = (call) => (call.url.includes('/rest/v1/profiles') ? { body: [{ name: 'Y', phone: '', role: 'admin' }] } : customerRoutes(call));

test('supabase: girisSiz istekler anon anahtarla gider; giristen sonra erisim jetonu kullanilir', async () => {
  const { api, calls } = harness(customerRoutes);
  await api.stock.load().catch(() => {});
  assert.equal(calls[0].headers.apikey, ANON);
  assert.equal(calls[0].headers.Authorization, `Bearer ${ANON}`);
  const user = await api.auth.signIn('Ayse@Ornek.com ', 'gizli-sifre-1');
  assert.equal(user.email, 'ayse@ornek.com');
  const login = calls.find((c) => c.url.includes('grant_type=password'));
  assert.equal(login.method, 'POST');
  assert.deepEqual(login.body, { email: 'ayse@ornek.com', password: 'gizli-sifre-1' });
  await api.stock.load().catch(() => {});
  const after = calls.filter((c) => c.url.includes('/rest/v1/products_stock')).at(-1);
  assert.equal(after.headers.Authorization, 'Bearer at-1');
});

test('supabase: kayitta e-posta dogrulamasi gerekiyorsa needsConfirmation doner ve oturum acilmaz', async () => {
  const { api } = harness((call) => {
    if (call.url.endsWith('/auth/v1/signup')) return { body: { id: 'u1', email: 'ayse@ornek.com' } };
    return customerRoutes(call);
  });
  const u = await api.auth.signUp({ name: 'Ayşe', email: 'ayse@ornek.com', password: 'gizli-sifre-1' });
  assert.equal(u.needsConfirmation, true);
  assert.equal(await api.auth.user(), null);
});

test('supabase: kayit istegi ad bilgisini meta veri olarak yollar ve kisa sifreyi sunucuya gitmeden reddeder', async () => {
  const { api, calls } = harness((call) => (call.url.endsWith('/auth/v1/signup') ? { body: session() } : customerRoutes(call)));
  await assert.rejects(api.auth.signUp({ name: 'A', email: 'a@ornek.com', password: 'kisa' }), /SIFRE_KISA/);
  assert.equal(calls.filter((c) => c.url.endsWith('/auth/v1/signup')).length, 0);
  await api.auth.signUp({ name: 'Ayşe', email: 'a@ornek.com', password: 'gizli-sifre-1' });
  const call = calls.find((c) => c.url.endsWith('/auth/v1/signup'));
  assert.deepEqual(call.body, { email: 'a@ornek.com', password: 'gizli-sifre-1', data: { name: 'Ayşe' } });
});

test('supabase: place_order yalniz id ve adet yollar; fiyat, toplam ve baska alanlar sunucuya gitmez', async () => {
  const order = { id: 'CG-100001', user_id: null, name: 'Ayşe', phone: '0555', payment: 'havale', delivery: 'magaza', address: '', coupon: '', subtotal: 100, discount: 0, total: 100, status: 'beklemede', created_at: '2026-10-19T10:00:00Z' };
  const { api, calls } = harness((call) => {
    if (call.url.includes('/rpc/place_order')) return { body: order };
    if (call.url.includes('/products_priced')) return { body: products.map((p) => ({ id: p.id, price: 100 })) };
    return { status: 404, body: { message: 'x' } };
  });
  const placed = await api.orders.place([{ id: products[0].id, qty: 2, price: 1, unitPrice: 1, total: 1 }], { name: 'Ayşe', phone: '0555', payment: 'havale', delivery: 'magaza', address: '', total: 1 }, ' cinar10 ');
  const rpc = calls.find((c) => c.url.includes('/rpc/place_order'));
  assert.deepEqual(rpc.body.lines, [{ id: products[0].id, qty: 2 }]);
  assert.deepEqual(Object.keys(rpc.body.customer).sort(), ['address', 'delivery', 'name', 'payment', 'phone']);
  assert.equal(rpc.body.coupon, ' cinar10 ');
  assert.equal(placed.id, 'CG-100001');
  assert.equal(placed.createdAt, '2026-10-19T10:00:00Z');
  assert.equal(placed.lines[0].unitPrice, 100);
});

test('supabase: sunucu hata kodlari Error(kod) olur; kimlik hatalari ve bilinmeyen hatalar eslenir', async () => {
  const cases = [
    [{ status: 400, body: { code: 'P0001', message: 'STOK_YETERSIZ' } }, 'STOK_YETERSIZ'],
    [{ status: 400, body: { message: 'URUN_YOK' } }, 'URUN_YOK'],
    [{ status: 400, body: { message: 'YETKI_YOK' } }, 'YETKI_YOK'],
    [{ status: 400, body: { code: '22P02', message: 'invalid input syntax for type integer: "1.5"' } }, 'ZORUNLU_ALAN'],
    [{ status: 500, body: { message: 'beklenmeyen sunucu hatasi' } }, 'SUNUCU_HATASI'],
    [{ status: 429, body: { message: 'Too many requests' } }, 'COK_FAZLA_ISTEK'],
    [{ status: 429, body: { error_code: 'over_request_rate_limit', msg: 'rate' } }, 'COK_FAZLA_ISTEK'],
    [new TypeError('fetch failed'), 'SUNUCU_YOK'],
  ];
  for (const [out, want] of cases) {
    const { api } = harness(() => out);
    await assert.rejects(api.orders.place([{ id: products[0].id, qty: 1 }], { name: 'A', phone: '1', payment: 'havale', delivery: 'magaza', address: '' }, ''), new RegExp(`^Error: ${want}$`));
  }
  const auth = [
    [{ status: 400, body: { error_description: 'Invalid login credentials', error: 'invalid_grant' } }, 'GIRIS_HATALI'],
    [{ status: 400, body: { error_description: 'Email not confirmed' } }, 'EMAIL_DOGRULANMADI'],
  ];
  for (const [out, want] of auth) {
    const { api } = harness(() => out);
    await assert.rejects(api.auth.signIn('a@ornek.com', 'gizli-sifre-1'), new RegExp(`^Error: ${want}$`));
  }
  const dup = harness((call) => (call.url.endsWith('/signup') ? { status: 422, body: { msg: 'User already registered', error_code: 'user_already_exists' } } : { status: 404, body: {} }));
  await assert.rejects(dup.api.auth.signUp({ name: 'A', email: 'a@ornek.com', password: 'gizli-sifre-1' }), /^Error: EMAIL_KAYITLI$/);
});

test('supabase: 401 gelince oturum yenilenir ve istek bir kez tekrarlanir; yeni jeton kullanilir', async () => {
  let first = true;
  const { api, calls } = harness((call) => {
    if (call.url.includes('grant_type=password')) return { body: session() };
    if (call.url.includes('grant_type=refresh_token')) return { body: session({ access_token: 'at-2', refresh_token: 'rt-2' }) };
    if (call.url.includes('/products_stock')) {
      if (first) { first = false; return { status: 401, body: { message: 'JWT expired' } }; }
      return { body: [{ product_id: products[0].id, stock: 4 }] };
    }
    return customerRoutes(call);
  });
  await api.auth.signIn('ayse@ornek.com', 'gizli-sifre-1');
  const stock = await api.stock.load();
  assert.equal(stock[products[0].id], 4);
  const refresh = calls.filter((c) => c.url.includes('grant_type=refresh_token'));
  assert.equal(refresh.length, 1);
  assert.deepEqual(refresh[0].body, { refresh_token: 'rt-1' });
  const retried = calls.filter((c) => c.url.includes('/products_stock')).at(-1);
  assert.equal(retried.headers.Authorization, 'Bearer at-2');
});

test('supabase: yenileme basarisizsa oturum temizlenir ve user() null doner', async () => {
  const { api, store } = harness((call) => {
    if (call.url.includes('grant_type=password')) return { body: session() };
    if (call.url.includes('grant_type=refresh_token')) return { status: 400, body: { error_description: 'Invalid Refresh Token' } };
    if (call.url.includes('/rest/v1/')) return { status: 401, body: { message: 'JWT expired' } };
    return { status: 404, body: {} };
  });
  await api.auth.signIn('ayse@ornek.com', 'gizli-sifre-1').catch(() => {});
  assert.equal(await api.auth.user(), null);
  assert.equal(store.get('sb-session', null), null);
});

test('supabase: oturum yenilemeden sonra da ayni kayitli oturum sonraki sayfa acilisinda kullanilir', async () => {
  const route = (call) => (call.url.includes('grant_type=password') ? { body: session() } : customerRoutes(call));
  const a = harness(route);
  await a.api.auth.signIn('ayse@ornek.com', 'gizli-sifre-1');
  const saved = a.store.get('sb-session', null);
  assert.equal(saved.access_token, 'at-1');
  assert.equal(JSON.stringify(saved).includes('gizli-sifre-1'), false, 'sifre saklanmamali');
});

test('supabase: musteri adminList cagirinca YETKI_YOK; siparis uclarina istek gitmez', async () => {
  const { api, calls } = harness(customerRoutes);
  await api.auth.signIn('ayse@ornek.com', 'gizli-sifre-1');
  await assert.rejects(api.orders.adminList(), /^Error: YETKI_YOK$/);
  await assert.rejects(api.orders.adminSetStatus('CG-100001', 'onaylandi'), /^Error: YETKI_YOK$/);
  await assert.rejects(api.stock.adminSet(products[0].id, 3), /^Error: YETKI_YOK$/);
  await assert.rejects(api.alerts.adminList(), /^Error: YETKI_YOK$/);
  assert.equal(calls.filter((c) => /\/rest\/v1\/(orders|rpc\/admin_|stock_alerts)/.test(c.url)).length, 0);
});

test('supabase: yonetici durum degistirir (rpc admin_set_order_status) ve stok ayarlar; negatif stok istege gitmeden reddedilir', async () => {
  const { api, calls } = harness((call) => {
    if (call.url.includes('/rpc/admin_set_order_status')) return { body: { id: 'CG-100001', status: 'onaylandi', name: 'A', phone: '1', payment: 'havale', delivery: 'magaza', address: '', coupon: '', subtotal: 1, discount: 0, total: 1, created_at: 'x' } };
    if (call.url.includes('/rpc/admin_set_stock')) return { status: 204 };
    return adminRoutes(call);
  });
  await api.auth.signIn('y@ornek.com', 'gizli-sifre-1');
  const o = await api.orders.adminSetStatus('CG-100001', 'onaylandi');
  assert.equal(o.status, 'onaylandi');
  assert.deepEqual(calls.find((c) => c.url.includes('admin_set_order_status')).body, { p_id: 'CG-100001', p_status: 'onaylandi' });
  await api.stock.adminSet(products[0].id, 7);
  assert.deepEqual(calls.find((c) => c.url.includes('admin_set_stock')).body, { p_product_id: products[0].id, p_qty: 7 });
  const n = calls.length;
  await assert.rejects(api.stock.adminSet(products[0].id, -1), /^Error: STOK_GECERSIZ$/);
  await assert.rejects(api.stock.adminSet(products[0].id, 1.5), /^Error: STOK_GECERSIZ$/);
  assert.equal(calls.length, n);
});

test('supabase: mine() misafirde istek atmaz, oturumda kullanici filtresiyle siparis ve satirlari okur ve camelCase eslestirir', async () => {
  const row = { id: 'CG-100002', user_id: 'u1', name: 'Ayşe', phone: '0555', payment: 'magaza', delivery: 'adres', address: 'Atatürk Cd. No:5', coupon: 'CINAR10', subtotal: 200, discount: 20, total: 180, status: 'beklemede', created_at: '2026-10-19T10:00:00Z', confirmed_at: null, completed_at: null, cancelled_at: null,
    order_lines: [{ product_id: products[0].id, name: 'Ürün', qty: 2, unit_price: 100 }] };
  const { api, calls } = harness((call) => (call.url.includes('/rest/v1/orders') ? { body: [row] } : customerRoutes(call)));
  assert.deepEqual(await api.orders.mine(), []);
  assert.equal(calls.filter((c) => c.url.includes('/orders')).length, 0);
  await api.auth.signIn('ayse@ornek.com', 'gizli-sifre-1');
  const [o] = await api.orders.mine();
  const get = calls.find((c) => c.url.includes('/rest/v1/orders'));
  assert.match(get.url, /user_id=eq\.u1/);
  assert.match(get.url, /select=\*,order_lines\(\*\)/);
  assert.equal(o.userId, 'u1');
  assert.equal(o.createdAt, '2026-10-19T10:00:00Z');
  assert.deepEqual(o.lines, [{ id: products[0].id, name: 'Ürün', qty: 2, unitPrice: 100 }]);
  assert.equal(o.discount, 20);
});

test('supabase: adres ekleme gecersizse sunucuya gitmez; ilk adres varsayilan olur', async () => {
  const { api, calls } = harness((call) => {
    if (call.method === 'POST' && call.url.includes('/rest/v1/addresses')) return { status: 201, body: [{ id: 'a1', title: 'Ev', text: 'Atatürk Cd. No:5 Fethiye Muğla', is_default: true }] };
    return customerRoutes(call);
  });
  await api.auth.signIn('ayse@ornek.com', 'gizli-sifre-1');
  const n = calls.length;
  await assert.rejects(api.auth.addresses.add({ title: 'Ev', text: 'kisa' }), /^Error: ZORUNLU_ALAN$/);
  await assert.rejects(api.auth.addresses.add({ title: ' ', text: 'Atatürk Cd. No:5 Fethiye Muğla' }), /^Error: ZORUNLU_ALAN$/);
  assert.equal(calls.length, n);
  const a = await api.auth.addresses.add({ title: 'Ev', text: 'Atatürk Cd. No:5 Fethiye Muğla' });
  const post = calls.find((c) => c.method === 'POST' && c.url.includes('/addresses'));
  assert.equal(post.body.user_id, 'u1');
  assert.equal(post.body.is_default, true);
  assert.deepEqual(a, { id: 'a1', title: 'Ev', text: 'Atatürk Cd. No:5 Fethiye Muğla', isDefault: true });
});

test('supabase: stok bildirimi e-postayi kucuk harfe cevirir, oturumdaysa kullanici kimligini ekler, bos istegi reddeder', async () => {
  const { api, calls } = harness((call) => (call.url.includes('/rest/v1/stock_alerts') && call.method === 'POST' ? { status: 201 } : customerRoutes(call)));
  await assert.rejects(api.alerts.add({ productId: products[0].id }), /^Error: ZORUNLU_ALAN$/);
  await api.alerts.add({ productId: products[0].id, email: ' MISAFIR@Ornek.com ' });
  assert.deepEqual(calls.find((c) => c.url.includes('/stock_alerts')).body, { product_id: products[0].id, email: 'misafir@ornek.com', phone: '' });
  await api.auth.signIn('ayse@ornek.com', 'gizli-sifre-1');
  await api.alerts.add({ productId: products[1].id, phone: '0555' });
  const posts = calls.filter((c) => c.method === 'POST' && c.url.includes('/stock_alerts'));
  assert.equal(posts[1].body.user_id, 'u1');
});

test('supabase: favoriler misafirde yerelde, oturumda sunucuda tutulur; giriste misafir favorileri tasinir', async () => {
  const { api, calls } = harness((call) => {
    if (call.url.includes('/rest/v1/wishlist') && call.method === 'POST') return { status: 201 };
    return customerRoutes(call);
  });
  assert.equal(await api.wishlist.toggle(products[0].id), true);
  assert.equal(calls.filter((c) => c.url.includes('/wishlist')).length, 0);
  await api.auth.signIn('ayse@ornek.com', 'gizli-sifre-1');
  const post = calls.find((c) => c.method === 'POST' && c.url.includes('/wishlist'));
  assert.ok(post, 'misafir favorisi hesaba tasinmadi');
  assert.match(post.url, /on_conflict=user_id,product_id/);
  assert.equal(post.headers.Prefer.includes('ignore-duplicates'), true);
  assert.deepEqual(await api.wishlist.list(), []);
});

test('supabase: sunucu fiyatlari products_priced gorunumunden okunur', async () => {
  const { api } = harness((call) => (call.url.includes('/products_priced') ? { body: [{ id: 'a', price: 1230 }, { id: 'b', price: 450 }] } : { status: 404, body: {} }));
  assert.deepEqual(await api.prices(), { a: 1230, b: 450 });
});

test('supabase: sifre ve jetonlar adreslerde veya konsolda gorunmez; sifre yalniz kimlik dogrulama govdesinde gider', async () => {
  const logged = [];
  const origLog = console.log; const origErr = console.error;
  console.log = (...a) => logged.push(a.join(' ')); console.error = (...a) => logged.push(a.join(' '));
  try {
    const { api, calls } = harness(customerRoutes);
    await api.auth.signIn('ayse@ornek.com', 'cok-gizli-sifre-9');
    await api.orders.mine().catch(() => {});
    for (const c of calls) {
      assert.equal(c.url.includes('cok-gizli-sifre-9'), false, `URL'de sifre: ${c.url}`);
      assert.equal(JSON.stringify(c.headers).includes('cok-gizli-sifre-9'), false);
      if (!c.url.includes('/auth/v1/')) assert.equal(JSON.stringify(c.body ?? '').includes('cok-gizli-sifre-9'), false);
    }
    assert.equal(logged.join('\n').includes('cok-gizli-sifre-9'), false);
    assert.equal(logged.join('\n').includes('at-1'), false);
  } finally {
    console.log = origLog; console.error = origErr;
  }
});

test('supabase: sifre degistirme once eski sifreyi dogrular, kisa yeni sifreyi reddeder, sonra PUT /auth/v1/user yapar', async () => {
  let ok = true;
  const { api, calls } = harness((call) => {
    if (call.url.includes('grant_type=password')) return ok ? { body: session() } : { status: 400, body: { error_description: 'Invalid login credentials' } };
    if (call.method === 'PUT' && call.url.endsWith('/auth/v1/user')) return { body: { id: 'u1' } };
    return customerRoutes(call);
  });
  await api.auth.signIn('ayse@ornek.com', 'eski-sifre-1');
  await assert.rejects(api.auth.changePassword('eski-sifre-1', 'kisa'), /^Error: SIFRE_KISA$/);
  ok = false;
  await assert.rejects(api.auth.changePassword('yanlis-sifre', 'yeni-sifre-22'), /^Error: GIRIS_HATALI$/);
  ok = true;
  await api.auth.changePassword('eski-sifre-1', 'yeni-sifre-22');
  const put = calls.find((c) => c.method === 'PUT');
  assert.deepEqual(put.body, { password: 'yeni-sifre-22' });
});

test('supabase: veri disa aktarma export_my_data rpc ile, hesap silme delete_my_account rpc ile yapilir ve oturum temizlenir; misafir istek atmaz', async () => {
  const { api, calls, store } = harness((call) => {
    if (call.url.includes('/rpc/export_my_data')) return { body: { email: 'ayse@ornek.com', profile: { name: 'Ayşe' }, addresses: [], orders: [], wishlist: [], stock_alerts: [], consents: [] } };
    if (call.url.includes('/rpc/delete_my_account')) return { status: 204 };
    return customerRoutes(call);
  });
  await assert.rejects(api.auth.exportData(), /^Error: GIRIS_HATALI$/);
  await assert.rejects(api.auth.deleteAccount(), /^Error: GIRIS_HATALI$/);
  assert.equal(calls.filter((c) => c.url.includes('/rpc/')).length, 0);
  await api.auth.signIn('ayse@ornek.com', 'gizli-sifre-1');
  const d = await api.auth.exportData();
  assert.equal(d.profile.name, 'Ayşe');
  assert.equal(calls.find((c) => c.url.includes('export_my_data')).method, 'POST');
  await api.auth.deleteAccount();
  assert.ok(calls.some((c) => c.url.includes('delete_my_account')));
  assert.equal(store.get('sb-session', null), null);
  assert.equal(await api.auth.user(), null);
});

test('supabase: yonetici hesabini silmeye calisinca sunucu YETKI_YOK doner ve oturum acik kalir', async () => {
  const { api, store } = harness((call) => {
    if (call.url.includes('/rpc/delete_my_account')) return { status: 400, body: { code: 'P0001', message: 'YETKI_YOK' } };
    return adminRoutes(call);
  });
  await api.auth.signIn('y@ornek.com', 'gizli-sifre-1');
  await assert.rejects(api.auth.deleteAccount(), /^Error: YETKI_YOK$/);
  assert.ok(store.get('sb-session', null));
});

test('supabase: izin kaydi yalniz oturumda, yalniz zorunlu izinler varsa ve ayni izin icin bir kez yazilir', async () => {
  const { api, calls } = harness((call) => (call.url.includes('/rest/v1/consents') ? { status: 201 } : customerRoutes(call)));
  await api.consents.record({ kvkk: true, islem: true, iletisim: false, at: 't1' });
  assert.equal(calls.filter((c) => c.url.includes('/consents')).length, 0, 'misafir icin sunucuya yazilmamali');
  await api.auth.signIn('ayse@ornek.com', 'gizli-sifre-1');
  await api.consents.record({ kvkk: true, islem: false, at: 't1' });
  assert.equal(calls.filter((c) => c.url.includes('/consents')).length, 0, 'zorunlu izinler eksikse yazilmamali');
  await api.consents.record({ kvkk: true, islem: true, iletisim: true, at: 't1' });
  await api.consents.record({ kvkk: true, islem: true, iletisim: true, at: 't1' });
  const posts = calls.filter((c) => c.url.includes('/consents'));
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body, { user_id: 'u1', kvkk: true, islem: true, iletisim: true });
  await api.consents.record({ kvkk: true, islem: true, iletisim: true, at: 't2' });
  assert.equal(calls.filter((c) => c.url.includes('/consents')).length, 2);
});

test('supabase: adaptor modu supabase ve yonetici olusturma kapali (yonetici yalniz panelden atanir)', async () => {
  const { api } = harness(customerRoutes);
  assert.equal(api.mode, 'supabase');
  assert.equal(api.auth.canCreateAdmin, false);
  await assert.rejects(api.auth.createAdmin({ name: 'Z', email: 'z@ornek.com', password: 'gizli-sifre-1' }), /^Error: YETKI_YOK$/);
  assert.equal(await api.auth.hasAdmin(), true);
});
