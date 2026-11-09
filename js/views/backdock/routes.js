// Trucks not coming to the dock, on screen (plan.route; the off-site and
// diverted design, 6 Nov 2026). The tags (Off-site · lands Mon 9 Nov,
// Diverted → 1187 Bunbury, From off-site · was due Tue 3 Nov), the rows a
// routed truck shows in its day, the day it lands, and the sheet that
// marks one: Where it goes, Receive here, Off-site or Diverted, with the
// day it lands here after all. The Planner, the phone's Plan, Manifests,
// Receiving and the Dashboard all use these. Managers only: the worker
// refuses plan.route from anyone else, so the buttons show for managers.
//
//   isMgr(ctx)                       the signed-in device is a manager's (or the owner's)
//   routeTag(r) / fromTag(plan, from)   the coloured tag
//   routeLine(r)                     "Went to off-site storage · no room on the dock", in a sentence
//   routeSheet(ctx, { date, n, manNo, nums }) → Promise<boolean>: mark a truck (n), or pick one of nums

import { ic, esc, toast, fmtDay } from '../../ui.js';
import { tx } from '../../i18n.js';
import { openSheet } from '../../sheet.js';
import { addDays } from '../../../shared/time.js';

export const isMgr = ctx => { const c = ctx.session?.current; return !!c && (!!c.owner || (c.roles || []).includes('manager')); };
export const REASONS = { room: tx('No room on the dock'), closed: tx('Store closed'), dc: tx('DC asked'), other: tx('Other') };

export function routeTag(r) {
  if (!r) return '';
  if (r.route === 'offsite') return `<span class="rt-tag off">${ic('stack')}${r.lands ? tx('Off-site · lands {day}', { day: esc(fmtDay(r.lands)) }) : tx('Off-site')}</span>`;
  const to = r.to ? tx('Diverted → {to}', { to: esc(r.to) }) : tx('Diverted');
  return `<span class="rt-tag div">${ic('route')}${to}${r.lands ? ' · ' + tx('lands {day}', { day: esc(fmtDay(r.lands)) }) : ''}</span>`;
}
// A truck bringing back one that went off-site (or was diverted) says when it was due.
export function fromTag(plan, from) {
  if (!from) return '';
  const r = plan?.days?.[from.date]?.routes?.[from.slot], day = esc(fmtDay(from.date));
  return `<span class="rt-tag back">${ic('undo')}${r?.route === 'diverted' ? tx('Was diverted · due {day}', { day }) : tx('From off-site · was due {day}', { day })}</span>`;
}
export function routeLine(r) {
  const why = r.reason ? REASONS[r.reason] : '';
  const where = r.route === 'offsite' ? (r.to ? tx('Went to off-site storage at {to}', { to: esc(r.to) }) : tx('Went to off-site storage')) : r.to ? tx('Went to {to}', { to: esc(r.to) }) : tx('Went somewhere else');
  return [where, why ? esc(why) : '', r.note ? esc(r.note) : ''].filter(Boolean).join(' · ');
}

