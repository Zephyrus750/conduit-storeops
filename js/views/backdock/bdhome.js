// The phone's Back dock home: the truck on the dock and what to do next.
import { ic, esc, mhead, mtile, mgr, toast } from '../../ui.js';
import { tx, txn } from '../../i18n.js';
import { openTrucks, progress, truckNo, fmtHM, running, who, todayKey, openHalt, holdName, fmtMins } from './common.js';
import { dockNow } from './wallboard.js';
import { ask } from '../../sheet.js';
import { decantBoard } from './plan.js';
import { phaseBar } from './phase.js';
// Who is on this phone: a D-number picked from the truck's crew, kept on
// the device for today only (names are never stored), so "My pallet"
// shows that person's pallet. The device id names the phone, not the person.
const meKey = no => `dock_me:${no}`;
function meOf(no) { try { const x = JSON.parse(localStorage.getItem(meKey(no)) || 'null'); return x && x.day === todayKey() ? x.pid : null; } catch { return null; } }
function setMe(no, pid) { try { if (pid) localStorage.setItem(meKey(no), JSON.stringify({ pid, day: todayKey() })); else localStorage.removeItem(meKey(no)); } catch {} }

// Land a pallet opens Receive; Run the decant opens Decant; Team opens Team & plan there.
const tile = (view, mode, html) => html.replace('data-go="receiving"', `data-go="${view}"${mode ? ` data-mode="${mode}"` : ''}`);

// The manager's part (the manager phone, 12 Oct): the truck's pace against
// its goal and forecast, each person's rate against their 28 days, the
// hold-ups, finished trucks still without a manifest, the crew's roles, and
// reopening a truck finished today.
const isMgr = ctx => { const c = ctx.session.current; return !!c && (!!c.owner || (c.roles || []).includes('manager')); };
function mgrCard(ctx, dock, t) {
  const day = todayKey(), week = new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10);
  const late = (dock.history || []).filter(h => !h.manifest && h.id.slice(0, 10) >= week), done = (dock.history || []).filter(h => h.id.slice(0, 10) === day).slice().reverse();
  let body = '';
  if (t && t.status === 'live') {
    const n = dockNow(dock, t), halt = openHalt(t), halts = (t.halts || []).filter(h => (h.kind || 'halt') === 'halt');
    const fc = n.fc.at ? fmtHM(new Date(n.fc.at).toISOString()) : '—';
    body += `<div class="bdm-kpis"><div><small>${tx('Against the goal')}</small><b class="${n.ahead === null ? '' : n.ahead >= 0 ? 'good' : 'warn'}">${n.ahead === null ? tx('no goal set') : n.ahead >= 0 ? tx('▲ {n} ahead of pace', { n: n.ahead }) : tx('▼ {n} behind pace', { n: -n.ahead })}</b></div>` +
      `<div><small>${tx('Forecast finish')}</small><b class="${n.fc.at && n.goal ? (n.fc.at <= n.goal ? 'good' : 'bad') : ''}">${fc}</b></div>` +
      `<div><small>${tx('Team rate')}</small><b>${n.teamRate === null ? '—' : tx('{n} ctn/h', { n: n.teamRate })}</b><span>${n.teamNorm ? tx('28-day crew {n} ctn/h', { n: n.teamNorm }) : tx('no 28-day rates yet')}</span></div></div>`;
    if (n.ppl.length) {
      const max = Math.max(1, ...n.ppl.map(p => Math.max(p.rate || 0, p.norm || 0)));
      body += `<div class="mv-sub">${tx('Each person against their 28 days')}</div><div class="bdm-pp">${n.ppl.map(p => `<div class="bdm-p${p.low ? ' low' : ''}"><b>${esc(p.pid)}</b><span class="bar"><i style="--w:${Math.round((p.rate || 0) / max * 100)}%"></i>${p.norm ? `<u style="--x:${Math.round(p.norm / max * 100)}%"></u>` : ''}</span><span class="v">${p.rate == null ? '—' : tx('{n} ctn/h', { n: p.rate })}${p.norm ? `<small>${tx('28 days {n}', { n: p.norm })}</small>` : ''}</span></div>`).join('')}</div>`;
    }
    body += `<div class="mv-sub">${tx('Hold-ups')}</div>` + (halt ? `<div class="bdm-halt">${ic('pause')}<b>${esc(holdName(halt))}</b><span>${tx('since {time}', { time: fmtHM(halt.start) })}</span></div>` : '') +
      `<p class="bdm-line">${halts.length ? tx('{n} today · {mins} down', { n: halts.length, mins: fmtMins(n.downMs / 60000) }) : tx('None on this truck')}</p>`;
    body += `<div class="bdm-acts"><button class="mv-ghost" data-go="receiving" data-mode="team">${ic('users')}${tx('Move roles')}</button></div>`;
  }
  if (late.length) body += `<div class="mv-sub">${tx('Late manifests')}</div><button class="bdm-late" data-go="rhistory">${ic('m-manifests')}<span>${txn(late.length, '{n} finished truck this week has no manifest yet', '{n} finished trucks this week have no manifest yet')}</span>${ic('chev')}</button>`;
  if (done.length) body += `<div class="mv-sub">${tx('Finished today')}</div>${done.map(h => `<div class="bdm-done"><b>${tx('Truck {n}', { n: esc(truckNo(h.id)) })}</b><span>${txn(h.cartons || 0, '{n} carton', '{n} cartons')}</span><button class="mv-ghost sm" data-act="bdm-reopen" data-id="${esc(h.id)}">${tx('Reopen')}</button></div>`).join('')}`;
  return body ? `<div class="bdm">${`<div class="bdm-h">${ic('shield')}<b>${tx('Manager')}</b>${mgr()}</div>`}${body}</div>` : '';
}

