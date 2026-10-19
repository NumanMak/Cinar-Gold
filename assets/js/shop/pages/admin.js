// Yönetim paneli: siparişleri onaylama/tamamlama/iptal etme, stok düzenleme ve stok bildirim istekleri.
// Yerel modda yalnızca bu tarayıcıdaki siparişleri görür; Supabase modunda tüm müşterilerin siparişlerini görür.
import { mountShell } from '../shell.js';
import { el, formatTL } from '../ui.js';
import { t, locale, translateDocument } from '../i18n.js';
import { productName } from '../names.js';

translateDocument();
const ctx = await mountShell({ page: 'admin' });
const { products, api } = ctx;
const root = document.getElementById('yonetim');

const ERRORS = {
  EMAIL_KAYITLI: 'Bu e-posta ile kayıt zaten var.',
  SIFRE_KISA: 'Şifre en az 8 karakter olmalı.',
  GIRIS_HATALI: 'E-posta veya şifre hatalı.',
  ZORUNLU_ALAN: 'Tüm alanları doldurun.',
  ADMIN_VAR: 'Bu tarayıcıda zaten bir yönetici hesabı var.',
  DURUM_GECERSIZ: 'Bu durum değişikliği yapılamaz.',
  SIPARIS_YOK: 'Sipariş bulunamadı.',
  STOK_GECERSIZ: 'Stok, 0 veya daha büyük bir tam sayı olmalı.',
  YETKI_YOK: 'Bu işlem için yönetici yetkisi gerekir.',
  SUNUCU_YOK: 'Sunucuya ulaşılamadı, tekrar deneyin.',
  COK_FAZLA_ISTEK: 'Çok fazla deneme yapıldı, lütfen biraz bekleyip tekrar deneyin.',
};
const errorText = (code, fallback) => t(ERRORS[code] ?? fallback);
const STATUS = { beklemede: 'Onay bekliyor', onaylandi: 'Onaylandı', tamamlandi: 'Tamamlandı', iptal: 'İptal edildi' };
const ACTIONS = {
  beklemede: [['onaylandi', 'Onayla', 'btn--gold'], ['iptal', 'İptal et', 'btn--line']],
  onaylandi: [['tamamlandi', 'Tamamlandı olarak işaretle', 'btn--gold'], ['iptal', 'İptal et', 'btn--line']],
  tamamlandi: [],
  iptal: [],
};
const PAYMENT = { havale: 'Havale / EFT', magaza: 'Mağazada ödeme' };
const TABS = [['siparisler', 'Siparişler'], ['stok', 'Stok'], ['bildirimler', 'Stok bildirim istekleri']];
const date = (iso) => new Date(iso).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' });
let tab = 'siparisler';
let filter = 'beklemede';
let query = '';
const cache = { orders: [], alerts: [] };

const lineName = (l) => {
  const p = products.find((x) => x.id === l.id);
  return p ? productName(p) : l.name;
};
const waPhone = (phone) => {
  const d = String(phone).replace(/\D/g, '');
  return d.startsWith('0') ? `90${d.slice(1)}` : d.startsWith('90') ? d : `90${d}`;
};
const isAdmin = () => ctx.me()?.role === 'admin';

function field(label, name, type, autocomplete, extra = {}) {
  return el('label', { class: 'field' }, el('span', {}, label), el('input', { type, name, autocomplete, required: '', ...extra }));
}

