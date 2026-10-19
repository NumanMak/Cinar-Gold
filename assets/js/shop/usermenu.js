// Üst bilgideki hesap alanı: misafirde "Giriş yap" düğmesi, girişte kullanıcı menüsü.
// Menü Baymard'ın hesap menüsü bulgularına göre ikiye ayrılır: sık kullanılan birincil bağlantılar ve daha sönük ikincil bağlantılar.
import { el } from './ui.js';
import { t } from './i18n.js';

const ICON_USER = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 20c.6-3.6 3.4-5.5 7-5.5s6.4 1.9 7 5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const ICON_CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toLocaleUpperCase('tr') ?? '').join('') || '?';

export function createAccountControl() {
  const root = el('div', { class: 'shop-account' });
  let cleanup = null;

  function renderGuest() {
    root.replaceChildren(el('a', { class: 'shop-login', href: 'hesap.html', html: ICON_USER }, el('span', {}, t('Giriş yap'))));
  }

  function renderUser(user, counts, api) {
    const { orders, favorites, alerts, pending: pendingCount } = counts;

    const link = (href, text, count, cls = '') => {
      const a = el('a', { class: `usermenu__item ${cls}`.trim(), href, role: 'menuitem', tabindex: '-1' }, text);
      if (count) a.append(el('span', { class: 'usermenu__count' }, String(count)));
      return a;
    };
    const logout = el('button', { class: 'usermenu__item usermenu__item--quiet', type: 'button', role: 'menuitem', tabindex: '-1' }, t('Çıkış yap'));
    const whatsapp = el('a', { class: 'usermenu__item usermenu__item--quiet', href: 'https://wa.me/905073517347', target: '_blank', rel: 'noopener', role: 'menuitem', tabindex: '-1' }, t('Destek: WhatsApp'));
    const items = [
      link('hesap.html#siparisler', t('Siparişlerim'), orders),
      link('hesap.html#favoriler', t('Favorilerim'), favorites),
      link('hesap.html#adresler', t('Adreslerim')),
      link('hesap.html#bilgiler', t('Hesap bilgilerim')),
      link('hesap.html#bildirimler', t('Stok bildirimlerim'), alerts, 'usermenu__item--quiet'),
      link('hesap.html#izinler', t('İzinler ve gizlilik'), 0, 'usermenu__item--quiet'),
      whatsapp, logout,
    ];
    // Yönetici hesabına özel bağlantı, birincil grubun en üstünde.
    if (user.role === 'admin') items.unshift(link('admin.html', t('Yönetim paneli'), pendingCount, ''));
    const primaryCount = user.role === 'admin' ? 5 : 4;
    const panel = el('div', { class: 'usermenu__panel', id: 'kullanici-menusu', role: 'menu', 'aria-label': t('Kullanıcı menüsü'), hidden: '' },
      el('div', { class: 'usermenu__who' }, el('strong', {}, user.name), el('span', {}, user.email)),
      el('div', { class: 'usermenu__group', role: 'none' }, ...items.slice(0, primaryCount)),
      el('div', { class: 'usermenu__group usermenu__group--quiet', role: 'none' }, ...items.slice(primaryCount)));
    const btn = el('button', { class: 'usermenu__btn', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'kullanici-menusu' },
      el('span', { class: 'usermenu__avatar', 'aria-hidden': 'true' }, initials(user.name)),
      el('span', { class: 'usermenu__name' }, user.name.trim().split(/\s+/)[0]),
      el('span', { class: 'usermenu__chev', html: ICON_CHEVRON }));
    btn.append(el('span', { class: 'visually-hidden' }, t(' hesap menüsü')));

    const setOpen = (open, focusBtn = false) => {
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) items[0].focus();
      else if (focusBtn) btn.focus();
    };
    const move = (from, step) => {
      const i = items.indexOf(document.activeElement);
      items[(i + step + items.length) % items.length].focus();
      return from;
    };

    btn.addEventListener('click', () => setOpen(panel.hidden));
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } });
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false, true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); move(null, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(null, -1); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Tab') setOpen(false);
    });
    panel.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    logout.addEventListener('click', async () => { try { await api.auth.signOut(); } finally { location.assign('hesap.html'); } });

    const onDocClick = (e) => { if (!root.contains(e.target)) setOpen(false); };
    document.addEventListener('click', onDocClick);
    cleanup = () => document.removeEventListener('click', onDocClick);

    root.replaceChildren(btn, panel);
  }

  return {
    node: root,
    update(user, counts, api) {
      if (cleanup) { cleanup(); cleanup = null; }
      if (user) renderUser(user, counts, api);
      else renderGuest();
    },
  };
}
