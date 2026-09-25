// Shared bits for the Back dock views: pallet types and colours, halt
// reasons, truck ids, progress. Reads the dock projection the backdock
// reducers keep (dock.trucks, dock.history, dock.manifests, plan.days).

export const PTYPES = [['chep', 'Chep tubs', '#2953D6'], ['loscam', 'Load pallets', '#B3261E'], ['bulk', 'Bulk', '#69787F']];
export const PT_LETTER = { chep: 'c', loscam: 'l', bulk: 'b' };
export const PT_NAME = Object.fromEntries(PTYPES.map(p => [p[0], p[1]]));
export const PT_COLOUR = Object.fromEntries(PTYPES.map(p => [p[0], p[2]]));
export const HALT_NAME = { hcage: 'Home cage', nostock: 'No stock', equip: 'Equipment', safety: 'Safety', waiting: 'Waiting', other: 'Other' };
export const STD_MINS_PER_CARTON = 0.5;

export const todayKey = () => today();
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
// People are D-numbers on the dock, never names.
export const who = m => m.pid;
export { dnumId } from '../../../shared/reducers/backdock.js';
// A pallet not finished and not left out: what carries over to the next truck.
export const unfinished = t => pallets(t).filter(p => p.status !== 'done' && !p.excluded);
export function grid(t) { const g = t?.grid || { rows: 4, cols: 7, rowLabels: 'ABCD' }; const labels = g.rowLabels || 'ABCDEFGH'; const refs = []; for (let r = 0; r < (g.rows || 4); r++) for (let c = 1; c <= (g.cols || 7); c++) refs.push(labels[r] + c); return { cols: g.cols || 7, refs }; }
export const startable = p => p && (p.status === 'landed' || p.status === 'assigned' || p.status === 'paused');

// ── manifests ──────────────────────────────────────────────────────────
import { today } from '../../ui.js';
import { parseManifestSheets, manifestDoc, attachConsols } from '../../../shared/manifest.js';
import { MICRO } from '../../data/micros.js';
export function microDept(code) { const c = String(code || '').padStart(3, '0'); for (const [d, list] of Object.entries(MICRO)) if (list.some(x => x.startsWith(c + ' '))) return d; return ''; }
export const manifestIndex = dock => Object.values(dock.manifests || {}).sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));

// SheetJS reads the .xls (Crystal export) and .xlsx; it loads on first use
// from the CDN, since publishing a report is a desktop job with a network.
let xlsxLoading = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxLoading) return xlsxLoading;
  xlsxLoading = new Promise((resolve, reject) => {
    const sc = document.createElement('script'); sc.src = 'vendor/xlsx/xlsx.full.min.js';   // self-hosted: works offline, no third-party script
    sc.onload = () => resolve(window.XLSX); sc.onerror = () => { xlsxLoading = null; reject(new Error('the spreadsheet reader did not load. Check the connection and try again')); };
    document.head.appendChild(sc);
  });
  return xlsxLoading;
}
export async function readManifestFile(file) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: false, raw: true });
  const sheets = wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) }));
  const parsed = parseManifestSheets(sheets);
  if (!parsed.consols.length) throw new Error(parsed.diag || 'no consolidations found in that file');
  return parsed;
}
// Read, ask for a manifest number when the report carries none, publish.
export async function publishManifestFile(ctx, file) {
  const parsed = await readManifestFile(file);
  let manNo = parsed.manNo;
  if (!/^[\w-]{1,20}$/.test(manNo)) { manNo = (prompt(`${file.name}: the report has no manifest number. Enter one:`, '') || '').trim(); if (!manNo) throw new Error('a manifest needs a number'); }
  const doc = manifestDoc(parsed, { filename: file.name, by: ctx.session.current?.device || '', manNo });
  const r = await ctx.api(`/v1/store/${ctx.storeNo}/manifest`, { method: 'POST', body: doc, timeoutMs: 60000 });
  return { ...r, doc };
}
export async function attachManifest(ctx, truck, manNo) {
  const doc = await ctx.api(`/v1/store/${ctx.storeNo}/manifest/${encodeURIComponent(manNo)}`);
  await ctx.store.dispatch({ type: 'manifest.attach', entity: { truck }, payload: { manNo: doc.manNo, dcNo: doc.dcNo || '', despatch: doc.despatch || '', consols: attachConsols(doc) } });
  return doc;
}