/* ---------- Giriş / ilk kurulum ---------- */
function accessForm(setup) {
  const msg = el('p', { class: 'form-msg', role: 'alert' });
  const submit = el('button', { class: 'btn btn--gold', type: 'submit' }, setup ? t('Yönetici hesabını oluştur') : t('Giriş yap'));
  const form = el('form', { class: 'auth-form', id: setup ? 'form-admin-kurulum' : 'form-admin-giris' },
    ...(setup ? [field(t('Ad soyad'), 'ad', 'name')] : []),
    field(t('E-posta'), 'email', 'email', 'username'),
    field(t('Şifre'), 'sifre', 'password', setup ? 'new-password' : 'current-password', setup ? { minlength: '8' } : {}),
    ...(setup ? [el('p', { class: 'form-msg' }, t('Şifreniz en az 8 karakter olmalı.'))] : []),
    msg, submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    msg.textContent = '';
    try {
      if (!(await ctx.requireConsent())) { msg.textContent = t('Devam etmek için kişisel veriler konusunda izin vermeniz gerekiyor.'); return; }
      const f = form.elements;
      if (setup) await api.auth.createAdmin({ name: f.ad.value, email: f.email.value, password: f.sifre.value });
      else await api.auth.signIn(f.email.value, f.sifre.value);
      await ctx.reloadMe();
      await render();
    } catch (err) {
      msg.textContent = errorText(err.message, 'İşlem tamamlanamadı, tekrar deneyin.');
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}

async function renderAccess() {
  const setup = api.auth.canCreateAdmin && !(await api.auth.hasAdmin());
  const user = ctx.me();
  root.replaceChildren(el('div', { class: 'auth' },
    el('p', { class: 'shop-lead' }, setup
      ? t('Bu tarayıcıda henüz yönetici hesabı yok. İlk yönetici hesabını oluşturun.')
      : user ? t('Bu hesabın yönetim paneline erişim yetkisi yok. Yönetici hesabıyla giriş yapın.') : t('Yönetim paneline erişmek için yönetici hesabıyla giriş yapın.')),
    accessForm(setup),
    ...(api.mode === 'local' ? [el('p', { class: 'form-msg' }, t('Yönetim paneli demodur: yalnızca bu tarayıcıdaki siparişleri ve stoğu yönetir.'))] : [])));
}

/* ---------- Siparişler ---------- */
function orderCard(o) {
  const msg = el('p', { class: 'form-msg', role: 'alert' });
  const actions = el('div', { class: 'order__actions' });
  for (const [status, label, cls] of ACTIONS[o.status] ?? []) {
    const btn = el('button', { class: `btn ${cls} btn--sm`, type: 'button', 'data-status': status }, t(label));
    btn.addEventListener('click', () => {
      if (status !== 'iptal') return change(o.id, status, msg);
      const yes = el('button', { class: 'btn btn--line btn--sm', type: 'button' }, t('Evet, iptal et'));
      const no = el('button', { class: 'link-btn', type: 'button' }, t('Vazgeç'));
      actions.replaceChildren(el('span', { class: 'form-msg' }, t('Sipariş iptal edilsin mi? Stok geri verilir.')), yes, no);
      yes.addEventListener('click', () => change(o.id, 'iptal', msg));
      no.addEventListener('click', draw);
    });
    actions.append(btn);
  }
  const wa = el('a', { class: 'link-btn', href: `https://wa.me/${waPhone(o.phone)}`, target: '_blank', rel: 'noopener' }, t('Müşteriye WhatsApp'));
  actions.append(wa);
  const delivery = o.delivery === 'adres' ? t('Adrese teslim: {adres}', { adres: o.address }) : t('Mağazadan teslim');
  return el('li', { class: `order order--${o.status}` },
    el('div', { class: 'order__head' },
      el('strong', {}, o.id),
      el('span', { class: `order__status order__status--${o.status}` }, t(STATUS[o.status] ?? o.status)),
      el('span', {}, date(o.createdAt)),
      el('strong', {}, formatTL(o.total))),
    el('p', { class: 'form-msg' }, `${o.name}, ${o.phone}`),
    el('ul', { class: 'done__list' }, ...o.lines.map((l) => el('li', {}, `${l.qty} x ${lineName(l)}`))),
    el('p', { class: 'form-msg' }, `${delivery}. ${t('Ödeme: {yontem}.', { yontem: PAYMENT[o.payment] ? t(PAYMENT[o.payment]) : o.payment })}`),
    actions, msg);
}

async function change(id, status, msg) {
  try {
    await api.orders.adminSetStatus(id, status);
    await ctx.reloadStock();
    await render();
  } catch (err) {
    msg.textContent = errorText(err.message, 'İşlem tamamlanamadı, tekrar deneyin.');
  }
}

function sectionOrders() {
  const all = cache.orders;
  const counts = (s) => (s ? all.filter((o) => o.status === s).length : all.length);
  const q = query.trim().toLowerCase();
  const list = all.filter((o) => (!filter || o.status === filter)
    && (!q || `${o.id} ${o.name} ${o.phone}`.toLowerCase().includes(q)));
  const chips = el('div', { class: 'shop-filters__types', role: 'group', 'aria-label': t('Sipariş durumu') },
    ...[['', 'Tümü'], ...Object.entries(STATUS)].map(([value, label]) => {
      const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(filter === value), 'data-filter': value }, `${t(value ? label : 'Tümü')} (${counts(value)})`);
      b.addEventListener('click', () => { filter = value; draw(); });
      return b;
    }));
  const search = el('input', { type: 'search', id: 'yonetim-ara', placeholder: t('Sipariş no, ad veya telefon'), value: query, 'aria-label': t('Sipariş ara') });
  search.addEventListener('input', () => { query = search.value; draw(); document.getElementById('yonetim-ara')?.focus(); });
  return [chips, el('div', { class: 'shop-search' }, search),
    list.length ? el('ul', { class: 'orders', id: 'yonetim-siparisler' }, ...list.map(orderCard))
      : el('p', { class: 'form-msg', role: 'status' }, t('Bu filtreye uygun sipariş yok.'))];
}

