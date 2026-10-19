import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme } from '../assets/js/shop/theme.js';

test('kayit yoksa sistem tercihi koyu', () => assert.equal(resolveTheme(null, true), 'dark'));
test('kayit yoksa sistem tercihi acik', () => assert.equal(resolveTheme(null, false), 'light'));
test('gecerli kayit sistem tercihinden onceliklidir', () => assert.equal(resolveTheme('light', true), 'light'));
test('gecersiz kayit sistem tercihine duser', () => assert.equal(resolveTheme('bozuk', false), 'light'));
