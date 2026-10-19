// Ortak kabuk: duyuru şeridi, üst bilgi eylemleri (tema, sepet, hesap), mağaza sayfası üst/alt bilgisi, izin penceresi.
import { createStore } from './storage.js';
import { initTheme } from './theme.js';
import { loadProducts } from './catalog.js';
import { createInventory } from './inventory.js';
import { createCart } from './cart.js';
import { createAuth } from './auth.js';
import { createConsent } from './consent.js';
import { createNotify } from './notify.js';
import { el } from './ui.js';
import { createAccountControl } from './usermenu.js';
import { loadGold, repriceProducts } from './pricing.js';
import { createWishlist } from './wishlist.js';
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
      el('p', { class: 'shop-foot__demo' }, t('Mağaza demo sürümdür: hesap, stok ve siparişler yalnızca bu tarayıcıda saklanır.'))));
}

export async function mountShell({ page }) {
  const store = createStore();
  const theme = initTheme(store);

  document.body.prepend(buildPromo());
  document.documentElement.classList.add('has-promo');

  const actions = buildActions();
  const homeActions = document.querySelector('.nav__actions');
  // Hesap alanı (Giriş yap / kullanıcı menüsü) her zaman sağ üstte, en sonda durur.
  const auth = createAuth(store);
  const notify = createNotify(store);
  const account = createAccountControl({ auth, store, notify });
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
  const inventory = createInventory(store, products);
  const cart = createCart(store, products, inventory);
  const consent = createConsent(store);

  const refresh = () => {
    document.getElementById('sepet-sayac').textContent = String(cart.count());
    account.update();
    actions.themeBtn.setAttribute('aria-pressed', String(theme.current() === 'dark'));
  };
  actions.themeBtn.addEventListener('click', () => { theme.toggle(); refresh(); });
  refresh();

  async function requireConsent() {
    if (consent.status().granted) return true;
    const opener = document.activeElement;
    const choices = await askConsent();
    if (choices) consent.grant(choices);
    if (opener && typeof opener.focus === 'function') opener.focus();
    return !!choices;
  }

  // Favoriler oturumdaki kullanıcıya (yoksa misafire) aittir; her çağrıda güncel sahip alınır.
  const wishlist = () => createWishlist(store, auth.current()?.id ?? null);

  return { store, products, inventory, cart, auth, consent, notify, wishlist, requireConsent, refresh };
}

// İzin penceresi: kabulde seçimleri, vazgeçişte null döner.
function askConsent() {
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
      el('p', { class: 'consent__text' }, t('Çınar Gold Kuyumculuk olarak adınız, e-postanız, telefonunuz ve sipariş bilgileriniz hesabınızı yönetmek, siparişinizi hazırlamak ve stok bildirimi yapmak amacıyla işlenir. Bu demo sürümde veriler yalnızca bu tarayıcıda saklanır. İzninizi dilediğiniz zaman hesap sayfasından geri alabilirsiniz.')),
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
