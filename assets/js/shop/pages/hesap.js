import { mountShell } from '../shell.js';
import { listOrders, cancelOrder } from '../orders.js';
import { mergeGuestWishlist } from '../wishlist.js';
import { el, formatTL, productCard } from '../ui.js';

const ctx = await mountShell({ page: 'account' });
const { auth, consent, store, notify, products, inventory } = ctx;
const root = document.getElementById('hesap');
let tab = 'giris';

const ERRORS = {
  EMAIL_KAYITLI: 'Bu e-posta ile kayıt zaten var.',
  SIFRE_KISA: 'Şifre en az 8 karakter olmalı.',
  GIRIS_HATALI: 'E-posta veya şifre hatalı.',
  ZORUNLU_ALAN: 'Tüm alanları doldurun (adres en az 10 karakter olmalı).',
  IPTAL_EDILEMEZ: 'Bu sipariş artık iptal edilemez.',
  SIPARIS_YOK: 'Sipariş bulunamadı.',
};

const DEMO_NOTE = 'Bu bir demo hesaptır; verileriniz yalnızca bu tarayıcıda saklanır.';
const STATUS = { beklemede: 'Onay bekliyor', iptal: 'İptal edildi' };
const PAYMENT = { havale: 'Havale / EFT', magaza: 'Mağazada ödeme' };
const SECTIONS = [
  ['genel', 'Genel bakış'], ['siparisler', 'Siparişlerim'], ['favoriler', 'Favorilerim'], ['adresler', 'Adreslerim'],
  ['bildirimler', 'Stok bildirimlerim'], ['bilgiler', 'Hesap bilgilerim'], ['izinler', 'İzinler ve gizlilik'],
];

const currentSection = () => {
  const id = location.hash.slice(1);
  return SECTIONS.some(([s]) => s === id) ? id : 'genel';
};

function field(label, name, type, autocomplete, extra = {}) {
  return el('label', { class: 'field' }, el('span', {}, label), el('input', { type, name, autocomplete, required: '', ...extra }));
}

/* ---------- Misafir: giriş ve kayıt ---------- */
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
      const user = register
        ? await auth.register({ name: f.ad.value, email: f.email.value, password: f.sifre.value })
        : await auth.login(f.email.value, f.sifre.value);
      mergeGuestWishlist(store, user.id);
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
    el('p', { class: 'shop-lead' }, 'Giriş yaparak siparişlerinizi görün, favorilerinizi ve adreslerinizi kaydedin.'),
    el('div', { class: 'shop-filters__types', role: 'group', 'aria-label': 'Hesap işlemi' }, tabBtn('giris', 'Giriş'), tabBtn('kayit', 'Kayıt ol')),
    authForm(tab), el('p', { class: 'form-msg' }, DEMO_NOTE)));
}

/* ---------- Giriş yapmış kullanıcı bölümleri ---------- */
const heading = (text) => el('h2', { class: 'acard__title' }, text);
const empty = (text, linkText, href) => el('div', { class: 'empty' }, el('p', { class: 'form-msg' }, text),
  ...(linkText ? [el('a', { class: 'btn btn--gold btn--sm', href }, linkText)] : []));

function orderItem(o, user) {
  const delivery = o.delivery === 'adres' ? `Adrese teslim: ${o.address}` : 'Mağazadan teslim';
  const msg = el('p', { class: 'form-msg', role: 'alert' });
  const actions = el('div', { class: 'order__actions' });
  if (o.status === 'beklemede') {
    const ask = el('button', { class: 'link-btn', type: 'button' }, 'Siparişi iptal et');
    ask.addEventListener('click', () => {
      const yes = el('button', { class: 'btn btn--line btn--sm', type: 'button' }, 'Evet, iptal et');
      const no = el('button', { class: 'link-btn', type: 'button' }, 'Vazgeç');
      actions.replaceChildren(el('span', { class: 'form-msg' }, 'Sipariş iptal edilsin mi? Stok geri verilir.'), yes, no);
      no.addEventListener('click', () => actions.replaceChildren(ask));
      yes.addEventListener('click', () => {
        try { cancelOrder({ store, inventory }, o.id, user.id); ctx.refresh(); render(); }
        catch (err) { msg.textContent = ERRORS[err.message] ?? 'İptal edilemedi.'; }
      });
    });
    actions.append(ask);
  }
  return el('li', { class: `order${o.status === 'iptal' ? ' order--cancelled' : ''}` },
    el('div', { class: 'order__head' },
      el('strong', {}, o.id),
      el('span', { class: `order__status order__status--${o.status}` }, STATUS[o.status] ?? o.status),
      el('span', {}, new Date(o.createdAt).toLocaleDateString('tr-TR')),
      el('strong', {}, formatTL(o.total))),
    el('ul', { class: 'done__list' }, ...o.lines.map((l) => el('li', {}, `${l.qty} x ${l.name}`))),
    el('p', { class: 'form-msg' }, `${delivery}. Ödeme: ${PAYMENT[o.payment] ?? o.payment}.${o.discount ? ` İndirim: ${formatTL(o.discount)}.` : ''}`),
    actions, msg);
}

