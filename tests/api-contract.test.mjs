import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../assets/js/shop/storage.js';
import { createLocalApi } from '../assets/js/shop/api/local.js';
import { products, memoryBackend } from './helpers.mjs';

// Sözleşme: her adaptörün (local, supabase) uyması gereken davranışlar. `makeApi()` her test için temiz bir arka uç döndürür.
// Supabase adaptörü aynı paketle sahte fetch üzerinden çalıştırılır (tests/api-supabase.test.mjs).
export function contract(label, makeApi) {
  const sold = products.filter((p) => p.stock >= 3);
  const [a, b] = sold;
  const customer = { name: 'Ayşe Yılmaz', phone: '05551112233', payment: 'havale', delivery: 'magaza', address: '' };
  const pw = 'gizli-sifre-1';
  // Her testte arka uç bağlamı yenilenir: { api, makeAdmin(api) -> { email, password }, mail(ad) -> benzersiz e-posta, exactStock }.
  let mail = (n) => `${n}@ornek.com`;
  const T = (name, fn) => test(`${label}: ${name}`, async () => {
    const ctx = await makeApi();
    mail = ctx.mail ?? mail;
    await fn(ctx);
  });
  const code = async (p) => { try { await p; } catch (e) { return e.message; } return 'HATA YOK'; };
  const stockOf = async (api, id) => (await api.stock.load())[id];

  T('kayit, cikis, giris dongusu; yanlis sifre GIRIS_HATALI; user() oturumu yansitir', async ({ api }) => {
    assert.equal(await api.auth.user(), null);
    const u = await api.auth.signUp({ name: 'Ayşe', email: mail('ayse'), password: pw });
    assert.equal(u.role, 'customer');
    assert.equal((await api.auth.user()).email, mail('ayse'));
    await api.auth.signOut();
    assert.equal(await api.auth.user(), null);
    assert.equal(await code(api.auth.signIn(mail('ayse'), 'yanlis-sifre')), 'GIRIS_HATALI');
    const again = await api.auth.signIn(mail('ayse').toUpperCase(), pw);
    assert.equal(again.email, mail('ayse'));
  });

  T('ayni e-posta EMAIL_KAYITLI, kisa sifre SIFRE_KISA', async ({ api }) => {
    await api.auth.signUp({ name: 'Ayşe', email: mail('ayse'), password: pw });
    await api.auth.signOut();
    assert.equal(await code(api.auth.signUp({ name: 'X', email: mail('ayse'), password: pw })), 'EMAIL_KAYITLI');
    assert.equal(await code(api.auth.signUp({ name: 'X', email: mail('baska'), password: 'kisa' })), 'SIFRE_KISA');
  });

  T('siparis stogu dusurur; toplam katalog fiyatindan hesaplanir; istemci fiyati yok sayilir', async ({ api }) => {
    const before = await stockOf(api, a.id);
    const order = await api.orders.place([{ id: a.id, qty: 2, price: 1, unitPrice: 1 }], { ...customer, total: 1 }, '');
    assert.equal(order.total, a.price * 2);
    assert.equal(order.status, 'beklemede');
    assert.equal(await stockOf(api, a.id), before - 2);
    assert.equal(order.lines[0].qty, 2);
  });

  T('CINAR10 kuponu %10 indirim verir, gecersiz kupon vermez', async ({ api }) => {
    const o1 = await api.orders.place([{ id: a.id, qty: 1 }], customer, ' cinar10 ');
    assert.equal(o1.discount, Math.round(a.price * 0.1));
    assert.equal(o1.total, a.price - o1.discount);
    const o2 = await api.orders.place([{ id: b.id, qty: 1 }], customer, 'YANLIS');
    assert.equal(o2.discount, 0);
  });

  T('gecersiz siparisler reddedilir ve stok degismez', async ({ api }) => {
    const before = await stockOf(api, a.id);
    assert.equal(await code(api.orders.place([], customer, '')), 'SEPET_BOS');
    assert.equal(await code(api.orders.place([{ id: a.id, qty: 1 }], { ...customer, name: ' ' }, '')), 'ZORUNLU_ALAN');
    assert.equal(await code(api.orders.place([{ id: a.id, qty: 1 }], { ...customer, payment: 'bitcoin' }, '')), 'ZORUNLU_ALAN');
    assert.equal(await code(api.orders.place([{ id: a.id, qty: 1 }], { ...customer, delivery: 'adres', address: 'kisa' }, '')), 'ZORUNLU_ALAN');
    assert.equal(await code(api.orders.place([{ id: 'yok-urun', qty: 1 }], customer, '')), 'URUN_YOK');
    assert.equal(await code(api.orders.place([{ id: a.id, qty: before + 1 }], customer, '')), 'STOK_YETERSIZ');
    assert.equal(await code(api.orders.place([{ id: a.id, qty: 0 }], customer, '')) !== 'HATA YOK', true);
    assert.equal(await code(api.orders.place([{ id: a.id, qty: 1.5 }], customer, '')) !== 'HATA YOK', true);
    assert.equal(await stockOf(api, a.id), before);
  });

  T('misafir siparis verebilir; mine() misafirde bos', async ({ api }) => {
    const o = await api.orders.place([{ id: a.id, qty: 1 }], customer, '');
    assert.ok(o.id);
    assert.deepEqual(await api.orders.mine(), []);
  });

  T('musteri yalniz kendi siparislerini gorur', async ({ api }) => {
    await api.auth.signUp({ name: 'A', email: mail('a'), password: pw });
    const o1 = await api.orders.place([{ id: a.id, qty: 1 }], customer, '');
    await api.auth.signOut();
    await api.auth.signUp({ name: 'B', email: mail('b'), password: pw });
    assert.deepEqual(await api.orders.mine(), []);
    const o2 = await api.orders.place([{ id: b.id, qty: 1 }], customer, '');
    assert.deepEqual((await api.orders.mine()).map((o) => o.id), [o2.id]);
    await api.auth.signOut();
    await api.auth.signIn(mail('a'), pw);
    assert.deepEqual((await api.orders.mine()).map((o) => o.id), [o1.id]);
  });

  T('musteri bekleyen siparisini iptal eder ve stok geri gelir; baskasinin siparisini iptal edemez', async ({ api }) => {
    await api.auth.signUp({ name: 'A', email: mail('a'), password: pw });
    const before = await stockOf(api, a.id);
    const o = await api.orders.place([{ id: a.id, qty: 2 }], customer, '');
    assert.equal(await stockOf(api, a.id), before - 2);
    const c = await api.orders.cancelMine(o.id);
    assert.equal(c.status, 'iptal');
    assert.equal(await stockOf(api, a.id), before);
    assert.equal(await code(api.orders.cancelMine(o.id)), 'IPTAL_EDILEMEZ');
    await api.auth.signOut();
    await api.auth.signUp({ name: 'B', email: mail('b'), password: pw });
    assert.equal(await code(api.orders.cancelMine(o.id)), 'SIPARIS_YOK');
  });

  T('yonetici islemleri musteriye YETKI_YOK; yonetici tum siparisleri gorur ve durum gunceller', async ({ api, makeAdmin }) => {
    await api.auth.signUp({ name: 'A', email: mail('a'), password: pw });
    const o = await api.orders.place([{ id: a.id, qty: 1 }], customer, '');
    assert.equal(await code(api.orders.adminList()), 'YETKI_YOK');
    assert.equal(await code(api.orders.adminSetStatus(o.id, 'onaylandi')), 'YETKI_YOK');
    assert.equal(await code(api.stock.adminSet(a.id, 5)), 'YETKI_YOK');
    await api.auth.signOut();
    await makeAdmin(api);
    const all = await api.orders.adminList();
    assert.ok(all.some((x) => x.id === o.id));
    assert.equal((await api.orders.adminSetStatus(o.id, 'onaylandi')).status, 'onaylandi');
    assert.equal((await api.orders.adminSetStatus(o.id, 'tamamlandi')).status, 'tamamlandi');
    assert.equal(await code(api.orders.adminSetStatus(o.id, 'beklemede')), 'DURUM_GECERSIZ');
    assert.equal(await code(api.orders.adminSetStatus('CG-000000', 'onaylandi')), 'SIPARIS_YOK');
  });

  T('onaylanmis siparis musteri tarafindan iptal edilemez; yonetici iptali stogu geri verir', async ({ api, makeAdmin }) => {
    await api.auth.signUp({ name: 'A', email: mail('a'), password: pw });
    const before = await stockOf(api, a.id);
    const o = await api.orders.place([{ id: a.id, qty: 2 }], customer, '');
    await api.auth.signOut();
    const admin = await makeAdmin(api);
    await api.orders.adminSetStatus(o.id, 'onaylandi');
    await api.auth.signOut();
    await api.auth.signIn(mail('a'), pw);
    assert.equal(await code(api.orders.cancelMine(o.id)), 'IPTAL_EDILEMEZ');
    await api.auth.signOut();
    await api.auth.signIn(admin.email, admin.password);
    await api.orders.adminSetStatus(o.id, 'iptal');
    assert.equal(await stockOf(api, a.id), before);
    assert.equal(await code(api.orders.adminSetStatus(o.id, 'iptal')), 'DURUM_GECERSIZ');
  });

  T('yonetici stogu ayarlar; negatif ve kesirli stok reddedilir; bilinmeyen urun URUN_YOK', async ({ api, makeAdmin }) => {
    await makeAdmin(api);
    await api.stock.adminSet(a.id, 0);
    assert.equal(await stockOf(api, a.id), 0);
    await api.stock.adminSet(a.id, 9);
    assert.equal(await stockOf(api, a.id), 9);
    assert.equal(await code(api.stock.adminSet(a.id, -1)), 'STOK_GECERSIZ');
    assert.equal(await code(api.stock.adminSet(a.id, 1.5)), 'STOK_GECERSIZ');
    assert.equal(await code(api.stock.adminSet('yok-urun', 1)), 'URUN_YOK');
  });

  T('stok tum urunler icin yuklenir', async (c0) => {
    const { api } = c0;
    const s = await api.stock.load();
    assert.equal(Object.keys(s).length, products.length);
    if (c0.exactStock !== false) assert.equal(s[a.id], a.stock);
  });

  T('favoriler: misafirde ve oturumda ekle/cikar; giriste misafir favorileri hesaba tasinir', async ({ api }) => {
    assert.equal(await api.wishlist.toggle(a.id), true);
    assert.deepEqual(await api.wishlist.list(), [a.id]);
    assert.equal(await api.wishlist.toggle(a.id), false);
    assert.deepEqual(await api.wishlist.list(), []);
    await api.wishlist.toggle(b.id);
    await api.auth.signUp({ name: 'A', email: mail('a'), password: pw });
    assert.deepEqual(await api.wishlist.list(), [b.id]);
    await api.auth.signOut();
    assert.deepEqual(await api.wishlist.list(), []);
    await api.auth.signIn(mail('a'), pw);
    assert.deepEqual(await api.wishlist.list(), [b.id]);
  });

  T('adres defteri: ekle, ilki varsayilan, varsayilan degistir, sil; kisa adres ZORUNLU_ALAN', async ({ api }) => {
    await api.auth.signUp({ name: 'A', email: mail('a'), password: pw });
    assert.equal(await code(api.auth.addresses.add({ title: 'Ev', text: 'kisa' })), 'ZORUNLU_ALAN');
    const a1 = await api.auth.addresses.add({ title: 'Ev', text: 'Atatürk Cd. No:5 Fethiye Muğla' });
    const a2 = await api.auth.addresses.add({ title: 'İş', text: 'Çarşı Mah. 12. Sk. No:3 Fethiye' });
    let list = await api.auth.addresses.list();
    assert.equal(list.length, 2);
    assert.equal(list.find((x) => x.id === a1.id).isDefault, true);
    await api.auth.addresses.setDefault(a2.id);
    list = await api.auth.addresses.list();
    assert.equal(list.find((x) => x.id === a2.id).isDefault, true);
    assert.equal(list.filter((x) => x.isDefault).length, 1);
    await api.auth.addresses.remove(a2.id);
    list = await api.auth.addresses.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].isDefault, true);
  });

  T('profil guncelleme ve sifre degistirme', async ({ api }) => {
    await api.auth.signUp({ name: 'Ayşe', email: mail('a'), password: pw });
    const u = await api.auth.updateProfile({ name: 'Ayşe Y.', phone: '0555 111 22 33' });
    assert.equal(u.name, 'Ayşe Y.');
    assert.equal(u.phone, '0555 111 22 33');
    assert.equal(await code(api.auth.updateProfile({ name: '  ' })), 'ZORUNLU_ALAN');
    assert.equal(await code(api.auth.changePassword('yanlis-sifre', 'yeni-sifre-22')), 'GIRIS_HATALI');
    assert.equal(await code(api.auth.changePassword(pw, 'kisa')), 'SIFRE_KISA');
    await api.auth.changePassword(pw, 'yeni-sifre-22');
    await api.auth.signOut();
    assert.equal(await code(api.auth.signIn(mail('a'), pw)), 'GIRIS_HATALI');
    await api.auth.signIn(mail('a'), 'yeni-sifre-22');
  });

  T('profil guncellemesi rol veya e-postayi degistiremez', async ({ api }) => {
    await api.auth.signUp({ name: 'Ayşe', email: mail('a'), password: pw });
    await api.auth.updateProfile({ name: 'Ayşe', role: 'admin', email: mail('x') });
    const u = await api.auth.user();
    assert.equal(u.role, 'customer');
    assert.equal(u.email, mail('a'));
  });

  T('stok bildirimi: misafir ekler, bos istek reddedilir, yonetici listeler, musteri kendi isteklerini gorur ve siler', async ({ api, makeAdmin }) => {
    assert.equal(await code(api.alerts.add({ productId: a.id })), 'ZORUNLU_ALAN');
    await api.alerts.add({ productId: a.id, email: mail('misafir') });
    await api.auth.signUp({ name: 'A', email: mail('a'), password: pw });
    await api.alerts.add({ productId: b.id, email: mail('a') });
    const mine = await api.alerts.mine();
    assert.equal(mine.length, 1);
    assert.equal(mine[0].productId, b.id);
    assert.equal(await code(api.alerts.adminList()), 'YETKI_YOK');
    await api.alerts.remove(mine[0].id);
    assert.equal((await api.alerts.mine()).length, 0);
    await api.auth.signOut();
    await makeAdmin(api);
    assert.ok((await api.alerts.adminList()).some((x) => x.email === mail('misafir')));
  });
}

