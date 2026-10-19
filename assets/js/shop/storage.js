// localStorage sarmalayıcısı: önekli anahtarlar, JSON değerler, her hatada bellekte çalışmaya devam.
const PREFIX = 'cg:';

function defaultBackend() {
  try { return globalThis.localStorage || null; } catch (e) { return null; }
}

export function createStore(backend = defaultBackend()) {
  const mem = new Map();

  return {
    get(key, fallback) {
      const k = PREFIX + key;
      let raw = mem.has(k) ? mem.get(k) : null;
      if (raw === null && backend) {
        try { raw = backend.getItem(k); } catch (e) { raw = null; }
      }
      if (raw === null || raw === undefined) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    },
    set(key, value) {
      const k = PREFIX + key;
      const raw = JSON.stringify(value);
      try {
        if (!backend) throw new Error('depolama yok');
        backend.setItem(k, raw);
        mem.delete(k);
      } catch (e) {
        mem.set(k, raw);
      }
    },
    remove(key) {
      const k = PREFIX + key;
      mem.delete(k);
      try { if (backend) backend.removeItem(k); } catch (e) { /* yoksay */ }
    },
  };
}
