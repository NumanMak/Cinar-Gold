// Yerel adaptör: mevcut localStorage tabanlı modülleri, Supabase adaptörüyle aynı ASENKRON arayüzün arkasına koyar.
// Arayüz sözleşmesi tests/api-contract.test.mjs içindedir. Hata kodları sunucu fonksiyonlarındaki kodlarla aynıdır.
import { createAuth } from '../auth.js';
import { createInventory } from '../inventory.js';
import { createCart } from '../cart.js';
import { createNotify } from '../notify.js';
import { createWishlist, mergeGuestWishlist, clearWishlist } from '../wishlist.js';
import { createStore } from '../storage.js';
import { placeOrder, listOrders, listAllOrders, cancelOrder, setOrderStatus, anonymizeOrders } from '../orders.js';

export function createLocalApi({ store, products }) {
  const auth = createAuth(store);
  const inventory = createInventory(store, products);
  const notify = createNotify(store);

  const current = () => auth.current();
  const requireUser = () => {
    const u = current();
    if (!u) throw new Error('GIRIS_HATALI');
    return u;
  };
  const requireAdmin = () => {
    if (!auth.isAdmin()) throw new Error('YETKI_YOK');
  };
  const withMerge = async (promise) => {
    const user = await promise;
    mergeGuestWishlist(store, user.id);
    return user;
  };

  return {
    mode: 'local',

    auth: {
      canCreateAdmin: true,
      signUp: (i) => withMerge(auth.register(i)),
      signIn: (email, password) => withMerge(auth.login(email, password)),
      createAdmin: (i) => withMerge(auth.createAdmin(i)),
      hasAdmin: async () => auth.hasAdmin(),
      async signOut() { auth.logout(); },
      async user() { return current(); },
      // KVKK: kullanıcının kendi verisinin tamamı (şifre bilgisi içermez).
      async exportData() {
        const u = requireUser();
        return {
          email: u.email,
          profile: { name: u.name, phone: u.phone, role: u.role },
          addresses: u.addresses.map((a) => ({ title: a.title, text: a.text, is_default: a.isDefault })),
          orders: listOrders(store, u.id),
          wishlist: createWishlist(store, u.id).list(),
          stock_alerts: notify.forContact({ email: u.email, phone: u.phone }),
          consents: [],
        };
      },
      async deleteAccount() {
        const u = requireUser();
        if (u.role === 'admin') throw new Error('YETKI_YOK');
        anonymizeOrders(store, u.id);
        clearWishlist(store, u.id);
        auth.deleteAccount();
      },
      async updateProfile(patch) { requireUser(); return auth.updateProfile({ name: patch.name, phone: patch.phone, address: patch.address }); },
      async changePassword(oldPassword, newPassword) { requireUser(); await auth.changePassword(oldPassword, newPassword); },
      addresses: {
        async list() { return requireUser().addresses; },
        async add(a) { requireUser(); return auth.addAddress(a); },
        async setDefault(id) { requireUser(); auth.setDefaultAddress(id); },
        async remove(id) { requireUser(); auth.removeAddress(id); },
      },
    },

    stock: {
      async load() { return Object.fromEntries(products.map((p) => [p.id, inventory.stockOf(p.id)])); },
      async adminSet(id, qty) { requireAdmin(); inventory.setStock(id, qty); },
    },

    orders: {
      // Satırlarda yalnızca id ve qty okunur; fiyat ve toplam her zaman katalogdan hesaplanır.
      async place(lines, customer, coupon = '') {
        const cart = createCart(createStore(null), products, inventory);
        for (const l of lines) cart.add(String(l.id), Number(l.qty));
        return placeOrder({ store, products, inventory, cart }, {
          userId: current()?.id ?? null,
          name: customer.name, phone: customer.phone, payment: customer.payment,
          delivery: customer.delivery, address: customer.address, code: coupon,
        });
      },
      async mine() { const u = current(); return u ? listOrders(store, u.id) : []; },
      async cancelMine(id) {
        const u = current();
        if (!u) throw new Error('SIPARIS_YOK');
        return cancelOrder({ store, inventory }, id, u.id);
      },
      async adminList() { requireAdmin(); return listAllOrders(store); },
      async adminSetStatus(id, status) { requireAdmin(); return setOrderStatus({ store, inventory }, id, status); },
    },

    // Yerel modda izin zaten tarayıcıda tutulur; sunucuya kayıt yoktur.
    consents: { async record() {} },

    wishlist: {
      async list() { return createWishlist(store, current()?.id ?? null).list(); },
      async toggle(id) { return createWishlist(store, current()?.id ?? null).toggle(id); },
    },

    alerts: {
      async add(r) { return notify.add(r); },
      async mine() { const u = current(); return u ? notify.forContact({ email: u.email, phone: u.phone }) : []; },
      async remove(id) { notify.remove(id); },
      async adminList() { requireAdmin(); return notify.list(); },
    },
  };
}
