// Supabase adaptörü: Auth, PostgREST ve RPC çağrılarını yalnızca fetch ile yapar (ek kütüphane yok).
// Fiyat, kupon ve stok kararları sunucu fonksiyonlarındadır (supabase/schema.sql); istemci yalnızca ürün kimliği ve adet yollar.
// Arayüz sözleşmesi tests/api-contract.test.mjs içindedir; protokol ayrıntıları tests/api-supabase.test.mjs ile denetlenir.
import { createWishlist, readGuestWishlist, clearGuestWishlist } from '../wishlist.js';

const CODES = new Set(['STOK_YETERSIZ', 'URUN_YOK', 'SEPET_BOS', 'ZORUNLU_ALAN', 'SIPARIS_YOK', 'IPTAL_EDILEMEZ', 'DURUM_GECERSIZ', 'YETKI_YOK', 'STOK_GECERSIZ', 'GIRIS_GEREKLI', 'SIPARIS_LIMITI', 'FIYAT_ESKI']);
const MIN_ADDRESS = 10;
const MIN_PASSWORD = 8;
const filled = (s) => String(s ?? '').trim() !== '';

function mapError(status, body) {
  const m = String(body?.message ?? body?.msg ?? body?.error_description ?? body?.error ?? '');
  if (CODES.has(m)) return new Error(m);
  if (status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit', 'over_sms_send_rate_limit'].includes(body?.error_code)) return new Error('COK_FAZLA_ISTEK');
  const lm = m.toLowerCase();
  if (lm.includes('invalid login credentials')) return new Error('GIRIS_HATALI');
  if (lm.includes('email not confirmed')) return new Error('EMAIL_DOGRULANMADI');
  if (lm.includes('already registered') || body?.error_code === 'user_already_exists') return new Error('EMAIL_KAYITLI');
  if (lm.includes('password') && /(at least|weak|short|characters)/.test(lm)) return new Error('SIFRE_KISA');
  if (['22P02', '23514', '22023'].includes(body?.code)) return new Error('ZORUNLU_ALAN');
  if (lm.includes('row-level security')) return new Error('YETKI_YOK');
  if (status === 401) return new Error('GIRIS_HATALI');
  return new Error('SUNUCU_HATASI');
}

export function createSupabaseApi(config, { fetchFn = globalThis.fetch?.bind(globalThis), store, products }) {
  const base = String(config.url).replace(/\/+$/, '');
  let session = store.get('sb-session', null);
  let profile = null; // { name, phone, role } önbelleği

  const setSession = (s) => {
    profile = null;
    if (!s) { session = null; store.remove('sb-session'); return; }
    session = { access_token: s.access_token, refresh_token: s.refresh_token, user: { id: s.user?.id, email: s.user?.email, name: s.user?.user_metadata?.name ?? '' } };
    store.set('sb-session', session);
  };

  async function send(path, { method = 'GET', body, prefer, token } = {}) {
    const headers = { apikey: config.anonKey, Authorization: `Bearer ${token ?? session?.access_token ?? config.anonKey}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;
    let res;
    try {
      res = await fetchFn(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      throw new Error('SUNUCU_YOK');
    }
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : undefined; } catch (e) { data = { message: text }; }
    return { ok: res.ok, status: res.status, data };
  }

  async function refreshSession() {
    if (!session?.refresh_token) return false;
    const r = await send('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, token: config.anonKey });
    if (!r.ok) { setSession(null); return false; }
    setSession(r.data);
    return true;
  }

  // Oturum süresi dolmuşsa bir kez yenileyip isteği tekrarlar.
  async function request(path, opts = {}) {
    let r = await send(path, opts);
    if (r.status === 401 && session && !path.startsWith('/auth/v1/token')) {
      if (await refreshSession()) r = await send(path, opts);
    }
    if (!r.ok) throw mapError(r.status, r.data);
    return r.data;
  }
  const first = (d) => (Array.isArray(d) ? d[0] : d);

  const uid = () => session?.user?.id ?? null;
  const addressOut = (a) => ({ id: a.id, title: a.title, text: a.text, isDefault: !!a.is_default });
  const alertOut = (r) => ({ id: r.id, productId: r.product_id, email: r.email, phone: r.phone, createdAt: r.created_at });
  const orderOut = (row, lines) => ({
    id: row.id, userId: row.user_id ?? null, name: row.name, phone: row.phone, payment: row.payment, delivery: row.delivery,
    address: row.address ?? '', coupon: row.coupon ?? '', subtotal: row.subtotal, discount: row.discount, total: row.total,
    status: row.status, createdAt: row.created_at, confirmedAt: row.confirmed_at ?? null, completedAt: row.completed_at ?? null, cancelledAt: row.cancelled_at ?? null,
    lines: lines ?? (row.order_lines ?? []).map((l) => ({ id: l.product_id, name: l.name, qty: l.qty, unitPrice: l.unit_price })),
  });

  async function loadProfile() {
    if (profile) return profile;
    const row = first(await request(`/rest/v1/profiles?select=name,phone,role&id=eq.${uid()}`));
    profile = { name: row?.name || session.user.name || '', phone: row?.phone ?? '', role: row?.role === 'admin' ? 'admin' : 'customer' };
    return profile;
  }
  async function listAddresses() {
    const rows = await request('/rest/v1/addresses?select=*&order=created_at.asc');
    return (rows ?? []).map(addressOut);
  }
  async function requireAdmin() {
    if (!session) throw new Error('YETKI_YOK');
    if ((await loadProfile()).role !== 'admin') throw new Error('YETKI_YOK');
  }

  async function user() {
    if (!session) return null;
    try {
      const p = await loadProfile();
      const addresses = await listAddresses();
      return { id: uid(), name: p.name, email: session.user.email, role: p.role, phone: p.phone, address: (addresses.find((a) => a.isDefault) ?? addresses[0])?.text ?? '', addresses };
    } catch (e) {
      if (!session) return null;
      throw e;
    }
  }

  // Misafirken eklenen favoriler girişte hesaba taşınır (var olanlar yoksayılır).
  async function mergeGuest() {
    const ids = readGuestWishlist(store);
    if (!ids.length || !uid()) return;
    await request('/rest/v1/wishlist?on_conflict=user_id,product_id', {
      method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: ids.map((id) => ({ user_id: uid(), product_id: id })),
    });
    clearGuestWishlist(store);
  }

  async function startSession(s) {
    setSession(s);
    try { await mergeGuest(); } catch (e) { console.error('Favoriler taşınamadı'); }
    return user();
  }

  async function prices() {
    const rows = await request('/rest/v1/products_priced?select=id,price');
    return Object.fromEntries((rows ?? []).map((r) => [r.id, r.price]));
  }

  return {
    mode: 'supabase',

    auth: {
      canCreateAdmin: false,
      hasAdmin: async () => true,
      createAdmin: async () => { throw new Error('YETKI_YOK'); },

      async signUp({ name, email, password }) {
        const n = String(name ?? '').trim();
        const e = String(email ?? '').trim().toLowerCase();
        if (!n || !e) throw new Error('ZORUNLU_ALAN');
        if (String(password ?? '').length < MIN_PASSWORD) throw new Error('SIFRE_KISA');
        const r = await request('/auth/v1/signup', { method: 'POST', body: { email: e, password, data: { name: n } }, token: config.anonKey });
        if (r?.access_token) return startSession(r);
        return { id: r?.id ?? null, email: e, name: n, role: 'customer', needsConfirmation: true };
      },
      async signIn(email, password) {
        const r = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: String(email ?? '').trim().toLowerCase(), password }, token: config.anonKey });
        return startSession(r);
      },
      async signOut() {
        if (session) { try { await send('/auth/v1/logout', { method: 'POST' }); } catch (e) { /* yoksay */ } }
        setSession(null);
      },
      user,
      // Şifre sıfırlama bağlantısı e-posta ile gönderilir (Supabase Auth).
      async recover(email) {
        const e = String(email ?? '').trim().toLowerCase();
        if (!e) throw new Error('ZORUNLU_ALAN');
        await request('/auth/v1/recover', { method: 'POST', body: { email: e }, token: config.anonKey });
      },
      // KVKK: kendi verisinin tamamı (sunucu fonksiyonu, şifre ve jeton içermez).
      async exportData() {
        if (!session) throw new Error('GIRIS_HATALI');
        return request('/rest/v1/rpc/export_my_data', { method: 'POST', body: {} });
      },
      // Hesabı siler: siparişler anonimleşir, kişisel veriler silinir. Yönetici hesabı silinemez.
      async deleteAccount() {
        if (!session) throw new Error('GIRIS_HATALI');
        await request('/rest/v1/rpc/delete_my_account', { method: 'POST', body: {} });
        setSession(null);
      },
      async updateProfile(patch) {
        if (!session) throw new Error('GIRIS_HATALI');
        const body = {};
        if (patch.name !== undefined) {
          body.name = String(patch.name).trim();
          if (!body.name) throw new Error('ZORUNLU_ALAN');
        }
        if (patch.phone !== undefined) body.phone = String(patch.phone).trim();
        if (Object.keys(body).length) await request(`/rest/v1/profiles?id=eq.${uid()}`, { method: 'PATCH', body, prefer: 'return=minimal' });
        profile = null;
        return user();
      },
      async changePassword(oldPassword, newPassword) {
        if (!session) throw new Error('GIRIS_HATALI');
        const r = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: session.user.email, password: oldPassword }, token: config.anonKey });
        if (String(newPassword ?? '').length < MIN_PASSWORD) throw new Error('SIFRE_KISA');
        setSession(r);
        await request('/auth/v1/user', { method: 'PUT', body: { password: newPassword } });
      },
      addresses: {
        async list() { if (!session) throw new Error('GIRIS_HATALI'); return listAddresses(); },
        async add({ title, text }) {
          if (!session) throw new Error('GIRIS_HATALI');
          const ttl = String(title ?? '').trim();
          const body = String(text ?? '').trim();
          if (!ttl || body.length < MIN_ADDRESS) throw new Error('ZORUNLU_ALAN');
          const existing = await listAddresses();
          const rows = await request('/rest/v1/addresses', { method: 'POST', prefer: 'return=representation', body: { user_id: uid(), title: ttl, text: body, is_default: existing.length === 0 } });
          return addressOut(first(rows));
        },
        async setDefault(id) {
          if (!session) throw new Error('GIRIS_HATALI');
          await request(`/rest/v1/addresses?user_id=eq.${uid()}`, { method: 'PATCH', body: { is_default: false }, prefer: 'return=minimal' });
          await request(`/rest/v1/addresses?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { is_default: true }, prefer: 'return=minimal' });
        },
        async remove(id) {
          if (!session) throw new Error('GIRIS_HATALI');
          const before = await listAddresses();
          await request(`/rest/v1/addresses?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
          const rest = before.filter((a) => a.id !== id);
          if (rest.length && !rest.some((a) => a.isDefault)) {
            await request(`/rest/v1/addresses?id=eq.${encodeURIComponent(rest[0].id)}`, { method: 'PATCH', body: { is_default: true }, prefer: 'return=minimal' });
          }
        },
      },
    },

    prices,

    stock: {
      async load() {
        const rows = await request('/rest/v1/products_stock?select=product_id,stock');
        return Object.fromEntries((rows ?? []).map((r) => [r.product_id, r.stock]));
      },
      async adminSet(id, qty) {
        await requireAdmin();
        if (!Number.isInteger(qty) || qty < 0) throw new Error('STOK_GECERSIZ');
        await request('/rest/v1/rpc/admin_set_stock', { method: 'POST', body: { p_product_id: id, p_qty: qty } });
      },
    },

    orders: {
      // Yalnızca ürün kimliği ve adet gider; fiyat, toplam ve kupon indirimi sunucuda hesaplanır.
      async place(lines, customer, coupon = '') {
        const sent = lines.map((l) => ({ id: String(l.id), qty: Number(l.qty) }));
        const row = first(await request('/rest/v1/rpc/place_order', {
          method: 'POST',
          body: {
            lines: sent,
            customer: { name: customer.name, phone: customer.phone, payment: customer.payment, delivery: customer.delivery ?? 'magaza', address: customer.address ?? '' },
            coupon,
          },
        }));
        let unit = {};
        try { unit = await prices(); } catch (e) { /* fiyat bilgisi yalnızca gösterim içindir */ }
        const merged = new Map();
        for (const l of sent) merged.set(l.id, (merged.get(l.id) ?? 0) + l.qty);
        const out = [...merged].map(([id, qty]) => {
          const p = products.find((x) => x.id === id);
          return { id, name: p?.name ?? id, qty, unitPrice: unit[id] ?? p?.price ?? 0 };
        });
        return orderOut(row, out);
      },
      async mine() {
        if (!session) return [];
        const rows = await request(`/rest/v1/orders?select=*,order_lines(*)&user_id=eq.${uid()}&order=created_at.desc`);
        return (rows ?? []).map((r) => orderOut(r));
      },
      async cancelMine(id) {
        return orderOut(first(await request('/rest/v1/rpc/cancel_my_order', { method: 'POST', body: { p_id: id } })));
      },
      async adminList() {
        await requireAdmin();
        const rows = await request('/rest/v1/orders?select=*,order_lines(*)&order=created_at.desc');
        return (rows ?? []).map((r) => orderOut(r));
      },
      async adminSetStatus(id, status) {
        await requireAdmin();
        return orderOut(first(await request('/rest/v1/rpc/admin_set_order_status', { method: 'POST', body: { p_id: id, p_status: status } })));
      },
    },

    // KVKK izin kaydı: yalnızca oturum açıkken ve aynı izin için bir kez yazılır.
    consents: {
      async record({ kvkk, islem, iletisim = false, at, notice = 'v2' }) {
        if (!session || !kvkk || !islem) return;
        const key = `${uid()}:${at ?? ''}`;
        if (store.get('consent-rec', null) === key) return;
        await request('/rest/v1/consents', { method: 'POST', body: { user_id: uid(), kvkk: true, islem: true, iletisim: !!iletisim, notice_version: notice }, prefer: 'return=minimal' });
        store.set('consent-rec', key);
      },
    },

    wishlist: {
      async list() {
        if (!session) return createWishlist(store, null).list();
        const rows = await request('/rest/v1/wishlist?select=product_id&order=created_at.asc');
        return (rows ?? []).map((r) => r.product_id);
      },
      async toggle(id) {
        if (!session) return createWishlist(store, null).toggle(id);
        const ids = await this.list();
        if (ids.includes(id)) {
          await request(`/rest/v1/wishlist?user_id=eq.${uid()}&product_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
          return false;
        }
        await request('/rest/v1/wishlist', { method: 'POST', body: { user_id: uid(), product_id: id }, prefer: 'return=minimal' });
        return true;
      },
    },

    alerts: {
      async add({ productId, email, phone }) {
        const e = String(email ?? '').trim().toLowerCase();
        const p = String(phone ?? '').trim();
        if (!filled(e) && !filled(p)) throw new Error('ZORUNLU_ALAN');
        const body = { product_id: productId, email: e, phone: p };
        if (uid()) body.user_id = uid();
        await request('/rest/v1/stock_alerts', { method: 'POST', body, prefer: 'return=minimal' });
        return { productId, email: e, phone: p };
      },
      async mine() {
        if (!session) return [];
        const rows = await request(`/rest/v1/stock_alerts?select=*&user_id=eq.${uid()}&order=created_at.desc`);
        return (rows ?? []).map(alertOut);
      },
      async remove(id) {
        await request(`/rest/v1/stock_alerts?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
      },
      async adminList() {
        await requireAdmin();
        const rows = await request('/rest/v1/stock_alerts?select=*&order=created_at.desc');
        return (rows ?? []).map(alertOut);
      },
    },
  };
}
