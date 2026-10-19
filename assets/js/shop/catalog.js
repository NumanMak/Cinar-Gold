const DATA_URL = new URL('../../data/products.json', import.meta.url);

export async function loadProducts(fetchFn = globalThis.fetch) {
  const res = await fetchFn(String(DATA_URL));
  if (!res.ok) throw new Error('KATALOG_YUKLENEMEDI');
  return res.json();
}

export function modelsOf(products, type) {
  return [...new Set(products.filter((p) => p.type === type).map((p) => p.model))];
}

export function filterProducts(products, f, inventory) {
  return products.filter((p) =>
    (!f.type || p.type === f.type) &&
    (!f.model || p.model === f.model) &&
    (!f.inStockOnly || inventory.stockOf(p.id) > 0));
}
