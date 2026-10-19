// "Bana bildir" kayıtları: stok gelince haber verilecek kişiler (yalnızca bu tarayıcıda tutulur).
const clean = (s) => String(s ?? '').trim();

export function createNotify(store) {
  const all = () => store.get('notify', []);

  return {
    add({ productId, email, phone }) {
      const e = clean(email).toLowerCase();
      const p = clean(phone);
      if (!e && !p) throw new Error('ZORUNLU_ALAN');
      const existing = all().find((r) => r.productId === productId && r.email === e && r.phone === p);
      if (existing) return existing;
      const rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), productId, email: e, phone: p, createdAt: new Date().toISOString() };
      store.set('notify', [...all(), rec]);
      return rec;
    },
    list: (productId) => all().filter((r) => !productId || r.productId === productId),
    remove: (id) => store.set('notify', all().filter((r) => r.id !== id)),
    // Bir kişinin (e-posta veya telefon) bildirim istekleri.
    forContact({ email, phone } = {}) {
      const e = clean(email).toLowerCase();
      const p = clean(phone);
      if (!e && !p) return [];
      return all().filter((r) => (e && r.email === e) || (p && r.phone === p));
    },
  };
}
