import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../assets/js/shop/storage.js';
import { createLocalApi } from '../assets/js/shop/api/local.js';
import { products, memoryBackend } from './helpers.mjs';
import { contract } from './contract.mjs';

// ---- local adaptörü

const localFactory = async () => {
  const store = createStore(memoryBackend());
  const api = createLocalApi({ store, products });
  const makeAdmin = async (apiRef) => {
    const creds = { email: 'yonetici@cinargold.test', password: 'Yonetici-Sifre-2026' };
    await apiRef.auth.createAdmin({ name: 'Admin Yonetici', ...creds });
    return creds;
  };
  return { api, store, makeAdmin, mail: (n) => `${n}@ornek.com`, exactStock: true };
};

contract('local', localFactory);

test('local: ikinci yonetici olusturulamaz (ADMIN_VAR) ve yonetici zaten varsa canCreateAdmin false', async () => {
  const { api, makeAdmin } = await localFactory();
  assert.equal(api.auth.canCreateAdmin, true);
  assert.equal(await api.auth.hasAdmin(), false);
  await makeAdmin(api);
  assert.equal(await api.auth.hasAdmin(), true);
  await api.auth.signOut();
  await assert.rejects(api.auth.createAdmin({ name: 'Z', email: 'z@ornek.com', password: 'Yonetici-Sifre-2027' }), /ADMIN_VAR/);
});

test('local: mode alani local', () => {
  assert.equal(createLocalApi({ store: createStore(memoryBackend()), products }).mode, 'local');
});