function sectionGenel(user) {
  const orders = listOrders(store, user.id);
  const favorites = ctx.wishlist().count();
  const alerts = notify.forContact({ email: user.email, phone: user.phone }).length;
  const tile = (href, n, label) => el('a', { class: 'tile', href }, el('strong', {}, String(n)), el('span', {}, label));
  const last = orders[0];
  return [
    el('h2', { class: 'acard__title' }, `Merhaba ${user.name}`),
    el('div', { class: 'tiles' },
      tile('#siparisler', orders.length, 'Sipariş'), tile('#favoriler', favorites, 'Favori'),
      tile('#adresler', user.addresses.length, 'Adres'), tile('#bildirimler', alerts, 'Stok bildirimi')),
    el('h3', { class: 'acard__sub' }, 'Son siparişiniz'),
    last ? el('ul', { class: 'orders' }, orderItem(last, user)) : empty('Henüz siparişiniz yok.', 'Alışverişe başla', 'magaza.html'),
  ];
}

function sectionSiparisler(user) {
  const orders = listOrders(store, user.id);
  return [heading('Siparişlerim'), orders.length
    ? el('ul', { class: 'orders' }, ...orders.map((o) => orderItem(o, user)))
    : empty('Henüz siparişiniz yok.', 'Alışverişe başla', 'magaza.html')];
}

function sectionFavoriler() {
  const ids = ctx.wishlist().list();
  const byId = new Map(products.map((p) => [p.id, p]));
  const list = ids.map((id) => byId.get(id)).filter(Boolean);
  return [heading('Favorilerim'), list.length
    ? el('ul', { class: 'shop-grid' }, ...list.map((p) => productCard(p, ctx, () => render())))
    : empty('Favori listeniz boş. Ürünlerdeki kalbe dokunarak ekleyebilirsiniz.', 'Mağazaya git', 'magaza.html')];
}

function sectionAdresler(user) {
  const msg = el('p', { class: 'form-msg', role: 'alert' });
  const title = el('input', { type: 'text', name: 'baslik', required: '', placeholder: 'Ev, İş...' });
  const text = el('textarea', { name: 'adres', rows: '3', required: '', placeholder: 'Mahalle, cadde/sokak, bina ve daire no, ilçe, il' });
  const form = el('form', { class: 'auth-form', id: 'form-adres' },
    el('label', { class: 'field' }, el('span', {}, 'Adres başlığı'), title),
    el('label', { class: 'field' }, el('span', {}, 'Açık adres'), text),
    msg, el('button', { class: 'btn btn--gold', type: 'submit' }, 'Adres ekle'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    try { auth.addAddress({ title: title.value, text: text.value }); ctx.refresh(); render(); }
    catch (err) { msg.textContent = ERRORS[err.message] ?? 'Adres eklenemedi.'; }
  });
  const cards = user.addresses.map((a) => {
    const def = el('button', { class: 'link-btn', type: 'button' }, 'Varsayılan yap');
    def.addEventListener('click', () => { auth.setDefaultAddress(a.id); render(); });
    const del = el('button', { class: 'link-btn', type: 'button' }, 'Sil');
    del.addEventListener('click', () => { auth.removeAddress(a.id); ctx.refresh(); render(); });
    return el('li', { class: 'order' },
      el('div', { class: 'order__head' }, el('strong', {}, a.title), ...(a.isDefault ? [el('span', { class: 'order__status' }, 'Varsayılan')] : [])),
      el('p', {}, a.text),
      el('div', { class: 'order__actions' }, ...(a.isDefault ? [] : [def]), del));
  });
  return [heading('Adreslerim'),
    cards.length ? el('ul', { class: 'orders' }, ...cards) : el('p', { class: 'form-msg' }, 'Kayıtlı adresiniz yok. Aşağıdan ekleyebilirsiniz.'),
    el('h3', { class: 'acard__sub' }, 'Yeni adres'), form];
}

