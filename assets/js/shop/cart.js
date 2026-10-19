import { applyCoupon } from './coupon.js';

export function createCart(store, products, inventory) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const read = () => store.get('cart', []).filter((i) => i && typeof i.id === 'string' && Number.isInteger(i.qty) && i.qty > 0);
  const write = (items) => store.set('cart', items);

  function setQty(id, qty) {
    const items = read().filter((i) => i.id !== id);
    if (qty > 0) {
      if (!byId.has(id)) throw new Error('URUN_YOK');
      if (qty > inventory.stockOf(id)) throw new Error('STOK_YETERSIZ');
      items.push({ id, qty });
    }
    write(items);
  }

  return {
    items: read,
    add(id, qty = 1) {
      if (!byId.has(id)) throw new Error('URUN_YOK');
      const cur = read().find((i) => i.id === id)?.qty ?? 0;
      const items = read();
      const next = cur + qty;
      if (next > inventory.stockOf(id)) throw new Error('STOK_YETERSIZ');
      write(cur ? items.map((i) => (i.id === id ? { id, qty: next } : i)) : [...items, { id, qty }]);
    },
    setQty,
    remove: (id) => write(read().filter((i) => i.id !== id)),
    clear: () => write([]),
    count: () => read().reduce((n, i) => n + i.qty, 0),
    quote(code) {
      const lines = [];
      const problems = [];
      for (const { id, qty } of read()) {
        const product = byId.get(id);
        if (!product) { problems.push(`${id}: ürün artık yok`); continue; }
        if (qty > inventory.stockOf(id)) problems.push(`${product.name}: stokta yalnızca ${inventory.stockOf(id)} adet var`);
        lines.push({ product, qty, lineTotal: product.price * qty });
      }
      const subtotal = lines.reduce((n, l) => n + l.lineTotal, 0);
      const c = applyCoupon(code, subtotal);
      return { lines, subtotal, discount: c.discount, total: subtotal - c.discount, couponValid: c.valid, problems };
    },
  };
}
