import test from 'node:test';
import assert from 'node:assert/strict';
import { modelsOf, filterProducts, loadProducts } from '../assets/js/shop/catalog.js';
import { createStore } from '../assets/js/shop/storage.js';
import { createInventory } from '../assets/js/shop/inventory.js';
import { products, memoryBackend } from './helpers.mjs';

const inv = () => createInventory(createStore(memoryBackend()), products);

test('modelsOf yuzuk icin 5 model verir', () => {
  assert.deepEqual(modelsOf(products, 'yuzuk'), ['Tektaş', 'Telkari', 'Alyans', 'Taşlı', 'Zarif']);
});

test('filterProducts tur ve model ile 3 urun verir', () => {
  assert.equal(filterProducts(products, { type: 'kolye', model: 'Madalyon' }, inv()).length, 3);
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

import { searchProducts, sortProducts } from '../assets/js/shop/catalog.js';

test('searchProducts Turkce karakterlere duyarsiz, ad ve model uzerinden arar', () => {
  assert.ok(searchProducts(products, 'yuzuk').length >= 15);
  assert.ok(searchProducts(products, 'TEKTAS').every((p) => /tekta/i.test(p.model + p.name)));
  assert.ok(searchProducts(products, 'pirlanta').some((p) => p.type === 'pirlanta'));
  assert.equal(searchProducts(products, 'xyzxyz').length, 0);
});

test('searchProducts bos metinde hepsini doner, birden fazla kelimeyi ve ile eslestirir', () => {
  assert.equal(searchProducts(products, '  ').length, 60);
  const r = searchProducts(products, 'kolye madalyon');
  assert.ok(r.length === 3 && r.every((p) => p.type === 'kolye' && p.model === 'Madalyon'));
});

test('sortProducts fiyat artan/azalan ve ada gore siralar, girdiyi degistirmez', () => {
  const copy = [...products];
  const asc = sortProducts(products, 'fiyat-artan');
  assert.deepEqual(products, copy);
  for (let i = 1; i < asc.length; i++) assert.ok(asc[i - 1].price <= asc[i].price);
  const desc = sortProducts(products, 'fiyat-azalan');
  for (let i = 1; i < desc.length; i++) assert.ok(desc[i - 1].price >= desc[i].price);
  const names = sortProducts(products, 'ad').map((p) => p.name);
  assert.deepEqual(names, [...names].sort((x, y) => x.localeCompare(y, 'tr')));
  assert.deepEqual(sortProducts(products, 'onerilen'), products);
});
