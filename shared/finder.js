// What a search finds beyond the map and the catalogue: the store's own
// records. Pure, over the state the device holds (an area it may not read
// is simply empty), so the palette and the tests share it.
//
//   findRecords(state, query) → {
//     manifests: [{ manNo, dcNo, despatch, consols, cartons, truck }],
//     consols:   [{ id, cons, cartons, dept, truck, manNo, bay, status, closed } | { id, seen: ledger entry }],
//     cages:     [{ id, ring, location, lines, units, status, has }],      has: the keycode's quantity
//     loads:     [{ id, label, status, date, pallets, has }],               has: pallets carrying the keycode or named
//     offsite:   [{ pid, title, cb, rec, has }],
//   }
//
// A query of digits is a keycode (6 to 8), a consolidation (its last nine
// digits, 9 to 22) or a pallet number; anything else matches manifest
// numbers, cage tags, load names and off-site pallets by name.

const digits = q => String(q || '').replace(/\D/g, '');
const LIMIT = 8;

export function findRecords(state, query) {
  const Q = String(query || '').trim(), U = Q.toUpperCase(), L = Q.toLowerCase(), D = digits(Q), numeric = /^\d[\d\s-]*$/.test(Q);
  const out = { manifests: [], consols: [], cages: [], loads: [], offsite: [] };
  if (Q.length < 2) return out;
  const dock = state?.dock || {}, cages = state?.cages || {}, inv = state?.inventory || {};
  const kc = numeric && D.length >= 6 && D.length <= 8 ? D : null;

  // Manifests: by number (as typed), DC number or despatch.
  for (const m of Object.values(dock.manifests || {})) {
    const no = String(m.manNo || '').toUpperCase();
    if (no.includes(U) || (D.length >= 3 && (String(m.dcNo || '') === D || String(m.despatch || '') === D))) out.manifests.push({ manNo: m.manNo, dcNo: m.dcNo || '', despatch: m.despatch || '', consols: m.consols || 0, cartons: m.totalCartons || 0, truck: m.truck || null });
  }

  // Consolidations: the last nine digits name one; trucks first (where it
  // landed), then the ledger (where it was seen or manifested before).
  if (numeric && D.length >= 9) {
    const k = D.slice(-9), seen = new Set();
    const trucks = Object.entries(dock.trucks || {}).sort((a, b) => (a[1].status === 'closed') - (b[1].status === 'closed') || b[0].localeCompare(a[0]));
    for (const [tid, t] of trucks) {
      const on = {}; for (const p of Object.values(t.pallets || {})) for (const id of p.consolIds || []) on[id] = p;
      for (const c of [...(t.manifest?.consols || []), ...(t.carriedConsols || [])]) {
        if (c.id !== k && !String(c.cons || '').endsWith(D)) continue;
        if (seen.has(c.id + tid)) continue; seen.add(c.id + tid);
        const p = on[c.id];
        out.consols.push({ id: c.id, cons: c.cons || '', cartons: c.cartons || 0, dept: c.dept || '', truck: tid, manNo: t.manifest?.manNo || '', bay: p?.ref || null, status: p ? p.status : 'not landed', closed: t.status === 'closed' });
      }
    }
    // A label scanned on a pallet without a manifest (or off it).
    for (const [tid, t] of trucks) for (const p of Object.values(t.pallets || {})) if ((p.scanIds || []).includes(k) && !seen.has(k + tid)) { seen.add(k + tid); out.consols.push({ id: k, cons: '', cartons: 0, dept: '', truck: tid, manNo: t.manifest?.manNo || '', bay: p.ref, status: t.manifest ? 'scanned, not on the manifest' : 'scanned, no manifest yet', closed: t.status === 'closed' }); }
    for (const p of Object.values(dock.rollover?.pallets || {})) if ((p.consolIds || []).includes(k)) out.consols.push({ id: k, cons: '', cartons: 0, dept: '', truck: dock.rollover.from, manNo: '', bay: p.ref, status: 'held for the next truck', closed: true });
    if (!out.consols.length) for (const x of (dock.ledger?.[k] || []).slice().sort((a, b) => b.d.localeCompare(a.d)).slice(0, 3)) out.consols.push({ id: k, seen: x });
  }

  // Cages: by tag, or by a keycode they hold.
  for (const [id, c] of Object.entries(cages)) {
    if (c.status === 'closed') continue;
    const has = kc ? c.items?.[kc] || 0 : 0;
    if (!(has || (!numeric && id.toUpperCase().includes(U)) || (numeric && D.length >= 4 && id.includes(D)))) continue;
    const items = Object.values(c.items || {});
    out.cages.push({ id, ring: c.ring, location: c.location || '', lines: items.length, units: items.reduce((n, q) => n + q, 0), status: c.status, has });
  }

  // Inventory: loads by name, pallet number or a keycode on them; off-site
  // pallets by number, name or a keycode on them.
  for (const l of Object.values(inv.loads || {})) {
    const pals = (l.pallets || []).filter(p => (D.length >= 3 && String(p.pid).includes(D) && numeric) || (!numeric && String(p.pid).toUpperCase() === U) || (kc && (p.items || []).some(i => i.k === kc)));
    if (pals.length || (!numeric && String(l.label || '').toLowerCase().includes(L))) out.loads.push({ id: l.id, label: l.label, status: l.status, date: l.date, pallets: (l.pallets || []).length, has: pals.map(p => p.pid) });
  }
  for (const r of Object.values(inv.offsite || {})) {
    const has = kc ? (r.products || []).filter(p => p.kc === kc).reduce((n, p) => n + (p.q || 0), 0) : 0;
    const byPid = String(r.pid).toUpperCase() === U || (numeric && D.length >= 3 && String(r.pid).includes(D));
    const byName = !numeric && L.length >= 3 && `${r.title || ''} ${r.desc || ''}`.toLowerCase().includes(L);
    if (has || byPid || byName) out.offsite.push({ pid: r.pid, title: r.title || r.desc || '', cb: r.cb || '', rec: r.rec || '', has });
  }
  for (const k of Object.keys(out)) out[k] = out[k].slice(0, LIMIT);
  return out;
}
export const recordCount = r => Object.values(r).reduce((n, l) => n + l.length, 0);
