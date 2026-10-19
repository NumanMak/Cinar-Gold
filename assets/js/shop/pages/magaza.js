import { mountShell } from '../shell.js';
import { modelsOf, filterProducts } from '../catalog.js';
import { el, productCard } from '../ui.js';

const TYPES = [['', 'Tümü'], ['yuzuk', 'Yüzük'], ['kolye', 'Kolye'], ['bilezik', 'Bilezik'], ['pirlanta', 'Pırlanta']];

const ctx = await mountShell({ page: 'shop' });
const q = new URLSearchParams(location.search);
const state = { type: q.get('tur') ?? '', model: q.get('model') ?? '', inStockOnly: q.get('stok') === '1' };
if (!TYPES.some(([v]) => v === state.type)) state.type = '';

const typesBox = document.getElementById('turler');
const modelSel = document.getElementById('model');
const stockChk = document.getElementById('stok');
const grid = document.getElementById('urunler');
const empty = document.getElementById('bos');
const count = document.getElementById('sayac');

function syncUrl() {
  const p = new URLSearchParams();
  if (state.type) p.set('tur', state.type);
  if (state.model) p.set('model', state.model);
  if (state.inStockOnly) p.set('stok', '1');
  history.replaceState(null, '', p.size ? `?${p}` : location.pathname);
}

function renderTypes() {
  typesBox.replaceChildren(...TYPES.map(([value, label]) => {
    const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(state.type === value) }, label);
    b.addEventListener('click', () => { state.type = value; state.model = ''; render(); });
    return b;
  }));
}

function renderModels() {
  const models = state.type ? modelsOf(ctx.products, state.type) : [];
  modelSel.replaceChildren(el('option', { value: '' }, state.type ? 'Tüm modeller' : 'Önce tür seçin'),
    ...models.map((m) => el('option', { value: m }, m)));
  modelSel.disabled = !state.type;
  if (!models.includes(state.model)) state.model = '';
  modelSel.value = state.model;
}

function render() {
  renderTypes();
  renderModels();
  stockChk.checked = state.inStockOnly;
  const list = filterProducts(ctx.products, state, ctx.inventory);
  grid.replaceChildren(...list.map((p) => productCard(p, ctx)));
  empty.hidden = list.length > 0;
  count.textContent = `${list.length} ürün`;
  syncUrl();
}

modelSel.addEventListener('change', () => { state.model = modelSel.value; render(); });
stockChk.addEventListener('change', () => { state.inStockOnly = stockChk.checked; render(); });
render();
