// Ortak kabuk: duyuru şeridi, üst bilgi eylemleri (tema, sepet, hesap), mağaza sayfası üst/alt bilgisi, izin penceresi.
import { createStore } from './storage.js';
import { initTheme } from './theme.js';
import { loadProducts } from './catalog.js';
import { createCart } from './cart.js';
import { createConsent } from './consent.js';
import { el } from './ui.js';
import { createAccountControl } from './usermenu.js';
import { loadGold, repriceProducts } from './pricing.js';
import { createApi } from './api/index.js';
import { CONFIG } from './config.js';
import { t, getLang, setLang } from './i18n.js';

export const PROMO_TEXT = t('Açılışa özel %10 indirim: CINAR10');

const SVG = {
  theme: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 11H6.2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
};

function buildPromo() {
  const group = () => {
    const g = el('div', { class: 'promo__group' });
    for (let i = 0; i < 4; i++) g.append(el('span', { class: 'promo__item' }, PROMO_TEXT));
    return g;
  };
  return el('div', { class: 'promo', role: 'region', 'aria-label': 'Duyuru' },
    el('p', { class: 'visually-hidden' }, PROMO_TEXT),
    el('div', { class: 'promo__track', 'aria-hidden': 'true' }, group(), group()));
}

function buildActions() {
  const themeBtn = el('button', { class: 'shop-act', type: 'button', html: SVG.theme });
  themeBtn.append(el('span', { class: 'visually-hidden' }, t('Koyu / açık temayı değiştir')));
  const cart = el('a', { class: 'shop-act', href: 'sepet.html', html: SVG.cart });
  cart.append(el('span', { class: 'shop-act__label' }, t('Sepet')), el('span', { class: 'shop-act__badge', id: 'sepet-sayac' }, '0'));
  // Tek tuşla dil değiştirme: Türkçe iken "EN", İngilizce iken "TR" gösterir.
  const other = getLang() === 'tr' ? 'en' : 'tr';
  const label = getLang() === 'tr' ? 'Switch to English' : "Türkçe'ye geç";
  const langBtn = el('button', { class: 'shop-act shop-lang', type: 'button', lang: other, title: label, 'aria-label': label }, other.toUpperCase());
  langBtn.addEventListener('click', () => setLang(other));
  return { wrap: el('div', { class: 'shop-actions' }, langBtn, themeBtn, cart), themeBtn };
}

function buildShopHeader() {
  return el('header', { class: 'shop-nav' },
    el('div', { class: 'container shop-nav__inner' },
      el('a', { class: 'brand', href: 'index.html', 'aria-label': t('Çınar Gold Kuyumculuk, ana sayfa') },
        el('img', { class: 'brand__mark', src: 'assets/icons/favicon.svg', alt: '', width: '34', height: '34' }),
        el('span', { class: 'brand__word' }, el('span', { class: 'brand__name' }, 'Çınar Gold'), el('span', { class: 'brand__sub' }, t('Kuyumculuk')))),
      el('nav', { class: 'shop-nav__links', 'aria-label': t('Ana menü') },
        el('a', { href: 'index.html' }, t('Ana sayfa')),
        el('a', { href: 'magaza.html' }, t('Mağaza')))));
}

function buildShopFooter() {
  return el('footer', { class: 'shop-foot' },
    el('div', { class: 'container' },
      el('p', {}, t('Çınar Gold Kuyumculuk, Cumhuriyet Mah., Atatürk Cd. No:25/A, Fethiye. Tel: 0507 351 73 47')),
      el('p', { class: 'shop-foot__links' },
        el('a', { href: 'gizlilik.html' }, t('Gizlilik ve aydınlatma')), ' · ', el('a', { href: 'satis.html' }, t('Mesafeli satış ve iade')))));
}

