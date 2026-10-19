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
