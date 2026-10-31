// The phone's Back dock home: the truck on the dock and what to do next.
import { ic, esc, mhead, mtile } from '../../ui.js';
import { tx } from '../../i18n.js';
import { openTrucks, progress, truckNo, fmtHM, running, who, todayKey } from './common.js';
import { decantBoard } from './plan.js';
import { phaseBar } from './phase.js';
// Who is on this phone: a D-number picked from the truck's crew, kept on
// the device for today only (names are never stored), so "My pallet"
// shows that person's pallet. The device id names the phone, not the person.
const meKey = no => `dock_me:${no}`;
function meOf(no) { try { const x = JSON.parse(localStorage.getItem(meKey(no)) || 'null'); return x && x.day === todayKey() ? x.pid : null; } catch { return null; } }
function setMe(no, pid) { try { if (pid) localStorage.setItem(meKey(no), JSON.stringify({ pid, day: todayKey() })); else localStorage.removeItem(meKey(no)); } catch {} }

const tile = (mode, html) => html.replace('data-go="receiving"', `data-go="receiving" data-mode="${mode}"`);

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
      (t ? `<div class="mv-tally"><b>${pr.done}</b><i><u style="width:${pr.pct}%"></u></i><span>${tx('{n} cartons · {pct}%', { n: pr.total, pct: pr.pct })}</span></div>` : '') +
      phaseBar(t || null, { link: true }) +
      // Each tile opens its own part of Receiving: Receive, Run, or Team & plan.
      `<div class="mv-tiles">${tile('receive', mtile('parking', tx('Land a pallet'), tx('Scan the labels · type · cartons'), '', 'receiving', 'hot'))}${tile('run', mtile('box', mine ? tx('My pallet · {ref}', { ref: esc(mine) }) : tx('Run the decant'), mine ? tx('{pid} · decanting now', { pid: esc(me) }) : me ? tx('{pid} · not on a pallet', { pid: esc(me) }) : tx('Start, pause and finish pallets'), pr ? tx('{n} live', { n: pr.active }) : '', 'receiving'))}${tile('team', mtile('users', tx('Team'), t && t.team?.length ? t.team.map(m => `${who(m)}${run[m.pid] ? ' ' + run[m.pid] : ''}`).join(' · ') : tx('No team on this truck yet'), '', 'receiving'))}</div>` +
      pick + decantBoard(dock, ctx.store.get('plan'), todayKey());
  },
  mount(ctx, root) {
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-act="dock-me"]'); if (!b) return;
      setMe(ctx.storeNo, b.dataset.pid || null); ctx.rerender();
    });
    return [ctx.store.on('dock', () => ctx.rerender())];
  },
};
