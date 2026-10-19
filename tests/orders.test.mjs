import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart } from '../assets/js/shop/cart.js';
import { createInventory } from '../assets/js/shop/inventory.js';
import { createStore } from '../assets/js/shop/storage.js';
import { placeOrder, listOrders } from '../assets/js/shop/orders.js';
import { products, memoryBackend } from './helpers.mjs';

function setup() {
  const store = createStore(memoryBackend());
  const inventory = createInventory(store, products);
  const cart = createCart(store, products, inventory);
  return { store, inventory, cart, deps: { store, products, inventory, cart } };
}
const buyer = { userId: 'u1', name: 'Ayşe Yılmaz', phone: '05551112233', payment: 'havale' };
const [a, b] = products.filter((p) => p.stock >= 3);

test('basarili siparis stogu dusurur, sepeti bosaltir ve sipari kaydeder', () => {
  const { deps, cart, inventory } = setup();
  cart.add(a.id, 2);
  const order = placeOrder(deps, buyer);
  assert.match(order.id, /^CG-\d{6}$/);
  assert.equal(order.status, 'beklemede');
  assert.equal(order.total, a.price * 2);
  assert.deepEqual(order.lines, [{ id: a.id, name: a.name, qty: 2, unitPrice: a.price }]);
  assert.equal(inventory.stockOf(a.id), a.stock - 2);
  assert.equal(cart.count(), 0);
});

test('kuponlu siparis indirimli toplami kaydeder', () => {
  const { deps, cart } = setup();
  cart.add(a.id, 1);
  const order = placeOrder(deps, { ...buyer, code: ' cinar10' });
  assert.equal(order.discount, Math.round(a.price * 0.1));
  assert.equal(order.total, a.price - order.discount);
});

test('bir urun sonradan baska sekmede tukenirse SIPARIS_GECERSIZ ve diger urunun stogu degismez', () => {
  const { deps, cart, inventory, store } = setup();
  cart.add(a.id, 1);
  cart.add(b.id, 1);
  createInventory(store, products).decrement(b.id, b.stock);
  assert.throws(() => placeOrder(deps, buyer), /SIPARIS_GECERSIZ/);
  assert.equal(inventory.stockOf(a.id), a.stock);
  assert.equal(cart.count(), 2);
});

test('katalogda olmayan urunlu sepet SIPARIS_GECERSIZ', () => {
  const { deps, store } = setup();
  store.set('cart', [{ id: 'eski-urun', qty: 1 }]);
  assert.throws(() => placeOrder(deps, buyer), /SIPARIS_GECERSIZ/);
});

test('bos sepet SEPET_BOS', () => {
  const { deps } = setup();
  assert.throws(() => placeOrder(deps, buyer), /SEPET_BOS/);
});

test('ad veya telefon bossa ZORUNLU_ALAN ve stok degismez', () => {
  const { deps, cart, inventory } = setup();
  cart.add(a.id, 1);
  assert.throws(() => placeOrder(deps, { ...buyer, name: ' ' }), /ZORUNLU_ALAN/);
  assert.throws(() => placeOrder(deps, { ...buyer, phone: '' }), /ZORUNLU_ALAN/);
  assert.throws(() => placeOrder(deps, { ...buyer, payment: 'bitcoin' }), /ZORUNLU_ALAN/);
  assert.equal(inventory.stockOf(a.id), a.stock);
});

test('son stok alindiktan sonra ikinci siparis ve ikinci ekleme reddedilir', () => {
  const { deps, cart } = setup();
  cart.add(a.id, a.stock);
  placeOrder(deps, buyer);
  assert.throws(() => placeOrder(deps, buyer), /SEPET_BOS/);
  assert.throws(() => cart.add(a.id, 1), /STOK_YETERSIZ/);
});

test('listOrders yalnizca ilgili kullanicinin siparislerini en yenisi basta verir', () => {
  const { deps, cart, store } = setup();
  cart.add(a.id, 1);
  const o1 = placeOrder(deps, buyer);
  cart.add(b.id, 1);
  const o2 = placeOrder(deps, buyer);
  cart.add(a.id, 1);
  placeOrder(deps, { ...buyer, userId: 'u2' });
  assert.deepEqual(listOrders(store, 'u1').map((o) => o.id), [o2.id, o1.id]);
  assert.equal(listOrders(store, 'u2').length, 1);
});
