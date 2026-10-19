import { mountShell } from '../shell.js';
import { placeOrder } from '../orders.js';
import { el, formatTL, productImg } from '../ui.js';

const ctx = await mountShell({ page: 'cart' });
const { cart, store, inventory, products, auth } = ctx;
const root = document.getElementById('sepet');
let code = store.get('coupon', '');
let flash = ''; // sepet yeniden çizildikten sonra formda gösterilecek hata metni

const ERRORS = {
  SIPARIS_GECERSIZ: 'Sepetinizdeki bazı ürünlerin stoğu değişti. Lütfen sepeti gözden geçirin.',
  STOK_YETERSIZ: 'Stokta bu kadar adet yok.',
  SEPET_BOS: 'Sepetiniz boş.',
  ZORUNLU_ALAN: 'Ad soyad, telefon, ödeme yöntemi ve (adrese teslimde) en az 10 karakterlik açık adresi doldurun.',
};

function changed() {
  ctx.refresh();
  render();
}

function lineRow(l) {
  const { product: p, qty } = l;
  const max = Math.max(1, Math.min(inventory.stockOf(p.id), 10));
  const sel = el('select', { 'aria-label': `${p.name} adedi` },
    ...Array.from({ length: Math.max(max, qty) }, (_, i) => el('option', { value: String(i + 1) }, String(i + 1))));
  sel.value = String(qty);
  sel.addEventListener('change', () => {
    try { cart.setQty(p.id, Number(sel.value)); } catch (e) { /* stok aşımı: toplam yeniden hesaplanınca uyarı görünür */ }
    changed();
  });
  const rm = el('button', { class: 'link-btn', type: 'button' }, 'Kaldır');
  rm.addEventListener('click', () => { cart.remove(p.id); changed(); });
  return el('li', { class: 'cline' },
    el('a', { class: 'cline__img', href: `urun.html?id=${encodeURIComponent(p.id)}` }, productImg(p, '96px')),
    el('div', { class: 'cline__info' },
      el('a', { class: 'cline__name', href: `urun.html?id=${encodeURIComponent(p.id)}` }, p.name),
      el('span', { class: 'cline__unit' }, `${formatTL(p.price)} x`),
      el('label', { class: 'field field--inline' }, el('span', {}, 'Adet'), sel), rm),
    el('strong', { class: 'cline__total' }, formatTL(l.lineTotal)));
}

function summary(q) {
  const row = (k, v, cls = '') => el('div', { class: `sum__row ${cls}` }, el('dt', {}, k), el('dd', {}, v));
  return el('dl', { class: 'sum' },
    row('Ara toplam', formatTL(q.subtotal)),
    ...(q.couponValid ? [row('İndirim (CINAR10)', `- ${formatTL(q.discount)}`, 'sum__row--disc')] : []),
    row('Toplam', formatTL(q.total), 'sum__row--total'));
}

function couponForm(q) {
  const input = el('input', { type: 'text', name: 'kupon', placeholder: 'İndirim kodu', autocomplete: 'off', value: code });
  const msg = el('p', { class: 'form-msg', role: 'status' }, code ? (q.couponValid ? '%10 indirim uygulandı.' : 'Kupon kodu geçerli değil.') : '');
  const form = el('form', { class: 'coupon' }, el('label', { class: 'field' }, el('span', {}, 'İndirim kodu'), input),
    el('button', { class: 'btn btn--line btn--sm', type: 'submit' }, 'Uygula'), msg);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    code = input.value.trim();
    store.set('coupon', code);
    render();
  });
  return form;
}

