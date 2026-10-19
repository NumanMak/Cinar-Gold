import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCoupon } from '../assets/js/shop/coupon.js';

test('CINAR10 buyuk kucuk harf ve bosluk duyarsiz', () => {
  assert.deepEqual(applyCoupon(' cinar10 ', 1000), { valid: true, rate: 0.1, discount: 100 });
});

test('indirim yuvarlanir', () => {
  assert.equal(applyCoupon('CINAR10', 1005).discount, 101);
});

test('bilinmeyen kupon gecersiz', () => {
  assert.deepEqual(applyCoupon('XYZ', 1000), { valid: false, rate: 0, discount: 0 });
});

test('bos kupon gecersiz', () => {
  assert.equal(applyCoupon('', 1000).valid, false);
  assert.equal(applyCoupon(undefined, 1000).valid, false);
});