function sectionBildirimler(user) {
  const reqs = notify.forContact({ email: user.email, phone: user.phone });
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows = reqs.map((r) => {
    const p = byId.get(r.productId);
    const rm = el('button', { class: 'link-btn', type: 'button' }, 'Vazgeç');
    rm.addEventListener('click', () => { notify.remove(r.id); ctx.refresh(); render(); });
    const inStock = p && inventory.stockOf(p.id) > 0;
    return el('li', { class: 'order' },
      el('div', { class: 'order__head' },
        p ? el('a', { href: `urun.html?id=${encodeURIComponent(p.id)}` }, p.name) : el('span', {}, r.productId),
        el('span', {}, inStock ? 'Stokta, şimdi sipariş verebilirsiniz' : 'Stok bekleniyor'), rm));
  });
  return [heading('Stok bildirimlerim'), rows.length ? el('ul', { class: 'orders' }, ...rows) : empty('Takip ettiğiniz tükenmiş ürün yok.')];
}

function sectionBilgiler(user) {
  const pmsg = el('p', { class: 'form-msg', role: 'status' });
  const name = el('input', { type: 'text', name: 'ad', autocomplete: 'name', required: '', value: user.name });
  const phone = el('input', { type: 'tel', name: 'telefon', autocomplete: 'tel', value: user.phone });
  const profile = el('form', { class: 'auth-form', id: 'form-profil' },
    el('p', { class: 'form-msg' }, `E-posta: ${user.email}`),
    el('label', { class: 'field' }, el('span', {}, 'Ad soyad'), name),
    el('label', { class: 'field' }, el('span', {}, 'Telefon'), phone),
    pmsg, el('button', { class: 'btn btn--gold', type: 'submit' }, 'Bilgileri kaydet'));
  profile.addEventListener('submit', (e) => {
    e.preventDefault();
    try { auth.updateProfile({ name: name.value, phone: phone.value }); ctx.refresh(); pmsg.textContent = 'Bilgileriniz kaydedildi.'; }
    catch (err) { pmsg.textContent = ERRORS[err.message] ?? 'Kaydedilemedi, tekrar deneyin.'; }
  });
  const smsg = el('p', { class: 'form-msg', role: 'alert' });
  const pass = el('form', { class: 'auth-form', id: 'form-sifre' },
    field('Mevcut şifre', 'eski', 'password', 'current-password'),
    field('Yeni şifre', 'yeni', 'password', 'new-password', { minlength: '8' }),
    smsg, el('button', { class: 'btn btn--line', type: 'submit' }, 'Şifreyi değiştir'));
  pass.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await auth.changePassword(pass.elements.eski.value, pass.elements.yeni.value); pass.reset(); smsg.textContent = 'Şifreniz değiştirildi.'; }
    catch (err) { smsg.textContent = ERRORS[err.message] ?? 'Şifre değiştirilemedi.'; }
  });
  return [heading('Hesap bilgilerim'), profile, el('h3', { class: 'acard__sub' }, 'Şifre'), pass];
}

function sectionIzinler() {
  const status = consent.status();
  const revoke = el('button', { class: 'btn btn--line btn--sm', type: 'button' }, 'İzinleri geri al');
  revoke.addEventListener('click', () => { consent.revoke(); render(); });
  return [heading('İzinler ve gizlilik'),
    el('p', { class: 'form-msg', id: 'izin-durum' }, status.granted
      ? `İzin verildi (${new Date(status.at).toLocaleDateString('tr-TR')}).` : 'İzin verilmedi. Bir sonraki işleminizde yeniden sorulur.'),
    ...(status.granted ? [revoke] : []),
    el('p', { class: 'form-msg' }, DEMO_NOTE)];
}

const BUILDERS = {
  genel: sectionGenel, siparisler: sectionSiparisler, favoriler: sectionFavoriler, adresler: sectionAdresler,
  bildirimler: sectionBildirimler, bilgiler: sectionBilgiler, izinler: sectionIzinler,
};

function renderUser(user) {
  const active = currentSection();
  const nav = el('nav', { class: 'account__nav', 'aria-label': 'Hesap bölümleri' },
    ...SECTIONS.map(([id, label]) => el('a', { href: `#${id}`, ...(id === active ? { 'aria-current': 'page' } : {}) }, label)));
  const logout = el('button', { class: 'btn btn--line btn--sm', type: 'button' }, 'Çıkış yap');
  logout.addEventListener('click', () => { auth.logout(); tab = 'giris'; ctx.refresh(); location.hash = ''; render(); });
  root.replaceChildren(el('div', { class: 'account-layout' },
    el('div', { class: 'account__side' }, nav, logout),
    el('section', { class: 'acard account__main', id: `bolum-${active}`, 'aria-live': 'polite' }, ...BUILDERS[active](user))));
  // Telefonda sekme şeridi yatay kayar; etkin sekme görünür kalsın.
  root.querySelector('.account__nav [aria-current]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function render() {
  const user = auth.current();
  if (user) renderUser(user);
  else renderGuest();
}

window.addEventListener('hashchange', render);
render();