/* ---------- Stok ---------- */
function sectionStock() {
  const rows = products.map((p) => {
    const input = el('input', { type: 'number', min: '0', step: '1', value: String(ctx.inventory.stockOf(p.id)), 'aria-label': t('{name} stoğu', { name: productName(p) }), 'data-id': p.id });
    const msg = el('span', { class: 'form-msg', role: 'status' });
    const save = el('button', { class: 'btn btn--line btn--sm', type: 'button' }, t('Kaydet'));
    save.addEventListener('click', async () => {
      save.disabled = true;
      try { await api.stock.adminSet(p.id, Number(input.value)); await ctx.reloadStock(); msg.textContent = t('Kaydedildi.'); }
      catch (err) { msg.textContent = errorText(err.message, 'Kaydedilemedi, tekrar deneyin.'); }
      finally { save.disabled = false; }
    });
    return el('li', { class: 'stockrow' }, el('span', { class: 'stockrow__name' }, productName(p)), input, save, msg);
  });
  return [el('p', { class: 'form-msg' }, t('Stoğu 0 olan ürünlerde müşteriye "Bana bildir" gösterilir.')), el('ul', { class: 'stocklist' }, ...rows)];
}

/* ---------- Bildirim istekleri ---------- */
function sectionAlerts() {
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows = cache.alerts.map((r) => {
    const p = byId.get(r.productId);
    const contact = [r.email, r.phone].filter(Boolean).join(', ');
    return el('li', { class: 'order' },
      el('div', { class: 'order__head' },
        el('strong', {}, p ? productName(p) : r.productId),
        el('span', {}, p && ctx.inventory.stockOf(p.id) > 0 ? t('Stokta') : t('Stok bekleniyor')),
        el('span', {}, date(r.createdAt))),
      el('p', { class: 'form-msg' }, contact));
  });
  return [rows.length ? el('ul', { class: 'orders' }, ...rows) : el('p', { class: 'form-msg' }, t('Stok bildirim isteği yok.'))];
}

const SECTIONS = { siparisler: sectionOrders, stok: sectionStock, bildirimler: sectionAlerts };

// Önbellekten çizer (arama/filtre sunucuya gitmez).
function draw() {
  const pending = cache.orders.filter((o) => o.status === 'beklemede').length;
  const nav = el('div', { class: 'shop-filters__types', role: 'group', 'aria-label': t('Yönetim bölümleri') },
    ...TABS.map(([id, label]) => {
      const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(tab === id), 'data-tab': id }, id === 'siparisler' && pending ? `${t(label)} (${pending})` : t(label));
      b.addEventListener('click', async () => { tab = id; await render(); });
      return b;
    }));
  root.replaceChildren(el('div', { class: 'admin' }, nav, el('div', { class: 'acard admin__body', id: `yonetim-${tab}` }, ...SECTIONS[tab]())));
}

// Sunucudan siparişleri (ve gerekiyorsa bildirimleri) yeniler, sonra çizer.
async function render() {
  if (!isAdmin()) { await renderAccess(); return; }
  try {
    cache.orders = await api.orders.adminList();
    if (tab === 'bildirimler') cache.alerts = await api.alerts.adminList();
  } catch (err) {
    root.replaceChildren(el('p', { class: 'form-msg', role: 'alert' }, errorText(err.message, 'Sunucuya ulaşılamadı, tekrar deneyin.')));
    return;
  }
  draw();
}

await render();
// Yeni siparişler için panel her 30 saniyede bir kendini yeniler (yazarken ve stok düzenlerken bozmamak için yalnızca siparişler sekmesinde).
setInterval(() => { if (isAdmin() && tab === 'siparisler' && !document.hidden && !document.activeElement?.closest('#yonetim-siparisler')) render(); }, 30000);
