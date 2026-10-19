import { mountShell } from '../shell.js';
import { el, formatTL, productImg, stockBadge, addToCart, openNotify, productCard, favoriteButton } from '../ui.js';

// Pixabay fotoğrafları temsilidir; fotoğrafçı adı kaynağa bağlanır.
function photoCredit(p) {
  const c = p.imageCredit;
  if (!c) return el('span', {});
  return el('p', { class: 'pdetail__credit' }, 'Görsel temsilidir. Fotoğraf: ',
    el('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.author), ` / ${c.source}`);
}

const ctx = await mountShell({ page: 'product' });
const root = document.getElementById('urun');
const id = new URLSearchParams(location.search).get('id');
const p = ctx.products.find((x) => x.id === id);

if (!p) {
  root.append(el('h1', { class: 'shop-title' }, 'Ürün bulunamadı'),
    el('p', { class: 'shop-lead' }, 'Aradığınız ürün artık satışta olmayabilir. Mağazadaki diğer modellere göz atın.'),
    el('a', { class: 'btn btn--gold', href: 'magaza.html' }, 'Mağazaya git'));
  document.title = 'Ürün bulunamadı | Çınar Gold Kuyumculuk';
} else {
  document.title = `${p.name} | Çınar Gold Kuyumculuk`;
  const stock = ctx.inventory.stockOf(p.id);
  const msg = el('p', { class: 'form-msg', role: 'status' });
  const buy = el('div', { class: 'pdetail__buy' });

  if (stock > 0) {
    const qty = el('select', { id: 'adet', 'aria-label': 'Adet' },
      ...Array.from({ length: Math.min(stock, 10) }, (_, i) => el('option', { value: String(i + 1) }, String(i + 1))));
    const add = el('button', { class: 'btn btn--gold', type: 'button' }, 'Sepete ekle');
    add.addEventListener('click', () => addToCart(p, Number(qty.value), ctx, msg));
    buy.append(el('label', { class: 'field field--inline' }, el('span', {}, 'Adet'), qty), add,
      el('a', { class: 'btn btn--line', href: 'sepet.html' }, 'Sepete git'));
  } else {
    const notify = el('button', { class: 'btn btn--line', type: 'button' }, 'Bana bildir');
    notify.addEventListener('click', () => openNotify(p, ctx));
    buy.append(el('p', { class: 'form-msg' }, 'Bu ürün şu an tükendi. Stok gelince haber verebiliriz.'), notify);
  }

  root.append(el('div', { class: 'pdetail' },
    el('div', { class: 'pdetail__media' }, productImg(p), photoCredit(p)),
    el('div', { class: 'pdetail__info' },
      el('p', { class: 'pdetail__eyebrow' }, `${p.typeLabel}, ${p.model} modeli`),
      el('h1', { class: 'shop-title' }, p.name),
      el('p', { class: 'pdetail__price' }, formatTL(p.price)),
      el('p', {}, stockBadge(stock)),
      el('p', { class: 'pdetail__desc' }, p.desc),
      el('div', { class: 'pdetail__fav' }, favoriteButton(p, ctx), el('span', {}, 'Favorilere ekle')),
      el('dl', { class: 'pdetail__specs' },
        el('div', {}, el('dt', {}, 'Ayar'), el('dd', {}, `${p.karat} ayar`)),
        el('div', {}, el('dt', {}, 'Ağırlık'), el('dd', {}, `${String(p.gram).replace('.', ',')} gram`))),
      buy, msg)));
  root.querySelector('img').setAttribute('loading', 'eager');

  // Benzer ürünler: önce aynı model, sonra aynı türün diğer modelleri.
  const same = ctx.products.filter((x) => x.id !== p.id && x.type === p.type);
  const similar = [...same.filter((x) => x.model === p.model), ...same.filter((x) => x.model !== p.model)].slice(0, 4);
  if (similar.length) {
    root.append(el('section', { class: 'similar', 'aria-labelledby': 'benzer-baslik' },
      el('h2', { id: 'benzer-baslik', class: 'order-form__title' }, 'Benzer ürünler'),
      el('ul', { class: 'shop-grid' }, ...similar.map((x) => productCard(x, ctx)))));
  }
}
