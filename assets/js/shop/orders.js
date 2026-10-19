const PAYMENTS = ['havale', 'magaza'];
const DELIVERIES = ['magaza', 'adres'];
const MIN_ADDRESS = 10;

export function listOrders(store, userId) {
  return store.get('orders', []).filter((o) => o.userId === userId).reverse();
}

export function placeOrder({ store, inventory, cart }, input) {
  const name = String(input.name ?? '').trim();
  const phone = String(input.phone ?? '').trim();
  const delivery = input.delivery ?? 'magaza';
  const address = delivery === 'adres' ? String(input.address ?? '').trim() : '';
  if (!name || !phone || !PAYMENTS.includes(input.payment) || !DELIVERIES.includes(delivery)) throw new Error('ZORUNLU_ALAN');
  if (delivery === 'adres' && address.length < MIN_ADDRESS) throw new Error('ZORUNLU_ALAN');
  if (cart.count() === 0) throw new Error('SEPET_BOS');

  const quote = cart.quote(input.code);
  if (quote.problems.length) throw new Error('SIPARIS_GECERSIZ');

  // Doğrulama bitti: bundan sonra hiçbir satır başarısız olmaz, stok tek seferde düşer.
  for (const l of quote.lines) inventory.decrement(l.product.id, l.qty);

  const seq = store.get('orderSeq', 100000) + 1;
  store.set('orderSeq', seq);
  const order = {
    id: `CG-${seq}`,
    userId: input.userId ?? null,
    name,
    phone,
    payment: input.payment,
    delivery,
    address,
    lines: quote.lines.map((l) => ({ id: l.product.id, name: l.product.name, qty: l.qty, unitPrice: l.product.price })),
    subtotal: quote.subtotal,
    discount: quote.discount,
    total: quote.total,
    createdAt: new Date().toISOString(),
    status: 'beklemede',
  };
  store.set('orders', [...store.get('orders', []), order]);
  cart.clear();
  return order;
}
