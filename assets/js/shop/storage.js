// localStorage sarmalayıcısı: önekli anahtarlar, JSON değerler, her hatada bellekte çalışmaya devam.
const PREFIX = 'cg:';

function defaultBackend() {
  try { return globalThis.localStorage || null; } catch (e) { return null; }
}

// Kayıtlı değerin tipi varsayılanla uyuşmuyorsa (null, {}, "x" gibi geçerli ama yanlış tipte JSON) geçersiz sayılır.
function sameKind(value, fallback) {
  if (fallback === null || fallback === undefined) return true;
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (typeof fallback === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return typeof value === typeof fallback;
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
      try {
        const value = JSON.parse(raw);
        return sameKind(value, fallback) ? value : fallback;
      } catch (e) { return fallback; }
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
    // Veri sayfalar arasında kalıcı mı? Engelli depolamada yalnızca o sayfa yüklemesinde yaşar.
    persistent() {
      try {
        if (!backend) return false;
        backend.setItem(PREFIX + '__probe', '1');
        backend.removeItem(PREFIX + '__probe');
        return true;
      } catch (e) { return false; }
    },
    remove(key) {
      const k = PREFIX + key;
      mem.delete(k);
      try { if (backend) backend.removeItem(k); } catch (e) { /* yoksay */ }
    },
  };
}
