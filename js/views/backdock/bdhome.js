// The phone's Back dock home: the truck on the dock and what to do next.
import { ic, esc, mhead, mtile } from '../../ui.js';
import { openTrucks, progress, truckNo, fmtHM, running, who } from './common.js';
export default {
  id: 'bdhome', title: 'Back dock', icon: 'truck', area: 'backdock',
  // Phone only: wider screens open the dock board (the shell follows desktopView).
  desktopView: 'receiving',
  desktop() { return ''; },
  mobile(ctx) {
    const dock = ctx.store.get('dock'), open = openTrucks(dock), t = open.find(x => x.status === 'live') || open[0];
    const pr = t ? progress(t) : null, run = t ? running(t) : {}, me = ctx.session.current?.device || '';
    const mine = t ? Object.entries(run).find(([pid]) => pid.toUpperCase() === String(me).toUpperCase())?.[1] : null;
    return mhead('Back dock', t ? `Truck ${truckNo(t.id)} · ${t.status === 'live' ? `landed ${fmtHM(t.landedAt)}` : 'staged'}${t.goalAt ? ' · goal ' + fmtHM(t.goalAt) : ''}` : 'No truck on the dock', '') +
      (t ? `<div class="mv-tally"><b>${pr.done}</b><i><u style="width:${pr.pct}%"></u></i><span>${pr.total} cartons · ${pr.pct}%</span></div>` : '') +
      `<div class="mv-tiles">${mtile('parking', 'Land a pallet', 'Bay · type · cartons', '', 'receiving', 'hot')}${mtile('box', mine ? `My pallet · ${esc(mine)}` : 'Run the decant', mine ? 'Decanting now' : 'Start, pause and finish pallets', pr ? `${pr.active} live` : '', 'receiving')}${mtile('users', 'Team', t && t.team?.length ? t.team.map(m => `${who(m)}${run[m.pid] ? ' ' + run[m.pid] : ''}`).join(' · ') : 'No team on this truck yet', '', 'receiving')}</div>` +
      `<div class="mv-note">${ic('lock')}Manifests, profiles and the planner are desktop jobs.</div>`;
  },
};
