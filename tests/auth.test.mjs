import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from '../assets/js/shop/auth.js';
import { createStore } from '../assets/js/shop/storage.js';
import { memoryBackend } from './helpers.mjs';

const ayse = { name: 'Ayşe', email: 'Ayse@Ornek.com ', password: 'gizli-sifre-1' };

test('kayit sonrasi current dolu ve e-posta normalize edilir', async () => {
  const auth = createAuth(createStore(memoryBackend()));
  const u = await auth.register(ayse);
  assert.equal(u.email, 'ayse@ornek.com');
  assert.deepEqual(auth.current(), u);
});

test('ayni e-posta farkli harfle EMAIL_KAYITLI', async () => {
  const auth = createAuth(createStore(memoryBackend()));
  await auth.register(ayse);
  await assert.rejects(auth.register({ ...ayse, email: 'AYSE@ornek.com' }), /EMAIL_KAYITLI/);
});

test('7 karakterli sifre SIFRE_KISA', async () => {
  const auth = createAuth(createStore(memoryBackend()));
  await assert.rejects(auth.register({ ...ayse, password: '1234567' }), /SIFRE_KISA/);
});

test('bos ad veya e-posta ZORUNLU_ALAN', async () => {
  const auth = createAuth(createStore(memoryBackend()));
  await assert.rejects(auth.register({ ...ayse, name: ' ' }), /ZORUNLU_ALAN/);
  await assert.rejects(auth.register({ ...ayse, email: '' }), /ZORUNLU_ALAN/);
});

test('yanlis sifre ve bilinmeyen e-posta ayni GIRIS_HATALI', async () => {
  const auth = createAuth(createStore(memoryBackend()));
  await auth.register(ayse);
  auth.logout();
  await assert.rejects(auth.login('ayse@ornek.com', 'yanlis-sifre'), /GIRIS_HATALI/);
  await assert.rejects(auth.login('yok@ornek.com', 'gizli-sifre-1'), /GIRIS_HATALI/);
});

test('dogru sifre ile giris, logout sonrasi current null', async () => {
  const auth = createAuth(createStore(memoryBackend()));
  await auth.register(ayse);
  auth.logout();
  assert.equal(auth.current(), null);
  const u = await auth.login(' AYSE@ornek.com', 'gizli-sifre-1');
  assert.equal(u.name, 'Ayşe');
});

test('store icinde duz sifre bulunmaz', async () => {
  const b = memoryBackend();
  await createAuth(createStore(b)).register(ayse);
  assert.ok(![...b.raw.values()].some((v) => v.includes(ayse.password)));
});

test('yeniden olusturulan auth ayni store ile oturumu hatirlar', async () => {
  const store = createStore(memoryBackend());
  const u = await createAuth(store).register(ayse);
  assert.deepEqual(createAuth(store).current(), u);
});

test('oturumda yalnizca kullanici id saklanir', async () => {
  const store = createStore(memoryBackend());
  const u = await createAuth(store).register(ayse);
  assert.equal(store.get('session', null), u.id);
});

test('yeni kullanicinin telefon ve adresi bos metindir', async () => {
  const u = await createAuth(createStore(memoryBackend())).register(ayse);
  assert.equal(u.phone, '');
  assert.equal(u.address, '');
});

test('updateProfile ad, telefon ve adresi gunceller ve current() yansitir', async () => {
  const store = createStore(memoryBackend());
  const auth = createAuth(store);
  await auth.register(ayse);
  const u = auth.updateProfile({ name: ' Ayşe Y. ', phone: '0555 111 22 33', address: 'Atatürk Cd. No:5 Fethiye' });
  assert.deepEqual([u.name, u.phone, u.address], ['Ayşe Y.', '0555 111 22 33', 'Atatürk Cd. No:5 Fethiye']);
  assert.equal(createAuth(store).current().phone, '0555 111 22 33');
});

test('updateProfile oturum yokken GIRIS_HATALI, bos ad ZORUNLU_ALAN firlatir', async () => {
  const auth = createAuth(createStore(memoryBackend()));
  assert.throws(() => auth.updateProfile({ phone: '1' }), /GIRIS_HATALI/);
  await auth.register(ayse);
  assert.throws(() => auth.updateProfile({ name: '  ' }), /ZORUNLU_ALAN/);
});