export default {
  id: 'bdhome', title: tx('Back dock'), icon: 'truck', area: 'backdock',
  // Phone only: wider screens open the dock board (the shell follows desktopView).
  desktopView: 'receiving',
  desktop() { return ''; },
  mobile(ctx) {
    const dock = ctx.store.get('dock'), open = openTrucks(dock), t = open.find(x => x.status === 'live') || open[0];
    const pr = t ? progress(t) : null, run = t ? running(t) : {}, me = meOf(ctx.storeNo), team = t?.team || [];
    const mine = me ? run[me] || null : null;
    const pick = team.length ? `<div class="mv-sub">${tx('Who’s on this phone?')}</div><div class="bdk-strip bdk-me">${team.map(m => `<button class="bdk-fchip${m.pid === me ? ' armed' : ''}" data-act="dock-me" data-pid="${esc(m.pid)}" aria-pressed="${m.pid === me}">${esc(who(m))}</button>`).join('')}${me ? `<button class="bdk-fchip" data-act="dock-me" data-pid="">${tx('Not me')}</button>` : ''}</div>` : '';
    return mhead(tx('Back dock'), t ? `${tx('Truck {n}', { n: truckNo(t.id) })} · ${t.status === 'live' ? tx('landed {time}', { time: fmtHM(t.landedAt) }) : tx('planned')}${t.goalAt ? ' · ' + tx('goal {time}', { time: fmtHM(t.goalAt) }) : ''}` : tx('No truck on the dock'), '') +
      (t ? `<div class="mv-tally"><b>${pr.done}</b><i><u style="--w:${pr.pct}%"></u></i><span>${tx('{n} cartons · {pct}%', { n: pr.total, pct: pr.pct })}</span></div>` : '') +
      phaseBar(t || null, { link: true }) +
      // Each tile opens its own part of Receiving: Receive, Run, or Team & plan.
      `<div class="mv-tiles">${tile('receiving', '', mtile('parking', tx('Land a pallet'), tx('Scan the labels · type · cartons'), '', 'receiving', 'hot'))}${tile('decant', '', mtile('box', mine ? tx('My pallet · {ref}', { ref: esc(mine) }) : tx('Run the decant'), mine ? tx('{pid} · decanting now', { pid: esc(me) }) : me ? tx('{pid} · not on a pallet', { pid: esc(me) }) : tx('Start, pause and finish pallets'), pr ? tx('{n} live', { n: pr.active }) : '', 'receiving'))}${tile('decant', 'team', mtile('users', tx('Team'), t && t.team?.length ? t.team.map(m => `${who(m)}${run[m.pid] ? ' ' + run[m.pid] : ''}`).join(' · ') : tx('No team on this truck yet'), '', 'receiving'))}</div>` +
      pick + (isMgr(ctx) ? mgrCard(ctx, dock, t) : '') + decantBoard(dock, ctx.store.get('plan'), todayKey());
  },
  mount(ctx, root) {
    root.addEventListener('click', async e => {
      const r = e.target.closest('[data-act="bdm-reopen"]');
      if (r) {
        const id = r.dataset.id; if (!await ask({ title: tx('Reopen Truck {no}?', { no: truckNo(id) }), text: tx("It goes back to live and its history row + rate credit are removed until it's closed again."), ok: tx('Reopen truck') })) return;
        try { await ctx.store.dispatch({ type: 'truck.reopen', entity: { truck: id } }); toast(tx('Truck {no} is live again', { no: truckNo(id) })); } catch (err) { toast(err.message, 'bad'); }
        return;
      }
      const b = e.target.closest('[data-act="dock-me"]'); if (!b) return;
      setMe(ctx.storeNo, b.dataset.pid || null); ctx.rerender();
    });
    return [ctx.store.on('dock', () => ctx.rerender())];
  },
};
