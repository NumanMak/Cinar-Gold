import { mountShell } from '../shell.js';
import { el, formatTL, productImg } from '../ui.js';
import { t, translateDocument } from '../i18n.js';
import { productName } from '../names.js';

translateDocument();
const ctx = await mountShell({ page: 'cart' });
const { cart, store, inventory, products, api } = ctx;
const root = document.getElementById('sepet');
let code = store.get('coupon', '');
let flash = ''; // sepet yeniden çizildikten sonra formda gösterilecek hata metni

const ERRORS = {
  SIPARIS_GECERSIZ: 'Sepetinizdeki bazı ürünlerin stoğu değişti. Lütfen sepeti gözden geçirin.',
  STOK_YETERSIZ: 'Stokta bu kadar adet yok.',
  SEPET_BOS: 'Sepetiniz boş.',
  ZORUNLU_ALAN: 'Ad soyad, telefon, ödeme yöntemi ve (adrese teslimde) en az 10 karakterlik açık adresi doldurun.',
  SUNUCU_YOK: 'Sunucuya ulaşılamadı, tekrar deneyin.',
  COK_FAZLA_ISTEK: 'Çok fazla deneme yapıldı, lütfen biraz bekleyip tekrar deneyin.',
};
// Sepeti değiştirmiş olabilecek hatalar: sepet yeniden çizilir ve mesaj yeni formda gösterilir.
const STALE = ['SIPARIS_GECERSIZ', 'STOK_YETERSIZ', 'SEPET_BOS', 'URUN_YOK'];
const ERROR_ALIAS = { URUN_YOK: 'SIPARIS_GECERSIZ' };
const errorText = (code) => { const k = ERROR_ALIAS[code] ?? code; return ERRORS[k] ? t(ERRORS[k]) : t('Sipariş oluşturulamadı, tekrar deneyin.'); };

// Sipariş satırı adı: katalogdaki güncel dilde ad; ürün kalktıysa siparişte kayıtlı ad.
const lineName = (l) => {
  const p = products.find((x) => x.id === l.id);
  return p ? productName(p) : l.name;
};

function changed() {
  ctx.refresh();
  render();
}

function lineRow(l) {
  const { product: p, qty } = l;
  const max = Math.max(1, Math.min(inventory.stockOf(p.id), 10));
  const sel = el('select', { 'aria-label': t('{name} adedi', { name: productName(p) }) },
    ...Array.from({ length: Math.max(max, qty) }, (_, i) => el('option', { value: String(i + 1) }, String(i + 1))));
  sel.value = String(qty);
  sel.addEventListener('change', () => {
    try { cart.setQty(p.id, Number(sel.value)); } catch (e) { /* stok aşımı: toplam yeniden hesaplanınca uyarı görünür */ }
    changed();
  });
  const rm = el('button', { class: 'link-btn', type: 'button' }, t('Kaldır'));
  rm.addEventListener('click', () => { cart.remove(p.id); changed(); });
  return el('li', { class: 'cline' },
    el('a', { class: 'cline__img', href: `urun.html?id=${encodeURIComponent(p.id)}` }, productImg(p, '96px')),
    el('div', { class: 'cline__info' },
      el('a', { class: 'cline__name', href: `urun.html?id=${encodeURIComponent(p.id)}` }, productName(p)),
      el('span', { class: 'cline__unit' }, `${formatTL(p.price)} x`),
      el('label', { class: 'field field--inline' }, el('span', {}, t('Adet')), sel), rm),
    el('strong', { class: 'cline__total' }, formatTL(l.lineTotal)));
}

function summary(q) {
  const row = (k, v, cls = '') => el('div', { class: `sum__row ${cls}` }, el('dt', {}, k), el('dd', {}, v));
  return el('dl', { class: 'sum' },
    row(t('Ara toplam'), formatTL(q.subtotal)),
    ...(q.couponValid ? [row(t('İndirim (CINAR10)'), `- ${formatTL(q.discount)}`, 'sum__row--disc')] : []),
    row(t('Toplam'), formatTL(q.total), 'sum__row--total'));
}

