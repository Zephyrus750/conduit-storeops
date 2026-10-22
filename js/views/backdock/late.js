// Late manifests (Decant Visualiser's linkLateSheet): pallets landed before
// the manifest arrived, or without a readable label, are linked to its
// consols afterwards. Exact scans match first, then a carton count that
// occurs once on each side; the rest get suggestions ranked by how close a
// consol's cartons are to the pallet's (logged, or estimated from the time
// worked at the people's rates). The manager confirms; manifest.linkLate
// records how each link was made.

import { esc, toast } from '../../ui.js';
import { tx, txn } from '../../i18n.js';
import { pallets, truckNo } from './common.js';
import { segWorkedMs } from '../../../shared/reducers/backdock.js';

const st = { truck: null, picks: {} };
export const unlinked = t => pallets(t).filter(p => !p.carriedFrom && !p.consolIds.length);

function plan(t, rates) {
  const taken = new Set(pallets(t).flatMap(p => p.consolIds));
  const free = (t.manifest?.consols || []).filter(c => !taken.has(c.id) && !c.carried);
  const todo = unlinked(t).sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true })), auto = [];
  // 1. Exact scans.
  for (const p of [...todo]) {
    const hits = [];
    for (const sid of p.scanIds || []) { const id9 = String(sid).slice(-9), c = free.find(x => !hits.includes(x) && (x.id === id9 || x.id === sid || x.cons.endsWith(id9) || id9.endsWith(x.cons.slice(-9)))); if (c) hits.push(c); }
    if (hits.length) { auto.push({ ref: p.ref, ids: hits.slice(0, 8).map(c => c.id), basis: 'scan' }); for (const c of hits) free.splice(free.indexOf(c), 1); todo.splice(todo.indexOf(p), 1); }
  }
  // 2. A carton count that occurs once among the pallets and once among the consols.
  const countP = n => todo.filter(p => p.cartons === n).length, countC = n => free.filter(c => c.cartons === n).length;
  for (const p of [...todo]) if (p.cartons != null && countP(p.cartons) === 1 && countC(p.cartons) === 1) { const c = free.find(x => x.cartons === p.cartons); auto.push({ ref: p.ref, ids: [c.id], basis: 'cartons' }); free.splice(free.indexOf(c), 1); todo.splice(todo.indexOf(p), 1); }
  // 3. Suggestions by carton fit.
  const now = Date.now(), decide = todo.map(p => {
    let n = p.cartons ?? null, est = false, mins = 0;
    if (n == null) {
      mins = p.segments.reduce((k, s) => k + segWorkedMs(t, s, now), 0) / 60000;
      const ppl = [...new Set(p.segments.map(s => s.pid))], rs = ppl.map(pid => rates?.[pid]?.eligible ? rates[pid].rate28d : null).filter(Boolean);
      const rate = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 60 / (t.minsPerCarton || 0.5);
      if (mins > 0) { n = Math.round(mins / 60 * rate); est = true; }
    }
    const cands = free.map(c => ({ ...c, d: n == null ? 1e9 : Math.abs(c.cartons - n) })).sort((a, b) => a.d - b.d).slice(0, 5);
    const pre = cands[0] && n != null && cands[0].d <= Math.max(3, n * 0.15) ? cands[0].id : '';
    return { p, n, est, mins, cands, pre, people: [...new Set(p.segments.map(s => s.pid))] };
  });
  return { auto, decide, free };
}

export function linkSheet(t, rates) {
  if (st.truck !== t.id) { st.truck = t.id; st.picks = {}; }
  const { auto, decide } = plan(t, rates), fm = m => tx('{h}h {m}m', { h: Math.floor(m / 60), m: String(Math.round(m % 60)).padStart(2, '0') }), nUn = unlinked(t).length;
  return `<div class="card ll"><div class="ch"><h3>${tx('Link manifest to landed pallets')}</h3><span class="go" data-act="ll-close">${tx('Close')}</span></div>` +
    `<p class="lbl">${txn(nUn, '{n} pallet landed without a match · {c} consols on manifest {no}. Links are recorded as linked late, with how each match was made.', '{n} pallets landed without a match · {c} consols on manifest {no}. Links are recorded as linked late, with how each match was made.', { c: (t.manifest?.consols || []).length, no: esc(t.manifest?.manNo || '') })}</p>` +
    (auto.length ? `<div class="pt3">${tx('Matched automatically')} · ${txn(auto.length, '{n} pallet', '{n} pallets')}</div><div class="list">${auto.map(a => `<div class="li"><span class="loc">${esc(a.ref)}</span><span class="nm">→ ${a.ids.map(esc).join(' + ')} <small class="cs-dim">(${a.basis === 'scan' ? tx('scanned code') : tx('carton count')})</small></span></div>`).join('')}</div>` : '') +
    (decide.length ? `<div class="pt3">${tx('Needs a decision · pick the consol (ranked by carton fit)')}</div><div class="list">${decide.map(d => `<div class="li ll-row"><span class="loc">${esc(d.p.ref)}</span><span class="nm">${d.n == null ? tx('no count') : d.est ? tx('≈{n} ctn est. from {time} worked', { n: d.n, time: fm(d.mins) }) : tx('{n} ctn', { n: d.n })}${d.people.length ? ' · ' + d.people.map(esc).join(', ') : ''}</span><select class="bdr-in" data-ll="${esc(d.p.ref)}"><option value="">${tx('— leave unlinked —')}</option>${d.cands.map(c => `<option value="${esc(c.id)}"${(st.picks[d.p.ref] ?? d.pre) === c.id ? ' selected' : ''}>${esc(c.id)} — ${tx('{n} ctn', { n: c.cartons })} ${c.d === 0 ? tx('(exact)') : c.d < 1e9 ? `(±${c.d})` : ''} · ${esc(c.dept || '')}</option>`).join('')}</select></div>`).join('')}</div>` : '') +
    (!auto.length && !decide.length ? `<p class="lbl">${tx('Every landed pallet is already linked.')}</p>` : `<div class="acts2" style="display:flex;gap:8px;margin-top:10px"><button class="btn primary sm" data-act="ll-apply">${tx('Apply links')}</button><button class="btn sm" data-act="ll-close">${tx('Cancel')}</button></div>`) + '</div>';
}
export const linkPick = (ref, id) => { st.picks[ref] = id; };
export async function applyLinks(ctx, t, rates) {
  const { auto, decide } = plan(t, rates), used = new Set(auto.flatMap(a => a.ids)), links = [...auto.map(a => ({ bay: a.ref, consolIds: a.ids, basis: a.basis }))];
  let dupes = 0;
  for (const d of decide) {
    const id = st.picks[d.p.ref] ?? d.pre; if (!id) continue;
    if (used.has(id)) { dupes++; continue; } used.add(id);
    const c = d.cands.find(x => x.id === id), basis = d.n == null ? 'manual' : c?.d === 0 && !d.est ? 'cartons' : d.est ? 'time' : 'manual';
    links.push({ bay: d.p.ref, consolIds: [id], basis });
  }
  if (!links.length) return toast(tx('Nothing picked to link'));
  await ctx.store.dispatch({ type: 'manifest.linkLate', entity: { truck: t.id }, payload: { links } });
  st.picks = {};
  toast(txn(links.length, '{n} pallet linked to the manifest on Truck {t}', '{n} pallets linked to the manifest on Truck {t}', { t: truckNo(t.id) }) + (dupes ? ' · ' + tx('{n} skipped (consol picked twice)', { n: dupes }) : ''));
}
