// Demo hesap sistemi: kullanıcılar yalnızca bu tarayıcıda saklanır. Şifre PBKDF2-SHA256 ile hash'lenir.
const ITER = 100000;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
const norm = (email) => String(email ?? '').trim().toLowerCase();
const MIN_ADDRESS = 10;
// Eski kayıtlarda tek metin olan "address" alanı varsa adres defterine dönüştürülür.
const addressesOf = (u) => u.addresses ?? (u.address ? [{ id: 'adres-1', title: 'Adresim', text: u.address, isDefault: true }] : []);
const defaultAddress = (list) => list.find((a) => a.isDefault) ?? list[0];
const pub = (u) => {
  const addresses = addressesOf(u);
  return { id: u.id, name: u.name, email: u.email, phone: u.phone ?? '', address: defaultAddress(addresses)?.text ?? '', addresses };
};

async function hash(password, saltBytes) {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: ITER }, key, 256));
}

function same(a, b) {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const newId = () => hex(globalThis.crypto.getRandomValues(new Uint8Array(6)));

export function createAuth(store) {
  const users = () => store.get('users', []);
  const saveAddresses = (user, addresses) => {
    const next = { ...user, addresses };
    delete next.address;
    store.set('users', users().map((u) => (u.id === user.id ? next : u)));
  };

  return {
    async register({ name, email, password }) {
      const n = String(name ?? '').trim();
      const e = norm(email);
      if (!n || !e) throw new Error('ZORUNLU_ALAN');
      if (String(password ?? '').length < 8) throw new Error('SIFRE_KISA');
      if (users().some((u) => u.email === e)) throw new Error('EMAIL_KAYITLI');
      const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
      const user = { id: hex(globalThis.crypto.getRandomValues(new Uint8Array(8))), name: n, email: e, salt: hex(salt), hash: await hash(password, salt) };
      store.set('users', [...users(), user]);
      store.set('session', user.id);
      return pub(user);
    },
    async login(email, password) {
      const user = users().find((u) => u.email === norm(email));
      // Bilinmeyen e-postada da hash hesaplanır; yanıt süresi ve hata kodu aynı kalır.
      const salt = user ? unhex(user.salt) : new Uint8Array(16);
      const h = await hash(String(password ?? ''), salt);
      if (!user || !same(h, user.hash)) throw new Error('GIRIS_HATALI');
      store.set('session', user.id);
      return pub(user);
    },
    // Yalnızca ad, telefon ve adres güncellenir; e-posta ve şifre alanlarına dokunulmaz.
    updateProfile(patch) {
      const id = store.get('session', null);
      const user = users().find((u) => u.id === id);
      if (!user) throw new Error('GIRIS_HATALI');
      const next = { ...user };
      if (patch.name !== undefined) {
        next.name = String(patch.name).trim();
        if (!next.name) throw new Error('ZORUNLU_ALAN');
      }
      if (patch.phone !== undefined) next.phone = String(patch.phone).trim();
      if (patch.address !== undefined && String(patch.address).trim()) {
        // Varsayılan adres güncellenir; hiç adres yoksa oluşturulur.
        const text = String(patch.address).trim();
        const list = addressesOf(next);
        const def = defaultAddress(list);
        next.addresses = def ? list.map((a) => (a === def ? { ...a, text } : a)) : [{ id: newId(), title: 'Adresim', text, isDefault: true }];
      }
      delete next.address;
      store.set('users', users().map((u) => (u.id === id ? next : u)));
      return pub(next);
    },
    addAddress({ title, text }) {
      const id = store.get('session', null);
      const user = users().find((u) => u.id === id);
      if (!user) throw new Error('GIRIS_HATALI');
      const t = String(title ?? '').trim();
      const body = String(text ?? '').trim();
      if (!t || body.length < MIN_ADDRESS) throw new Error('ZORUNLU_ALAN');
      const list = addressesOf(user);
      const address = { id: newId(), title: t, text: body, isDefault: list.length === 0 };
      saveAddresses(user, [...list, address]);
      return address;
    },
    setDefaultAddress(addressId) {
      const user = users().find((u) => u.id === store.get('session', null));
      if (!user) throw new Error('GIRIS_HATALI');
      saveAddresses(user, addressesOf(user).map((a) => ({ ...a, isDefault: a.id === addressId })));
    },
    removeAddress(addressId) {
      const user = users().find((u) => u.id === store.get('session', null));
      if (!user) throw new Error('GIRIS_HATALI');
      const rest = addressesOf(user).filter((a) => a.id !== addressId);
      if (rest.length && !rest.some((a) => a.isDefault)) rest[0] = { ...rest[0], isDefault: true };
      saveAddresses(user, rest);
    },
    async changePassword(oldPassword, newPassword) {
      const id = store.get('session', null);
      const user = users().find((u) => u.id === id);
      if (!user) throw new Error('GIRIS_HATALI');
      if (!same(await hash(String(oldPassword ?? ''), unhex(user.salt)), user.hash)) throw new Error('GIRIS_HATALI');
      if (String(newPassword ?? '').length < 8) throw new Error('SIFRE_KISA');
      const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
      const next = { ...user, salt: hex(salt), hash: await hash(newPassword, salt) };
      store.set('users', users().map((u) => (u.id === id ? next : u)));
    },
    logout: () => store.remove('session'),
    current() {
      const id = store.get('session', null);
      const user = users().find((u) => u.id === id);
      return user ? pub(user) : null;
    },
  };
}
