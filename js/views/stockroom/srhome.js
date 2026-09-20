// The phone's Stockroom home: what to do next, as tiles.
import { ic, esc, mhead, mtile, fmtDate } from '../../ui.js';
import { todayKey } from './common.js';
export default {
  id: 'srhome', title: 'Stockroom', icon: 'box', area: 'stockroom',
  desktop() { return ''; },
  mobile(ctx) {
    const date = todayKey(), bf = ctx.store.get('backfill');
    const subs = Object.values(bf.subs).filter(s => s.date === date), pending = subs.filter(s => s.status === 'pending');
    const req = (bf.requested[date] || []).filter(b => !subs.some(s => s.bay === b));
    const cages = Object.values(ctx.store.get('cages')).filter(c => c.status === 'open').length;
    const adj = Object.keys(ctx.store.get('adjustments')[date] || {}).length;
    return mhead('Stockroom', `${fmtDate(date)} · ${subs.length} bays on the board`) +
      `<div class="mv-tiles">${mtile('barcode', 'Backfill scan', pending.length ? `${pending[0].bay} in progress · ${Object.keys(pending[0].codes).length} codes` : 'Scan a bay to start', pending.length ? 'Resume' : '', 'bfreview', 'hot')}${mtile('m-cages', 'Cages', `Scan cartons onto a cage · ${cages} open`, '', 'cages')}${mtile('sort', 'Adjust SOH', `Flag a wrong stock-on-hand · ${adj} today`, '', 'adjust')}${mtile('listcheck', 'Day list', 'What to backfill next', req.length ? String(req.length) : '', 'daylist')}${mtile('history', 'History', 'Today’s sent bays', '', 'srhistory')}</div>` +
      `<div class="mv-note">${ic('lock')}Review and the report live on the desktop. This phone captures.</div>`;
  },
};