// ---- local adaptörü

const localFactory = async () => {
  const store = createStore(memoryBackend());
  const api = createLocalApi({ store, products });
  const makeAdmin = async (apiRef) => {
    const creds = { email: 'yonetici@cinargold.test', password: 'Yonetici-Sifre-2026' };
    await apiRef.auth.createAdmin({ name: 'Admin Yonetici', ...creds });
    return creds;
  };
  return { api, store, makeAdmin, mail: (n) => `${n}@ornek.com`, exactStock: true };
};

contract('local', localFactory);

test('local: ikinci yonetici olusturulamaz (ADMIN_VAR) ve yonetici zaten varsa canCreateAdmin false', async () => {
  const { api, makeAdmin } = await localFactory();
  assert.equal(api.auth.canCreateAdmin, true);
  assert.equal(await api.auth.hasAdmin(), false);
  await makeAdmin(api);
  assert.equal(await api.auth.hasAdmin(), true);
  await api.auth.signOut();
  await assert.rejects(api.auth.createAdmin({ name: 'Z', email: 'z@ornek.com', password: 'Yonetici-Sifre-2027' }), /ADMIN_VAR/);
});

test('local: mode alani local', () => {
  assert.equal(createLocalApi({ store: createStore(memoryBackend()), products }).mode, 'local');
});
