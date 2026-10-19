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

// Türkçe karakterlere ve büyük/küçük harfe duyarsız karşılaştırma metni.
const fold = (s) => String(s ?? '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

export function searchProducts(products, text) {
  const tokens = fold(text).split(/\s+/).filter(Boolean);
  if (!tokens.length) return products;
  return products.filter((p) => {
    const hay = fold(`${p.name} ${p.typeLabel} ${p.model} ${p.type}`);
    return tokens.every((t) => hay.includes(t));
  });
}

export function sortProducts(products, key) {
  const list = [...products];
  if (key === 'fiyat-artan') return list.sort((a, b) => a.price - b.price);
  if (key === 'fiyat-azalan') return list.sort((a, b) => b.price - a.price);
  if (key === 'ad') return list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  return list;
}
