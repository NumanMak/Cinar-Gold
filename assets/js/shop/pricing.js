// Fiyat = gram x (ayara göre gram fiyatı) x (1 + işçilik) + taş bedeli. Gram fiyatı Özsafir'in 22 ayar satış fiyatından türetilir.
const GOLD_URL = new URL('../../data/gold.json', import.meta.url);
const GOLD_MAX_AGE_MS = 30 * 60 * 60 * 1000;

export const gramPrice = (gram22Sell, karat) => (gram22Sell * karat) / 22;

export function priceOf(p, gram22Sell) {
  const raw = p.gram * gramPrice(gram22Sell, p.karat) * (1 + p.laborRate) + p.stoneFee;
  return Math.round(raw / 10) * 10;
}

// Canlı altın verisi geçerliyse ürün fiyatlarını yerinde günceller; geçersizse products.json'daki fiyat kalır.
export function repriceProducts(products, gold) {
  const sell = Number(gold?.items?.gram22?.sell);
  if (!Number.isFinite(sell) || sell <= 0) return 0;
  for (const p of products) p.price = priceOf(p, sell);
  return products.length;
}

export async function loadGold(fetchFn = globalThis.fetch, now = Date.now()) {
  try {
    const res = await fetchFn(String(GOLD_URL), { cache: 'no-store' });
    if (!res.ok) return null;
    const doc = await res.json();
    const age = now - Date.parse(doc.fetchedAt);
    return age > -5 * 60 * 1000 && age <= GOLD_MAX_AGE_MS ? doc : null;
  } catch (e) {
    return null;
  }
}
