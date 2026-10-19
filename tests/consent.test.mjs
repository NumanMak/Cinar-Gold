import test from 'node:test';
import assert from 'node:assert/strict';
import { createConsent } from '../assets/js/shop/consent.js';
import { createStore } from '../assets/js/shop/storage.js';
import { memoryBackend } from './helpers.mjs';

const mk = () => createConsent(createStore(memoryBackend()));

test('baslangicta izin yok', () => {
  const s = mk().status();
  assert.equal(s.granted, false);
  assert.equal(s.at, null);
});

test('yalnizca kvkk ile grant IZIN_ZORUNLU firlatir ve kayit degismez', () => {
  const c = mk();
  assert.throws(() => c.grant({ kvkk: true, islem: false }), /IZIN_ZORUNLU/);
  assert.equal(c.status().granted, false);
});

test('iletisim olmadan zorunlularla grant gecerli', () => {
  const c = mk();
  c.grant({ kvkk: true, islem: true });
  const s = c.status();
  assert.equal(s.granted, true);
  assert.equal(s.choices.iletisim, false);
  assert.match(s.at, /^\d{4}-\d{2}-\d{2}T/);
});

test('revoke izni geri alir', () => {
  const c = mk();
  c.grant({ kvkk: true, islem: true, iletisim: true });
  c.revoke();
  assert.equal(c.status().granted, false);
});