test('updateProfile e-posta ve sifre alanlarini degistirmez', async () => {
  const auth = createAuth(createStore(memoryBackend()));
  await auth.register(ayse);
  auth.updateProfile({ email: 'baska@ornek.com', hash: 'x', phone: '1' });
  assert.equal(auth.current().email, 'ayse@ornek.com');
  auth.logout();
  await auth.login('ayse@ornek.com', 'gizli-sifre-1');
});

test('changePassword eski sifre yanlissa GIRIS_HATALI, kisaysa SIFRE_KISA, basarida yeni sifreyle giris', async () => {
  const auth = createAuth(createStore(memoryBackend()));
  await auth.register(ayse);
  await assert.rejects(auth.changePassword('yanlis-sifre', 'yeni-sifre-22'), /GIRIS_HATALI/);
  await assert.rejects(auth.changePassword('gizli-sifre-1', 'kisa'), /SIFRE_KISA/);
  await auth.changePassword('gizli-sifre-1', 'yeni-sifre-22');
  auth.logout();
  await assert.rejects(auth.login('ayse@ornek.com', 'gizli-sifre-1'), /GIRIS_HATALI/);
  await auth.login('ayse@ornek.com', 'yeni-sifre-22');
});

test('addAddress adres ekler, ilk adres varsayilan olur, current().address varsayilan adrestir', async () => {
  const auth = createAuth(createStore(memoryBackend()));
  await auth.register(ayse);
  const a1 = auth.addAddress({ title: 'Ev', text: 'Atatürk Cd. No:5 Fethiye Muğla' });
  assert.ok(a1.id);
  assert.equal(a1.isDefault, true);
  const a2 = auth.addAddress({ title: 'İş', text: 'Çarşı Mah. 12. Sk. No:3 Fethiye' });
  assert.equal(a2.isDefault, false);
  assert.equal(auth.current().addresses.length, 2);
  assert.equal(auth.current().address, 'Atatürk Cd. No:5 Fethiye Muğla');
});

test('addAddress baslik bossa veya adres 10 karakterden kisaysa ZORUNLU_ALAN, oturum yoksa GIRIS_HATALI', async () => {
  const auth = createAuth(createStore(memoryBackend()));
  assert.throws(() => auth.addAddress({ title: 'Ev', text: 'Atatürk Cd. No:5 Fethiye' }), /GIRIS_HATALI/);
  await auth.register(ayse);
  assert.throws(() => auth.addAddress({ title: ' ', text: 'Atatürk Cd. No:5 Fethiye Muğla' }), /ZORUNLU_ALAN/);
  assert.throws(() => auth.addAddress({ title: 'Ev', text: 'kısa' }), /ZORUNLU_ALAN/);
});

test('setDefaultAddress varsayilani degistirir, removeAddress siler ve varsayilan silinirse siradaki varsayilan olur', async () => {
  const auth = createAuth(createStore(memoryBackend()));
  await auth.register(ayse);
  const a1 = auth.addAddress({ title: 'Ev', text: 'Atatürk Cd. No:5 Fethiye Muğla' });
  const a2 = auth.addAddress({ title: 'İş', text: 'Çarşı Mah. 12. Sk. No:3 Fethiye' });
  auth.setDefaultAddress(a2.id);
  assert.equal(auth.current().address, 'Çarşı Mah. 12. Sk. No:3 Fethiye');
  auth.removeAddress(a2.id);
  assert.deepEqual(auth.current().addresses.map((a) => [a.id, a.isDefault]), [[a1.id, true]]);
  auth.removeAddress(a1.id);
  assert.equal(auth.current().address, '');
});

test('updateProfile address bos degilse varsayilan adresi gunceller (yoksa olusturur)', async () => {
  const auth = createAuth(createStore(memoryBackend()));
  await auth.register(ayse);
  auth.updateProfile({ address: 'Atatürk Cd. No:5 Fethiye Muğla' });
  assert.equal(auth.current().addresses.length, 1);
  auth.updateProfile({ address: 'Yeni Mah. 7. Sk. No:1 Fethiye' });
  assert.equal(auth.current().addresses.length, 1);
  assert.equal(auth.current().address, 'Yeni Mah. 7. Sk. No:1 Fethiye');
});
