import { mountShell } from '../shell.js';
import { el, formatTL, productCard } from '../ui.js';
import { t, locale, translateDocument } from '../i18n.js';
import { productName } from '../names.js';

translateDocument();
const ctx = await mountShell({ page: 'account' });
const { consent, products, api } = ctx;
const root = document.getElementById('hesap');
let tab = 'giris';

const ERRORS = {
  EMAIL_KAYITLI: 'Bu e-posta ile kayıt zaten var.',
  SIFRE_KISA: 'Şifre en az 8 karakter olmalı.',
  GIRIS_HATALI: 'E-posta veya şifre hatalı.',
  ZORUNLU_ALAN: 'Tüm alanları doldurun (adres en az 10 karakter olmalı).',
  IPTAL_EDILEMEZ: 'Bu sipariş artık iptal edilemez.',
  SUNUCU_YOK: 'Sunucuya ulaşılamadı, tekrar deneyin.',
  SIPARIS_YOK: 'Sipariş bulunamadı.',
  SUNUCU_HATASI: 'Sunucu hatası, lütfen biraz sonra tekrar deneyin.',
  EMAIL_DOGRULANMADI: 'E-posta adresiniz henüz doğrulanmadı. Gelen kutunuzdaki bağlantıya tıklayın.',
};

const errorText = (code, fallback) => t(ERRORS[code] ?? fallback);
const DEMO_NOTE = 'Bu bir demo hesaptır; verileriniz yalnızca bu tarayıcıda saklanır.';
// Yerel (demo) modda bilgi notu gösterilir; gerçek arka uçta gösterilmez.
const demoNote = () => (api.mode === 'local' ? [el('p', { class: 'form-msg' }, t(DEMO_NOTE))] : []);
const STATUS = { beklemede: 'Onay bekliyor', onaylandi: 'Onaylandı', tamamlandi: 'Tamamlandı', iptal: 'İptal edildi' }; // t() ile gösterilir
const PAYMENT = { havale: 'Havale / EFT', magaza: 'Mağazada ödeme' };
const SECTIONS = [
  ['genel', 'Genel bakış'], ['siparisler', 'Siparişlerim'], ['favoriler', 'Favorilerim'], ['adresler', 'Adreslerim'],
  ['bildirimler', 'Stok bildirimlerim'], ['bilgiler', 'Hesap bilgilerim'], ['izinler', 'İzinler ve gizlilik'],
];

const date = (iso) => new Date(iso).toLocaleDateString(locale());

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
  const submit = el('button', { class: 'btn btn--gold', type: 'submit' }, register ? t('Kayıt ol') : t('Giriş yap'));
  const form = el('form', { class: 'auth-form', id: `form-${kind}` },
    ...(register ? [field('Ad soyad', 'ad', 'text', 'name')] : []),
    field(t('E-posta'), 'email', 'email', 'email'),
    field(t('Şifre'), 'sifre', 'password', register ? 'new-password' : 'current-password', register ? { minlength: '8' } : {}),
    ...(register ? [el('p', { class: 'form-msg' }, t('Şifreniz en az 8 karakter olmalı.'))] : []),
    msg, submit);
  // Şifremi unuttum: yalnızca e-posta gönderebilen arka uçta (Supabase) gösterilir.
  if (!register && api.auth.recover) {
    const forgot = el('button', { class: 'link-btn', type: 'button' }, t('Şifremi unuttum'));
    forgot.addEventListener('click', async () => {
      const email = form.elements.email.value.trim();
      if (!email) { msg.textContent = t('Önce e-posta adresinizi yazın.'); return; }
      try { await api.auth.recover(email); msg.textContent = t('Şifre sıfırlama bağlantısı e-postanıza gönderildi.'); }
      catch (err) { msg.textContent = errorText(err.message, 'İşlem tamamlanamadı, tekrar deneyin.'); }
    });
    form.insertBefore(forgot, submit);
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    msg.textContent = '';
    try {
      if (!(await ctx.requireConsent())) {
        msg.textContent = t('Devam etmek için kişisel veriler konusunda izin vermeniz gerekiyor.');
        return;
      }
      const f = form.elements;
      if (register) {
        const created = await api.auth.signUp({ name: f.ad.value, email: f.email.value, password: f.sifre.value });
        if (created.needsConfirmation) {
          msg.textContent = t('Doğrulama e-postası gönderildi. Lütfen e-postanızdaki bağlantıya tıklayın, sonra giriş yapın.');
          return;
        }
      } else {
        await api.auth.signIn(f.email.value, f.sifre.value);
      }
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

function renderGuest() {
  const tabBtn = (id, label) => {
    const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(tab === id) }, label);
    b.addEventListener('click', () => { tab = id; render(); });
    return b;
  };
  root.replaceChildren(el('div', { class: 'auth' },
    el('p', { class: 'shop-lead' }, t('Giriş yaparak siparişlerinizi görün, favorilerinizi ve adreslerinizi kaydedin.')),
    el('div', { class: 'shop-filters__types', role: 'group', 'aria-label': t('Hesap işlemi') }, tabBtn('giris', t('Giriş')), tabBtn('kayit', t('Kayıt ol'))),
    authForm(tab), ...demoNote()));
}

