import { mountShell } from '../shell.js';
import { listOrders } from '../orders.js';
import { el, formatTL } from '../ui.js';

const ctx = await mountShell({ page: 'account' });
const { auth, consent, store } = ctx;
const root = document.getElementById('hesap');
let tab = 'giris';

const ERRORS = {
  EMAIL_KAYITLI: 'Bu e-posta ile kayıt zaten var.',
  SIFRE_KISA: 'Şifre en az 8 karakter olmalı.',
  GIRIS_HATALI: 'E-posta veya şifre hatalı.',
  ZORUNLU_ALAN: 'Tüm alanları doldurun.',
};

const DEMO_NOTE = 'Bu bir demo hesaptır; verileriniz yalnızca bu tarayıcıda saklanır.';

function field(label, name, type, autocomplete) {
  return el('label', { class: 'field' }, el('span', {}, label), el('input', { type, name, autocomplete, required: '' }));
}

function authForm(kind) {
  const register = kind === 'kayit';
  const msg = el('p', { class: 'form-msg', role: 'alert' });
  const submit = el('button', { class: 'btn btn--gold', type: 'submit' }, register ? 'Kayıt ol' : 'Giriş yap');
  const form = el('form', { class: 'auth-form', id: `form-${kind}` },
    ...(register ? [field('Ad soyad', 'ad', 'text', 'name')] : []),
    field('E-posta', 'email', 'email', 'email'),
    field('Şifre', 'sifre', 'password', register ? 'new-password' : 'current-password'),
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
    el('div', { class: 'shop-filters__types', role: 'group', 'aria-label': 'Hesap işlemi' }, tabBtn('giris', 'Giriş'), tabBtn('kayit', 'Kayıt ol')),
    authForm(tab), el('p', { class: 'form-msg' }, DEMO_NOTE)));
}

function orderItem(o) {
  return el('li', { class: 'order' },
    el('div', { class: 'order__head' },
      el('strong', {}, o.id),
      el('span', {}, new Date(o.createdAt).toLocaleDateString('tr-TR')),
      el('span', {}, formatTL(o.total))),
    el('ul', { class: 'done__list' }, ...o.lines.map((l) => el('li', {}, `${l.qty} x ${l.name}`))));
}

function renderUser(user) {
  const orders = listOrders(store, user.id);
  const status = consent.status();
  const revoke = el('button', { class: 'btn btn--line btn--sm', type: 'button' }, 'İzinleri geri al');
  revoke.addEventListener('click', () => { consent.revoke(); render(); });
  const logout = el('button', { class: 'btn btn--line', type: 'button' }, 'Çıkış yap');
  logout.addEventListener('click', () => { auth.logout(); tab = 'giris'; ctx.refresh(); render(); });

  root.replaceChildren(el('div', { class: 'account' },
    el('p', { class: 'shop-lead' }, `Merhaba ${user.name}`),
    el('p', { class: 'form-msg' }, user.email),
    el('h2', { class: 'order-form__title' }, 'Siparişlerim'),
    orders.length ? el('ul', { class: 'orders' }, ...orders.map(orderItem)) : el('p', { class: 'form-msg' }, 'Henüz siparişiniz yok.'),
    el('h2', { class: 'order-form__title' }, 'Kişisel veri izni'),
    el('p', { class: 'form-msg', id: 'izin-durum' }, status.granted
      ? `İzin verildi (${new Date(status.at).toLocaleDateString('tr-TR')}).` : 'İzin verilmedi.'),
    ...(status.granted ? [revoke] : []),
    el('p', { class: 'form-msg' }, DEMO_NOTE),
    el('div', { class: 'pdetail__buy' }, logout)));
}

function render() {
  const user = auth.current();
  if (user) renderUser(user);
  else renderGuest();
}

render();
