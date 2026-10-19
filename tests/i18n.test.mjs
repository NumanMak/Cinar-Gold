import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLang, translate, translateTextNodes } from '../assets/js/shop/i18n.js';

const dict = { 'Sepete ekle': 'Add to cart', '{n} ürün': '{n} products', 'Merhaba {ad}': 'Hello {ad}' };

test('detectLang: kayit yoksa tr, gecerli kayit en, gecersiz kayit tr', () => {
  assert.equal(detectLang({ saved: null }), 'tr');
  assert.equal(detectLang({ saved: 'en' }), 'en');
  assert.equal(detectLang({ saved: 'fr' }), 'tr');
  assert.equal(detectLang({ saved: 42 }), 'tr');
});

test('detectLang: ?lang= parametresi kayittan onceliklidir, gecersiz parametre yoksayilir', () => {
  assert.equal(detectLang({ saved: 'tr', search: '?lang=en' }), 'en');
  assert.equal(detectLang({ saved: 'en', search: '?lang=tr&x=1' }), 'tr');
  assert.equal(detectLang({ saved: 'en', search: '?lang=zz' }), 'en');
});

test('translate: tr anahtari aynen dondurur, en sozlukten cevirir', () => {
  assert.equal(translate('tr', dict, 'Sepete ekle'), 'Sepete ekle');
  assert.equal(translate('en', dict, 'Sepete ekle'), 'Add to cart');
});

test('translate: sozlukte olmayan anahtar en modunda da anahtarin kendisidir (sozluk prototipine bakilmaz)', () => {
  assert.equal(translate('en', dict, 'Bilinmeyen metin'), 'Bilinmeyen metin');
  assert.equal(translate('en', dict, 'constructor'), 'constructor');
  assert.equal(translate('en', dict, 'toString'), 'toString');
});

test('translate: {param} yer tutuculari doldurulur, eksik parametre aynen kalir, tr modunda da calisir', () => {
  assert.equal(translate('en', dict, '{n} ürün', { n: 5 }), '5 products');
  assert.equal(translate('tr', dict, '{n} ürün', { n: 5 }), '5 ürün');
  assert.equal(translate('en', dict, 'Merhaba {ad}', {}), 'Hello {ad}');
  assert.equal(translate('en', dict, 'Merhaba {ad}', { ad: '<b>X</b>' }), 'Hello <b>X</b>');
});

test('translateTextNodes: dugum metnini cevirir, bastaki/sondaki bosluklari korur, bilinmeyeni bozmaz', () => {
  const nodes = [{ nodeValue: '\n   Sepete ekle  ' }, { nodeValue: 'Hiçbir şey' }, { nodeValue: '   ' }];
  const n = translateTextNodes(nodes, (s) => translate('en', dict, s));
  assert.equal(nodes[0].nodeValue, '\n   Add to cart  ');
  assert.equal(nodes[1].nodeValue, 'Hiçbir şey');
  assert.equal(nodes[2].nodeValue, '   ');
  assert.equal(n, 1);
});
