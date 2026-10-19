// Kupon kodları: kod (büyük harf) -> indirim oranı.
const COUPONS = { CINAR10: 0.1 };

export function applyCoupon(code, subtotal) {
  const rate = COUPONS[String(code ?? '').trim().toUpperCase()];
  if (!rate) return { valid: false, rate: 0, discount: 0 };
  return { valid: true, rate, discount: Math.round(subtotal * rate) };
}
