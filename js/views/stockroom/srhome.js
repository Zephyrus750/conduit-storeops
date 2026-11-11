// The phone's Stockroom home: what to do next, as tiles.
import { ic, esc, mhead, mtile, fmtDate } from '../../ui.js';
import { todayKey } from './common.js';
import { toolOff } from '../../../shared/tools.js';
import { tx, txn } from '../../i18n.js';
export default {
  id: 'srhome', title: tx('Stockroom'), icon: 'box', area: 'stockroom',
  // Phone only: wider screens open the desk (the shell follows desktopView).
  desktopView: 'bfreview',
  desktop() { return ''; },
  mobile(ctx) {
    const date = todayKey(), bf = ctx.store.get('backfill');
    const subs = Object.values(bf.subs).filter(s => s.date === date), pending = subs.filter(s => s.status === 'pending');
    const req = (bf.requested[date] || []).filter(b => !subs.some(s => s.bay === b));
    const cages = Object.values(ctx.store.get('cages')).filter(c => c.status === 'open').length;
    const scanned = pending.length ? Object.values(pending[0].codes).filter(c => c.scanned).length : 0;
    const adj = Object.keys(ctx.store.get('adjustments')[date] || {}).length, toolOn = !toolOff(ctx.store.get('tools')?.off, 'intel');
    return mhead(tx('Stockroom'), `${txn(subs.length, '{n} bay on the board', '{n} bays on the board')} · ${fmtDate(date)}`) +
      `<div class="mv-tiles">${mtile('barcode', tx('Backfill scan'), pending.length ? txn(scanned, '{bay} in progress · {n} code', '{bay} in progress · {n} codes', { bay: pending[0].bay }) : tx('Scan a bay to start'), pending.length ? tx('Resume') : '', 'bfreview', 'hot')}${toolOn ? mtile('search', tx('Find a location'), tx('What’s in a bay, and what to pull'), '', 'srloc') : ''}${mtile('m-cages', tx('Cages'), tx('Scan cartons onto a cage · {n} open', { n: cages }), '', 'cages')}${mtile('sort', tx('Adjust SOH'), tx('Flag a wrong stock-on-hand · {n} today', { n: adj }), '', 'adjust')}${mtile('listcheck', tx('Day list'), tx('What to backfill next'), req.length ? String(req.length) : '', 'daylist')}${mtile('history', tx('History'), tx('Today’s sent bays'), '', 'srhistory')}</div>`;
  },
  // The counts follow the store: they were drawn once, and showed 0 when
  // the data arrived after the home opened.
  mount(ctx) { return ['backfill', 'cages', 'adjustments', 'tools'].map(k => ctx.store.on(k, () => ctx.rerender())); },
};
