// Applying a suggested map edit to a map document (the editor's source, as
// published): the owner console's Apply to map, and the tests. Pure: it
// changes the document handed to it and returns how many shelves changed.
//
//   rename  the shelf named x.shelf ("A16 S2") on x.floor (or any floor)
//           takes the new name when it reads as a shelf code ("A17 S2").
//           One shelf only: when several share the name, the one at x.pos
//           (the shelf tapped); without a position, none (0: by hand).
//   name    the unnamed shelf at x.pos on x.floor takes the name
//   flag    nothing to change on the map: 0
//
//   applyEdit(doc, x) → number of shelves changed (0: make it by hand)
//   oneShelf(hits, pos) → the one shelf of hits a rename changes, or null

export const SHELF_CODE = /^([A-Z]{1,3}\d{1,4})(?:[\s-]?([SEP]\d{1,2}))?$/;
const full = s => ((s.name || '') + (s.subname ? ' ' + s.subname : '')).toUpperCase().trim();

export function parseCode(to) {
  const m = SHELF_CODE.exec(String(to || '').trim().toUpperCase());
  return m ? { name: m[1], subname: m[2] || '' } : null;
}

const at = (s, pos) => !!pos && Math.abs(Number(s.x) - pos.x) < 0.5 && Math.abs(Number(s.y) - pos.y) < 0.5;

// The one shelf a rename changes (decision 42): the only one with that name,
// or, when several share it (Busselton has 15 names used twice), the one at
// pos, the shelf tapped or captured. null when they can't be told apart: the
// owner makes it by hand. The editor's Accept and its Field Mode merge use
// this too (window.MapEdits, from editor/detect-boot.js).
export function oneShelf(hits, pos) { return hits.length === 1 ? hits[0] : hits.find(s => at(s, pos)) || null; }

export function applyEdit(doc, x) {
  if (!doc || !Array.isArray(doc.floors) || !x) return 0;
  const code = parseCode(x.to);
  if (!code || (x.kind !== 'rename' && x.kind !== 'name')) return 0;
  const floors = doc.floors.filter(f => !x.floor || f.id === x.floor);
  const shelves = floors.flatMap(f => f.shelves || []);
  const hits = x.kind === 'rename'
    ? shelves.filter(s => full(s) === String(x.shelf || '').toUpperCase().trim())
    : shelves.filter(s => !s.name && at(s, x.pos));
  // A rename changes one shelf: the only one with that name, or the one at
  // its position. It used to rename every shelf sharing the name.
  const pick = x.kind === 'name' ? hits : [oneShelf(hits, x.pos)].filter(Boolean);
  for (const s of pick) { s.name = code.name; s.subname = code.subname; }
  return pick.length;
}
