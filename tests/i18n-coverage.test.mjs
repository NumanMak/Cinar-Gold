import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { EN } from '../assets/js/shop/i18n-en.js';

const root = new URL('../assets/js/shop/', import.meta.url);
const files = [
  ...readdirSync(root).filter((f) => f.endsWith('.js') && !['i18n-en.js', 'i18n.js'].includes(f)).map((f) => new URL(f, root)),
  ...readdirSync(new URL('pages/', root)).filter((f) => f.endsWith('.js')).map((f) => new URL(`pages/${f}`, root)),
];
const name = (f) => f.pathname.split('/').pop();

// t('...') ve t("...") çağrılarının anahtarları (şablon metin kullanılmaz; parametre için {ad} yer tutucusu).
function keysOf(src) {
  const out = [];
  const re = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
  let m;
  while ((m = re.exec(src))) out.push((m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"'));
  return out;
}

test('kaynaktaki her t("...") anahtarinin Ingilizce karsiligi vardir', () => {
  const missing = [];
  for (const f of files) for (const k of keysOf(readFileSync(f, 'utf8'))) if (!Object.hasOwn(EN, k)) missing.push(`${name(f)}: ${k}`);
  assert.deepEqual(missing, []);
});

test('Turkce harf iceren her tirnakli metin ya sozlukte vardir ya da kod/secici dizesidir (t() ile sarilmamis arayuz metni kalmamali)', () => {
  const leaks = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
      const x = m[1].replace(/\\'/g, "'");
      if (/[çğıöşüÇĞİÖŞÜ]/.test(x) && !Object.hasOwn(EN, x)) leaks.push(`${name(f)}: ${x}`);
    }
  }
  assert.deepEqual(leaks, []);
});

test('t() cagrilarinda sablon metin (`...${}`) kullanilmaz', () => {
  const bad = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*`[^`]*`/g)) bad.push(`${name(f)}: ${m[0]}`);
  }
  assert.deepEqual(bad, []);
});

test('sozlukteki her giris dolu; yer tutucular anahtar ve degerde ayni; Ingilizce deger Turkce harf icermez (marka ve adres haric)', () => {
  const allowed = /Çınar|Fethiye|Muğla|Atatürk|Özsafir|Reşat|Cumhuriyet/;
  const tr = /[çğıöşüÇĞİÖŞÜ]/;
  const problems = [];
  for (const [k, v] of Object.entries(EN)) {
    if (typeof v !== 'string' || !v.trim()) problems.push(`boş: ${k}`);
    const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    if (ph(k) !== ph(v)) problems.push(`yer tutucu uyuşmuyor: ${k}`);
    if (tr.test(v) && !allowed.test(v)) problems.push(`Türkçe harf: ${k} -> ${v}`);
  }
  assert.deepEqual(problems, []);
});

test('statik sayfalarin (HTML) her metin parcasi ve oznitelik metni sozlukte vardir', () => {
  const pages = ['index.html', 'magaza.html', 'urun.html', 'sepet.html', 'hesap.html', '404.html'];
  const ignore = new Set(['0507 351 73 47', 'E-posta']);
  const missing = [];
  for (const p of pages) {
    const s = readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
    const head = s.slice(0, s.indexOf('<body'));
    let body = s.slice(s.indexOf('<body'));
    body = body.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, '');
    const decode = (x) => x.replace(/&larr;/g, '←').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
    const texts = [...body.matchAll(/>([^<]+)</g)].map((m) => decode(m[1])).filter((x) => /[A-Za-zÇĞİÖŞÜçğıöşü]{2}/.test(x));
    const attrs = [...body.matchAll(/(?:aria-label|alt|title|placeholder|data-wa|data-desc|data-name)="([^"]{2,})"/g)].map((m) => decode(m[1]));
    for (const m of body.matchAll(/data-specs="([^"]+)"/g)) attrs.push(...decode(m[1]).split('|').map((x) => x.trim()));
    const meta = [...head.matchAll(/<meta (?:name="description"|property="og:(?:title|description|image:alt)"|name="twitter:(?:title|description)") content="([^"]+)"/g)].map((m) => decode(m[1]));
    const title = [...head.matchAll(/<title>([\s\S]*?)<\/title>/g)].map((m) => decode(m[1]));
    for (const x of [...texts, ...attrs, ...meta, ...title]) if (!ignore.has(x) && !Object.hasOwn(EN, x)) missing.push(`${p}: ${x}`);
  }
  assert.deepEqual(missing, []);
});
