// Applying a suggested map edit to a map document (the editor's source, as
// published): the owner console's Apply to map, and the tests. Pure: it
// changes the document handed to it and returns how many shelves changed.
//
//   rename  the shelf named x.shelf ("A16 S2") on x.floor (or any floor)
//           takes the new name when it reads as a shelf code ("A17 S2")
//   name    the unnamed shelf at x.pos on x.floor takes the name
//   flag    nothing to change on the map: 0
//
//   applyEdit(doc, x) → number of shelves changed (0: make it by hand)

export const SHELF_CODE = /^([A-Z]{1,3}\d{1,4})(?:[\s-]?([SEP]\d{1,2}))?$/;
const full = s => ((s.name || '') + (s.subname ? ' ' + s.subname : '')).toUpperCase().trim();

export function parseCode(to) {
  const m = SHELF_CODE.exec(String(to || '').trim().toUpperCase());
  return m ? { name: m[1], subname: m[2] || '' } : null;
}

export function applyEdit(doc, x) {
  if (!doc || !Array.isArray(doc.floors) || !x) return 0;
  const code = parseCode(x.to);
  if (!code || (x.kind !== 'rename' && x.kind !== 'name')) return 0;
  const floors = doc.floors.filter(f => !x.floor || f.id === x.floor);
  let n = 0;
  for (const f of floors) for (const s of f.shelves || []) {
    const hit = x.kind === 'rename' ? full(s) === String(x.shelf || '').toUpperCase().trim()
      : !s.name && x.pos && Math.abs(Number(s.x) - x.pos.x) < 0.5 && Math.abs(Number(s.y) - x.pos.y) < 0.5;
    if (hit) { s.name = code.name; s.subname = code.subname; n++; }
  }
  return n;
}
