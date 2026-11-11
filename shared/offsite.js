// The off-site register's rows and groups (the 6 Nov 2026 off-site design,
// boards 5 and 6). Every pallet in off-site storage is one register row
// (inventory.offsite): a row from the master list or added by hand, a
// consol of a whole truck marked off-site in the Planner (plan.route), or a
// pallet sent from the dock at Receiving (pallet.offsite). The ones that
// came on a manifest name it, so the register reads By manifest. Pure and
// shared: the reducers keep rows with these, the views group them.
//
//   offsiteRow(r, at, sys)          a register row, checked and trimmed; sys keeps the fields
//                                   only reducers set (via, from, truck, bay, call, recTruck, of)
//   regOf(s)                        the store state's register slice, made if missing
//   sameSlot(a, b)                  two { date, slot } name the same truck
//   rowHas(r, id)                   the row is that consol (its pid or one of its consols)
//   tickBack(s, id, truckId, day)   a consol landed on a truck: its live row is back that day
//   untick(s, id, truckId)          that landing was a wrong scan: the row is off-site again
//   callRows(s, pids, call)         rows a planned truck brings back (call { date, slot } or null)
//   callTruck(r)                    'YYYY-MM-DD-Tn' of the truck a row was called back on, or null
//   offsiteGroups(inv, today)       [group] By manifest: manifests, off-site loads, other pallets
//   backOn(inv, truckId)            { n, back, sent } the rows called back on that truck

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAN = /^[\w-]{1,20}$/;
const TRUCK = /^\d{4}-\d{2}-\d{2}-T\d+$/;
const BAY = /^[A-Z]\d{1,2}$/;
const day = v => (typeof v === 'string' && (DAY.test(v) || v === 'yes') ? v : '');
const slotOf = v => v && typeof v === 'object' && DAY.test(String(v.date)) && Number.isInteger(Number(v.slot)) && v.slot >= 1 && v.slot <= 4 ? { date: String(v.date), slot: Number(v.slot) } : null;
const count = v => Math.max(0, Math.min(9999, Math.round(Number(v) || 0)));

export function offsiteRow(r, at, sys = false) {
  const pid = String(r?.pid ?? '').trim().slice(0, 20); if (!pid) return null;
  const row = { pid, sent: day(r.sent), time: String(r.time || '').slice(0, 8), desc: String(r.desc || '').slice(0, 200), title: String(r.title || '').slice(0, 80),
    products: (Array.isArray(r.products) ? r.products : []).filter(x => x && /^\d{6,10}$/.test(String(x.kc))).slice(0, 20).map(x => ({ kc: String(x.kc), q: Number(x.q) || 0 })),
    req: String(r.req || '').slice(0, 40), cb: day(r.cb), rec: day(r.rec), note: String(r.note || '').slice(0, 200), at };
  // What a pallet that came on a manifest says about itself.
  if (MAN.test(String(r.man ?? ''))) row.man = String(r.man);
  if (r.ctn != null && count(r.ctn)) row.ctn = count(r.ctn);
  // A report's dept is '047/085' and its mix [['047', cartons, units], …].
  const depts = Array.isArray(r.depts) ? [...new Set(r.depts.flatMap(x => Array.isArray(x) ? [String(x[0])] : String(x ?? '').split('/')).filter(d => /^\d{3}$/.test(d)))].slice(0, 6) : [];
  if (depts.length) row.depts = depts;
  const consols = Array.isArray(r.consols) ? [...new Set(r.consols.map(String).filter(x => /^\d{9}$/.test(x)))].slice(0, 40) : [];
  if (consols.length) row.consols = consols;
  if (!sys) return row;
  if (r.via === 'route' || r.via === 'dock') row.via = r.via;
  if (slotOf(r.from)) row.from = slotOf(r.from);
  if (TRUCK.test(String(r.truck ?? ''))) row.truck = String(r.truck);
  if (BAY.test(String(r.bay ?? ''))) row.bay = String(r.bay);
  if (r.of != null && count(r.of)) row.of = count(r.of);
  if (slotOf(r.call)) row.call = slotOf(r.call);
  if (TRUCK.test(String(r.recTruck ?? ''))) row.recTruck = String(r.recTruck);
  return row;
}

export const regOf = s => (s.inventory ||= { offsite: {}, offsiteAt: null, offsiteSrc: '', loads: {} });
export const sameSlot = (a, b) => !!a && !!b && a.date === b.date && Number(a.slot) === Number(b.slot);
export const rowHas = (r, id) => r.pid === id || (r.consols || []).includes(id);
export const callTruck = r => r?.call ? `${r.call.date}-T${r.call.slot}` : null;

