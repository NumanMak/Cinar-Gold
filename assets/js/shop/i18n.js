// Dil desteği: Türkçe (varsayılan) ve İngilizce. Anahtar Türkçe metnin kendisidir; İngilizce karşılığı i18n-en.js içindedir.
// Dil değişince sayfa yeniden yüklenir, böylece statik ve dinamik tüm metinler aynı dilde kalır.
import { EN } from './i18n-en.js';

const KEY = 'cg:lang';
export const LANGS = ['tr', 'en'];

export function detectLang({ saved, search = '' }) {
  const q = new URLSearchParams(search).get('lang');
  if (LANGS.includes(q)) return q;
  return LANGS.includes(saved) ? saved : 'tr';
}

export function translate(lang, dict, key, params) {
  const own = lang === 'en' && Object.prototype.hasOwnProperty.call(dict, key);
  const text = own ? dict[key] : key;
  return params ? text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : text;
}

// Metin düğümlerini yerinde çevirir; çevrilen düğüm sayısını döner.
export function translateTextNodes(nodes, tr) {
  let count = 0;
  for (const node of nodes) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(node.nodeValue);
    if (!m[2]) continue;
    const out = tr(m[2].replace(/\s+/g, ' '));
    if (out !== m[2].replace(/\s+/g, ' ')) {
      node.nodeValue = m[1] + out + m[3];
      count += 1;
    }
  }
  return count;
}

let current = 'tr';
const hasWindow = typeof window !== 'undefined' && typeof document !== 'undefined';

if (hasWindow) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) { saved = null; }
  current = detectLang({ saved, search: location.search });
  const q = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(q)) { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch (e) { /* yoksay */ } }
  document.documentElement.lang = current;
}

export const getLang = () => current;
// Klasik betikler (assets/js/main.js) için genel erişim.
if (hasWindow) window.cgI18n = { t: (key, params) => translate(current, EN, key, params), lang: () => current, locale: () => (current === 'en' ? 'en-US' : 'tr-TR') };
export const locale = () => (current === 'en' ? 'en-US' : 'tr-TR');
export const t = (key, params) => translate(current, EN, key, params);

export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === current) return;
  try { localStorage.setItem(KEY, JSON.stringify(lang)); } catch (e) { /* yoksay */ }
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  location.assign(url);
}

const ATTRS = ['aria-label', 'alt', 'title', 'placeholder', 'data-wa', 'data-desc', 'data-name', 'content'];

// Statik HTML (ana sayfa) için: metin düğümleri ve seçili öznitelikler. İngilizce modunda çalışır.
export function translateDocument(doc = document) {
  if (current !== 'en') return;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  translateTextNodes(nodes, (s) => t(s));
  for (const el of doc.querySelectorAll('[aria-label],[alt],[title],[placeholder],[data-wa],[data-desc],[data-name],[data-specs]')) {
    for (const a of ATTRS) if (el.hasAttribute(a)) el.setAttribute(a, t(el.getAttribute(a)));
    if (el.hasAttribute('data-specs')) el.setAttribute('data-specs', el.getAttribute('data-specs').split('|').map((p) => t(p.trim())).join('|'));
  }
  doc.title = t(doc.title);
  const desc = doc.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', t(desc.getAttribute('content')));
  for (const m of doc.querySelectorAll('meta[property^="og:"],meta[name^="twitter:"]')) {
    const c = m.getAttribute('content');
    if (c && !/^https?:/.test(c)) m.setAttribute('content', t(c));
  }
}