/* ---------- Giriş yapmış kullanıcı bölümleri ---------- */
const heading = (text) => el('h2', { class: 'acard__title' }, text);
const empty = (text, linkText, href) => el('div', { class: 'empty' }, el('p', { class: 'form-msg' }, text),
  ...(linkText ? [el('a', { class: 'btn btn--gold btn--sm', href }, linkText)] : []));

// Sipariş satırı adı: katalogdaki güncel dilde ad; ürün kalktıysa siparişte kayıtlı ad.
const lineName = (l) => {
  const p = products.find((x) => x.id === l.id);
  return p ? productName(p) : l.name;
};

function orderItem(o, user) {
  const delivery = o.delivery === 'adres' ? t('Adrese teslim: {adres}', { adres: o.address }) : t('Mağazadan teslim');
  const msg = el('p', { class: 'form-msg', role: 'alert' });
  const actions = el('div', { class: 'order__actions' });
  if (o.status === 'beklemede') {
    const ask = el('button', { class: 'link-btn', type: 'button' }, t('Siparişi iptal et'));
    ask.addEventListener('click', () => {
      const yes = el('button', { class: 'btn btn--line btn--sm', type: 'button' }, t('Evet, iptal et'));
      const no = el('button', { class: 'link-btn', type: 'button' }, t('Vazgeç'));
      actions.replaceChildren(el('span', { class: 'form-msg' }, t('Sipariş iptal edilsin mi? Stok geri verilir.')), yes, no);
      no.addEventListener('click', () => actions.replaceChildren(ask));
      yes.addEventListener('click', async () => {
        yes.disabled = true;
        try { await api.orders.cancelMine(o.id); await ctx.reloadStock(); ctx.refresh(); await render(); }
        catch (err) { yes.disabled = false; msg.textContent = errorText(err.message, 'İptal edilemedi.'); }
      });
    });
    actions.append(ask);
  }
  return el('li', { class: `order${o.status === 'iptal' ? ' order--cancelled' : ''}` },
    el('div', { class: 'order__head' },
      el('strong', {}, o.id),
      el('span', { class: `order__status order__status--${o.status}` }, STATUS[o.status] ? t(STATUS[o.status]) : o.status),
      el('span', {}, date(o.createdAt)),
      el('strong', {}, formatTL(o.total))),
    el('ul', { class: 'done__list' }, ...o.lines.map((l) => el('li', {}, `${l.qty} x ${lineName(l)}`))),
    el('p', { class: 'form-msg' }, `${delivery}. ${t('Ödeme: {yontem}.', { yontem: PAYMENT[o.payment] ? t(PAYMENT[o.payment]) : o.payment })}${o.discount ? ` ${t('İndirim: {tutar}.', { tutar: formatTL(o.discount) })}` : ''}`),
    actions, msg);
}

function sectionGenel(user, data) {
  const orders = data.orders;
  const favorites = ctx.wishlist.count();
  const alerts = data.alerts.length;
  const tile = (href, n, label) => el('a', { class: 'tile', href }, el('strong', {}, String(n)), el('span', {}, label));
  const last = orders[0];
  return [
    el('h2', { class: 'acard__title' }, t('Merhaba {ad}', { ad: user.name })),
    el('div', { class: 'tiles' },
      tile('#siparisler', orders.length, t('Sipariş')), tile('#favoriler', favorites, t('Favori')),
      tile('#adresler', user.addresses.length, t('Adres')), tile('#bildirimler', alerts, t('Stok bildirimi'))),
    el('h3', { class: 'acard__sub' }, t('Son siparişiniz')),
    last ? el('ul', { class: 'orders' }, orderItem(last, user)) : empty(t('Henüz siparişiniz yok.'), t('Alışverişe başla'), 'magaza.html'),
  ];
}