function couponForm(q) {
  const input = el('input', { type: 'text', name: 'kupon', placeholder: t('İndirim kodu'), autocomplete: 'off', value: code });
  const msg = el('p', { class: 'form-msg', role: 'status' }, code ? (q.couponValid ? t('%10 indirim uygulandı.') : t('Kupon kodu geçerli değil.')) : '');
  const form = el('form', { class: 'coupon' }, el('label', { class: 'field' }, el('span', {}, t('İndirim kodu')), input),
    el('button', { class: 'btn btn--line btn--sm', type: 'submit' }, t('Uygula')), msg);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    code = input.value.trim();
    store.set('coupon', code);
    render();
  });
  return form;
}

function orderForm(q) {
  const user = ctx.me();
  const name = el('input', { type: 'text', name: 'ad', autocomplete: 'name', required: '', value: user ? user.name : '' });
  const phone = el('input', { type: 'tel', name: 'telefon', autocomplete: 'tel', required: '', value: user ? user.phone : '' });
  const address = el('textarea', { name: 'adres', rows: '3', autocomplete: 'street-address', placeholder: t('Mahalle, cadde/sokak, bina ve daire no, ilçe, il') }, user ? user.address : '');
  // Kayıtlı adresler: seçilince metin alanı dolar; "Yeni adres" metni boşaltır.
  const saved = el('select', { name: 'kayitli-adres', 'aria-label': t('Kayıtlı adreslerim') },
    ...(user ? user.addresses.map((a) => el('option', { value: a.id }, `${a.title}${a.isDefault ? t(' (varsayılan)') : ''}`)) : []),
    el('option', { value: '' }, t('Yeni adres gir')));
  if (user && user.addresses.length) saved.value = (user.addresses.find((a) => a.isDefault) ?? user.addresses[0]).id;
  saved.addEventListener('change', () => {
    const a = user.addresses.find((x) => x.id === saved.value);
    address.value = a ? a.text : '';
  });
  const addressField = el('div', { class: 'field', id: 'adres-alani', hidden: '' },
    ...(user && user.addresses.length ? [el('label', { class: 'field' }, el('span', {}, t('Kayıtlı adreslerim')), saved)] : []),
    el('label', { class: 'field' }, el('span', {}, t('Teslimat adresi')), address));
  const deliver = (value, text, checked) => el('label', { class: 'check' }, el('input', { type: 'radio', name: 'teslimat', value, ...(checked ? { checked: '' } : {}) }), el('span', {}, text));
  const pay = (value, text, checked) => el('label', { class: 'check' }, el('input', { type: 'radio', name: 'odeme', value, ...(checked ? { checked: '' } : {}) }), el('span', {}, text));
  const msg = el('p', { class: 'form-msg', role: 'alert' }, flash);
  flash = '';
  const submit = el('button', { class: 'btn btn--gold', type: 'submit' }, t('Siparişi tamamla'));
  if (q.problems.length) submit.disabled = true;
  const form = el('form', { class: 'order-form' },
    el('h2', { class: 'order-form__title' }, t('Sipariş bilgileri')),
    ...(user ? [] : [el('p', { class: 'form-msg' }, t('Hesabınız varsa '), el('a', { class: 'link-btn', href: 'hesap.html' }, t('giriş yapın')), t(', bilgileriniz otomatik dolsun.'))]),
    el('label', { class: 'field' }, el('span', {}, t('Ad soyad')), name),
    el('label', { class: 'field' }, el('span', {}, t('Telefon')), phone),
    el('fieldset', { class: 'order-form__pay' }, el('legend', {}, t('Teslimat')),
      deliver('magaza', t('Mağazadan teslim (Atatürk Cd. No:25/A, Fethiye)'), true), deliver('adres', t('Adrese teslim'), false)),
    addressField,
    el('fieldset', { class: 'order-form__pay' }, el('legend', {}, t('Ödeme yöntemi')),
      pay('havale', t('Havale / EFT'), true), pay('magaza', t('Mağazada ödeme'), false)),
    el('p', { class: 'form-msg' }, t('Demo mağaza: sipariş yalnızca bu tarayıcıda kaydedilir, ödeme alınmaz. Onay için mağazamız sizinle WhatsApp üzerinden iletişime geçer.')),
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
        msg.textContent = t('Siparişi tamamlamak için kişisel veriler konusunda izin vermeniz gerekiyor.');
        submit.disabled = false;
        return;
      }
      // Fiyat ve kupon sunucuda hesaplanır; yalnızca ürün kimliği ve adet gönderilir.
      const order = await api.orders.place(cart.items(), {
        name: name.value, phone: phone.value,
        payment: form.elements.odeme.value, delivery: form.elements.teslimat.value, address: address.value,
      }, code);
      cart.clear();
      store.remove('coupon');
      code = '';
      if (user) {
        // Hesap bilgilerinin güncellenmesi sipariş için zorunlu değildir; başarısız olursa sipariş yine geçerlidir.
        try {
          await api.auth.updateProfile({ phone: phone.value });
          if (order.delivery === 'adres' && !user.addresses.some((a) => a.text === order.address)) {
            await api.auth.addresses.add({ title: t('Adresim {n}', { n: user.addresses.length + 1 }), text: order.address });
          }
          await ctx.reloadMe();
        } catch (e) { console.error(e); }
      }
      await ctx.reloadStock();
      ctx.refresh();
      showSuccess(order);
    } catch (err) {
      const text = errorText(err.message);
      if (STALE.includes(err.message)) {
        flash = text; // sepet değişmiş olabilir: stok yenilenir, yeniden çizilir, mesaj yeni formda gösterilir
        await ctx.reloadStock();
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
  const text = t('Merhaba, {id} numaralı siparişimi onaylamak istiyorum. Toplam: {total}', { id: order.id, total: formatTL(order.total) });
  root.replaceChildren(
    el('div', { class: 'done', role: 'status' },
      el('h2', { class: 'done__title' }, t('Siparişiniz alındı')),
      el('p', {}, t('Sipariş numaranız: {id}', { id: order.id })),
      el('p', {}, t('Toplam: {total}', { total: formatTL(order.total) })),
      el('p', {}, order.delivery === 'adres' ? t('Teslimat adresi: {adres}', { adres: order.address }) : t('Teslimat: Mağazadan teslim (Atatürk Cd. No:25/A, Fethiye)')),
      el('ul', { class: 'done__list' }, ...order.lines.map((l) => el('li', {}, `${l.qty} x ${lineName(l)}`))),
      el('div', { class: 'pdetail__buy' },
        el('a', { class: 'btn btn--gold', href: `https://wa.me/905073517347?text=${encodeURIComponent(text)}`, target: '_blank', rel: 'noopener' }, t('WhatsApp ile onayla')),
        el('a', { class: 'btn btn--line', href: 'magaza.html' }, t('Alışverişe devam et')),
        el('a', { class: 'btn btn--line', href: 'hesap.html' }, t('Siparişlerim')))));
}

function issueText(i) {
  if (i.kind === 'gone') return t('{id}: ürün artık yok', { id: i.id });
  const p = products.find((x) => x.id === i.id);
  return t('{name}: stokta yalnızca {n} adet var', { name: p ? productName(p) : i.id, n: i.left });
}

function render() {
  const q = cart.quote(code);
  if (!cart.items().length) {
    root.replaceChildren(el('p', { class: 'shop-lead' }, t('Sepetiniz boş.')), el('a', { class: 'btn btn--gold', href: 'magaza.html' }, t('Mağazaya git')));
    return;
  }
  let problems = null;
  if (q.problems.length) {
    const clear = el('button', { class: 'link-btn', type: 'button' }, t('Sepeti temizle'));
    clear.addEventListener('click', () => { cart.clear(); changed(); });
    problems = el('div', { class: 'problems', role: 'alert' }, el('ul', {}, ...q.issues.map((i) => el('li', {}, issueText(i)))), clear);
  }
  root.replaceChildren(el('div', { class: 'cart-grid' },
    el('div', {}, el('ul', { class: 'clines' }, ...q.lines.map(lineRow)), ...(problems ? [problems] : [])),
    el('aside', { class: 'cart-side' }, summary(q), couponForm(q), orderForm(q))));
}

render();
