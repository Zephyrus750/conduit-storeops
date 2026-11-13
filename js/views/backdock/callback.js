// Off-site pallets by manifest, on screen (the 6 Nov 2026 off-site design,
// boards 5–7): the tags a group carries, the line that says where it came
// from, the Call back sheet that plans the truck bringing it home, and the
// tag a called-back truck shows. The Off-site pallets register, the
// Planner's "Off-site, to call back" card, Receiving and the phone use these.
//
//   groupTag(g, today)            Off-site · back Mon 9 Nov | Part off-site · 4 of 12 |
//                                 Called back · Sat 7 Nov, Truck 2 | Overdue since Mon 2 Nov
//   groupSub(g)                   "sent Tue 3 Nov · 12 pallets", "a load · sent …", "sent at the dock …"
//   groupName(g)                  the manifest number, the load's name, or Other pallets
//   callText(c)                   "Sat 7 Nov, Truck 2"
//   deptLine(r)                   a pallet's departments: "Home 047 · Kids 085"
//   backTag(ctx, truckId) → html  a truck bringing pallets back: From off-site · sent …, n of N back
//   callbackSheet(ctx, g) → Promise<boolean>   Call back: which pallets, the day, ETA and truck

import { ic, esc, toast, fmtDay, today } from '../../ui.js';
import { tx, txn } from '../../i18n.js';
import { openSheet } from '../../sheet.js';
import { backOn } from '../../../shared/offsite.js';
import { truckNo, slotRef, microName } from './common.js';
import { routeManifest } from '../../../shared/dockroutes.js';
import { rtTag } from './routes.js';

export const callText = c => tx('{day}, Truck {no}', { day: esc(fmtDay(c.date)), no: c.slot });
export function groupTag(g) {
  if (g.state === 'back') return rtTag('good', 'check', tx('All back'));
  if (g.state === 'called') return rtTag('info', 'undo', tx('Called back · {when}', { when: callText(g.calls[0]) }) + (g.calls.length > 1 ? ` +${g.calls.length - 1}` : ''));
  if (g.state === 'overdue') return rtTag('bad', 'alert', tx('Overdue since {day}', { day: esc(fmtDay(g.cb)) }));
  if (g.state === 'part') return rtTag('warn', 'stack', g.of ? tx('Part off-site · {n} of {of}', { n: g.rows.length, of: g.of }) : tx('Part off-site'));
  return rtTag('warn', 'stack', g.cb ? tx('Off-site · back {day}', { day: esc(fmtDay(g.cb)) }) : tx('Off-site'));
}
export const groupName = g => g.kind === 'other' ? tx('Other pallets') : esc(g.label);
export function groupSub(g) {
  const n = txn(g.rows.length, '{n} pallet', '{n} pallets'), sent = g.sent ? esc(fmtDay(g.sent)) : '';
  if (g.kind === 'load') return sent ? tx('a load · sent {day} · {pallets}', { day: sent, pallets: n }) : tx('a load · {pallets}', { pallets: n });
  if (g.kind === 'other') return tx('added by hand or from the master list · {pallets}', { pallets: n });
  if (g.via === 'dock') return tx('sent at the dock {day} · {pallets}', { day: sent, pallets: n });
  return sent ? tx('sent {day} · {pallets}', { day: sent, pallets: n }) : n;
}
// A pallet's departments by name and number: "Pet Care 046 · Furniture 054".
export const deptLine = r => (r.depts || []).map(d => microName(d) ? `${esc(microName(d))} ${esc(d)}` : tx('Department {code}', { code: esc(d) })).join(' · ');

// A truck that brings pallets back from off-site: when they went, and how
// many have landed so far (ticked off the register).
export function backTag(ctx, truckId) {
  const b = backOn(ctx.store.get('inventory'), truckId);
  if (!b.n) return '';
  return rtTag('info', 'undo', b.sent ? tx('From off-site · sent {day}', { day: esc(fmtDay(b.sent)) }) : tx('From off-site')) + rtTag('info', '', tx('{n} of {of} back', { n: b.back, of: b.n }), 'num');
}

