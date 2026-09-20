// Shared bits for the Back dock views: pallet types and colours, halt
// reasons, truck ids, progress. Reads the dock projection the backdock
// reducers keep (dock.trucks, dock.history, dock.manifests, plan.days).

export const PTYPES = [['chep', 'Chep tubs', '#2953D6'], ['loscam', 'Load pallets', '#B3261E'], ['bulk', 'Bulk', '#69787F']];
export const PT_LETTER = { chep: 'c', loscam: 'l', bulk: 'b' };
export const PT_NAME = Object.fromEntries(PTYPES.map(p => [p[0], p[1]]));
export const PT_COLOUR = Object.fromEntries(PTYPES.map(p => [p[0], p[2]]));
export const HALT_NAME = { hcage: 'Home cage', nostock: 'No stock', equip: 'Equipment', safety: 'Safety', waiting: 'Waiting', other: 'Other' };
export const STD_MINS_PER_CARTON = 0.5;

export const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const truckNo = id => String(id || '').replace(/^\d{4}-\d{2}-\d{2}-T/, '');
export const truckDay = id => String(id || '').slice(0, 10);
export function fmtHM(iso) { if (!iso) return '—'; const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

// Open trucks, today's first, then by number.
export function openTrucks(dock) { return Object.entries(dock.trucks).filter(([, t]) => t.status !== 'closed').map(([id, t]) => ({ id, ...t })).sort((a, b) => b.id.slice(0, 10).localeCompare(a.id.slice(0, 10)) || Number(truckNo(a.id)) - Number(truckNo(b.id))); }
export function nextTruckId(dock) { const day = todayKey(); let n = 1; while (dock.trucks[`${day}-T${n}`]) n++; return `${day}-T${n}`; }
export function pallets(t) { return Object.values(t?.pallets || {}).filter(p => !p.excluded); }
export function progress(t) {
  const ps = pallets(t); let total = 0, done = 0;
  for (const p of ps) { const c = Number(p.cartons) || 0; total += c; if (p.status === 'done') done += c; }
  return { total, done, pct: total ? Math.round(done / total * 100) : 0, count: ps.length, active: ps.filter(p => p.status === 'active').length, doneCount: ps.filter(p => p.status === 'done').length };
}
export function openHalt(t) { const h = t?.halts || []; for (let i = h.length - 1; i >= 0; i--) if (!h[i].end) return h[i]; return null; }
// Who is on which pallet right now.
export function running(t) { const out = {}; for (const p of pallets(t)) { const seg = (p.segments || []).find(s => !s.end); if (seg) out[seg.pid] = p.ref; } return out; }
export const who = m => m.dnum || m.name || m.pid;
export function grid(t) { const g = t?.grid || { rows: 4, cols: 7, rowLabels: 'ABCD' }; const labels = g.rowLabels || 'ABCDEFGH'; const refs = []; for (let r = 0; r < (g.rows || 4); r++) for (let c = 1; c <= (g.cols || 7); c++) refs.push(labels[r] + c); return { cols: g.cols || 7, refs }; }
export const startable = p => p && (p.status === 'landed' || p.status === 'assigned' || p.status === 'paused');
