import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventory } from '../assets/js/shop/inventory.js';
import { createStore } from '../assets/js/shop/storage.js';
import { products, memoryBackend } from './helpers.mjs';

const inStock = products.find((p) => p.stock >= 3);
const soldOut = products.find((p) => p.stock === 0);

test('stockOf baslangic stogunu verir', () => {
  const inv = createInventory(createStore(memoryBackend()), products);
  assert.equal(inv.stockOf(inStock.id), inStock.stock);
  assert.equal(inv.isSoldOut(soldOut.id), true);
});

test('decrement stogu azaltir', () => {
  const inv = createInventory(createStore(memoryBackend()), products);
  inv.decrement(inStock.id, 2);
  assert.equal(inv.stockOf(inStock.id), inStock.stock - 2);
});

test('stoktan fazla dusum STOK_YETERSIZ firlatir ve stok degismez', () => {
  const inv = createInventory(createStore(memoryBackend()), products);
  assert.throws(() => inv.decrement(inStock.id, inStock.stock + 1), /STOK_YETERSIZ/);
  assert.equal(inv.stockOf(inStock.id), inStock.stock);
});

test('ayni store ile yeniden olusturulan envanter dusumu hatirlar', () => {
  const store = createStore(memoryBackend());
  createInventory(store, products).decrement(inStock.id, 1);
  assert.equal(createInventory(store, products).stockOf(inStock.id), inStock.stock - 1);
});

test('bilinmeyen id icin stockOf 0 doner', () => {
  const inv = createInventory(createStore(memoryBackend()), products);
  assert.equal(inv.stockOf('yok'), 0);
  assert.equal(inv.isSoldOut('yok'), true);
});

test('bozuk stok kaydi (negatif, metin) baslangic stoguna doner', () => {
  const store = createStore(memoryBackend());
  store.set('stock', { [inStock.id]: -1 });
  assert.equal(createInventory(store, products).stockOf(inStock.id), inStock.stock);
  store.set('stock', { [inStock.id]: '3' });
  assert.equal(createInventory(store, products).stockOf(inStock.id), inStock.stock);
});

test('restore stogu artirir ve bilinmeyen id veya gecersiz adette hata firlatir', () => {
  const inv = createInventory(createStore(memoryBackend()), products);
  inv.decrement(inStock.id, 2);
  inv.restore(inStock.id, 2);
  assert.equal(inv.stockOf(inStock.id), inStock.stock);
  assert.throws(() => inv.restore('yok', 1), /URUN_YOK/);
  assert.throws(() => inv.restore(inStock.id, 0), /STOK_GECERSIZ/);
  assert.throws(() => inv.restore(inStock.id, 1.5), /STOK_GECERSIZ/);
});

test('setStock stogu dogrudan ayarlar; negatif, kesirli ve bilinmeyen urun icin hata verir', () => {
  const inv = createInventory(createStore(memoryBackend()), products);
  inv.setStock(inStock.id, 0);
  assert.equal(inv.isSoldOut(inStock.id), true);
  inv.setStock(inStock.id, 25);
  assert.equal(inv.stockOf(inStock.id), 25);
  assert.throws(() => inv.setStock(inStock.id, -1), /STOK_GECERSIZ/);
  assert.throws(() => inv.setStock(inStock.id, 1.5), /STOK_GECERSIZ/);
  assert.throws(() => inv.setStock('yok', 1), /URUN_YOK/);
});