export async function mountShell({ page }) {
  const store = createStore();
  const theme = initTheme(store);

  document.body.prepend(buildPromo());
  document.documentElement.classList.add('has-promo');

  const actions = buildActions();
  const homeActions = document.querySelector('.nav__actions');
  // Hesap alanı (Giriş yap / kullanıcı menüsü) her zaman sağ üstte, en sonda durur.
  const account = createAccountControl();
  if (page === 'home' && homeActions) {
    homeActions.prepend(actions.wrap);
    homeActions.querySelector('.nav__toggle').before(account.node);
  } else {
    const header = buildShopHeader();
    header.querySelector('.shop-nav__inner').append(actions.wrap, account.node);
    document.querySelector('.promo').after(header);
    document.body.append(buildShopFooter());
  }

  if (!store.persistent()) {
    document.querySelector('.promo').after(el('p', { class: 'storage-warn', role: 'status' },
      t('Tarayıcı depolaması kapalı: sepetiniz ve hesabınız sayfalar arasında korunmayabilir.')));
  }

  let products = [];
  try {
    products = await loadProducts();
  } catch (e) {
    console.error(e);
    document.querySelector('.promo').after(el('p', { class: 'shop-error', role: 'alert' }, t('Ürünler yüklenemedi, sayfayı yenileyin.')));
  }

  // Fiyatlar canlı altın fiyatından hesaplanır; veri yoksa veya eskiyse products.json'daki fiyat kalır.
  repriceProducts(products, await loadGold());

  // Arka uç (yerel veya Supabase). Ulaşılamazsa sayfa çökmez: katalogdaki başlangıç stoğu ve misafir görünümü kullanılır.
  const api = await createApi(CONFIG, { store, products });
  // Demo notu yalnızca tarayıcı içi (yerel) modda gösterilir.
  if (api.mode === 'local') document.querySelector('.shop-foot .container')?.append(el('p', { class: 'shop-foot__demo' }, t('Mağaza demo sürümdür: hesap, stok ve siparişler yalnızca bu tarayıcıda saklanır.')));
  // Gerçek arka uçta fiyatlar sunucudaki products_priced görünümünden gelir (sipariş tutarıyla aynı kaynak).
  if (api.prices) {
    try {
      const priced = await api.prices();
      for (const p of products) if (Number.isFinite(priced[p.id])) p.price = priced[p.id];
    } catch (e) { console.error(e); }
  }
  const banner = (text) => document.querySelector('.promo').after(el('p', { class: 'shop-error', role: 'alert' }, text));
  let stock = Object.fromEntries(products.map((p) => [p.id, p.stock]));
  let me = null;
  let favs = [];
  const loadStock = async () => {
    try { stock = await api.stock.load(); } catch (e) { console.error(e); }
  };
  const loadMe = async () => {
    try { me = await api.auth.user(); } catch (e) { console.error(e); me = null; }
    try { favs = await api.wishlist.list(); } catch (e) { favs = []; }
  };
  let backendDown = false;
  try { await Promise.all([loadStock(), loadMe()]); } catch (e) { backendDown = true; }
  if (api.mode === 'supabase' && api.ok === false) backendDown = true;
  if (backendDown) banner(t('Sunucuya ulaşılamadı, tekrar deneyin.'));

  // Sayfaların senkron okuduğu önbellekli görünümler.
  const inventory = {
    stockOf: (id) => stock[id] ?? 0,
    isSoldOut: (id) => (stock[id] ?? 0) <= 0,
  };
  const cart = createCart(store, products, inventory);
  const consent = createConsent(store);
  const wishlist = {
    has: (id) => favs.includes(id),
    count: () => favs.length,
    list: () => [...favs],
    // Önce ekranı günceller, sonra sunucuya yazar; hata olursa geri alır.
    async toggle(id) {
      const before = favs;
      favs = before.includes(id) ? before.filter((x) => x !== id) : [...before, id];
      try { return await api.wishlist.toggle(id); } catch (e) { favs = before; throw e; }
    },
  };

  // Hesap menüsü sayaçları (sipariş, favori, bildirim, bekleyen sipariş) oturum varken sunucudan okunur.
  const refreshAccount = async () => {
    const counts = { orders: 0, favorites: favs.length, alerts: 0, pending: 0 };
    if (me) {
      try {
        if (me.role === 'admin') counts.pending = (await api.orders.adminList()).filter((o) => o.status === 'beklemede').length;
        else counts.orders = (await api.orders.mine()).length;
        counts.alerts = (await api.alerts.mine()).length;
      } catch (e) { console.error(e); }
    }
    account.update(me, counts, api);
  };

  // Oturum açıkken verilen izin sunucuya da kaydedilir (başarısızlık kullanıcıyı engellemez).
  const syncConsent = async () => {
    const st = consent.status();
    if (!st.granted || !me) return;
    try { await api.consents.record({ ...st.choices, at: st.at, notice: st.notice }); } catch (e) { console.error(e); }
  };

  const refresh = () => {
    document.getElementById('sepet-sayac').textContent = String(cart.count());
    actions.themeBtn.setAttribute('aria-pressed', String(theme.current() === 'dark'));
    refreshAccount();
  };
  actions.themeBtn.addEventListener('click', () => { theme.toggle(); refresh(); });
  refresh();

  async function requireConsent() {
    if (consent.status().granted) return true;
    const opener = document.activeElement;
    const choices = await askConsent(api.mode);
    if (choices) { consent.grant(choices); syncConsent(); }
    if (opener && typeof opener.focus === 'function') opener.focus();
    return !!choices;
  }

  return {
    store, products, api, inventory, cart, consent, wishlist, requireConsent, refresh,
    me: () => me,
    reloadMe: async () => { await loadMe(); refresh(); syncConsent(); return me; },
    reloadStock: loadStock,
  };
}

