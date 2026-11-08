// The map for the Price checks chapter: the same real part of
// Busselton 1241's map as Location refresh (js/guide/refresh-map.js,
// the Kitchen runs A8 to A23), drawn as the phone's Labels view draws it
// (styles/app.css .map.real.li, js/views/labelint.js marksFor): every shelf
// grey, the shelves of a micro-department checked this cycle green, of one
// with a wrong label found red, of the one open purple, and the shelf last
// tapped outlined dark. Run badges in grey, shelf labels hidden, as the map
// shows them at this zoom. Shelves are data (codes, map units), not words.
import { SHELVES } from './refresh-map.js';

// Which micro-department each shelf is on (label.assign, per shelf): the
// Kitchen's five on its runs, three of Women's Clothing and one of Bed, Bath,
// Laundry. A2 S1, A4 S1, A15, A17 and A19 are on none yet.
const run = (r, ...ends) => [`${r} S1`, `${r} S2`, ...ends.map(e => `${r} ${e}`)];
export const ASSIGN = {
  'h1-038': [...run('A8', 'E1', 'E2'), ...run('A10', 'E1', 'E2')],
  'h1-040': [...run('A12', 'E1', 'E2'), ...run('A14', 'E1', 'E2')],
  'h1-056': [...run('A16', 'E1', 'E2'), ...run('A18', 'E1', 'E2')],
  'h1-021': [...run('A20', 'E1', 'E2'), ...run('A21', 'E1', 'E2'), 'A23 S1', 'A23 E1', 'A23 E2'],
  'h1-023': [...run('A11', 'E1', 'E2'), ...run('A13', 'E1', 'E2')],
  'c1-004': ['Q9 S1', 'Q9 S2', 'Q9 E2'], 'c1-005': ['Q13 S1', 'Q13 S2', 'Q13 E2'], 'c1-052': ['Q12 S1', 'Q12 S2'], 'h2-074': ['B5 S2'],
};
export const microOf = code => Object.keys(ASSIGN).find(m => ASSIGN[m].includes(code)) || null;

// The run badges in view, where the map puts them: [run, x, y] (50 × 32 map units).
const BADGES = [['A11', -235, 269], ['A13', -155, 269], ['A15', -75, 269], ['A17', 5, 269], ['A19', 85, 269], ['A21', 175, 244], ['A23', 255, 185], ['B5', 265, 223],
  ['A8', -245, -56], ['A10', -165, -56], ['A12', -85, -56], ['A14', -5, -56], ['A16', 75, -56], ['A18', 155, -56], ['A20', 255, -56], ['A2', -165, -177], ['A4', 175, -186],
  ['Q4', -165, -215], ['03', 265, -381], ['Q17', 185, -375], ['02', 195, -337], ['Q16', 115, -396], ['Q14', 40, -396], ['Q15', 75, -276], ['Q13', -30, -336], ['Q12', -145, -296], ['Q9', -265, -336]];

// The colours of styles/app.css .map.real.li: [fill, stroke, stroke width].
const LOOK = { base: ['#CBD0D8', '#B9BFC9', 1.5], checked: ['#DCFCE7', '#16A34A', 1.6], wrong: ['#FEE2E2', '#DC2626', 2.2], focus: ['#F3EEFC', '#5B21B6', 2.6] };
export const VIEW = [-262, -440, 580, 994];

// checked, wrong: the micro-departments so marked this cycle; open: the one
// in hand; tapped: the shelf last tapped.
export function liMap({ checked = [], wrong = [], open = '', tapped = '', view = VIEW } = {}) {
  const C = new Set(checked), X = new Set(wrong);
  let s = `<svg class="lb2-svg" viewBox="${view.join(' ')}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">`;
  for (const [code, , x, y, w, h] of SHELVES) {
    const m = code ? microOf(code) : null;
    const k = m && m === open ? 'focus' : m && X.has(m) ? 'wrong' : m && C.has(m) ? 'checked' : 'base';
    const [fill, stroke, sw] = LOOK[k], sel = code && code === tapped;
    s += `<rect data-s="${code}" x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="${sel ? '#111827' : stroke}" stroke-width="${sel ? 3 : sw}"/>`;
  }
  return s + `<g class="lb2-bdg">${BADGES.map(([r, x, y]) => `<rect x="${x}" y="${y}" width="50" height="32" rx="8"/><text x="${x + 25}" y="${y + 16}">${r}</text>`).join('')}</g></svg>`;
}
