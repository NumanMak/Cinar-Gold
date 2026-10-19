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
