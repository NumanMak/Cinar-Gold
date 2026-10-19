import test from 'node:test';
import assert from 'node:assert/strict';
import { modelsOf, filterProducts, loadProducts } from '../assets/js/shop/catalog.js';
import { createStore } from '../assets/js/shop/storage.js';
import { createInventory } from '../assets/js/shop/inventory.js';
import { products, memoryBackend } from './helpers.mjs';

const inv = () => createInventory(createStore(memoryBackend()), products);

test('modelsOf yuzuk icin 5 model verir', () => {
  assert.deepEqual(modelsOf(products, 'yuzuk'), ['Tektaş', 'Telkari', 'Alyans', 'Baget', 'Zarif']);
});

test('filterProducts tur ve model ile 3 urun verir', () => {
  assert.equal(filterProducts(products, { type: 'kolye', model: 'Nazar' }, inv()).length, 3);
});

test('filterProducts filtre vermezse hepsini verir', () => {
  assert.equal(filterProducts(products, {}, inv()).length, 60);
});

test('inStockOnly stogu 0 olanlari eler', () => {
  const r = filterProducts(products, { type: 'bilezik', inStockOnly: true }, inv());
  assert.equal(r.length, 13);
  assert.ok(r.every((p) => p.stock > 0));
});

test('loadProducts verilen fetch ile urunleri doner', async () => {
  const fake = async (url) => ({ ok: true, json: async () => [{ id: 'a', url }] });
  const r = await loadProducts(fake);
  assert.equal(r[0].id, 'a');
  assert.match(r[0].url, /assets\/data\/products\.json$/);
});

test('loadProducts ok olmayan yanitta hata firlatir', async () => {
  await assert.rejects(loadProducts(async () => ({ ok: false, status: 404 })));
});
