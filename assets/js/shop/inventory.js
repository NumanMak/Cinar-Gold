// Stok: başlangıç değeri products.json'dan, düşümler store içindeki "stock" kaydından gelir.
export function createInventory(store, products) {
  const base = new Map(products.map((p) => [p.id, p.stock]));

  const stockOf = (id) => {
    if (!base.has(id)) return 0;
    const left = store.get('stock', {});
    const v = Object.prototype.hasOwnProperty.call(left, id) ? left[id] : base.get(id);
    return Number.isInteger(v) && v >= 0 ? v : base.get(id);
  };

  return {
    stockOf,
    isSoldOut: (id) => stockOf(id) <= 0,
    setStock(id, qty) {
      if (!base.has(id)) throw new Error('URUN_YOK');
      if (!Number.isInteger(qty) || qty < 0) throw new Error('STOK_GECERSIZ');
      store.set('stock', { ...store.get('stock', {}), [id]: qty });
    },
    restore(id, qty) {
      if (!base.has(id)) throw new Error('URUN_YOK');
      if (!Number.isInteger(qty) || qty < 1) throw new Error('STOK_GECERSIZ');
      store.set('stock', { ...store.get('stock', {}), [id]: stockOf(id) + qty });
    },
    decrement(id, qty) {
      const now = stockOf(id);
      if (!Number.isInteger(qty) || qty < 1 || qty > now) throw new Error('STOK_YETERSIZ');
      store.set('stock', { ...store.get('stock', {}), [id]: now - qty });
    },
  };
}
