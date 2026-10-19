import { readFileSync } from 'node:fs';

export const products = JSON.parse(readFileSync(new URL('../assets/data/products.json', import.meta.url), 'utf8'));

export function memoryBackend() {
  const m = new Map();
  return {
    raw: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
