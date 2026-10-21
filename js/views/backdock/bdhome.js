// The phone's Back dock home: the truck on the dock and what to do next.
import { ic, esc, mhead, mtile } from '../../ui.js';
import { openTrucks, progress, truckNo, fmtHM, running, who, todayKey } from './common.js';
import { decantBoard } from './plan.js';
// Who is on this phone: a D-number picked from the truck's crew, kept on
// the device for today only (names are never stored), so "My pallet"
// shows that person's pallet. The device id names the phone, not the person.
const meKey = no => `dock_me:${no}`;
function meOf(no) { try { const x = JSON.parse(localStorage.getItem(meKey(no)) || 'null'); return x && x.day === todayKey() ? x.pid : null; } catch { return null; } }
function setMe(no, pid) { try { if (pid) localStorage.setItem(meKey(no), JSON.stringify({ pid, day: todayKey() })); else localStorage.removeItem(meKey(no)); } catch {} }

export default {
  id: 'bdhome', title: 'Back dock', icon: 'truck', area: 'backdock',
  // Phone only: wider screens open the dock board (the shell follows desktopView).
  desktopView: 'receiving',
  desktop() { return ''; },
  mobile(ctx) {
    const dock = ctx.store.get('dock'), open = openTrucks(dock), t = open.find(x => x.status === 'live') || open[0];
    const pr = t ? progress(t) : null, run = t ? running(t) : {}, me = meOf(ctx.storeNo), team = t?.team || [];
    const mine = me ? run[me] || null : null;
    const pick = team.length ? `<div class="mv-sub">Who’s on this phone?</div><div class="bdk-strip bdk-me">${team.map(m => `<button class="bdk-fchip${m.pid === me ? ' armed' : ''}" data-act="dock-me" data-pid="${esc(m.pid)}" aria-pressed="${m.pid === me}">${esc(who(m))}</button>`).join('')}${me ? '<button class="bdk-fchip" data-act="dock-me" data-pid="">Not me</button>' : ''}</div>` : '';
    return mhead('Back dock', t ? `Truck ${truckNo(t.id)} · ${t.status === 'live' ? `landed ${fmtHM(t.landedAt)}` : 'staged'}${t.goalAt ? ' · goal ' + fmtHM(t.goalAt) : ''}` : 'No truck on the dock', '') +
      (t ? `<div class="mv-tally"><b>${pr.done}</b><i><u style="width:${pr.pct}%"></u></i><span>${pr.total} cartons · ${pr.pct}%</span></div>` : '') +
      `<div class="mv-tiles">${mtile('parking', 'Land a pallet', 'Bay · type · cartons', '', 'receiving', 'hot')}${mtile('box', mine ? `My pallet · ${esc(mine)}` : 'Run the decant', mine ? `${esc(me)} · decanting now` : me ? `${esc(me)} · not on a pallet` : 'Start, pause and finish pallets', pr ? `${pr.active} live` : '', 'receiving')}${mtile('users', 'Team', t && t.team?.length ? t.team.map(m => `${who(m)}${run[m.pid] ? ' ' + run[m.pid] : ''}`).join(' · ') : 'No team on this truck yet', '', 'receiving')}</div>` +
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
