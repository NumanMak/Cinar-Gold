// Ürün alanlarının dile göre seçimi. İngilizce alan yoksa Türkçe alana düşülür.
import { getLang } from './i18n.js';

const SUFFIX = { name: 'nameEn', desc: 'descEn', model: 'modelEn', typeLabel: 'typeLabelEn', metal: 'metalEn' };

export function localized(p, field, lang = getLang()) {
  if (lang === 'en' && p[SUFFIX[field]]) return p[SUFFIX[field]];
  return p[field] ?? '';
}

export const productName = (p, lang) => localized(p, 'name', lang);
export const productDesc = (p, lang) => localized(p, 'desc', lang);
export const modelLabel = (p, lang) => localized(p, 'model', lang);
export const typeLabel = (p, lang) => localized(p, 'typeLabel', lang);
export const metalLabel = (p, lang) => localized(p, 'metal', lang);
