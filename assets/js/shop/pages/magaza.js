import { mountShell } from '../shell.js';
import { modelsOf, filterProducts, searchProducts, sortProducts } from '../catalog.js';
import { el, productCard } from '../ui.js';
import { t, translateDocument } from '../i18n.js';
import { modelLabel } from '../names.js';

const TYPES = [['', 'Tümü'], ['yuzuk', 'Yüzük'], ['kolye', 'Kolye'], ['bilezik', 'Bilezik'], ['pirlanta', 'Pırlanta']];

translateDocument();
const ctx = await mountShell({ page: 'shop' });
const q = new URLSearchParams(location.search);
const SORTS = ['onerilen', 'fiyat-artan', 'fiyat-azalan', 'ad'];
const state = { type: q.get('tur') ?? '', model: q.get('model') ?? '', inStockOnly: q.get('stok') === '1', text: q.get('q') ?? '', sort: q.get('sirala') ?? 'onerilen' };
if (!SORTS.includes(state.sort)) state.sort = 'onerilen';
if (!TYPES.some(([v]) => v === state.type)) state.type = '';

const typesBox = document.getElementById('turler');
const modelSel = document.getElementById('model');
const stockChk = document.getElementById('stok');
const grid = document.getElementById('urunler');
const empty = document.getElementById('bos');
const count = document.getElementById('sayac');
const searchInput = document.getElementById('ara');
const sortSel = document.getElementById('sirala');

function syncUrl() {
  const p = new URLSearchParams();
  if (state.type) p.set('tur', state.type);
  if (state.model) p.set('model', state.model);
  if (state.inStockOnly) p.set('stok', '1');
  if (state.text.trim()) p.set('q', state.text.trim());
  if (state.sort !== 'onerilen') p.set('sirala', state.sort);
  history.replaceState(null, '', p.size ? `?${p}` : location.pathname);
}

function renderTypes() {
  typesBox.replaceChildren(...TYPES.map(([value, label]) => {
    const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(state.type === value) }, t(label));
    b.addEventListener('click', () => { state.type = value; state.model = ''; render(); });
    return b;
  }));
}

function renderModels() {
  const models = state.type ? modelsOf(ctx.products, state.type) : [];
  modelSel.replaceChildren(el('option', { value: '' }, state.type ? t('Tüm modeller') : t('Önce tür seçin')),
    ...models.map((m) => el('option', { value: m }, modelLabel(ctx.products.find((x) => x.type === state.type && x.model === m)))));
  modelSel.disabled = !state.type;
  if (!models.includes(state.model)) state.model = '';
  modelSel.value = state.model;
}

function render() {
  renderTypes();
  renderModels();
  stockChk.checked = state.inStockOnly;
  const list = sortProducts(searchProducts(filterProducts(ctx.products, state, ctx.inventory), state.text), state.sort);
  if (searchInput.value !== state.text) searchInput.value = state.text;
  sortSel.value = state.sort;
  grid.replaceChildren(...list.map((p) => productCard(p, ctx)));
  empty.hidden = list.length > 0;
  count.textContent = t('{n} ürün', { n: list.length });
  syncUrl();
}

modelSel.addEventListener('change', () => { state.model = modelSel.value; render(); });
stockChk.addEventListener('change', () => { state.inStockOnly = stockChk.checked; render(); });
searchInput.addEventListener('input', () => { state.text = searchInput.value; render(); });
sortSel.addEventListener('change', () => { state.sort = sortSel.value; render(); });
document.getElementById('arama-formu').addEventListener('submit', (e) => e.preventDefault());
render();
