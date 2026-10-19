import test from 'node:test';
import assert from 'node:assert/strict';
import { gramPrice, priceOf, repriceProducts, loadGold } from '../assets/js/shop/pricing.js';

const ring = { id: 'a', gram: 3, karat: 14, laborRate: 0.2, stoneFee: 0, price: 111 };
const diamond = { id: 'b', gram: 2, karat: 18, laborRate: 0.1, stoneFee: 5000, price: 222 };

test('gramPrice 22 ayar fiyatindan ayara gore olceklenir', () => {
  assert.equal(gramPrice(6600, 22), 6600);
  assert.equal(gramPrice(6600, 14), 4200);
  assert.equal(gramPrice(6600, 18), 5400);
});

test('priceOf gram x ayar fiyati x (1 + iscilik) + tas bedeli, 10 TL yuvarlanir', () => {
  assert.equal(priceOf(ring, 6600), 15120); // 3 x 4200 x 1.2
  assert.equal(priceOf(diamond, 6600), 5000 + 11880); // 2 x 5400 x 1.1
  assert.equal(priceOf({ ...ring, gram: 2.4 }, 6325) % 10, 0);
});

test('repriceProducts urun fiyatlarini yerinde gunceller ve sayi doner', () => {
  const list = [{ ...ring }, { ...diamond }];
  const n = repriceProducts(list, { items: { gram22: { sell: 6600 } } });
  assert.equal(n, 2);
  assert.equal(list[0].price, 15120);
  assert.equal(list[1].price, 16880);
});

test('repriceProducts gecersiz veya bos altin verisinde fiyatlara dokunmaz', () => {
  for (const bad of [null, undefined, {}, { items: {} }, { items: { gram22: { sell: 0 } } }, { items: { gram22: { sell: 'x' } } }, { items: { gram22: { sell: -5 } } }]) {
    const list = [{ ...ring }];
    assert.equal(repriceProducts(list, bad), 0);
    assert.equal(list[0].price, 111);
  }
});

test('altin fiyati yukselince fiyat yukselir', () => {
  assert.ok(priceOf(ring, 7000) > priceOf(ring, 6000));
});

test('loadGold taze dosyayi doner, eski (30 saatten fazla) veya bozuk dosyada null doner', async () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  const mk = (iso) => async () => ({ ok: true, json: async () => ({ fetchedAt: iso, items: { gram22: { sell: 6000 } } }) });
  assert.ok(await loadGold(mk('2026-10-19T10:00:00Z'), now));
  assert.equal(await loadGold(mk('2026-10-17T10:00:00Z'), now), null);
  assert.equal(await loadGold(mk('bozuk'), now), null);
  assert.equal(await loadGold(async () => ({ ok: false }), now), null);
  assert.equal(await loadGold(async () => { throw new Error('ag'); }, now), null);
});
