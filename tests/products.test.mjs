import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const products = JSON.parse(readFileSync(new URL('../assets/data/products.json', import.meta.url), 'utf8'));
const TYPES = ['yuzuk', 'kolye', 'bilezik', 'pirlanta'];
const byType = (t) => products.filter((p) => p.type === t);

test('urun sayisi 60', () => {
  assert.equal(products.length, 60);
});

test('her turde 15 urun', () => {
  for (const t of TYPES) assert.equal(byType(t).length, 15, t);
});

test('her turde 5 model, her modelde 3 urun', () => {
  for (const t of TYPES) {
    const counts = new Map();
    for (const p of byType(t)) counts.set(p.model, (counts.get(p.model) || 0) + 1);
    assert.equal(counts.size, 5, t);
    for (const n of counts.values()) assert.equal(n, 3, t);
  }
});

test('idler benzersiz', () => {
  assert.equal(new Set(products.map((p) => p.id)).size, products.length);
});

test('her turde tam 2 urun stokta yok', () => {
  for (const t of TYPES) assert.equal(byType(t).filter((p) => p.stock === 0).length, 2, t);
});

test('gorsel dosyalari mevcut', () => {
  for (const p of products) {
    for (const w of [640, 1080]) {
      assert.ok(existsSync(new URL(`../assets/img/${p.img}-${w}.webp`, import.meta.url)), `${p.img}-${w}`);
    }
  }
});

test('fiyat ve stok tam sayi, gram > 0', () => {
  for (const p of products) {
    assert.ok(Number.isInteger(p.price) && p.price > 0, p.id);
    assert.ok(Number.isInteger(p.stock) && p.stock >= 0 && p.stock <= 12, p.id);
    assert.ok(typeof p.gram === 'number' && p.gram > 0, p.id);
    assert.ok([14, 18, 22].includes(p.karat), p.id);
  }
});
