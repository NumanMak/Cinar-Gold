import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotify } from '../assets/js/shop/notify.js';
import { createStore } from '../assets/js/shop/storage.js';
import { memoryBackend } from './helpers.mjs';

const mk = () => createNotify(createStore(memoryBackend()));

test('e-posta ile kayit eklenir', () => {
  const n = mk();
  const r = n.add({ productId: 'p1', email: 'a@b.com' });
  assert.equal(r.productId, 'p1');
  assert.equal(n.list('p1').length, 1);
});

test('ayni urun ve e-posta ikinci kez eklenmez, var olan kayit doner', () => {
  const n = mk();
  const r1 = n.add({ productId: 'p1', email: 'a@b.com' });
  const r2 = n.add({ productId: 'p1', email: ' A@B.com' });
  assert.deepEqual(r2, r1);
  assert.equal(n.list().length, 1);
});

test('e-posta ve telefon bossa ZORUNLU_ALAN', () => {
  assert.throws(() => mk().add({ productId: 'p1' }), /ZORUNLU_ALAN/);
  assert.throws(() => mk().add({ productId: 'p1', email: ' ', phone: '' }), /ZORUNLU_ALAN/);
});

test('list productId ile filtreler', () => {
  const n = mk();
  n.add({ productId: 'p1', phone: '0555' });
  n.add({ productId: 'p2', phone: '0555' });
  assert.equal(n.list('p2').length, 1);
  assert.equal(n.list().length, 2);
});
