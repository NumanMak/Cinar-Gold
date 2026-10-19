import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../assets/js/shop/storage.js';
import { memoryBackend } from './helpers.mjs';

test('get kayit yokken varsayilani doner', () => {
  assert.equal(createStore(memoryBackend()).get('x', 7), 7);
});

test('set sonrasi get degeri doner ve anahtar cg: onekini alir', () => {
  const b = memoryBackend();
  const s = createStore(b);
  s.set('a', { n: 1 });
  assert.deepEqual(s.get('a', null), { n: 1 });
  assert.ok(b.raw.has('cg:a'));
});

test('bozuk JSON varsayilana doner', () => {
  const b = memoryBackend();
  b.setItem('cg:a', '{bozuk');
  assert.deepEqual(createStore(b).get('a', []), []);
});

test('backend yazarken hata firlatsa bile bellekte calisir', () => {
  const b = memoryBackend();
  b.setItem = () => { throw new Error('kota'); };
  const s = createStore(b);
  s.set('cart', [1]);
  assert.deepEqual(s.get('cart', []), [1]);
});

test('backend okurken hata firlatsa bile varsayilan doner', () => {
  const b = memoryBackend();
  b.getItem = () => { throw new Error('engelli'); };
  assert.equal(createStore(b).get('x', 'v'), 'v');
});

test('remove kaydi siler', () => {
  const s = createStore(memoryBackend());
  s.set('a', 1);
  s.remove('a');
  assert.equal(s.get('a', 0), 0);
});

test('gecerli ama yanlis tipte JSON varsayilana doner (null, nesne, metin, sayi)', () => {
  const b = memoryBackend();
  const s = createStore(b);
  for (const raw of ['null', '{}', '"x"', '5']) {
    b.setItem('cg:cart', raw);
    assert.deepEqual(s.get('cart', []), [], raw);
  }
  b.setItem('cg:stock', 'null');
  assert.deepEqual(s.get('stock', {}), {});
  b.setItem('cg:stock', '[]');
  assert.deepEqual(s.get('stock', {}), {});
  b.setItem('cg:orderSeq', '"abc"');
  assert.equal(s.get('orderSeq', 100000), 100000);
});

test('null varsayilanli anahtar her tipi kabul eder', () => {
  const b = memoryBackend();
  b.setItem('cg:session', '"u1"');
  assert.equal(createStore(b).get('session', null), 'u1');
});

test('persistent: calisan depolamada true, engelli depolamada false', () => {
  assert.equal(createStore(memoryBackend()).persistent(), true);
  const bad = memoryBackend();
  bad.setItem = () => { throw new Error('engelli'); };
  assert.equal(createStore(bad).persistent(), false);
  assert.equal(createStore(null).persistent(), false);
});
