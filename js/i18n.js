// Languages: the interface in ShelfSearcher's seven (English, German,
// French, Filipino, Vietnamese, Spanish, Italian), chosen on each device in
// Settings › Display or on the sign-in card.
//
//   tx(text, vars)         the text in the device's language. The key is the
//                          English text itself; {name} placeholders are filled
//                          from vars, which the caller has already escaped.
//                          Text with no translation shows in English. When one
//                          English word means two things, the key names which:
//                          the key 'issue status::Open' shows "Open" in English
//                          and has its own translation, apart from 'Open'.
//   txn(n, one, many, vars) the singular or plural form, with {n} filled
//   LANGS, lang()          the seven [code, name, locale], and this device's
//   locale()               the Intl locale for dates
//   setLang(code)          saves the choice and reloads, so every screen redraws
//   translateStatic(root)  index.html's own text: elements marked data-t
//
// Each language's dictionary is js/i18n/<code>.js, which merges one file per
// area from js/i18n/<code>/; English has none. The dictionary loads before
// anything renders (top-level await), so a module may call tx() while it is
// evaluated. npm test checks that every tx() key has all six translations
// with the same placeholders and markup (test/unit/i18n.test.js).
//
// What stays in English everywhere: data (shelf, bay and product codes,
// product and store names, department and micro-department names, D-numbers,
// anything a person typed), the codes printed on the company's reports
// (SOH, PULL, GHOST, RECOUNT…), the brand, and the owner's map editor.

export const LANGS = [['en', 'English', 'en-AU'], ['de', 'Deutsch', 'de-DE'], ['fr', 'Français', 'fr-FR'], ['fil', 'Filipino', 'fil-PH'], ['vi', 'Tiếng Việt', 'vi-VN'], ['es', 'Español', 'es-ES'], ['it', 'Italiano', 'it-IT']];
const KEY = 'suite_prefs';   // the device's preferences (js/prefs.js), read here directly: prefs.js uses tx()

let code = 'en', dict = null;
try { const c = JSON.parse(localStorage.getItem(KEY) || '{}').lang; if (LANGS.some(l => l[0] === c)) code = c; } catch {}
if (code !== 'en') {
  try { dict = (await import(`./i18n/${code}.js`)).default; }
  catch (e) { console.warn('language', code, e); code = 'en'; dict = null; }
}
if (typeof document !== 'undefined') document.documentElement.lang = code;

export const lang = () => code;
export const locale = () => LANGS.find(l => l[0] === code)[2];
const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);
// 'context::Text' → 'Text': the English a context key stands for.
export const plain = s => { const i = s.indexOf('::'); return i < 0 ? s : s.slice(i + 2); };
export function tx(text, vars) { return fill((dict && dict[text]) || plain(text), vars); }
export function txn(n, one, many, vars) { return tx(n === 1 ? one : many, { n, ...vars }); }

export function setLang(c) {
  if (!LANGS.some(l => l[0] === c) || c === code) return;
  try { const p = JSON.parse(localStorage.getItem(KEY) || '{}'); p.lang = c; localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
  location.reload();
}

// index.html's static text: an element marked data-t has its own text and
// its placeholder, title and aria-label translated.
export function translateStatic(root = document) {
  if (!dict) return;
  for (const el of root.querySelectorAll('[data-t]')) {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) n.textContent = n.textContent.replace(n.textContent.trim(), tx(n.textContent.trim()));
    for (const a of ['placeholder', 'title', 'aria-label']) if (el.hasAttribute(a)) el.setAttribute(a, tx(el.getAttribute(a)));
  }
}

// The language choice as a <select>, for Settings and the sign-in card.
export const langSelect = (attrs = '') => `<select ${attrs}>${LANGS.map(([c, n]) => `<option value="${c}"${c === code ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
