import test from 'node:test';
import assert from 'node:assert/strict';
import { createWishlist, mergeGuestWishlist } from '../assets/js/shop/wishlist.js';
import { createStore } from '../assets/js/shop/storage.js';
import { memoryBackend } from './helpers.mjs';

const mk = (owner) => {
  const store = createStore(memoryBackend());
  return { store, wl: createWishlist(store, owner) };
};

test('toggle ekler ve cikarir, has ve count tutarlidir', () => {
  const { wl } = mk('u1');
  assert.equal(wl.toggle('p1'), true);
  assert.equal(wl.has('p1'), true);
  assert.equal(wl.count(), 1);
  assert.equal(wl.toggle('p1'), false);
  assert.equal(wl.has('p1'), false);
  assert.equal(wl.count(), 0);
});

test('list ekleme sirasindadir ve ayni urun iki kez girmez', () => {
  const { wl } = mk('u1');
  wl.toggle('a'); wl.toggle('b'); wl.toggle('c'); wl.toggle('b'); wl.toggle('b');
  assert.deepEqual(wl.list(), ['a', 'c', 'b']);
});

test('kullanicilar birbirinin favorisini gormez, misafir ayri tutulur', () => {
  const store = createStore(memoryBackend());
  createWishlist(store, 'u1').toggle('p1');
  assert.equal(createWishlist(store, 'u2').count(), 0);
  assert.equal(createWishlist(store, null).count(), 0);
  createWishlist(store, null).toggle('g1');
  assert.deepEqual(createWishlist(store, null).list(), ['g1']);
});

test('mergeGuestWishlist misafir favorilerini kullaniciya tekrarsiz tasir ve misafir listesini bosaltir', () => {
  const store = createStore(memoryBackend());
  const guest = createWishlist(store, null);
  guest.toggle('g1'); guest.toggle('shared');
  createWishlist(store, 'u1').toggle('shared');
  mergeGuestWishlist(store, 'u1');
  assert.deepEqual(createWishlist(store, 'u1').list(), ['shared', 'g1']);
  assert.equal(createWishlist(store, null).count(), 0);
});

test('bozuk favori kaydi bos liste olarak okunur', () => {
  const b = memoryBackend();
  b.setItem('cg:wishlist:u1', '{"x":1}');
  assert.deepEqual(createWishlist(createStore(b), 'u1').list(), []);
});
