// Day list: the posted walk for the stockroom. Today's requested bays and
// bays still pending review, split across 1 to 4 walkers in bay order;
// the desk sets walkers and excludes bays (daylist.set), prints the sheet.

import { $, ic, esc, vh, sub, toast, mhead, mrows } from '../../ui.js';
import { todayKey, send } from './common.js';

function model(ctx) {
  const date = todayKey(), bf = ctx.store.get('backfill'), dl = ctx.store.get('daylist')[date] || { walkers: 2, excluded: [], source: '' };
  const pending = Object.values(bf.subs).filter(s => s.date === date && s.status === 'pending').map(s => ({ bay: s.bay, kind: 'Backfill', sub: `${Object.values(s.codes).filter(c => c.scanned).length} codes scanned`, hot: false }));
  const requested = (bf.requested[date] || []).filter(b => !pending.some(p => p.bay === b)).map(b => ({ bay: b, kind: 'Requested', sub: 'not scanned yet', hot: true }));
  const all = [...requested, ...pending].sort((a, b) => a.bay.localeCompare(b.bay, undefined, { numeric: true }));
  const active = all.filter(x => !dl.excluded.includes(x.bay));
  const per = Math.ceil(active.length / dl.walkers) || 1;
  const walkers = Array.from({ length: dl.walkers }, (_, i) => active.slice(i * per, (i + 1) * per));
  return { date, dl, all, active, walkers };
}
export default {
  id: 'daylist', title: 'Day list', icon: 'm-daylist', area: 'stockroom',
  desktop(ctx) {
    const m = model(ctx);
    return vh('Day list', sub('Posted walk', esc(m.date), `${m.active.length} bays · ${m.dl.walkers} walker${m.dl.walkers === 1 ? '' : 's'}`), `<div class="pills">${[1, 2, 3, 4].map(n => `<button class="${m.dl.walkers === n ? 'on' : ''}" data-act="walkers" data-n="${n}">${n}</button>`).join('')}</div><button class="btn primary" data-act="print">${ic('print')}Print triage sheet</button>`, 'm-daylist') +
      `<div class="grid3" style="grid-template-columns:repeat(${Math.min(2, m.dl.walkers)},1fr)">${m.walkers.map((w, i) => `<div class="card"><div class="ch"><h3>Walker ${String.fromCharCode(65 + i)}</h3><span class="go">${w.length ? `${esc(w[0].bay)} – ${esc(w[w.length - 1].bay)}` : 'nothing yet'}</span></div><div class="list">${w.map(x => `<div class="li"><span class="loc">${esc(x.bay)}</span><span class="nm">${x.sub}</span><span class="status${x.hot ? ' warn' : ''}">${x.kind}</span><span class="tick" title="Exclude from the walk" data-act="exclude" data-bay="${esc(x.bay)}"></span></div>`).join('') || '<div class="li cs-dim">Request bays from Backfill review to build the walk.</div>'}</div></div>`).join('')}</div>` +
      (m.dl.excluded.length ? `<div class="card" style="margin-top:14px"><div class="ch"><h3>Left out today</h3></div><div class="list">${m.dl.excluded.map(b => `<div class="li"><span class="loc">${esc(b)}</span><span class="nm"></span><span class="btn sm" data-act="include" data-bay="${esc(b)}">Put back</span></div>`).join('')}</div></div>` : '');
  },
  mobile(ctx) { return `<div id="dlmob">${mobile(ctx)}</div>`; },
  mount(ctx, root) {
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const m = model(ctx), act = a.dataset.act;
      const set = (patch) => send(ctx, 'daylist.set', { date: m.date }, { walkers: m.dl.walkers, excluded: m.dl.excluded, source: m.dl.source || 'requested', ...patch });
      if (act === 'walkers') await set({ walkers: Number(a.dataset.n) });
      else if (act === 'exclude') await set({ excluded: [...new Set([...m.dl.excluded, a.dataset.bay])] });
      else if (act === 'include') await set({ excluded: m.dl.excluded.filter(b => b !== a.dataset.bay) });
      else if (act === 'print') window.print();
    });
    const repaint = () => { if (ctx.isMobile) { const h = $('#dlmob', root); if (h) h.innerHTML = mobile(ctx); } else ctx.rerender(); };
    return [ctx.store.on('daylist', repaint), ctx.store.on('backfill', repaint)];
  },
};
function mobile(ctx) {
  const m = model(ctx);
  return mhead('Day list', `What to backfill next · ${m.active.length} bays`) +
    (m.active.length ? mrows(m.active.map(x => [esc(x.bay), `${x.kind} · ${x.sub}`, `<span class="btn sm" data-go="bfreview" data-bay="${esc(x.bay)}">Start</span>`, x.hot ? 'hot' : ''])) : `<div class="mv-note">${ic('layers')}Nothing posted yet. Scanning a bay that is not here still works.</div>`) +
    `<div class="mv-note">${ic('layers')}Ordered by the desk’s day list. ${m.dl.walkers} walker${m.dl.walkers === 1 ? '' : 's'}.</div>`;
}