function sectionSiparisler(user, data) {
  const orders = data.orders;
  return [heading(t('Siparişlerim')), orders.length
    ? el('ul', { class: 'orders' }, ...orders.map((o) => orderItem(o, user)))
    : empty(t('Henüz siparişiniz yok.'), t('Alışverişe başla'), 'magaza.html')];
}

function sectionFavoriler() {
  const ids = ctx.wishlist.list();
  const byId = new Map(products.map((p) => [p.id, p]));
  const list = ids.map((id) => byId.get(id)).filter(Boolean);
  return [heading(t('Favorilerim')), list.length
    ? el('ul', { class: 'shop-grid' }, ...list.map((p) => productCard(p, ctx, () => render())))
    : empty(t('Favori listeniz boş. Ürünlerdeki kalbe dokunarak ekleyebilirsiniz.'), t('Mağazaya git'), 'magaza.html')];
}

function sectionAdresler(user) {
  const msg = el('p', { class: 'form-msg', role: 'alert' });
  const title = el('input', { type: 'text', name: 'baslik', required: '', placeholder: t('Ev, İş...') });
  const text = el('textarea', { name: 'adres', rows: '3', required: '', placeholder: t('Mahalle, cadde/sokak, bina ve daire no, ilçe, il') });
  const form = el('form', { class: 'auth-form', id: 'form-adres' },
    el('label', { class: 'field' }, el('span', {}, t('Adres başlığı')), title),
    el('label', { class: 'field' }, el('span', {}, t('Açık adres')), text),
    msg, el('button', { class: 'btn btn--gold', type: 'submit' }, t('Adres ekle')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api.auth.addresses.add({ title: title.value, text: text.value }); await ctx.reloadMe(); await render(); }
    catch (err) { msg.textContent = errorText(err.message, 'Adres eklenemedi.'); }
  });
  const cards = user.addresses.map((a) => {
    const def = el('button', { class: 'link-btn', type: 'button' }, t('Varsayılan yap'));
    def.addEventListener('click', async () => { await api.auth.addresses.setDefault(a.id); await ctx.reloadMe(); await render(); });
    const del = el('button', { class: 'link-btn', type: 'button' }, t('Sil'));
    del.addEventListener('click', async () => { await api.auth.addresses.remove(a.id); await ctx.reloadMe(); await render(); });
    return el('li', { class: 'order' },
      el('div', { class: 'order__head' }, el('strong', {}, a.title), ...(a.isDefault ? [el('span', { class: 'order__status' }, t('Varsayılan'))] : [])),
      el('p', {}, a.text),
      el('div', { class: 'order__actions' }, ...(a.isDefault ? [] : [def]), del));
  });
  return [heading(t('Adreslerim')),
    cards.length ? el('ul', { class: 'orders' }, ...cards) : el('p', { class: 'form-msg' }, t('Kayıtlı adresiniz yok. Aşağıdan ekleyebilirsiniz.')),
    el('h3', { class: 'acard__sub' }, t('Yeni adres')), form];
}

function sectionBildirimler(user, data) {
  const reqs = data.alerts;
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows = reqs.map((r) => {
    const p = byId.get(r.productId);
    const rm = el('button', { class: 'link-btn', type: 'button' }, t('Vazgeç'));
    rm.addEventListener('click', async () => { await api.alerts.remove(r.id); ctx.refresh(); await render(); });
    const inStock = p && ctx.inventory.stockOf(p.id) > 0;
    return el('li', { class: 'order' },
      el('div', { class: 'order__head' },
        p ? el('a', { href: `urun.html?id=${encodeURIComponent(p.id)}` }, productName(p)) : el('span', {}, r.productId),
        el('span', {}, inStock ? t('Stokta, şimdi sipariş verebilirsiniz') : t('Stok bekleniyor')), rm));
  });
  return [heading(t('Stok bildirimlerim')), rows.length ? el('ul', { class: 'orders' }, ...rows) : empty(t('Takip ettiğiniz tükenmiş ürün yok.'))];
}

