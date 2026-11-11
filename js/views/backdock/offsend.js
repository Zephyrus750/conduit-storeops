// Send to off-site at Receiving (the 6 Nov 2026 off-site design, boards 6
// and 7; managers only). No room on the dock for all of it: on the desk,
// "Pick pallets for off-site" turns the grid into a picker, a bar says what
// is picked, and the side sheet sends them with a callback date and who
// asked. On the phone it starts from a pallet's sheet, with "Add more
// pallets from the grid". The pallets come off the grid onto the off-site
// register under the truck's manifest (pallet.offsite); the truck closes
// without them, tagged Part off-site · n of N.
//
//   off                        this device's picking: { truck, pick: Set | null, sheet, cb, req, note, busy }
//   pickable(p)                a pallet nobody has started
//   pickClass(ref, p)          the grid square's class while picking
//   partTag(t)                 Part off-site · 4 of 12, on a truck that sent some
//   pickBar(t, phone)          what is picked, Clear and Send to off-site…
//   sendSheet(t, phone)        the sheet: the pallets, Callback, Requested by, Note
//   onOffAct(ctx, act, a, t, root) → true when it handled the action

import { ic, esc, toast, fmtDay, today } from '../../ui.js';
import { tx, txn } from '../../i18n.js';
import { sheetHtml } from '../../sheet.js';
import { truckNo } from './common.js';
import { consolsOf } from '../../../shared/reducers/backdock.js';
import { deptLine } from './callback.js';

export const off = { truck: null, pick: null, sheet: false, cb: '', req: '', note: '', busy: false };
const reset = () => Object.assign(off, { pick: null, sheet: false, cb: '', req: '', note: '', busy: false });
export const pickable = p => !!p && !p.segments?.length && p.status !== 'done' && p.status !== 'active';
export function pickClass(ref, p) { return off.pick ? (off.pick.has(ref) ? ' pk' : pickable(p) ? ' pko' : ' pkx') : ''; }
export function partTag(t) {
  const n = t?.offsite?.length || 0; if (!n) return '';
  const of = n + Object.values(t.pallets || {}).filter(p => !p.excluded).length;
  return `<span class="rt-tag part">${ic('stack')}${tx('Part off-site · {n} of {of}', { n, of })}</span>`;
}
// Picking belongs to one truck: switching truck lets it go.
export function syncTruck(t) { if (off.truck !== (t?.id || null)) { reset(); off.truck = t?.id || null; } }

const picked = t => [...(off.pick || [])].map(ref => t.pallets[ref]).filter(pickable);
const ctnOf = ps => ps.reduce((n, p) => n + (p.cartons || 0), 0);
export function pickBar(t, phone = false) {
  if (!off.pick) return '';
  const ps = picked(t), refs = ps.map(p => p.ref).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const what = ps.length ? `<b>${txn(ps.length, '{n} pallet picked', '{n} pallets picked')}</b><span>${esc(refs.join(', '))}${ctnOf(ps) ? ' · ' + tx('{n} ctn', { n: ctnOf(ps) }) : ''}</span>` : `<b>${tx('Pick pallets for off-site')}</b><span>${tx('Tap the pallets there is no room for. Started pallets can’t go.')}</span>`;
  const acts = `${ps.length ? `<button class="btn sm" data-act="off-clear">${tx('Clear')}</button>` : ''}<button class="btn sm" data-act="off-cancel">${tx('Cancel')}</button><button class="btn sm primary" data-act="off-send"${ps.length ? '' : ' disabled'}>${ic('stack')}${tx('Send to off-site…')}</button>`;
  // The phone's strip: what is picked, × to stop picking, and Send.
  if (phone) return `<div class="dk-strip off-strip"><div class="dk-st"><div class="dk-l1"><b class="t">${ps.length ? txn(ps.length, '{n} pallet picked', '{n} pallets picked') : tx('Pick pallets for off-site')}</b></div><div class="dk-l2">${ps.length ? `${esc(refs.join(', '))}${ctnOf(ps) ? ' · ' + tx('{n} ctn', { n: ctnOf(ps) }) : ''}` : tx('Tap the pallets there is no room for. Started pallets can’t go.')}</div></div>` +
    `<button class="off-x" data-act="off-cancel" aria-label="${tx('Cancel')}" title="${tx('Cancel')}">${ic('x')}</button><button class="dk-go" data-act="off-send"${ps.length ? '' : ' disabled'}>${ic('stack')}${tx('Send to off-site…')}</button></div>`;
  return `<div class="off-bar">${ic('stack')}<div class="off-what">${what}</div><div class="off-acts">${acts}</div></div>`;
}

