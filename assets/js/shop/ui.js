// Mağaza sayfalarının ortak arayüz parçaları. Kullanıcıdan veya katalogdan gelen metin yalnızca textContent ile yazılır.

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

export const formatTL = (n) => `${n.toLocaleString('tr-TR')} ₺`;

export function stockInfo(stock) {
  if (stock <= 0) return { text: 'Tükendi', level: 'out' };
  if (stock <= 3) return { text: `Son ${stock} adet`, level: 'low' };
  return { text: 'Stokta', level: 'ok' };
}

export function productImg(p, sizes = '(min-width: 900px) 25vw, 50vw') {
  return el('img', {
    src: `assets/img/${p.img}-640.webp`,
    srcset: `assets/img/${p.img}-640.webp 640w, assets/img/${p.img}-1080.webp 1080w`,
    sizes, width: '1080', height: '1350', loading: 'lazy', decoding: 'async', alt: p.name,
  });
}

export function stockBadge(stock) {
  const s = stockInfo(stock);
  return el('span', { class: `stock stock--${s.level}` }, s.text);
}

// Stok 0 iken "Bana bildir": önce izin, sonra iletişim formu.
export async function openNotify(product, ctx) {
  if (!(await ctx.requireConsent())) return;
  const opener = document.activeElement;
  const email = el('input', { type: 'email', name: 'email', autocomplete: 'email', placeholder: 'E-posta' });
  const phone = el('input', { type: 'tel', name: 'phone', autocomplete: 'tel', placeholder: 'Telefon (isteğe bağlı)' });
  const msg = el('p', { class: 'form-msg', role: 'status' });
  const send = el('button', { class: 'btn btn--gold', type: 'submit' }, 'Haber ver');
  const close = el('button', { class: 'btn btn--line', type: 'button' }, 'Kapat');
  const form = el('form', { method: 'dialog', class: 'consent__form' },
    el('h2', { id: 'bildir-baslik', class: 'consent__title' }, 'Stok gelince haber verelim'),
    el('p', { class: 'consent__text' }, product.name),
    el('label', { class: 'field' }, el('span', {}, 'E-posta'), email),
    el('label', { class: 'field' }, el('span', {}, 'Telefon'), phone),
    msg,
    el('div', { class: 'consent__actions' }, close, send));
  const dialog = el('dialog', { class: 'consent', 'aria-labelledby': 'bildir-baslik' }, form);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      ctx.notify.add({ productId: product.id, email: email.value, phone: phone.value });
      msg.textContent = 'Stok gelince size haber vereceğiz.';
      send.disabled = true;
    } catch (err) {
      msg.textContent = err.message === 'ZORUNLU_ALAN' ? 'E-posta ya da telefon girin.' : 'Kaydedilemedi, tekrar deneyin.';
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
    if (msgEl) msgEl.textContent = 'Sepete eklendi.';
    return true;
  } catch (err) {
    if (msgEl) msgEl.textContent = err.message === 'STOK_YETERSIZ' ? 'Stokta bu kadar adet yok.' : 'Ürün eklenemedi.';
    return false;
  }
}

export function productCard(p, ctx) {
  const stock = ctx.inventory.stockOf(p.id);
  const msg = el('span', { class: 'form-msg', role: 'status' });
  const action = stock > 0
    ? el('button', { class: 'btn btn--gold btn--sm', type: 'button' }, 'Sepete ekle')
    : el('button', { class: 'btn btn--line btn--sm', type: 'button' }, 'Bana bildir');
  action.addEventListener('click', () => {
    if (stock > 0) addToCart(p, 1, ctx, msg);
    else openNotify(p, ctx);
  });
  return el('li', { class: 'pcard' },
    el('a', { class: 'pcard__media', href: `urun.html?id=${encodeURIComponent(p.id)}` }, productImg(p)),
    el('div', { class: 'pcard__body' },
      el('h3', { class: 'pcard__name' }, el('a', { href: `urun.html?id=${encodeURIComponent(p.id)}` }, p.name)),
      el('p', { class: 'pcard__meta' }, `${p.karat} ayar, ${String(p.gram).replace('.', ',')} g`),
      el('div', { class: 'pcard__row' }, el('strong', { class: 'pcard__price' }, formatTL(p.price)), stockBadge(stock)),
      el('div', { class: 'pcard__actions' }, action, msg)));
}
