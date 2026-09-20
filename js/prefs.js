// Per-device appearance preferences: tokens applied to the one frame.
// Stored under suite_prefs (brand-neutral, feature-named).

export const ACCENTS = [
  ["Signal orange", '#D24E0E', '#B84309', '#FDEEE5', '#F4C9B3', '', 'bright'],
  ["Shell teal", '#0B8484', '#086A6A', '#E3F4F3', '#B6DEDC', '', 'bright'],
  ["Royal blue", '#2E63E6', '#1F4DBF', '#E8EEFD', '#BFCFF7', '', 'bright'],
  ["Cube green", '#16915B', '#0F7046', '#E4F5EC', '#B5E3C9', '', 'bright'],
  ["Plum", '#7C3AED', '#5B21B6', '#F1EAFD', '#D3BFF8', '', 'bright'],
  ["Graphite", '#1F2937', '#111827', '#E8EAEE', '#C5CAD3', '', 'bright'],
  ["Crimson", '#C81E3A', '#9C172D', '#FAE8EB', '#EDB7C0', '', 'bright'],
  ["Raspberry", '#C2185B', '#971347', '#F9E8EF', '#EBB5CB', '', 'bright'],
  ["Marigold", '#D98E04', '#A96F03', '#FBF4E6', '#F3DBAF', '', 'bright'],
  ["Indigo", '#4338CA', '#342C9E', '#ECEBFA', '#C3BFEE', '', 'bright'],
  ["Lagoon", '#0E7CA8', '#0B6183', '#E7F2F6', '#B2D5E3', '', 'bright'],
  ["Terracotta", '#B5573A', '#8F4128', '#F7EBE6', '#E6C9BD', '', 'soft'],
  ["Dusty teal", '#4A8E8C', '#356B6A', '#E8F2F1', '#BFDCDA', '', 'soft'],
  ["Slate blue", '#4F6D9A', '#3B527A', '#EAEFF6', '#C4D0E2', '', 'soft'],
  ["Sage", '#5F8F6E', '#466B52', '#EAF2EC', '#C3DACA', '', 'soft'],
  ["Mauve", '#8B6BAE', '#684F86', '#F0EBF6', '#D3C6E3', '', 'soft'],
  ["Ochre", '#B0813C', '#86612C', '#F7F0E4', '#E5D3B3', '', 'soft'],
  ["Deep navy", '#2F3E5C', '#23304A', '#E9ECF2', '#C3CBDA', '', 'soft'],
  ["Charcoal teal", '#3C5A5E', '#2C4448', '#E8EEEF', '#BFD0D2', '', 'soft'],
  ["Rosewood", '#9C5B63', '#7A474D', '#F5EFEF', '#DFCBCD', '', 'soft'],
  ["Moss", '#6B7B4A', '#53603A', '#F0F2ED', '#D0D5C5', '', 'soft'],
  ["Storm", '#5E6B7A', '#49535F', '#EFF0F2', '#CBD0D4', '', 'soft'],
  ["Heather", '#7E6F9E', '#62577B', '#F2F1F5', '#D6D1E0', '', 'soft'],
  ["Cocoa", '#7A5A4A', '#5F463A', '#F2EEED', '#D4CAC5', '', 'soft'],
];
const KEY = 'suite_prefs';
// Display scale: the whole frame renders at this factor (0.9 reads as the
// showcase did on a 1440-wide screen). Container queries see the scaled
// width, so a half-screen window still gets the half-screen layout.
export const SCALES = [['0.75', 'Small'], ['0.9', 'Compact'], ['1', 'Default'], ['1.15', 'Large']];
const DEFAULTS = { skin: 'light', accent: 0, rail: 'light', bars: 'plain', hdr: 'classic', railmin: false, scale: '0.9' };
let cur = null;
export function prefs() { if (!cur) { try { cur = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch { cur = { ...DEFAULTS }; } } return cur; }
export function setPref(k, v) { prefs()[k] = v; try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch {} applyPrefs(); }
export function applyPrefs(frame = document.querySelector('.frame')) {
  if (!frame) return;
  const p = prefs(), a = ACCENTS[p.accent] || ACCENTS[0], dark = p.skin === 'dark';
  frame.classList.toggle('dark', dark);
  for (const c of ['rail-light', 'rail-tint', 'rail-solid', 'rail-deep', 'bars-plain', 'bars-tint', 'bars-strong', 'hdr-classic', 'hdr-title']) frame.classList.remove(c);
  frame.classList.add('rail-' + p.rail, 'bars-' + p.bars, 'hdr-' + p.hdr);
  const s = frame.style;
  s.setProperty('--accent', a[1]); s.setProperty('--accent-ink', dark ? a[1] : a[2]);
  s.setProperty('--accent-soft', dark ? `color-mix(in srgb,${a[1]} 22%,#111827)` : a[3]);
  s.setProperty('--accent-line', dark ? `color-mix(in srgb,${a[1]} 45%,#111827)` : a[4]);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  const app = frame.querySelector('#app'); if (app) app.classList.toggle('railmin', !!p.railmin);
  const z = Number(p.scale) || 1; s.zoom = z === 1 ? '' : String(z);
}