export function sendSheet(t, phone = false) {
  if (!off.sheet) return '';
  const ps = picked(t), n = ps.length, cs = consolsOf(t), man = t.manifest?.manNo || t.plannedManifest || '';
  const rest = Object.values(t.pallets || {}).filter(p => !p.excluded).length - n, of = n + rest + (t.offsite?.length || 0), sentN = n + (t.offsite?.length || 0);
  const row = p => { const c = cs.filter(x => p.consolIds.includes(x.id)); const depts = c.flatMap(x => [x.dept, ...(x.mix || [])]).flatMap(x => Array.isArray(x) ? [String(x[0])] : String(x || '').split('/')).filter(d => /^\d{3}$/.test(d)); return `<div class="off-r"><b>${esc(p.ref)}</b><span class="mono">${esc(p.consolIds[0] || '—')}${p.consolIds.length > 1 ? ` +${p.consolIds.length - 1}` : ''}</span><span class="dl">${deptLine({ depts: [...new Set(depts)].slice(0, 4) })}</span><small>${p.cartons ? tx('{n} ctn', { n: p.cartons }) : ''}</small>${phone && n > 1 ? `<button class="ibtn" data-act="off-drop" data-ref="${esc(p.ref)}" aria-label="${tx('Take {ref} off the list', { ref: esc(p.ref) })}">${ic('x')}</button>` : ''}</div>`; };
  const title = n === 1 ? tx('Send {ref} to off-site', { ref: esc(ps[0].ref) }) : txn(n, 'Send {n} pallet to off-site', 'Send {n} pallets to off-site');
  const sub = [tx('Truck {n}', { n: esc(truckNo(t.id)) }), man ? esc(man) : '', esc(fmtDay(today()))].filter(Boolean).join(' · ');
  const effect = n === 1 ? tx('It comes off the grid and goes on the Off-site register. The truck closes without it.')
    : tx('They come off the grid and go on the Off-site register, sent today. The other {left} carry on to decant, and the truck closes without these {n}.', { left: rest, n });
  const tag = tx('Its tag becomes Part off-site · {n} of {of}.', { n: sentN, of });
  const body = `<div class="rt-body off-body"><div class="off-list">${ps.map(row).join('')}</div>` +
    (phone ? `<button class="btn sm off-more" data-act="off-more">${ic('plus')}${tx('Add more pallets from the grid')}</button>` : '') +
    `<div class="pf-pair cb-when"><label class="pf"><span class="lbl">${tx('Callback')}</span><input type="date" class="inp" data-off="cb" min="${esc(today())}" value="${esc(off.cb)}"></label><label class="pf"><span class="lbl">${tx('Requested by')}</span><input class="inp" data-off="req" maxlength="40" value="${esc(off.req)}" placeholder="${tx('Name')}"></label></div>` +
    `<label class="pf"><span class="lbl">${tx('Note')}</span><input class="inp" data-off="note" maxlength="200" value="${esc(off.note)}" placeholder="${tx('Anything the yard should know')}"></label>` +
    `<p class="rt-effect offsite">${ic('stack')}<span>${effect} ${tag}</span></p></div>`;
  return sheetHtml({ kind: 'side', cls: 'off-sheet', title, sub, close: 'off-close', busy: off.busy, body,
    foot: `<button class="btn" data-act="off-close"${off.busy ? ' disabled' : ''}>${tx('Cancel')}</button><button class="btn primary" data-act="off-go"${off.busy || !n ? ' disabled' : ''}>${off.busy ? tx('Saving…') : `${ic('stack')}${tx('Send to off-site')}`}</button>` });
}

const keep = root => { for (const k of ['cb', 'req', 'note']) { const i = root.querySelector(`[data-off="${k}"]`); if (i) off[k] = i.value.trim(); } };
export async function onOffAct(ctx, act, a, t, root, st) {
  if (!act.startsWith('off-') || !t) return false;
  syncTruck(t);
  if (act === 'off-pick') { off.pick = off.pick ? null : new Set(); st.sel = null; ctx.rerender(); return true; }
  if (act === 'off-one') { const ref = a.dataset.ref; off.pick = new Set([ref]); st.sel = null; off.sheet = !!ctx.isMobile; ctx.rerender(); return true; }
  if (act === 'off-clear') { off.pick = new Set(); ctx.rerender(); return true; }
  if (act === 'off-cancel') { reset(); ctx.rerender(); return true; }
  if (act === 'off-send') { if (!picked(t).length) return true; off.sheet = true; ctx.rerender(); return true; }
  if (act === 'off-more') { keep(root); off.sheet = false; ctx.rerender(); return true; }
  if (act === 'off-drop') { keep(root); off.pick?.delete(a.dataset.ref); ctx.rerender(); return true; }
  if (act === 'off-close') { if (off.busy) return true; keep(root); off.sheet = false; if (ctx.isMobile && (off.pick?.size || 0) <= 1) off.pick = null; ctx.rerender(); return true; }
  if (act === 'off-go') {
    keep(root);
    const bays = picked(t).map(p => p.ref); if (!bays.length) return true;
    off.busy = true; ctx.rerender();
    try {
      await ctx.store.dispatch({ type: 'pallet.offsite', entity: { truck: t.id }, payload: { bays, cb: off.cb || null, req: off.req, note: off.note } });
      reset(); off.truck = t.id;
      toast(txn(bays.length, '{n} pallet sent to off-site', '{n} pallets sent to off-site'));
    } catch (err) { off.busy = false; toast(err.message, 'bad'); }
    ctx.rerender();
    return true;
  }
  return false;
}
// While picking, a square is picked or let go; a started one says why not.
export function pickCell(ctx, t, ref) {
  if (!off.pick) return false;
  const p = t.pallets[ref];
  if (!p) return true;
  if (!pickable(p)) { toast(tx('{ref} has been started: only pallets nobody has worked go off-site', { ref }), 'bad'); return true; }
  if (off.pick.has(ref)) off.pick.delete(ref); else off.pick.add(ref);
  ctx.rerender();
  return true;
}
// The note's input keeps what was typed when another device repaints.
export function onOffInput(e) { const i = e.target.closest?.('[data-off]'); if (i) off[i.dataset.off] = i.value; }