// A consol scanned on a truck: the live row holding it is back, unless that
// truck is the one it was sent from, or it landed before it was sent.
export function tickBack(s, id, truckId, landed) {
  const reg = s.inventory?.offsite; if (!reg || !id) return;
  for (const r of Object.values(reg)) {
    if (r.rec || !rowHas(r, id) || r.truck === truckId || (r.sent && r.sent > landed)) continue;
    r.rec = landed; r.recTruck = truckId;
  }
}
export function untick(s, id, truckId) {
  const reg = s.inventory?.offsite; if (!reg || !id) return;
  for (const r of Object.values(reg)) if (r.recTruck === truckId && rowHas(r, id)) { r.rec = ''; delete r.recTruck; }
}
export function callRows(s, pids, call) {
  const reg = regOf(s).offsite;
  for (const pid of pids) { const r = reg[pid]; if (!r) continue; if (call) r.call = call; else delete r.call; }
}

const byPid = (a, b) => (a.bay || '').localeCompare(b.bay || '', undefined, { numeric: true }) || a.pid.localeCompare(b.pid, undefined, { numeric: true });

// By manifest. A group:
//   { key, kind: manifest|load|other, man, load, label, via: route|dock|list, sent,
//     rows (all, received too), live (not back), open (live and not called back),
//     ctn (cartons still off-site), of (pallets on the truck, for part off-site),
//     cb (the earliest callback still to come), overdue, calls [{ date, slot, n }],
//     state: back | called | overdue | part | off }
// Manifests first (overdue, then by callback, then sent), then off-site
// loads, then the pallets that came on no manifest.
export function offsiteGroups(inv, today) {
  const groups = new Map();
  const add = (key, base) => { if (!groups.has(key)) groups.set(key, { key, rows: [], ...base }); return groups.get(key); };
  for (const r of Object.values(inv?.offsite || {})) {
    const g = r.man ? add('man:' + r.man, { kind: 'manifest', man: r.man, label: r.man }) : add('other', { kind: 'other', label: '' });
    g.rows.push(r);
  }
  const out = [];
  for (const g of groups.values()) {
    g.rows.sort(byPid);
    g.live = g.rows.filter(r => !r.rec);
    g.open = g.live.filter(r => !r.call);
    g.via = g.rows.some(r => r.via === 'dock') ? 'dock' : g.rows.some(r => r.via === 'route') ? 'route' : 'list';
    g.sent = g.rows.map(r => r.sent).filter(x => DAY.test(x)).sort()[0] || '';
    g.ctn = g.live.reduce((n, r) => n + (r.ctn || 0), 0);
    g.of = Math.max(0, ...g.rows.map(r => r.of || 0)) || null;
    g.from = g.rows.find(r => r.from)?.from || null;
    g.truck = g.rows.find(r => r.truck)?.truck || null;
    g.cb = g.open.map(r => r.cb).filter(x => DAY.test(x)).sort()[0] || '';
    g.overdue = !!g.cb && g.cb < today;
    const calls = new Map(); for (const r of g.live) if (r.call) { const k = callTruck(r); calls.set(k, { ...r.call, n: (calls.get(k)?.n || 0) + 1 }); }
    g.calls = [...calls.values()].sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot);
    g.state = !g.live.length ? 'back' : !g.open.length ? 'called' : g.overdue ? 'overdue' : g.via === 'dock' ? 'part' : 'off';
    out.push(g);
  }
  for (const l of Object.values(inv?.loads || {})) if (l.status === 'offsite') {
    const live = l.pallets.map(p => ({ pid: p.pid, depts: [...new Set(p.items.map(i => i.dept).filter(Boolean))].slice(0, 6), units: p.items.reduce((n, i) => n + (Number(i.q) || 0), 0) }));
    const call = slotOf(l.call);
    out.push({ key: 'load:' + l.id, kind: 'load', load: l.id, label: l.label, via: 'load', sent: l.date || '', rows: live, live, open: call ? [] : live, ctn: 0, of: null, from: null, truck: null, cb: '', overdue: false, calls: call ? [{ ...call, n: live.length }] : [], state: call ? 'called' : 'off' });
  }
  const rank = g => g.kind === 'manifest' ? 0 : g.kind === 'load' ? 1 : 2;
  const live = g => g.state === 'back' ? 1 : 0;
  return out.sort((a, b) => live(a) - live(b) || rank(a) - rank(b) || (b.overdue - a.overdue) || (a.cb || '9').localeCompare(b.cb || '9') || (b.sent || '').localeCompare(a.sent || '') || String(a.label).localeCompare(String(b.label)));
}

// The pallets a truck brings back from off-site: called back on it, and
// how many of those have landed (ticked off by a scan, or by hand).
export function backOn(inv, truckId) {
  const rows = Object.values(inv?.offsite || {}).filter(r => callTruck(r) === truckId);
  const sent = rows.map(r => r.sent).filter(x => DAY.test(x)).sort()[0] || '';
  return { n: rows.length, back: rows.filter(r => r.rec).length, sent };
}