// The sheet. A truck already marked opens on its route; Receive here puts
// it back on the plan. From a day with no truck planned (or Manifests, for
// a report with a day but no truck) it asks which truck too.
export function routeSheet(ctx, { date, n = null, manNo = null, nums = [1, 2, 3, 4] } = {}) {
  const plan = ctx.store.get('plan') || { days: {} };
  const cur = n ? plan.days[date]?.routes?.[n] || null : null, slot = n ? plan.days[date]?.slots?.[n] : null;
  const st = { n: n || nums[0] || 1, kind: cur?.route || 'offsite', lands: cur?.lands || '', to: cur?.to || '', reason: cur?.reason || null, note: cur?.note || '', busy: false };
  const man = manNo || cur?.manNo || cur?.slot?.manifest?.manNo || slot?.manifest?.manNo || '';
  return new Promise(resolve => {
    let saved = false;
    const sheet = openSheet({ kind: 'dialog', cls: 'rt-sheet', title: tx('Where it goes'), sub: '', onClose: () => resolve(saved) });
    const el = sheet.el;
    const read = () => { for (const f of ['lands', 'to', 'note']) { const i = el.querySelector(`[data-rt="${f}"]`); if (i) st[f] = i.value.trim(); } const t = el.querySelector('[data-rt="n"]'); if (t) st.n = Number(t.value); };
    const paint = () => {
      const kinds = [['here', tx('Receive here'), 'truck'], ['offsite', tx('Off-site'), 'stack'], ['diverted', tx('Diverted'), 'route']];
      const seg = `<div class="seg rt-seg" role="radiogroup" aria-label="${tx('Where it goes')}">${kinds.map(([k, l, i]) => `<button type="button" role="radio" aria-checked="${st.kind === k}" class="${st.kind === k ? 'on ' + k : ''}" data-rt-kind="${k}">${ic(i)}${l}</button>`).join('')}</div>`;
      const truckPick = !n ? `<label class="pf"><span class="lbl">${tx('Truck')}</span><select class="inp" data-rt="n">${nums.map(k => `<option value="${k}"${st.n === k ? ' selected' : ''}>${tx('Truck {no}', { no: k })}</option>`).join('')}</select></label>` : '';
      const lands = `<label class="pf"><span class="lbl">${st.kind === 'offsite' ? tx('Lands here on') : tx('Lands here after all on')}</span><input type="date" class="inp" data-rt="lands" min="${esc(addDays(date, 1))}" value="${esc(st.lands)}"><span class="cs-dim">${st.kind === 'offsite' ? tx('The callback day, if you know it: the Planner and the Dashboard show it that day.') : tx('Leave it empty if it goes there for good.')}</span></label>`;
      const to = `<label class="pf"><span class="lbl">${st.kind === 'offsite' ? tx('Where it is stored') : tx('Where it went')}</span><input class="inp" data-rt="to" maxlength="60" value="${esc(st.to)}" placeholder="${st.kind === 'offsite' ? tx('e.g. the storage yard') : tx('e.g. 1187 Bunbury, DC hold')}"></label>`;
      const why = `<div class="pf"><span class="lbl">${tx('Why')}</span><span class="chips rt-why">${Object.entries(REASONS).map(([k, l]) => `<button type="button" class="chip${st.reason === k ? ' on' : ''}" data-rt-reason="${k}" aria-pressed="${st.reason === k}">${esc(l)}</button>`).join('')}</span></div>`;
      const note = `<label class="pf"><span class="lbl">${tx('Note')}</span><input class="inp" data-rt="note" maxlength="200" value="${esc(st.note)}" placeholder="${tx('Anything the dock should know')}"></label>`;
      const effect = st.kind === 'here' ? (cur ? tx('It goes back on the plan for that day and lands at Receiving like any truck.') : tx('It lands at Receiving like any truck.'))
        : st.kind === 'offsite' ? tx('Nothing expects it at Receiving that day; the Planner, the Dashboard and Manifests tag it Off-site, and its cartons are not counted as received.')
        : tx('It never lands here: Receiving does not expect it and its cartons are counted as diverted, not received.');
      sheet.set({
        sub: `${esc(fmtDay(date))}${n ? ' · ' + tx('Truck {no}', { no: n }) : ''}${man ? ' · ' + esc(man) : ''}`,
        body: `<div class="rt-body">${truckPick}<div class="pf"><span class="lbl">${tx('Where it goes')}</span>${seg}</div>${st.kind === 'here' ? '' : lands + to + why + note}<p class="rt-effect ${st.kind}">${ic(st.kind === 'here' ? 'check' : st.kind === 'offsite' ? 'stack' : 'route')}<span>${effect}</span></p></div>`,
        foot: `<button class="btn" data-rt-act="cancel"${st.busy ? ' disabled' : ''}>${tx('Cancel')}</button><button class="btn primary" data-rt-act="save"${st.busy || (st.kind === 'here' && !cur) ? ' disabled' : ''}>${st.busy ? tx('Saving…') : `${ic('check')}${tx('Save')}`}</button>`,
      });
      sheet.busy(st.busy);
    };
    el.addEventListener('click', async e => {
      const k = e.target.closest('[data-rt-kind]'), r = e.target.closest('[data-rt-reason]'), a = e.target.closest('[data-rt-act]');
      if (st.busy) return;
      if (k) { read(); st.kind = k.dataset.rtKind; return paint(); }
      if (r) { read(); st.reason = st.reason === r.dataset.rtReason ? null : r.dataset.rtReason; return paint(); }
      if (!a) return;
      if (a.dataset.rtAct === 'cancel') return sheet.close();
      read();
      const payload = st.kind === 'here' ? { route: null } : { route: st.kind, lands: st.lands || null, to: st.to, reason: st.reason, note: st.note, ...(man ? { manNo: man } : {}) };
      st.busy = true; paint();
      try {
        await ctx.store.dispatch({ type: 'plan.route', entity: { date, slot: st.n }, payload });
        saved = true;
        toast(st.kind === 'here' ? tx('Truck {no} on {day}: back on the plan', { no: st.n, day: fmtDay(date) }) : st.kind === 'offsite' ? tx('Truck {no} on {day}: off-site', { no: st.n, day: fmtDay(date) }) : tx('Truck {no} on {day}: diverted', { no: st.n, day: fmtDay(date) }));
        st.busy = false; sheet.close();
      } catch (err) { st.busy = false; paint(); toast(err.message, 'bad'); }
    });
    paint();
  });
}
