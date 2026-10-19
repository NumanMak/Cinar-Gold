import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart } from '../assets/js/shop/cart.js';
import { createInventory } from '../assets/js/shop/inventory.js';
import { createStore } from '../assets/js/shop/storage.js';
import { products, memoryBackend } from './helpers.mjs';

function setup() {
  const store = createStore(memoryBackend());
  const inventory = createInventory(store, products);
  return { store, inventory, cart: createCart(store, products, inventory) };
}
const inStock = products.find((p) => p.stock >= 3);
const soldOut = products.find((p) => p.stock === 0);

test('ekleme ve ayni urunu tekrar eklemek adedi arttirir', () => {
  const { cart } = setup();
  cart.add(inStock.id);
  cart.add(inStock.id, 2);
  assert.deepEqual(cart.items(), [{ id: inStock.id, qty: 3 }]);
  assert.equal(cart.count(), 3);
});

test('stoktan fazla ekleme STOK_YETERSIZ firlatir', () => {
  const { cart } = setup();
  assert.throws(() => cart.add(inStock.id, inStock.stock + 1), /STOK_YETERSIZ/);
  assert.equal(cart.count(), 0);
});

test('stogu 0 urune add STOK_YETERSIZ firlatir', () => {
  const { cart } = setup();
  assert.throws(() => cart.add(soldOut.id), /STOK_YETERSIZ/);
});

test('bilinmeyen id URUN_YOK firlatir', () => {
  const { cart } = setup();
  assert.throws(() => cart.add('yok'), /URUN_YOK/);
});

test('setQty 0 satiri siler, remove ve clear calisir', () => {
  const { cart } = setup();
  cart.add(inStock.id, 2);
  cart.setQty(inStock.id, 0);
  assert.equal(cart.count(), 0);
  cart.add(inStock.id);
  cart.remove(inStock.id);
  assert.equal(cart.count(), 0);
  cart.add(inStock.id);
  cart.clear();
  assert.deepEqual(cart.items(), []);
});

test('quote kuponsuz indirim 0 ve couponValid false', () => {
  const { cart } = setup();
  cart.add(inStock.id, 1);
  const q = cart.quote();
  assert.equal(q.subtotal, inStock.price);
  assert.equal(q.discount, 0);
  assert.equal(q.total, inStock.price);
  assert.equal(q.couponValid, false);
  assert.deepEqual(q.problems, []);
});

test('quote cinar10 ile %10 indirim uygular', () => {
  const { cart } = setup();
  cart.add(inStock.id, 1);
  const q = cart.quote('cinar10');
  assert.equal(q.discount, Math.round(inStock.price * 0.1));
  assert.equal(q.total, inStock.price - q.discount);
  assert.equal(q.couponValid, true);
});

test('katalogda olmayan satir problems icinde raporlanir, lines icine girmez', () => {
  const { cart, store } = setup();
  store.set('cart', [{ id: 'eski-urun', qty: 1 }]);
  const q = cart.quote();
  assert.equal(q.lines.length, 0);
  assert.equal(q.problems.length, 1);
  assert.match(q.problems[0], /eski-urun/);
});

test('stogu sonradan azalan satir problems icinde raporlanir', () => {
  const { cart, store, inventory } = setup();
  cart.add(inStock.id, inStock.stock);
  inventory.decrement(inStock.id, 1);
  assert.equal(cart.quote().problems.length, 1);
  assert.ok(store);
});
