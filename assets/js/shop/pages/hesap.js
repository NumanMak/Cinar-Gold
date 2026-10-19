import { mountShell } from '../shell.js';
import { listOrders } from '../orders.js';
import { el, formatTL } from '../ui.js';

const ctx = await mountShell({ page: 'account' });
const { auth, consent, store, notify, products } = ctx;
const root = document.getElementById('hesap');
let tab = 'giris';

const ERRORS = {
  EMAIL_KAYITLI: 'Bu e-posta ile kayıt zaten var.',
  SIFRE_KISA: 'Şifre en az 8 karakter olmalı.',
  GIRIS_HATALI: 'E-posta veya şifre hatalı.',
  ZORUNLU_ALAN: 'Tüm alanları doldurun.',
};

const DEMO_NOTE = 'Bu bir demo hesaptır; verileriniz yalnızca bu tarayıcıda saklanır.';
const STATUS = { beklemede: 'Onay bekliyor' };
const PAYMENT = { havale: 'Havale / EFT', magaza: 'Mağazada ödeme' };

function field(label, name, type, autocomplete, extra = {}) {
  return el('label', { class: 'field' }, el('span', {}, label), el('input', { type, name, autocomplete, required: '', ...extra }));
}

function authForm(kind) {
  const register = kind === 'kayit';
  const msg = el('p', { class: 'form-msg', role: 'alert' });
  const submit = el('button', { class: 'btn btn--gold', type: 'submit' }, register ? 'Kayıt ol' : 'Giriş yap');
  const form = el('form', { class: 'auth-form', id: `form-${kind}` },
    ...(register ? [field('Ad soyad', 'ad', 'text', 'name')] : []),
    field('E-posta', 'email', 'email', 'email'),
    field('Şifre', 'sifre', 'password', register ? 'new-password' : 'current-password', register ? { minlength: '8' } : {}),
    ...(register ? [el('p', { class: 'form-msg' }, 'Şifreniz en az 8 karakter olmalı.')] : []),
    msg, submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    msg.textContent = '';
    try {
      if (!(await ctx.requireConsent())) {
        msg.textContent = 'Devam etmek için kişisel veriler konusunda izin vermeniz gerekiyor.';
        return;
      }
      const f = form.elements;
      if (register) await auth.register({ name: f.ad.value, email: f.email.value, password: f.sifre.value });
      else await auth.login(f.email.value, f.sifre.value);
      ctx.refresh();
      render();
    } catch (err) {
      msg.textContent = ERRORS[err.message] ?? 'İşlem tamamlanamadı, tekrar deneyin.';
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}

function renderGuest() {
  const tabBtn = (id, label) => {
    const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(tab === id) }, label);
    b.addEventListener('click', () => { tab = id; render(); });
    return b;
  };
  root.replaceChildren(el('div', { class: 'auth' },
    el('p', { class: 'shop-lead' }, 'Giriş yaparak siparişlerinizi görün, adres ve telefon bilgilerinizi kaydedin.'),
    el('div', { class: 'shop-filters__types', role: 'group', 'aria-label': 'Hesap işlemi' }, tabBtn('giris', 'Giriş'), tabBtn('kayit', 'Kayıt ol')),
    authForm(tab), el('p', { class: 'form-msg' }, DEMO_NOTE)));
}

function card(title, ...children) {
  return el('section', { class: 'acard' }, el('h2', { class: 'acard__title' }, title), ...children);
}

function profileCard(user) {
  const msg = el('p', { class: 'form-msg', role: 'status' });
  const name = el('input', { type: 'text', name: 'ad', autocomplete: 'name', required: '', value: user.name });
  const phone = el('input', { type: 'tel', name: 'telefon', autocomplete: 'tel', value: user.phone });
  const address = el('textarea', { name: 'adres', rows: '3', autocomplete: 'street-address', placeholder: 'Mahalle, cadde/sokak, bina ve daire no, ilçe, il' }, user.address);
  const form = el('form', { class: 'auth-form', id: 'form-profil' },
    el('p', { class: 'form-msg' }, `E-posta: ${user.email}`),
    el('label', { class: 'field' }, el('span', {}, 'Ad soyad'), name),
    el('label', { class: 'field' }, el('span', {}, 'Telefon'), phone),
    el('label', { class: 'field' }, el('span', {}, 'Teslimat adresi'), address),
    msg, el('button', { class: 'btn btn--gold', type: 'submit' }, 'Bilgileri kaydet'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      auth.updateProfile({ name: name.value, phone: phone.value, address: address.value });
      ctx.refresh();
      msg.textContent = 'Bilgileriniz kaydedildi.';
    } catch (err) {
      msg.textContent = ERRORS[err.message] ?? 'Kaydedilemedi, tekrar deneyin.';
    }
  });
  return card('Bilgilerim', form);
}