// İzin penceresi: kabulde seçimleri, vazgeçişte null döner.
function askConsent(mode) {
  return new Promise((resolve) => {
    const box = (name, text, required) => {
      const input = el('input', { type: 'checkbox', name });
      if (required) input.required = true;
      return { input, label: el('label', { class: 'consent__row' }, input, el('span', {}, text)) };
    };
    const kvkk = box('kvkk', t('Aydınlatma metnini okudum, kişisel verilerimin işlenmesini kabul ediyorum (zorunlu).'), true);
    const islem = box('islem', t('Siparişim, hesabım ve stok bildirimim için bilgilerimin kullanılmasına izin veriyorum (zorunlu).'), true);
    const iletisim = box('iletisim', t('Kampanya ve duyurular için bana ulaşılabilir (isteğe bağlı).'), false);
    const accept = el('button', { class: 'btn btn--gold', type: 'submit', disabled: '' }, t('Kabul et'));
    const cancel = el('button', { class: 'btn btn--line', type: 'button' }, t('Vazgeç'));
    const form = el('form', { method: 'dialog', class: 'consent__form' },
      el('h2', { id: 'izin-baslik', class: 'consent__title' }, t('Kişisel verileriniz')),
      el('p', { class: 'consent__text' }, mode === 'local'
        ? t('Çınar Gold Kuyumculuk olarak adınız, e-postanız, telefonunuz ve sipariş bilgileriniz hesabınızı yönetmek, siparişinizi hazırlamak ve stok bildirimi yapmak amacıyla işlenir. Bu demo sürümde veriler yalnızca bu tarayıcıda saklanır. İzninizi dilediğiniz zaman hesap sayfasından geri alabilirsiniz.')
        : t('Çınar Gold Kuyumculuk (veri sorumlusu) olarak adınız, e-postanız, telefonunuz, adresleriniz ve sipariş bilgileriniz; hesabınızı yönetmek, siparişinizi hazırlamak, stok bildirimi yapmak ve yasal yükümlülükleri yerine getirmek amacıyla işlenir. Veriler Avrupa Birliği içindeki (Frankfurt) sunucularda saklanır. Hesap sayfanızdan verilerinizi indirebilir, hesabınızı silebilir ve izninizi geri alabilirsiniz. Başvurularınız için: 0507 351 73 47.')),
      el('p', { class: 'consent__text' }, el('a', { href: 'gizlilik.html', target: '_blank', rel: 'noopener' }, t('Aydınlatma metninin tamamını okuyun'))),
      kvkk.label, islem.label, iletisim.label,
      el('div', { class: 'consent__actions' }, cancel, accept));
    const dialog = el('dialog', { class: 'consent', 'aria-labelledby': 'izin-baslik' }, form);

    const sync = () => { accept.disabled = !(kvkk.input.checked && islem.input.checked); };
    kvkk.input.addEventListener('change', sync);
    islem.input.addEventListener('change', sync);

    let result = null;
    form.addEventListener('submit', () => {
      result = { kvkk: kvkk.input.checked, islem: islem.input.checked, iletisim: iletisim.input.checked };
    });
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });

    document.body.append(dialog);
    dialog.showModal();
    kvkk.input.focus();
  });
}
