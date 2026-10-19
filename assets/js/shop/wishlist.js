// Favoriler: her kullanıcının (ve misafirin) ürün kimlikleri listesi, ekleme sırasıyla tutulur.
const keyOf = (owner) => `wishlist:${owner ?? 'guest'}`;
const read = (store, owner) => store.get(keyOf(owner), []).filter((x) => typeof x === 'string');

export function createWishlist(store, owner) {
  return {
    list: () => read(store, owner),
    has: (id) => read(store, owner).includes(id),
    count: () => read(store, owner).length,
    // Ekliyorsa true, çıkarıyorsa false döner.
    toggle(id) {
      const list = read(store, owner);
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      store.set(keyOf(owner), next);
      return next.includes(id);
    },
  };
}

// Giriş yapınca misafirken eklenen favoriler hesaba taşınır.
export function mergeGuestWishlist(store, userId) {
  const user = read(store, userId);
  const guest = read(store, null);
  store.set(keyOf(userId), [...user, ...guest.filter((id) => !user.includes(id))]);
  store.remove(keyOf(null));
}

// Misafir favorilerini okur ve temizler (sunucu adaptörü girişte hesaba taşır).
export const readGuestWishlist = (store) => read(store, null);
export const clearGuestWishlist = (store) => store.remove(keyOf(null));
