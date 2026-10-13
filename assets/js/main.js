/* =========================================================================
   Çınar Gold Kuyumculuk  |  etkileşimler
   Açılış, yumuşak kaydırma (Lenis), yapışkan menü, kaydırma animasyonları,
   paralaks, 3D eğim, manyetik butonlar, ürün penceresi, açık/kapalı durumu,
   güncel altın fiyatları ve hero videosu.
   ========================================================================= */
(() => {
  'use strict';

  window.__cg = true; // <head> içindeki güvenlik ağı bu bayrağı bekler

  const doc = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mq = (q) => window.matchMedia(q);
  const reduceMotion = mq('(prefers-reduced-motion: reduce)');
  const finePointer = mq('(hover: hover) and (pointer: fine)');
  const motionOK = () => !reduceMotion.matches;

  /* --- Mağaza ayarları ---------------------------------------------------- */
  const PHONE = '905073517347';
  const FOUNDED = 1996;
  const HOURS = {
    tz: 'Europe/Istanbul',
    days: [0, 1, 2, 3, 4, 5, 6], // 0 = Pazar. Kapalı günler varsa buradan çıkarın.
    open: 8 * 60 + 30,
    close: 20 * 60,
    openText: '08:30’da',
    closeText: '20:00’de',
  };
  const PRICE_URL = 'https://finans.truncgil.com/v4/today.json';
  const PRICE_REFRESH_MS = 5 * 60 * 1000;

  const safe = (name, fn) => {
    try { fn(); } catch (err) { console.warn(`[cinar-gold] ${name}:`, err); }
  };
  const waLink = (msg) => `https://wa.me/${PHONE}?text=${encodeURIComponent(msg)}`;

  /* --- Elemanlar ---------------------------------------------------------- */
  const nav = $('.nav');
  const hero = $('.hero');
  const heroMedia = $('.hero__media');
  const heroContent = $('.hero__content');
  const main = $('main');
  const footer = $('.footer');
  const waFloat = $('.wa-float');

  /* --- Statik içerik ------------------------------------------------------- */
  safe('content', () => {
    const year = new Date().getFullYear();
    $$('[data-year]').forEach((el) => { el.textContent = String(year); });
    $$('[data-years]').forEach((el) => { el.textContent = String(Math.max(30, year - FOUNDED)); });
    $$('[data-wa]').forEach((a) => { a.href = waLink(a.dataset.wa); });
  });

  /* --- Başlıkları kelimelere böl ------------------------------------------- */
  safe('split', () => {
    $$('[data-split]').forEach((el) => {
      const text = el.textContent.trim().replace(/\s+/g, ' ');
      if (!text) return;
      el.setAttribute('aria-label', text);
      const wrap = document.createElement('span');
      wrap.setAttribute('aria-hidden', 'true');
      text.split(' ').forEach((word, i, words) => {
        const w = document.createElement('span');
        w.className = 'w';
        const inner = document.createElement('span');
        inner.className = 'w__in';
        inner.style.setProperty('--wi', String(i));
        inner.textContent = word;
        w.appendChild(inner);
        wrap.appendChild(w);
        if (i < words.length - 1) wrap.appendChild(document.createTextNode(' '));
      });
      el.textContent = '';
      el.appendChild(wrap);
    });
  });

  /* --- Yumuşak kaydırma (Lenis) ------------------------------------------- */
  let lenis = null;
  safe('lenis', () => {
    if (!motionOK() || typeof window.Lenis !== 'function') return;
    lenis = new window.Lenis({
      lerp: 0.085,
      smoothWheel: true,
      wheelMultiplier: 1,
      autoRaf: false,
      anchors: false,
    });
  });

  const lockScroll = (on) => {
    if (lenis) { on ? lenis.stop() : lenis.start(); }
    else doc.style.overflow = on ? 'hidden' : '';
  };

  const navOffset = () => {
    const v = parseFloat(getComputedStyle(doc).getPropertyValue('--nav-h-s'));
    return Number.isFinite(v) ? v : 68;
  };

  function scrollToTarget(target) {
    const toTop = target === hero || target.id === 'anasayfa';
    if (lenis) {
      lenis.scrollTo(toTop ? 0 : target, {
        offset: toTop ? 0 : -navOffset(),
        duration: 1.5,
        easing: (t) => 1 - Math.pow(1 - t, 4),
      });
    } else {
      const top = toTop ? 0 : target.getBoundingClientRect().top + window.scrollY - navOffset();
      window.scrollTo({ top, behavior: motionOK() ? 'smooth' : 'auto' });
    }
  }

  /* --- Mobil menü ------------------------------------------------------------ */
  const toggle = $('.nav__toggle');
  const menu = $('#mobil-menu');
  const toggleLabel = toggle ? $('[data-toggle-label]', toggle) : null;
  let menuOpen = false;
  let menuTimer = 0;

  function setInert(on) {
    [main, footer, waFloat].forEach((el) => { if (el) el.inert = on; });
  }
  function openMenu() {
    if (!menu || menuOpen) return;
    menuOpen = true;
    clearTimeout(menuTimer);
    menu.hidden = false;
    void menu.offsetHeight;
    menu.classList.add('is-open');
    doc.classList.add('menu-open');
    toggle.setAttribute('aria-expanded', 'true');
    if (toggleLabel) toggleLabel.textContent = 'Menüyü kapat';
    setInert(true);
    lockScroll(true);
    const first = $('.mmenu__link', menu);
    if (first) first.focus({ preventScroll: true });
  }
  function closeMenu(returnFocus = true) {
    if (!menu || !menuOpen) return;
    menuOpen = false;
    menu.classList.remove('is-open');
    doc.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    if (toggleLabel) toggleLabel.textContent = 'Menüyü aç';
    setInert(false);
    lockScroll(false);
    menuTimer = setTimeout(() => { if (!menuOpen) menu.hidden = true; }, 520);
    if (returnFocus) toggle.focus({ preventScroll: true });
  }
  safe('menu', () => {
    if (!toggle || !menu) return;
    toggle.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) closeMenu(); });
    mq('(min-width: 1100px)').addEventListener('change', (e) => { if (e.matches) closeMenu(false); });
  });

  /* --- Sayfa içi bağlantılar ve sayfa geçişi ------------------------------ */
  safe('links', () => {
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');

      if (href.charAt(0) === '#') {
        if (href.length < 2) return;
        let target = null;
        try { target = document.getElementById(decodeURIComponent(href.slice(1))); } catch (err) { /* geçersiz */ }
        if (!target) return;
        e.preventDefault();
        closeMenu(false);
        scrollToTarget(target);
        if (history.replaceState) history.replaceState(null, '', href);
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        return;
      }

      if (a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (!/^https?:$/.test(url.protocol) || url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      e.preventDefault();
      doc.classList.add('is-leaving');
      setTimeout(() => { location.href = url.href; }, motionOK() ? 340 : 0);
    });
    window.addEventListener('pageshow', (e) => { if (e.persisted) doc.classList.remove('is-leaving'); });
  });

  /* --- Aktif menü bağlantısı ------------------------------------------------- */
  safe('active-link', () => {
    const links = $$('.nav__link');
    if (!links.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const hash = `#${entry.target.id}`;
        links.forEach((a) => {
          if (a.getAttribute('href') === hash) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main section[id]').forEach((s) => io.observe(s));
  });

  /* --- Kaydırma ile beliren öğeler ---------------------------------------- */
  function initReveal() {
    const els = $$('[data-reveal], [data-split]');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      const counters = new Map();
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const group = el.hasAttribute('data-reveal') ? el.closest('[data-stagger]') : null;
        if (group) {
          const n = counters.get(group) || 0;
          el.style.setProperty('--i', String(n));
          counters.set(group, n + 1);
        }
        el.classList.add('is-in');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.12 });
    els.forEach((el) => io.observe(el));
  }

  /* --- Kaydırmaya bağlı efektler (paralaks, hero, 1996 dolumu) ------------- */
  const parallax = $$('[data-parallax]').map((el) => ({
    el,
    box: el.parentElement,
    f: parseFloat(el.dataset.parallax) || 0.1,
  }));
  const fills = $$('[data-fill]');
  let lastY = -1;
  let dirty = true;

  function tick() {
    const y = window.scrollY;
    if (y === lastY && !dirty) return;
    lastY = y;
    dirty = false;
    const vh = window.innerHeight;

    if (nav) nav.classList.toggle('is-scrolled', y > 24);

    if (motionOK()) {
      if (heroContent && y < vh * 1.4) {
        const p = clamp(y / (vh * 0.72), 0, 1);
        heroContent.style.translate = `0 ${(y * 0.26).toFixed(1)}px`;
        heroContent.style.opacity = (1 - p).toFixed(3);
        if (heroMedia) heroMedia.style.translate = `0 ${(y * 0.34).toFixed(1)}px`;
      }
      for (const p of parallax) {
        const r = p.box.getBoundingClientRect();
        if (r.bottom < -120 || r.top > vh + 120) continue;
        const offset = r.top + r.height / 2 - vh / 2;
        const slack = Math.max(0, (p.el.offsetHeight - r.height) / 2);
        p.el.style.translate = `0 ${clamp(-offset * p.f, -slack, slack).toFixed(1)}px`;
      }
    }

    for (const el of fills) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -50 || r.top > vh + 50) continue;
      const p = motionOK() ? clamp((vh * 0.95 - r.top) / (vh * 0.6), 0, 1) : 1;
      el.style.setProperty('--p', p.toFixed(3));
    }
  }

  function frame(t) {
    if (lenis) lenis.raf(t);
    tick();
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', () => { dirty = true; }, { passive: true });
  requestAnimationFrame(frame);

  /* --- Hero: video, imleç ışığı --------------------------------------------- */
  function initHeroVideo() {
    const video = $('.hero__video');
    if (!video || !hero || !motionOK()) return;
    const conn = navigator.connection || {};
    if (conn.saveData || /2g|3g/.test(conn.effectiveType || '')) return;
    // Dikey ekranlarda (telefon, dikey tablet) dikey fotoğraf kullanılır, video yüklenmez
    const portrait = mq('(max-width: 760px), (max-aspect-ratio: 4/5)');
    let loaded = false;
    let visible = true;

    const play = () => {
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };
    const sync = () => {
      if (!loaded) return;
      if (visible && !document.hidden && !portrait.matches) play();
      else video.pause();
      if (portrait.matches) hero.classList.remove('is-playing');
    };
    const load = () => {
      if (loaded || portrait.matches) return;
      loaded = true;
      const hd = window.innerWidth * (window.devicePixelRatio || 1) > 1500;
      video.muted = true;
      video.src = hd ? video.dataset.srcHd : video.dataset.srcSd;
      video.addEventListener('playing', () => { if (!portrait.matches) hero.classList.add('is-playing'); });
      video.addEventListener('error', () => hero.classList.remove('is-playing'), { once: true });
      sync();
    };

    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(hero);
    document.addEventListener('visibilitychange', sync);
    portrait.addEventListener('change', () => { load(); sync(); });
    load();
  }

  safe('hero-light', () => {
    if (!hero || !finePointer.matches || !motionOK()) return;
    let raf = 0;
    hero.addEventListener('pointermove', (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = hero.getBoundingClientRect();
        hero.style.setProperty('--sx', `${clamp(((e.clientX - r.left) / r.width) * 100, 0, 100).toFixed(1)}%`);
        hero.style.setProperty('--sy', `${clamp(((e.clientY - r.top) / r.height) * 100, 0, 100).toFixed(1)}%`);
      });
    });
  });

  /* --- Manyetik butonlar ------------------------------------------------------- */
  safe('magnetic', () => {
    if (!finePointer.matches || !motionOK()) return;
    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * 0.22;
        const y = (e.clientY - (r.top + r.height / 2)) * 0.32;
        el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      });
      el.addEventListener('pointerleave', () => { el.style.translate = ''; });
    });
  });

  /* --- Ürün kartlarında 3D eğim ve ışık ------------------------------------- */
  safe('tilt', () => {
    if (!finePointer.matches || !motionOK()) return;
    $$('[data-tilt]').forEach((card) => {
      let raf = 0;
      let rect = null;
      card.addEventListener('pointerenter', () => {
        rect = card.getBoundingClientRect();
        card.classList.add('is-tilting');
      });
      card.addEventListener('pointermove', (e) => {
        if (!rect) rect = card.getBoundingClientRect();
        const px = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        const py = clamp((e.clientY - rect.top) / rect.height, 0, 1);
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          card.style.setProperty('--ry', `${((px - 0.5) * 11).toFixed(2)}deg`);
          card.style.setProperty('--rx', `${((0.5 - py) * 9).toFixed(2)}deg`);
          card.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
          card.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
        });
      });
      card.addEventListener('pointerleave', () => {
        cancelAnimationFrame(raf);
        rect = null;
        card.classList.remove('is-tilting');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });

    $$('.why__item').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--hx', `${(e.clientX - r.left).toFixed(0)}px`);
        el.style.setProperty('--hy', `${(e.clientY - r.top).toFixed(0)}px`);
      });
    });
  });

  /* --- Öne çıkanlar rayı -------------------------------------------------------- */
  let railDragged = false;
  safe('rail', () => {
    const rail = $('[data-rail]');
    if (!rail) return;
    const track = $('[data-rail-track]', rail);
    const bar = $('[data-rail-bar]', rail);
    const prev = $('[data-rail-prev]', rail);
    const next = $('[data-rail-next]', rail);

    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const ratio = clamp(track.clientWidth / Math.max(1, track.scrollWidth), 0.08, 1);
      const p = max > 0 ? clamp(track.scrollLeft / max, 0, 1) : 0;
      if (bar) {
        bar.style.width = `${(ratio * 100).toFixed(2)}%`;
        bar.style.transform = `translateX(${(p * (1 / ratio - 1) * 100).toFixed(2)}%)`;
      }
      if (prev) prev.disabled = track.scrollLeft <= 4;
      if (next) next.disabled = track.scrollLeft >= max - 4;
    };
    const step = () => {
      const item = $('.product', track);
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return item ? item.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
    };
    const behavior = () => (motionOK() ? 'smooth' : 'auto');
    if (prev) prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: behavior() }));
    if (next) next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: behavior() }));

    let raf = 0;
    track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('load', update);
    update();

    // Fare ile sürükleyerek kaydırma
    let down = false;
    let startX = 0;
    let startLeft = 0;
    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true;
      railDragged = false;
      startX = e.clientX;
      startLeft = track.scrollLeft;
      e.preventDefault();
    });
    window.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!railDragged && Math.abs(dx) > 6) {
        railDragged = true;
        track.classList.add('is-dragging');
      }
      if (railDragged) track.scrollLeft = startLeft - dx;
    });
    const end = () => {
      if (!down) return;
      down = false;
      if (railDragged) {
        track.classList.remove('is-dragging');
        setTimeout(() => { railDragged = false; }, 0);
      }
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    track.addEventListener('click', (e) => {
      if (railDragged) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  });

  /* --- Ürün detay penceresi --------------------------------------------------- */
  safe('modal', () => {
    const dialog = $('#urun-detay');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    const img = $('[data-modal-img]', dialog);
    const title = $('[data-modal-title]', dialog);
    const desc = $('[data-modal-desc]', dialog);
    const specs = $('[data-modal-specs]', dialog);
    const wa = $('[data-modal-wa]', dialog);
    let opener = null;

    const finish = () => {
      if (!dialog.open) return;
      dialog.classList.remove('is-closing');
      dialog.close();
    };
    const close = () => {
      if (!dialog.open || dialog.classList.contains('is-closing')) return;
      if (!motionOK()) { finish(); return; }
      dialog.classList.add('is-closing');
      setTimeout(finish, 330);
    };
    const open = (li, trigger) => {
      const name = li.dataset.name || '';
      const stem = li.dataset.img;
      title.textContent = name;
      desc.textContent = li.dataset.desc || '';
      specs.replaceChildren(...(li.dataset.specs || '').split('|').filter(Boolean).map((row) => {
        const i = row.indexOf(':');
        const wrap = document.createElement('div');
        wrap.className = 'spec';
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = (i > -1 ? row.slice(0, i) : row).trim();
        dd.textContent = (i > -1 ? row.slice(i + 1) : '').trim();
        wrap.append(dt, dd);
        return wrap;
      }));
      if (stem) {
        img.sizes = '(min-width: 760px) 490px, 100vw';
        img.srcset = `assets/img/${stem}-640.webp 640w, assets/img/${stem}-1080.webp 1080w`;
        img.src = `assets/img/${stem}-1080.webp`;
      }
      const cardImg = $('img', li);
      img.alt = cardImg ? cardImg.alt : name;
      wa.href = waLink(`Merhaba, web sitenizdeki “${name}” için fiyat ve stok bilgisi almak istiyorum.`);
      opener = trigger;
      dialog.classList.remove('is-closing');
      dialog.showModal();
      lockScroll(true);
    };

    dialog.addEventListener('close', () => {
      lockScroll(false);
      if (opener) opener.focus({ preventScroll: true });
    });
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
    $$('[data-close]', dialog).forEach((b) => b.addEventListener('click', close));

    $$('[data-product]').forEach((li) => {
      const card = $('.product__card', li);
      const btn = $('.product__open', li);
      if (!card) return;
      card.addEventListener('click', (e) => {
        if (railDragged) return;
        e.preventDefault();
        open(li, btn || card);
      });
    });
  });

  /* --- Açık / kapalı durumu ---------------------------------------------------- */
  safe('status', () => {
    const box = $('[data-status]');
    if (!box || typeof Intl === 'undefined') return;
    const text = $('[data-status-text]', box);
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const DAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: HOURS.tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });

    const update = () => {
      const parts = {};
      fmt.formatToParts(new Date()).forEach((p) => { parts[p.type] = p.value; });
      const day = DAYS.indexOf(parts.weekday);
      const mins = ((parseInt(parts.hour, 10) % 24) * 60) + parseInt(parts.minute, 10);
      if (day < 0 || !Number.isFinite(mins)) return;
      const openToday = HOURS.days.includes(day);
      const isOpen = openToday && mins >= HOURS.open && mins < HOURS.close;
      let msg;
      if (isOpen) {
        const left = HOURS.close - mins;
        msg = left <= 45 ? `Şu an açık, ${left} dakika sonra kapanıyor` : `Şu an açık, ${HOURS.closeText} kapanıyor`;
      } else if (openToday && mins < HOURS.open) {
        msg = `Şu an kapalı, bugün ${HOURS.openText} açılıyor`;
      } else {
        let d = 1;
        while (d < 7 && !HOURS.days.includes((day + d) % 7)) d += 1;
        const when = d === 1 ? 'yarın' : `${DAYS_TR[(day + d) % 7]} günü`;
        msg = `Şu an kapalı, ${when} ${HOURS.openText} açılıyor`;
      }
      text.textContent = msg;
      box.classList.toggle('is-open', isOpen);
      box.classList.toggle('is-closed', !isOpen);
      box.hidden = false;
    };
    update();
    setInterval(update, 30 * 1000);
  });

  /* --- Güncel altın fiyatları ----------------------------------------------------- */
  safe('prices', () => {
    const box = $('[data-market]');
    if (!box || typeof fetch !== 'function') return;
    const items = $$('[data-key]', box);
    const time = $('[data-market-time]', box);
    const money2 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const money0 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
    const pct = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let loadedOnce = false;
    let retries = 0;

    const flash = (el) => {
      el.classList.remove('is-flash');
      void el.offsetWidth;
      el.classList.add('is-flash');
    };

    async function load() {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => ctrl && ctrl.abort(), 9000);
      try {
        const res = await fetch(PRICE_URL, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        let count = 0;
        items.forEach((li) => {
          const d = data[li.dataset.key];
          const value = d ? Number(d.Selling) : NaN;
          if (!Number.isFinite(value) || value <= 0) return;
          count += 1;
          const priceEl = $('[data-price]', li);
          const chgEl = $('[data-chg]', li);
          const txt = (value >= 10000 ? money0 : money2).format(value);
          if (priceEl.textContent !== txt) {
            priceEl.textContent = txt;
            if (loadedOnce) flash(priceEl);
          }
          const change = Number(d.Change);
          if (chgEl && Number.isFinite(change)) {
            const arrow = document.createElement('span');
            arrow.setAttribute('aria-hidden', 'true');
            arrow.textContent = change > 0 ? '▲ ' : change < 0 ? '▼ ' : '';
            const sr = document.createElement('span');
            sr.className = 'visually-hidden';
            sr.textContent = change > 0 ? 'artış ' : change < 0 ? 'düşüş ' : 'değişim ';
            chgEl.replaceChildren(arrow, sr, document.createTextNode(`%${pct.format(Math.abs(change))}`));
            chgEl.classList.toggle('is-up', change > 0);
            chgEl.classList.toggle('is-down', change < 0);
          }
        });
        if (!count) throw new Error('Fiyat verisi boş');
        loadedOnce = true;
        box.classList.remove('is-error');
        const m = /(\d{2}):(\d{2})/.exec(String(data.Update_Date || ''));
        time.textContent = m ? `Son güncelleme ${m[1]}:${m[2]}` : 'Güncel piyasa verisi';
      } catch (err) {
        if (!loadedOnce) {
          box.classList.add('is-error');
          time.textContent = 'Güncel fiyatlar şu an gösterilemiyor. Mağaza fiyatı için bizi arayın: 0507 351 73 47';
          // Geçici ağ hatalarında kısa aralıklarla iki kez daha dene
          if (retries < 2) { retries += 1; setTimeout(load, 6000 * retries); }
        }
      } finally {
        clearTimeout(timer);
      }
    }

    load();
    setInterval(() => { if (!document.hidden) load(); }, PRICE_REFRESH_MS);
  });

  /* --- Açılış ------------------------------------------------------------------ */
  let started = false;
  function onReady() {
    if (started) return;
    started = true;
    safe('reveal', initReveal);
    const startVideo = () => setTimeout(() => safe('hero-video', initHeroVideo), 250);
    if (document.readyState === 'complete') startVideo();
    else window.addEventListener('load', startVideo, { once: true });
  }

  function ready() {
    if (doc.classList.contains('is-ready')) { onReady(); return; }
    doc.classList.add('is-ready');
    try { sessionStorage.setItem('cg-intro', '1'); } catch (err) { /* gizli mod */ }
    onReady();
  }

  const showIntro = doc.classList.contains('js') && !doc.classList.contains('no-intro');
  if (!showIntro) {
    requestAnimationFrame(() => requestAnimationFrame(ready));
  } else {
    const heroImg = $('.hero__still img');
    const imgReady = heroImg && !heroImg.complete
      ? new Promise((r) => { heroImg.addEventListener('load', r, { once: true }); heroImg.addEventListener('error', r, { once: true }); })
      : Promise.resolve();
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    const minTime = new Promise((r) => setTimeout(r, Math.max(0, 1250 - performance.now())));
    const maxTime = new Promise((r) => setTimeout(r, Math.max(0, 2600 - performance.now())));
    Promise.race([Promise.all([imgReady, fontsReady, minTime]), maxTime]).then(ready, ready);
  }
})();
