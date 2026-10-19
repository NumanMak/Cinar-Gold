// Mağaza sayfalarının ortak arayüz parçaları. Kullanıcıdan veya katalogdan gelen metin yalnızca textContent ile yazılır.
import { t, getLang } from './i18n.js';
import { productName } from './names.js';

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v; // yalnızca koddaki sabit SVG metinleri için
    else node.setAttribute(k, v);
  }
  node.append(...kids);
  return node;
}

// Türkçe: 12.560 ₺   İngilizce: ₺12,560
export const formatTL = (n) => (getLang() === 'en' ? `₺${n.toLocaleString('en-US')}` : `${n.toLocaleString('tr-TR')} ₺`);
export const formatGram = (g) => (getLang() === 'en' ? String(g) : String(g).replace('.', ','));

export function stockInfo(stock) {
  if (stock <= 0) return { text: t('Tükendi'), level: 'out' };
  if (stock <= 3) return { text: t('Son {n} adet', { n: stock }), level: 'low' };
  return { text: t('Stokta'), level: 'ok' };
}

export function productImg(p) {
  return el('img', { src: p.image, width: '900', height: '900', loading: 'lazy', decoding: 'async', alt: productName(p) });
}

export function stockBadge(stock) {
  const s = stockInfo(stock);
  return el('span', { class: `stock stock--${s.level}` }, s.text);
}

// Stok 0 iken "Bana bildir": önce izin, sonra iletişim formu.
export async function openNotify(product, ctx) {
  if (!(await ctx.requireConsent())) return;
  const opener = document.activeElement;
  const email = el('input', { type: 'email', name: 'email', autocomplete: 'email', placeholder: t('E-posta'), value: ctx.me()?.email ?? '' });
  const phone = el('input', { type: 'tel', name: 'phone', autocomplete: 'tel', placeholder: t('Telefon (isteğe bağlı)') });
  const msg = el('p', { class: 'form-msg', role: 'status' });
  const send = el('button', { class: 'btn btn--gold', type: 'submit' }, t('Haber ver'));
  const close = el('button', { class: 'btn btn--line', type: 'button' }, t('Kapat'));
  const form = el('form', { method: 'dialog', class: 'consent__form' },
    el('h2', { id: 'bildir-baslik', class: 'consent__title' }, t('Stok gelince haber verelim')),
    el('p', { class: 'consent__text' }, productName(product)),
    el('label', { class: 'field' }, el('span', {}, t('E-posta')), email),
    el('label', { class: 'field' }, el('span', {}, t('Telefon')), phone),
    msg,
    el('div', { class: 'consent__actions' }, close, send));
  const dialog = el('dialog', { class: 'consent', 'aria-labelledby': 'bildir-baslik' }, form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    send.disabled = true;
    try {
      await ctx.api.alerts.add({ productId: product.id, email: email.value, phone: phone.value });
      msg.textContent = t('Stok gelince size haber vereceğiz.');
    } catch (err) {
      send.disabled = false;
      msg.textContent = err.message === 'ZORUNLU_ALAN' ? t('E-posta ya da telefon girin.') : t('Kaydedilemedi, tekrar deneyin.');
    }
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { dialog.remove(); if (opener?.focus) opener.focus(); });
  document.body.append(dialog);
  dialog.showModal();
  email.focus();
}

export function addToCart(product, qty, ctx, msgEl) {
  try {
    ctx.cart.add(product.id, qty);
    ctx.refresh();
    if (msgEl) msgEl.textContent = t('Sepete eklendi.');
    return true;
  } catch (err) {
    if (msgEl) msgEl.textContent = err.message === 'STOK_YETERSIZ' ? t('Stokta bu kadar adet yok.') : t('Ürün eklenemedi.');
    return false;
  }
}

const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';

// Favori kalbi: basınca ekler/çıkarır; onChange(newState) sayfaya haber verir.
export function favoriteButton(p, ctx, onChange) {
  const btn = el('button', { class: 'fav', type: 'button', html: HEART });
  const label = el('span', { class: 'visually-hidden' });
  btn.append(label);
  const sync = () => {
    const on = ctx.wishlist.has(p.id);
    btn.setAttribute('aria-pressed', String(on));
    label.textContent = on ? t('{name} favorilerden çıkar', { name: productName(p) }) : t('{name} favorilere ekle', { name: productName(p) });
  };
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    const pending = ctx.wishlist.toggle(p.id);
    sync(); // iyimser: ekran hemen güncellenir
    try {
      const on = await pending;
      sync();
      ctx.refresh();
      if (onChange) onChange(on);
    } catch (err) {
      sync(); // sunucu reddetti: önbellek geri alındı
    } finally {
      btn.disabled = false;
    }
  });
  sync();
  return btn;
}

export function productCard(p, ctx, onFavoriteChange) {
  const stock = ctx.inventory.stockOf(p.id);
  const msg = el('span', { class: 'form-msg', role: 'status' });
  const action = stock > 0
    ? el('button', { class: 'btn btn--gold btn--sm', type: 'button' }, t('Sepete ekle'))
    : el('button', { class: 'btn btn--line btn--sm', type: 'button' }, t('Bana bildir'));
  action.addEventListener('click', () => {
    if (stock > 0) addToCart(p, 1, ctx, msg);
    else openNotify(p, ctx);
  });
  return el('li', { class: 'pcard' },
    el('div', { class: 'pcard__top' },
      el('a', { class: 'pcard__media', href: `urun.html?id=${encodeURIComponent(p.id)}` }, productImg(p)),
      favoriteButton(p, ctx, onFavoriteChange)),
    el('div', { class: 'pcard__body' },
      el('h3', { class: 'pcard__name' }, el('a', { href: `urun.html?id=${encodeURIComponent(p.id)}` }, productName(p))),
      el('p', { class: 'pcard__meta' }, t('{karat} ayar, {gram} g', { karat: p.karat, gram: formatGram(p.gram) })),
      el('div', { class: 'pcard__row' }, el('strong', { class: 'pcard__price' }, formatTL(p.price)), stockBadge(stock)),
      el('div', { class: 'pcard__actions' }, action, msg)));
}