function passwordCard() {
  const msg = el('p', { class: 'form-msg', role: 'alert' });
  const form = el('form', { class: 'auth-form', id: 'form-sifre' },
    field('Mevcut şifre', 'eski', 'password', 'current-password'),
    field('Yeni şifre', 'yeni', 'password', 'new-password', { minlength: '8' }),
    msg, el('button', { class: 'btn btn--line', type: 'submit' }, 'Şifreyi değiştir'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await auth.changePassword(form.elements.eski.value, form.elements.yeni.value);
      form.reset();
      msg.textContent = 'Şifreniz değiştirildi.';
    } catch (err) {
      msg.textContent = ERRORS[err.message] ?? 'Şifre değiştirilemedi.';
    }
  });
  return card('Şifre', form);
}

function orderItem(o) {
  const delivery = o.delivery === 'adres' ? `Adrese teslim: ${o.address}` : 'Mağazadan teslim';
  return el('li', { class: 'order' },
    el('div', { class: 'order__head' },
      el('strong', {}, o.id),
      el('span', { class: 'order__status' }, STATUS[o.status] ?? o.status),
      el('span', {}, new Date(o.createdAt).toLocaleDateString('tr-TR')),
      el('strong', {}, formatTL(o.total))),
    el('ul', { class: 'done__list' }, ...o.lines.map((l) => el('li', {}, `${l.qty} x ${l.name}`))),
    el('p', { class: 'form-msg' }, `${delivery}. Ödeme: ${PAYMENT[o.payment] ?? o.payment}.${o.discount ? ` İndirim: ${formatTL(o.discount)}.` : ''}`));
}

function ordersCard(user) {
  const orders = listOrders(store, user.id);
  return card('Siparişlerim', orders.length
    ? el('ul', { class: 'orders' }, ...orders.map(orderItem))
    : el('p', { class: 'form-msg' }, 'Henüz siparişiniz yok. '), ...(orders.length ? [] : [el('a', { class: 'btn btn--gold btn--sm', href: 'magaza.html' }, 'Alışverişe başla')]));
}

function alertsCard(user) {
  const reqs = notify.forContact({ email: user.email, phone: user.phone });
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows = reqs.map((r) => {
    const p = byId.get(r.productId);
    const rm = el('button', { class: 'link-btn', type: 'button' }, 'Vazgeç');
    rm.addEventListener('click', () => { notify.remove(r.id); render(); });
    const inStock = p && ctx.inventory.stockOf(p.id) > 0;
    return el('li', { class: 'order' },
      el('div', { class: 'order__head' },
        p ? el('a', { href: `urun.html?id=${encodeURIComponent(p.id)}` }, p.name) : el('span', {}, r.productId),
        el('span', {}, inStock ? 'Stokta, şimdi sipariş verebilirsiniz' : 'Stok bekleniyor'), rm));
  });
  return card('Stok bildirimlerim', rows.length ? el('ul', { class: 'orders' }, ...rows) : el('p', { class: 'form-msg' }, 'Takip ettiğiniz tükenmiş ürün yok.'));
}

function consentCard() {
  const status = consent.status();
  const revoke = el('button', { class: 'btn btn--line btn--sm', type: 'button' }, 'İzinleri geri al');
  revoke.addEventListener('click', () => { consent.revoke(); render(); });
  return card('Kişisel veri izni',
    el('p', { class: 'form-msg', id: 'izin-durum' }, status.granted
      ? `İzin verildi (${new Date(status.at).toLocaleDateString('tr-TR')}).` : 'İzin verilmedi. Bir sonraki işleminizde yeniden sorulur.'),
    ...(status.granted ? [revoke] : []));
}

function renderUser(user) {
  const logout = el('button', { class: 'btn btn--line', type: 'button' }, 'Çıkış yap');
  logout.addEventListener('click', () => { auth.logout(); tab = 'giris'; ctx.refresh(); render(); });
  root.replaceChildren(el('div', { class: 'account' },
    el('p', { class: 'shop-lead' }, `Merhaba ${user.name}`),
    el('div', { class: 'account__grid' },
      el('div', { class: 'account__col' }, ordersCard(user), alertsCard(user)),
      el('div', { class: 'account__col' }, profileCard(user), passwordCard(), consentCard())),
    el('p', { class: 'form-msg' }, DEMO_NOTE),
    el('div', { class: 'pdetail__buy' }, logout)));
}

function render() {
  const user = auth.current();
  if (user) renderUser(user);
  else renderGuest();
}

render();
