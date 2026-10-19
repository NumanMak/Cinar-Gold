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

test('ayni urun iki satirda tekrarlanirsa toplam adet stogu asarsa siparis reddedilir ve stok degismez', () => {
  const { deps, store, inventory } = setup();
  const p = products.find((x) => x.stock >= 4);
  store.set('cart', [{ id: p.id, qty: p.stock - 1 }, { id: p.id, qty: p.stock - 1 }, { id: b.id, qty: 1 }]);
  assert.throws(() => placeOrder(deps, buyer), /SIPARIS_GECERSIZ/);
  assert.equal(inventory.stockOf(p.id), p.stock);
  assert.equal(inventory.stockOf(b.id), b.stock);
});

test('adrese teslimde adres zorunlu: bos veya kisa adres ZORUNLU_ALAN, stok degismez', () => {
  const { deps, cart, inventory } = setup();
  cart.add(a.id, 1);
  assert.throws(() => placeOrder(deps, { ...buyer, delivery: 'adres', address: '' }), /ZORUNLU_ALAN/);
  assert.throws(() => placeOrder(deps, { ...buyer, delivery: 'adres', address: 'kisa' }), /ZORUNLU_ALAN/);
  assert.equal(inventory.stockOf(a.id), a.stock);
});

test('adrese teslim siparisi adresi kaydeder, magazadan teslim adres istemez', () => {
  const { deps, cart } = setup();
  cart.add(a.id, 1);
  const o1 = placeOrder(deps, { ...buyer, delivery: 'adres', address: 'Atatürk Cd. No:25 Fethiye Muğla' });
  assert.equal(o1.delivery, 'adres');
  assert.equal(o1.address, 'Atatürk Cd. No:25 Fethiye Muğla');
  cart.add(b.id, 1);
  const o2 = placeOrder(deps, { ...buyer, delivery: 'magaza' });
  assert.equal(o2.delivery, 'magaza');
  assert.equal(o2.address, '');
});

test('gecersiz teslimat yontemi ZORUNLU_ALAN', () => {
  const { deps, cart } = setup();
  cart.add(a.id, 1);
  assert.throws(() => placeOrder(deps, { ...buyer, delivery: 'ucak' }), /ZORUNLU_ALAN/);
});

import { cancelOrder } from '../assets/js/shop/orders.js';

test('cancelOrder beklemedeki siparisi iptal eder ve stogu geri verir', () => {
  const { deps, cart, inventory, store } = setup();
  cart.add(a.id, 2);
  const o = placeOrder(deps, buyer);
  assert.equal(inventory.stockOf(a.id), a.stock - 2);
  const c = cancelOrder({ store, inventory }, o.id, 'u1');
  assert.equal(c.status, 'iptal');
  assert.equal(inventory.stockOf(a.id), a.stock);
  assert.equal(listOrders(store, 'u1')[0].status, 'iptal');
});

test('cancelOrder baska kullanicinin siparisi icin SIPARIS_YOK, iki kez iptal icin IPTAL_EDILEMEZ ve stok tekrar artmaz', () => {
  const { deps, cart, inventory, store } = setup();
  cart.add(a.id, 1);
  const o = placeOrder(deps, buyer);
  assert.throws(() => cancelOrder({ store, inventory }, o.id, 'u2'), /SIPARIS_YOK/);
  assert.throws(() => cancelOrder({ store, inventory }, 'CG-000000', 'u1'), /SIPARIS_YOK/);
  cancelOrder({ store, inventory }, o.id, 'u1');
  assert.throws(() => cancelOrder({ store, inventory }, o.id, 'u1'), /IPTAL_EDILEMEZ/);
  assert.equal(inventory.stockOf(a.id), a.stock);
});

import { listAllOrders, setOrderStatus } from '../assets/js/shop/orders.js';

test('listAllOrders tum kullanicilarin siparislerini en yenisi basta verir', () => {
  const { deps, cart, store } = setup();
  cart.add(a.id, 1);
  const o1 = placeOrder(deps, buyer);
  cart.add(b.id, 1);
  const o2 = placeOrder(deps, { ...buyer, userId: 'u2' });
  assert.deepEqual(listAllOrders(store).map((o) => o.id), [o2.id, o1.id]);
});

test('setOrderStatus beklemede -> onaylandi -> tamamlandi gecer ve zaman damgasi yazar', () => {
  const { deps, cart, store, inventory } = setup();
  cart.add(a.id, 1);
  const o = placeOrder(deps, buyer);
  const c = setOrderStatus({ store, inventory }, o.id, 'onaylandi');
  assert.equal(c.status, 'onaylandi');
  assert.ok(c.confirmedAt);
  const d = setOrderStatus({ store, inventory }, o.id, 'tamamlandi');
  assert.equal(d.status, 'tamamlandi');
  assert.equal(listAllOrders(store)[0].status, 'tamamlandi');
});

test('setOrderStatus iptal stogu geri verir; iptal edilmis siparis tekrar acilamaz', () => {
  const { deps, cart, store, inventory } = setup();
  cart.add(a.id, 2);
  const o = placeOrder(deps, buyer);
  assert.equal(inventory.stockOf(a.id), a.stock - 2);
  setOrderStatus({ store, inventory }, o.id, 'iptal');
  assert.equal(inventory.stockOf(a.id), a.stock);
  assert.throws(() => setOrderStatus({ store, inventory }, o.id, 'onaylandi'), /DURUM_GECERSIZ/);
  assert.throws(() => setOrderStatus({ store, inventory }, o.id, 'iptal'), /DURUM_GECERSIZ/);
  assert.equal(inventory.stockOf(a.id), a.stock);
});

test('setOrderStatus gecersiz durum, geriye gecis ve bilinmeyen siparis icin hata verir', () => {
  const { deps, cart, store, inventory } = setup();
  cart.add(a.id, 1);
  const o = placeOrder(deps, buyer);
  assert.throws(() => setOrderStatus({ store, inventory }, o.id, 'bitti'), /DURUM_GECERSIZ/);
  assert.throws(() => setOrderStatus({ store, inventory }, 'CG-000000', 'onaylandi'), /SIPARIS_YOK/);
  setOrderStatus({ store, inventory }, o.id, 'tamamlandi');
  assert.throws(() => setOrderStatus({ store, inventory }, o.id, 'beklemede'), /DURUM_GECERSIZ/);
});

test('musteri iptali yalnizca beklemedeki siparise izin verir (onaylanmis siparis IPTAL_EDILEMEZ)', () => {
  const { deps, cart, store, inventory } = setup();
  cart.add(a.id, 1);
  const o = placeOrder(deps, buyer);
  setOrderStatus({ store, inventory }, o.id, 'onaylandi');
  assert.throws(() => cancelOrder({ store, inventory }, o.id, 'u1'), /IPTAL_EDILEMEZ/);
});
