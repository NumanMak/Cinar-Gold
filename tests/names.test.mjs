import test from 'node:test';
import assert from 'node:assert/strict';
import { localized, productName, productDesc, modelLabel, typeLabel, metalLabel } from '../assets/js/shop/names.js';
import { searchProducts } from '../assets/js/shop/catalog.js';
import { products } from './helpers.mjs';

const p = { name: 'Tektaş Yüzük, Sarı altın', nameEn: 'Solitaire Ring, Yellow gold', desc: 'Açıklama', descEn: 'Description', model: 'Tektaş', modelEn: 'Solitaire', typeLabel: 'Yüzük', typeLabelEn: 'Ring', metal: 'Sarı altın', metalEn: 'Yellow gold' };

test('localized: tr modunda Turkce, en modunda Ingilizce alan doner', () => {
  assert.equal(localized(p, 'name', 'tr'), 'Tektaş Yüzük, Sarı altın');
  assert.equal(localized(p, 'name', 'en'), 'Solitaire Ring, Yellow gold');
});

test('localized: Ingilizce alan yoksa Turkce alana duser', () => {
  assert.equal(localized({ name: 'Ad' }, 'name', 'en'), 'Ad');
  assert.equal(localized({}, 'name', 'en'), '');
});

test('yardimci fonksiyonlar dil parametresiyle calisir', () => {
  assert.equal(productName(p, 'en'), 'Solitaire Ring, Yellow gold');
  assert.equal(productDesc(p, 'en'), 'Description');
  assert.equal(modelLabel(p, 'en'), 'Solitaire');
  assert.equal(typeLabel(p, 'en'), 'Ring');
  assert.equal(metalLabel(p, 'en'), 'Yellow gold');
  assert.equal(modelLabel(p, 'tr'), 'Tektaş');
});

test('katalogdaki her urunun Ingilizce alanlari dolu, Turkce harf icermez ve adlar benzersizdir', () => {
  const tr = /[çğıöşüÇĞİÖŞÜ]/;
  for (const x of products) {
    for (const f of ['nameEn', 'descEn', 'modelEn', 'typeLabelEn', 'metalEn']) {
      assert.ok(x[f] && x[f].length > 2, `${x.id}.${f}`);
      assert.ok(!tr.test(x[f]), `${x.id}.${f}: ${x[f]}`);
    }
  }
  assert.equal(new Set(products.map((x) => x.nameEn)).size, products.length);
});

test('arama Ingilizce adla da bulur: "solitaire ring" ve "yellow gold necklace"', () => {
  assert.ok(searchProducts(products, 'solitaire ring').length >= 3);
  assert.ok(searchProducts(products, 'medallion necklace').every((x) => x.type === 'kolye'));
  assert.ok(searchProducts(products, 'diamond earrings').length === 3);
  assert.equal(searchProducts(products, 'zzzz').length, 0);
});