// What a slot holds on a day: the trucks already planned, on the dock, or
// marked off-site; a free number is a new truck.
function slotsOn(plan, dock, date) {
  const day = plan.days?.[date] || {};
  return [1, 2, 3, 4].map(n => {
    const id = `${date}-T${n}`, sl = day.slots?.[n], rt = day.routes?.[n], t = dock.trucks?.[id] || (dock.history || []).find(h => h.id === id);
    if (t) return { n, taken: tx('on the dock') };
    if (rt) return { n, taken: rt.route === 'offsite' ? tx('off-site') : tx('diverted') };
    if (sl) return { n, taken: [sl.eta ? tx('planned {time}', { time: esc(sl.eta) }) : tx('planned'), sl.manifest?.manNo ? esc(sl.manifest.manNo) : ''].filter(Boolean).join(' · ') };
    return { n, taken: '' };
  });
}

// Call back (board 5): All its pallets or the ones ticked, the day, ETA and
// a free truck. It plans the truck (plan.set) naming the pallets it brings
// back; a whole off-site truck called back whole gets its manifest staged.
export function callbackSheet(ctx, g) {
  const plan = ctx.store.get('plan') || { days: {} }, dock = ctx.store.get('dock') || { trucks: {}, history: [] }, t0 = today();
  const open = g.open || [];
  const st = { all: true, pick: new Set(open.map(r => r.pid)), date: g.cb && g.cb >= t0 ? g.cb : t0, eta: '10:00', n: null, busy: false };
  const ctn = rows => rows.reduce((n, r) => n + (r.ctn || 0), 0);
  const label = groupName(g), sentDay = g.sent ? esc(fmtDay(g.sent)) : '';
  return new Promise(resolve => {
    let saved = false;
    const sheet = openSheet({ kind: 'dialog', cls: 'cb-sheet', title: tx('Call back {what}', { what: label }), onClose: () => resolve(saved) });
    const el = sheet.el;
    const chosen = () => st.all ? open : open.filter(r => st.pick.has(r.pid));
    const paint = () => {
      const slots = slotsOn(plan, dock, st.date);
      if (!st.n || slots.find(s => s.n === st.n)?.taken) st.n = slots.find(s => !s.taken)?.n || null;
      const rows = chosen(), c = ctn(rows);
      const pallets = g.kind === 'load' ? '' : `<div class="pf"><span class="lbl">${tx('Pallets')}</span><div class="seg cb-seg" role="radiogroup" aria-label="${tx('Pallets')}">` +
        `<button type="button" role="radio" aria-checked="${st.all}" class="${st.all ? 'on' : ''}" data-cb="all"><b>${tx('All {n}', { n: open.length })}</b>${ctn(open) ? `<small>${tx('{n} ctn', { n: ctn(open) })}</small>` : ''}</button>` +
        `<button type="button" role="radio" aria-checked="${!st.all}" class="${!st.all ? 'on' : ''}" data-cb="some"><b>${tx('Choose pallets')}</b><small>${tx('tick the ones you need')}</small></button></div>` +
        (st.all ? '' : `<div class="cb-list">${open.map(r => `<label class="cb-r"><input type="checkbox" data-cb-pid="${esc(r.pid)}"${st.pick.has(r.pid) ? ' checked' : ''}><span class="mono">${r.bay ? `<b>${esc(r.bay)}</b> ` : ''}${esc(r.pid)}</span><span class="cb-d">${deptLine(r) || esc(r.title || '')}</span>${r.ctn ? `<small>${tx('{n} ctn', { n: r.ctn })}</small>` : ''}</label>`).join('')}</div>`) + `</div>`;
      const when = `<div class="pf-pair cb-when"><label class="pf"><span class="lbl">${tx('Day')}</span><input type="date" class="inp" data-cb-f="date" min="${esc(t0)}" value="${esc(st.date)}"></label><label class="pf"><span class="lbl">${tx('ETA')}</span><input type="time" class="inp" data-cb-f="eta" value="${esc(st.eta)}"></label></div>`;
      const trucks = `<div class="pf"><span class="lbl">${tx('Truck')}</span><div class="cb-trucks">${slots.map(s => `<button type="button" class="cb-t${st.n === s.n ? ' on' : ''}" data-cb-n="${s.n}"${s.taken ? ' disabled' : ''} aria-pressed="${st.n === s.n}"><b>${tx('Truck {no}', { no: s.n })}</b><small>${s.taken || tx('new')}</small></button>`).join('')}</div></div>`;
      const man = stageable() ? esc(g.man) : '';
      const what = st.n ? (man ? tx('{day} gets Truck {no} with {man} staged, tagged From off-site · sent {sent}.', { day: esc(fmtDay(st.date)), no: st.n, man, sent: sentDay })
        : g.kind === 'load' ? tx('{day} gets Truck {no}, bringing back {what}.', { day: esc(fmtDay(st.date)), no: st.n, what: label })
        : tx('{day} gets Truck {no}, tagged From off-site · sent {sent}.', { day: esc(fmtDay(st.date)), no: st.n, sent: sentDay })) : tx('{day} has four trucks already: pick another day.', { day: esc(fmtDay(st.date)) });
      const how = g.kind === 'load' ? tx('Mark the load Received in Manifests when it lands.') : tx('Each pallet is ticked Received on the register as it lands.');
      sheet.set({
        sub: g.kind === 'load' ? groupSub(g) : tx('{pallets} at off-site storage · sent {day}', { pallets: txn(open.length, '{n} pallet', '{n} pallets'), day: sentDay }),
        body: `<div class="rt-body cb-body">${pallets}${when}${trucks}<p class="rt-effect back">${ic('undo')}<span>${what} ${st.n ? how : ''}</span></p></div>`,
        foot: `<button class="btn" data-cb-act="cancel"${st.busy ? ' disabled' : ''}>${tx('Cancel')}</button><button class="btn primary" data-cb-act="go"${st.busy || !st.n || (g.kind !== 'load' && !rows.length) ? ' disabled' : ''}>${st.busy ? tx('Saving…') : `${ic('truck')}${tx('Plan the truck')}`}</button>`,
      });
      sheet.busy(st.busy);
    };
    // A whole off-site truck called back whole lands on its own manifest.
    const stageable = () => g.via === 'route' && g.man && st.all && open.length === g.live.length;
    const fromOf = () => g.from || (g.truck ? { date: g.truck.slice(0, 10), slot: Number(truckNo(g.truck)) } : null);
    el.addEventListener('change', e => {
      const f = e.target.closest('[data-cb-f]'), p = e.target.closest('[data-cb-pid]');
      if (f) { st[f.dataset.cbF] = f.value || (f.dataset.cbF === 'date' ? t0 : ''); if (f.dataset.cbF === 'date') paint(); return; }
      if (p) { if (p.checked) st.pick.add(p.dataset.cbPid); else st.pick.delete(p.dataset.cbPid); paint(); }
    });
    el.addEventListener('click', async e => {
      if (st.busy) return;
      const k = e.target.closest('[data-cb]'), n = e.target.closest('[data-cb-n]'), a = e.target.closest('[data-cb-act]');
      if (k) { st.all = k.dataset.cb === 'all'; return paint(); }
      if (n && !n.disabled) { st.n = Number(n.dataset.cbN); return paint(); }
      if (!a) return;
      if (a.dataset.cbAct === 'cancel') return sheet.close();
      if (!st.n) return;
      st.busy = true; paint();
      try {
        const payload = { eta: st.eta || null };
        if (g.kind === 'load') payload.load = g.load;
        else payload.pids = chosen().map(r => r.pid);
        const from = fromOf(); if (from && from.date < st.date) payload.from = from;
        if (stageable()) {
          const rt = g.from ? plan.days?.[g.from.date]?.routes?.[g.from.slot] : null;
          let m = rt?.slot?.manifest || null;
          if (!m && routeManifest(rt) && navigator.onLine !== false) { try { m = slotRef(await ctx.api(`/v1/store/${ctx.storeNo}/manifest/${encodeURIComponent(g.man)}`)); } catch { m = null; } }
          if (m) payload.manifest = m;
        }
        await ctx.store.dispatch({ type: 'plan.set', entity: { date: st.date, slot: st.n }, payload });
        saved = true; st.busy = false; sheet.close();
        toast(tx('Called back: Truck {no} on {day}', { no: st.n, day: fmtDay(st.date) }));
      } catch (err) { st.busy = false; paint(); toast(err.message, 'bad'); }
    });
    paint();
  });
}