function orderForm(q) {
  const user = auth.current();
  const name = el('input', { type: 'text', name: 'ad', autocomplete: 'name', required: '', value: user ? user.name : '' });
  const phone = el('input', { type: 'tel', name: 'telefon', autocomplete: 'tel', required: '', value: user ? user.phone : '' });
  const address = el('textarea', { name: 'adres', rows: '3', autocomplete: 'street-address', placeholder: 'Mahalle, cadde/sokak, bina ve daire no, ilçe, il' }, user ? user.address : '');
  const addressField = el('label', { class: 'field', id: 'adres-alani', hidden: '' }, el('span', {}, 'Teslimat adresi'), address);
  const deliver = (value, text, checked) => el('label', { class: 'check' }, el('input', { type: 'radio', name: 'teslimat', value, ...(checked ? { checked: '' } : {}) }), el('span', {}, text));
  const pay = (value, text, checked) => el('label', { class: 'check' }, el('input', { type: 'radio', name: 'odeme', value, ...(checked ? { checked: '' } : {}) }), el('span', {}, text));
  const msg = el('p', { class: 'form-msg', role: 'alert' }, flash);
  flash = '';
  const submit = el('button', { class: 'btn btn--gold', type: 'submit' }, 'Siparişi tamamla');
  if (q.problems.length) submit.disabled = true;
  const form = el('form', { class: 'order-form' },
    el('h2', { class: 'order-form__title' }, 'Sipariş bilgileri'),
    ...(user ? [] : [el('p', { class: 'form-msg' }, 'Hesabınız varsa ', el('a', { class: 'link-btn', href: 'hesap.html' }, 'giriş yapın'), ', bilgileriniz otomatik dolsun.')]),
    el('label', { class: 'field' }, el('span', {}, 'Ad soyad'), name),
    el('label', { class: 'field' }, el('span', {}, 'Telefon'), phone),
    el('fieldset', { class: 'order-form__pay' }, el('legend', {}, 'Teslimat'),
      deliver('magaza', 'Mağazadan teslim (Atatürk Cd. No:25/A, Fethiye)', true), deliver('adres', 'Adrese teslim', false)),
    addressField,
    el('fieldset', { class: 'order-form__pay' }, el('legend', {}, 'Ödeme yöntemi'),
      pay('havale', 'Havale / EFT', true), pay('magaza', 'Mağazada ödeme', false)),
    el('p', { class: 'form-msg' }, 'Demo mağaza: sipariş yalnızca bu tarayıcıda kaydedilir, ödeme alınmaz. Onay için mağazamız sizinle WhatsApp üzerinden iletişime geçer.'),
    msg, submit);

  const syncDelivery = () => {
    const toAddress = form.elements.teslimat.value === 'adres';
    addressField.hidden = !toAddress;
    address.required = toAddress;
  };
  form.addEventListener('change', (e) => { if (e.target.name === 'teslimat') syncDelivery(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    msg.textContent = '';
    try {
      if (!(await ctx.requireConsent())) {
        msg.textContent = 'Siparişi tamamlamak için kişisel veriler konusunda izin vermeniz gerekiyor.';
        submit.disabled = false;
        return;
      }
      const order = placeOrder({ store, products, inventory, cart }, {
        userId: user ? user.id : null, name: name.value, phone: phone.value,
        payment: form.elements.odeme.value, delivery: form.elements.teslimat.value, address: address.value, code,
      });
      if (user) auth.updateProfile({ phone: phone.value, ...(order.delivery === 'adres' ? { address: order.address } : {}) });
      store.remove('coupon');
      code = '';
      ctx.refresh();
      showSuccess(order);
    } catch (err) {
      const text = ERRORS[err.message] ?? 'Sipariş oluşturulamadı, tekrar deneyin.';
      if (err.message === 'SIPARIS_GECERSIZ' || err.message === 'STOK_YETERSIZ' || err.message === 'SEPET_BOS') {
        flash = text; // sepet değişmiş olabilir: yeniden çiz, mesajı yeni formda göster
        changed();
      } else {
        msg.textContent = text; // form olduğu gibi kalır, yazılanlar silinmez
        submit.disabled = false;
      }
    }
  });
  return form;
}

function showSuccess(order) {
  const text = `Merhaba, ${order.id} numaralı siparişimi onaylamak istiyorum. Toplam: ${formatTL(order.total)}`;
  root.replaceChildren(
    el('div', { class: 'done', role: 'status' },
      el('h2', { class: 'done__title' }, 'Siparişiniz alındı'),
      el('p', {}, `Sipariş numaranız: ${order.id}`),
      el('p', {}, `Toplam: ${formatTL(order.total)}`),
      el('p', {}, order.delivery === 'adres' ? `Teslimat adresi: ${order.address}` : 'Teslimat: Mağazadan teslim (Atatürk Cd. No:25/A, Fethiye)'),
      el('ul', { class: 'done__list' }, ...order.lines.map((l) => el('li', {}, `${l.qty} x ${l.name}`))),
      el('div', { class: 'pdetail__buy' },
        el('a', { class: 'btn btn--gold', href: `https://wa.me/905073517347?text=${encodeURIComponent(text)}`, target: '_blank', rel: 'noopener' }, 'WhatsApp ile onayla'),
        el('a', { class: 'btn btn--line', href: 'magaza.html' }, 'Alışverişe devam et'),
        el('a', { class: 'btn btn--line', href: 'hesap.html' }, 'Siparişlerim'))));
}

function render() {
  const q = cart.quote(code);
  if (!cart.items().length) {
    root.replaceChildren(el('p', { class: 'shop-lead' }, 'Sepetiniz boş.'), el('a', { class: 'btn btn--gold', href: 'magaza.html' }, 'Mağazaya git'));
    return;
  }
  let problems = null;
  if (q.problems.length) {
    const clear = el('button', { class: 'link-btn', type: 'button' }, 'Sepeti temizle');
    clear.addEventListener('click', () => { cart.clear(); changed(); });
    problems = el('div', { class: 'problems', role: 'alert' }, el('ul', {}, ...q.problems.map((t) => el('li', {}, t))), clear);
  }
  root.replaceChildren(el('div', { class: 'cart-grid' },
    el('div', {}, el('ul', { class: 'clines' }, ...q.lines.map(lineRow)), ...(problems ? [problems] : [])),
    el('aside', { class: 'cart-side' }, summary(q), couponForm(q), orderForm(q))));
}

render();