function sectionBilgiler(user) {
  const pmsg = el('p', { class: 'form-msg', role: 'status' });
  const name = el('input', { type: 'text', name: 'ad', autocomplete: 'name', required: '', value: user.name });
  const phone = el('input', { type: 'tel', name: 'telefon', autocomplete: 'tel', value: user.phone });
  const profile = el('form', { class: 'auth-form', id: 'form-profil' },
    el('p', { class: 'form-msg' }, t('E-posta: {adres}', { adres: user.email })),
    el('label', { class: 'field' }, el('span', {}, t('Ad soyad')), name),
    el('label', { class: 'field' }, el('span', {}, t('Telefon')), phone),
    pmsg, el('button', { class: 'btn btn--gold', type: 'submit' }, t('Bilgileri kaydet')));
  profile.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api.auth.updateProfile({ name: name.value, phone: phone.value }); await ctx.reloadMe(); pmsg.textContent = t('Bilgileriniz kaydedildi.'); }
    catch (err) { pmsg.textContent = errorText(err.message, 'Kaydedilemedi, tekrar deneyin.'); }
  });
  const smsg = el('p', { class: 'form-msg', role: 'alert' });
  const pass = el('form', { class: 'auth-form', id: 'form-sifre' },
    field(t('Mevcut şifre'), 'eski', 'password', 'current-password'),
    field(t('Yeni şifre'), 'yeni', 'password', 'new-password', { minlength: '8' }),
    smsg, el('button', { class: 'btn btn--line', type: 'submit' }, t('Şifreyi değiştir')));
  pass.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api.auth.changePassword(pass.elements.eski.value, pass.elements.yeni.value); pass.reset(); smsg.textContent = t('Şifreniz değiştirildi.'); }
    catch (err) { smsg.textContent = errorText(err.message, 'Şifre değiştirilemedi.'); }
  });
  return [heading(t('Hesap bilgilerim')), profile, el('h3', { class: 'acard__sub' }, t('Şifre')), pass];
}

function sectionIzinler() {
  const status = consent.status();
  const revoke = el('button', { class: 'btn btn--line btn--sm', type: 'button' }, t('İzinleri geri al'));
  revoke.addEventListener('click', () => { consent.revoke(); render(); });
  return [heading(t('İzinler ve gizlilik')),
    el('p', { class: 'form-msg', id: 'izin-durum' }, status.granted
      ? t('İzin verildi ({tarih}).', { tarih: date(status.at) }) : t('İzin verilmedi. Bir sonraki işleminizde yeniden sorulur.')),
    ...(status.granted ? [revoke] : []),
    ...demoNote()];
}

const BUILDERS = {
  genel: sectionGenel, siparisler: sectionSiparisler, favoriler: sectionFavoriler, adresler: sectionAdresler,
  bildirimler: sectionBildirimler, bilgiler: sectionBilgiler, izinler: sectionIzinler,
};

function renderUser(user, data) {
  const active = currentSection();
  const nav = el('nav', { class: 'account__nav', 'aria-label': t('Hesap bölümleri') },
    ...SECTIONS.map(([id, label]) => el('a', { href: `#${id}`, ...(id === active ? { 'aria-current': 'page' } : {}) }, t(label))));
  const logout = el('button', { class: 'btn btn--line btn--sm', type: 'button' }, t('Çıkış yap'));
  logout.addEventListener('click', async () => { await api.auth.signOut(); tab = 'giris'; await ctx.reloadMe(); location.hash = ''; await render(); });
  root.replaceChildren(el('div', { class: 'account-layout' },
    el('div', { class: 'account__side' }, nav, logout),
    el('section', { class: 'acard account__main', id: `bolum-${active}`, 'aria-live': 'polite' }, ...BUILDERS[active](user, data))));
  // Telefonda sekme şeridi yatay kayar; etkin sekme görünür kalsın.
  root.querySelector('.account__nav [aria-current]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

async function render() {
  const user = ctx.me();
  if (!user) { renderGuest(); return; }
  const active = currentSection();
  const data = { orders: [], alerts: [] };
  try {
    if (active === 'genel' || active === 'siparisler') data.orders = await api.orders.mine();
    if (active === 'genel' || active === 'bildirimler') data.alerts = await api.alerts.mine();
  } catch (err) {
    root.replaceChildren(el('p', { class: 'form-msg', role: 'alert' }, errorText(err.message, 'Sunucuya ulaşılamadı, tekrar deneyin.')));
    return;
  }
  renderUser(user, data);
}

window.addEventListener('hashchange', render);
await render();
