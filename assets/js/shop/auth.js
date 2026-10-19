// Demo hesap sistemi: kullanıcılar yalnızca bu tarayıcıda saklanır. Şifre PBKDF2-SHA256 ile hash'lenir.
const ITER = 100000;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
const norm = (email) => String(email ?? '').trim().toLowerCase();
const pub = ({ id, name, email }) => ({ id, name, email });

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

export function createAuth(store) {
  const users = () => store.get('users', []);

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
    logout: () => store.remove('session'),
    current() {
      const id = store.get('session', null);
      const user = users().find((u) => u.id === id);
      return user ? pub(user) : null;
    },
  };
}
