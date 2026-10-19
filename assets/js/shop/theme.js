const THEMES = ['dark', 'light'];
const COLORS = { dark: '#000000', light: '#faf6ee' };

export function resolveTheme(saved, prefersDark) {
  return THEMES.includes(saved) ? saved : prefersDark ? 'dark' : 'light';
}

export function applyTheme(doc, theme) {
  doc.documentElement.dataset.theme = theme;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[theme]);
  doc.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
}

export function initTheme(store, win = globalThis.window) {
  const prefersDark = !!win.matchMedia?.('(prefers-color-scheme: dark)').matches;
  let theme = resolveTheme(store.get('theme', null), prefersDark);
  applyTheme(win.document, theme);
  return {
    current: () => theme,
    toggle() {
      theme = theme === 'dark' ? 'light' : 'dark';
      store.set('theme', theme);
      applyTheme(win.document, theme);
      return theme;
    },
  };
}
