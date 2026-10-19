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

// Yalnızca onay bekleyen ve kullanıcıya ait sipariş iptal edilir; stok geri verilir.
export function cancelOrder({ store, inventory }, orderId, userId) {
  const orders = store.get('orders', []);
  const order = orders.find((o) => o.id === orderId && o.userId === userId);
  if (!order) throw new Error('SIPARIS_YOK');
  if (order.status !== 'beklemede') throw new Error('IPTAL_EDILEMEZ');
  for (const l of order.lines) inventory.restore(l.id, l.qty);
  const cancelled = { ...order, status: 'iptal', cancelledAt: new Date().toISOString() };
  store.set('orders', orders.map((o) => (o === order ? cancelled : o)));
  return cancelled;
}

export const listAllOrders = (store) => [...store.get('orders', [])].reverse();

// Yönetici durum geçişleri. Geriye dönüş yoktur; iptal stoğu geri verir ve son durumdur.
const NEXT = { beklemede: ['onaylandi', 'tamamlandi', 'iptal'], onaylandi: ['tamamlandi', 'iptal'], tamamlandi: [], iptal: [] };

export function setOrderStatus({ store, inventory }, orderId, status) {
  const orders = store.get('orders', []);
  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new Error('SIPARIS_YOK');
  if (!Object.hasOwn(NEXT, status) || !NEXT[order.status]?.includes(status)) throw new Error('DURUM_GECERSIZ');
  if (status === 'iptal') for (const l of order.lines) inventory.restore(l.id, l.qty);
  const stamp = { onaylandi: 'confirmedAt', tamamlandi: 'completedAt', iptal: 'cancelledAt' }[status];
  const next = { ...order, status, [stamp]: new Date().toISOString() };
  store.set('orders', orders.map((o) => (o === order ? next : o)));
  return next;
}
