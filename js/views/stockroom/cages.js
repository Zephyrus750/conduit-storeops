// Cages: every open cage with its ring colour, where it is parked, what is
// on it and when it was last seen. Desktop lists and finds; the phone
// scans cartons onto a cage (cage.scan), parks it (cage.park) and sweeps
// the room (cage.sweep). Ring colour is the physical ring on the cage.

import { storeDay } from '../../../shared/time.js';
import { $, ic, esc, vh, sub, today as storeToday, status, fmtTime, ago, toast, mhead, mrows, mbig, mghost, mfoot, mscan } from '../../ui.js';
import { parseKeycodes } from '../../../shared/backfill.js';
import { RINGS } from '../../../shared/reducers/stockroom.js';
import { RING, ring, ageOf, ensureNames, nameHtml, nameOf, send } from './common.js';

const st = { sel: null, find: '', filter: 'all', sort: 'age', mode: 'scan', target: null, qty: 1, last: null, newRing: 'new-lines' };
const cagetabs = on => `<div class="pills cs-tabs"><button class="${on === 'scan' ? 'on' : ''}" data-act="mode" data-mode="scan">${ic('barcode')}Scan</button><button class="${on === 'sweep' ? 'on' : ''}" data-act="mode" data-mode="sweep">${ic('listcheck')}Sweep</button></div>`;

function model(ctx) {
  const all = Object.entries(ctx.store.get('cages')).map(([id, c]) => ({ id, ...c, units: Object.values(c.items).reduce((a, b) => a + b, 0), lines: Object.keys(c.items).length, stale: c.status === 'open' && Date.now() - new Date(c.seen) > 7 * 86400000 }));
  const open = all.filter(c => c.status === 'open');
  open.sort((a, b) => st.sort === 'zone' ? String(a.location || '').localeCompare(String(b.location || '')) : st.sort === 'type' ? a.ring.localeCompare(b.ring) : a.seen.localeCompare(b.seen));
  const q = st.find.trim();
  const hits = q ? open.filter(c => c.id.includes(q.toUpperCase()) || Object.keys(c.items).some(k => k.startsWith(q)) || (c.location || '').includes(q.toUpperCase())) : [];
  return { all, open, hits, q, stale: open.filter(c => c.stale) };
}

export default {
  id: 'cages', title: 'Cages', icon: 'm-cages', area: 'stockroom',
  desktop(ctx) {
    const m = model(ctx);
    const list = (st.filter === 'all' ? m.open : m.open.filter(c => c.ring === st.filter));
    const counts = Object.fromEntries(RINGS.map(r => [r, m.open.filter(c => c.ring === r).length]));
    const chips = `<div class="legchips"><span class="chip${st.filter === 'all' ? ' on' : ''}" data-act="filter" data-v="all">All ${m.open.length}</span>${RINGS.map(r => `<span class="chip${st.filter === r ? ' on' : ''}" data-act="filter" data-v="${r}"><i style="background:${RING[r][1]}"></i>${RING[r][0]} ${counts[r]}</span>`).join('')}</div>`;
    const rows = list.map(c => `<div class="row${st.sel === c.id ? ' sel' : ''}" data-act="sel" data-id="${esc(c.id)}"><span class="cg">${ring(c.ring)}${esc(c.id)}</span><span>${RING[c.ring][0]} · ${c.location ? esc(c.location) : '<i class="cs-dim">not parked</i>'}<small>${c.lines} lines · ${c.units} units · last seen ${ago(c.seen)}</small></span><span class="cage-age ${c.stale ? 'old' : Date.now() - new Date(c.seen) > 2 * 86400000 ? 'mid' : 'ok'}">${ageOf(c.seen)}</span></div>`).join('') || '<div class="row cs-dim">No cages open. Start one on the right.</div>';
    const sel = m.open.find(c => c.id === st.sel);
    const detail = sel ? `<div class="cres"><div class="kc">${ring(sel.ring)}${esc(sel.id)}</div><div class="nm">${RING[sel.ring][0]} cage · opened ${fmtTime(sel.created)}</div><div class="where"><span class="by">${sel.location ? `in <b>${esc(sel.location)}</b>` : 'not parked yet'} · last seen ${ago(sel.seen)} · ${sel.sweeps.length} sweep${sel.sweeps.length === 1 ? '' : 's'}</span></div>` +
      `<div class="list" style="margin-top:8px">${Object.entries(sel.items).map(([kc, q]) => `<div class="li"><span class="kc mono">${esc(kc)}</span><span class="nm">${nameHtml(kc)}</span><b>× ${q}</b></div>`).join('') || '<div class="li cs-dim">Nothing on it yet</div>'}</div>` +
      `<div class="adj-form2" style="margin-top:10px"><input class="ad-in mono" data-field="park" placeholder="Park at… e.g. AISLE 2" value="${esc(sel.location || '')}"><button class="btn sm" data-act="park">${ic('parking')}Park</button></div>` +
      `<div class="adj-form2" style="margin-top:8px"><input class="ad-in mono" data-field="addkc" placeholder="Keycode" inputmode="numeric"><input class="ad-in" data-field="addqty" placeholder="Qty" inputmode="numeric" value="1" style="max-width:80px"><button class="btn sm" data-act="addline">${ic('plus')}Add</button></div>` +
      `<div class="acts" style="margin-top:10px"><span class="btn sm" data-act="sweep">${ic('check')}Seen now</span><span class="btn sm" data-act="close" style="color:var(--red)">${ic('x')}Emptied · close cage</span></div></div>` : '';
    const found = m.q ? `<div class="cres"><div class="kc">${esc(m.q)}</div>${m.hits.length ? m.hits.map(c => `<div class="where"><span class="cg">${ring(c.ring)}${esc(c.id)}</span><span class="by">${c.location ? `in <b>${esc(c.location)}</b>` : 'not parked'}${c.items[m.q] ? ` · ${c.items[m.q]} units` : ''}</span></div>`).join('') : '<div class="meta">Not on any open cage</div>'}</div>` : '';
    return vh('Cages', sub(`${m.open.length} cages open`, `${m.stale.length} not seen this week`, `${m.all.filter(c => c.status === 'closed').length} closed`), `<button class="btn primary" data-act="new">${ic('plus')}New cage</button>`, 'm-cages') +
      `<div class="grid2"><div class="lcol"><div class="card"><div class="ch"><h3>Open cages</h3><span class="pills" style="margin-left:auto"><button class="${st.sort === 'age' ? 'on' : ''}" data-act="sort" data-v="age">By age</button><button class="${st.sort === 'zone' ? 'on' : ''}" data-act="sort" data-v="zone">By zone</button><button class="${st.sort === 'type' ? 'on' : ''}" data-act="sort" data-v="type">By type</button></span></div>${chips}<div class="pcard clist" style="margin-top:10px">${rows}</div></div>` +
      `<div class="card" style="margin-top:14px"><div class="ch"><h3>Sweeps</h3><span class="cs-dim">walk the room, scan every tag</span></div><div class="ad-kv"><span>Last sweep</span><b>${lastSweep(m.open)}</b><span>Not seen 7+ days</span><b>${m.stale.map(c => `<span class="mono">${esc(c.id)}</span>`).join(' · ') || 'none'}</b><span>Closed</span><b>${m.all.filter(c => c.status === 'closed').length} cage${m.all.filter(c => c.status === 'closed').length === 1 ? '' : 's'} emptied</b></div><p class="lbl">Sweeps are run from a phone: Cages › Sweep. A cage not seen for seven days shows in red.</p></div></div>` +
      `<div class="sidecol"><div class="cfind"><div class="search">${ic('search')}<input data-field="find" value="${esc(st.find)}" placeholder="Find a cage, zone or keycode…"></div></div>${found}<div class="card" id="newCage" ${st.newOpen ? '' : 'hidden'}><div class="ch"><h3>New cage</h3></div><div class="adj-form"><input class="ad-in mono" data-field="newid" placeholder="Cage tag e.g. BSN1240421" autocapitalize="characters"><span class="ringpick"><small>Ring</small>${RINGS.map(r => `<span data-act="newring" data-v="${r}">${ring(r, st.newRing === r)}</span>`).join('')}</span><button class="btn primary" data-act="create">${ic('plus')}Open cage</button></div></div>${detail}</div></div>`;
  },
  mobile(ctx) { return `<div id="cgmob">${mobile(ctx)}</div>`; },
  mount(ctx, root) {
    const repaint = () => { if (ctx.isMobile) { const h = $('#cgmob', root); if (h) h.innerHTML = mobile(ctx); } else ctx.rerender(); };
    const codes = () => Object.values(ctx.store.get('cages')).flatMap(c => Object.keys(c.items));
    ensureNames(ctx, codes(), repaint);
    root.addEventListener('click', e => onClick(e, ctx, root, repaint));
    root.addEventListener('input', e => { if (e.target.matches('[data-field="find"]')) { st.find = e.target.value; const v = e.target.value; ctx.rerender(); setTimeout(() => { const i = root.querySelector('[data-field="find"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 0); } });
    root.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (e.target.matches('[data-field="mtag"]')) { e.preventDefault(); pickCage(ctx, e.target.value, repaint); }
      if (e.target.matches('[data-field="mscan"]')) { e.preventDefault(); scanOnto(ctx, e.target.value, repaint); e.target.value = ''; }
      if (e.target.matches('[data-field="msweep"]')) { e.preventDefault(); sweepTag(ctx, e.target.value, repaint); e.target.value = ''; }
      if (e.target.matches('[data-field="addkc"],[data-field="addqty"]')) { e.preventDefault(); root.querySelector('[data-act="addline"]')?.click(); }
      if (e.target.matches('[data-field="park"]')) { e.preventDefault(); root.querySelector('[data-act="park"]')?.click(); }
    });
    return [ctx.store.on('cages', () => { ensureNames(ctx, codes(), repaint); repaint(); })];
  },
};
function lastSweep(open) { const at = open.flatMap(c => c.sweeps.map(s => s.at)).sort().pop(); return at ? `${fmtTime(at)} · ${open.filter(c => c.sweeps.some(s => s.at.slice(0, 10) === at.slice(0, 10))).length} of ${open.length} seen that day` : 'no sweep yet'; }

async function onClick(e, ctx, root, repaint) {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act, m = model(ctx);
  if (act === 'sel') { st.sel = a.dataset.id; ctx.rerender(); }
  else if (act === 'filter') { st.filter = a.dataset.v; ctx.rerender(); }
  else if (act === 'sort') { st.sort = a.dataset.v; ctx.rerender(); }
  else if (act === 'new') { st.newOpen = !st.newOpen; ctx.rerender(); setTimeout(() => root.querySelector('[data-field="newid"]')?.focus(), 30); }
  else if (act === 'newring') { st.newRing = a.dataset.v; repaint(); }
  else if (act === 'create') { const id = String(root.querySelector('[data-field="newid"]')?.value || '').trim().toUpperCase(); if (!id) return toast('Type the cage tag', 'bad'); const r = await send(ctx, 'cage.create', { cage: id }, { ring: st.newRing }); if (r) { st.sel = id; st.newOpen = false; if (ctx.isMobile) { st.target = id; } ctx.rerender(); } }
  else if (act === 'park') { const c = m.open.find(x => x.id === st.sel); const loc = root.querySelector('[data-field="park"]')?.value.trim(); if (c && loc) await send(ctx, 'cage.park', { cage: c.id }, { location: loc }); }
  else if (act === 'addline') { const c = m.open.find(x => x.id === st.sel); const kc = parseKeycodes(root.querySelector('[data-field="addkc"]')?.value)[0], qty = Number(root.querySelector('[data-field="addqty"]')?.value) || 1; if (!c || !kc) return toast('Keycode needed', 'bad'); await send(ctx, 'cage.scan', { cage: c.id }, { keycode: kc, qty }); }
  else if (act === 'sweep') { const c = m.open.find(x => x.id === st.sel); if (c) await send(ctx, 'cage.sweep', { cage: c.id }); }
  else if (act === 'close') { const c = m.open.find(x => x.id === st.sel); if (c && confirm(`Close ${c.id}? It is emptied and leaves the list.`)) { await send(ctx, 'cage.close', { cage: c.id }); st.sel = null; } }
  // phone
  else if (act === 'mode') { st.mode = a.dataset.mode; repaint(); }
  else if (act === 'm-pick') { st.target = a.dataset.id; repaint(); setTimeout(() => root.querySelector('[data-field="mscan"]')?.focus(), 30); }
  else if (act === 'm-change') { st.target = null; st.last = null; repaint(); }
  else if (act === 'm-new') { st.newOpen = !st.newOpen; repaint(); }
  else if (act === 'm-park') { const loc = prompt(`Park ${st.target} at (aisle or spot)`, m.open.find(c => c.id === st.target)?.location || ''); if (loc && loc.trim()) await send(ctx, 'cage.park', { cage: st.target }, { location: loc.trim() }); }
  else if (act === 'm-qty') { st.qty = Math.max(1, st.qty + Number(a.dataset.d)); repaint(); }
  else if (act === 'm-done') { const c = m.open.find(x => x.id === st.target); if (c && !c.location) { const loc = prompt(`Park ${c.id} at (aisle or spot)`); if (loc && loc.trim()) await send(ctx, 'cage.park', { cage: c.id }, { location: loc.trim() }); } st.target = null; st.last = null; repaint(); }
  else if (act === 'm-seen') { await send(ctx, 'cage.sweep', { cage: a.dataset.id }); }
  else if (act === 'm-scan-btn') { const i = root.querySelector('[data-field="mscan"]'); if (i) { await scanOnto(ctx, i.value, repaint); i.value = ''; } }
}
async function pickCage(ctx, raw, repaint) {
  const id = String(raw || '').trim().toUpperCase(); if (!id) return;
  const c = ctx.store.get('cages')[id];
  if (!c || c.status !== 'open') { if (!confirm(`${id} is not an open cage. Open it now with a ${RING[st.newRing][0]} ring?`)) return; const r = await send(ctx, 'cage.create', { cage: id }, { ring: st.newRing }); if (!r) return; }
  st.target = id; st.last = null; repaint(); setTimeout(() => document.querySelector('[data-field="mscan"]')?.focus(), 30);
}
async function scanOnto(ctx, raw, repaint) {
  const v = String(raw || '').trim().toUpperCase();
  if (ctx.store.get('cages')[v]?.status === 'open') return pickCage(ctx, v, repaint);
  const kc = parseKeycodes(v)[0]; if (!kc) return toast('That is not a keycode or a cage tag', 'bad');
  const r = await send(ctx, 'cage.scan', { cage: st.target }, { keycode: kc, qty: st.qty });
  if (r) { st.last = { kc, qty: st.qty }; st.qty = 1; ensureNames(ctx, [kc], repaint); repaint(); }
  setTimeout(() => document.querySelector('[data-field="mscan"]')?.focus(), 30);
}
async function sweepTag(ctx, raw, repaint) {
  const id = String(raw || '').trim().toUpperCase();
  if (!ctx.store.get('cages')[id]) return toast(`${id} is not a cage on the register`, 'bad');
  await send(ctx, 'cage.sweep', { cage: id }); toast(`${id} seen`); repaint();
}
function mobile(ctx) {
  const m = model(ctx);
  if (st.mode === 'sweep') {
    const today = storeToday();
    const zones = {}; for (const c of m.open) (zones[c.location || 'Not parked'] ||= []).push(c);
    const seen = m.open.filter(c => c.sweeps.some(s => storeDay(s.at) === today)).length;
    return mhead('Cage sweep', `${seen} of ${m.open.length} seen today`) + `<div class="cs">${cagetabs('sweep')}` +
      `<div class="card swp-prog"><div class="swp-big"><b>${seen}</b><span>of ${m.open.length} seen</span></div><div class="track"><i style="width:${m.open.length ? Math.round(seen / m.open.length * 100) : 0}%"></i></div></div>` +
      mscan('Scan a cage tag', `<input data-field="msweep" autocomplete="off" autocapitalize="characters" placeholder="Cage tag" enterkeyhint="done">`, 'Or tap Seen on the cage in front of you') +
      `<div class="card swp-list">${Object.entries(zones).map(([z, cs]) => `<div class="swp-zone"><div class="swp-zh">${esc(z)}<span>${cs.filter(c => c.sweeps.some(s => storeDay(s.at) === today)).length} of ${cs.length}</span></div>${cs.map(c => { const ok = c.sweeps.some(s => storeDay(s.at) === today); return `<div class="swp-row ${ok ? 'ok' : c.stale ? 'lost' : 'todo'}"><span class="swp-ic">${ic(ok ? 'check' : c.stale ? 'alert' : 'clock')}</span><span class="cg">${esc(c.id)}</span><span class="st">${ok ? 'Seen' : c.stale ? `Not seen ${ageOf(c.seen)}` : 'To find'}${ok ? '' : ` <span class="btn sm" data-act="m-seen" data-id="${esc(c.id)}">Seen</span>`}</span></div>`; }).join('')}</div>`).join('') || '<div class="cs-dim" style="padding:12px">No open cages</div>'}</div></div>`;
  }
  const t = m.open.find(c => c.id === st.target);
  if (!t) {
    return mhead('Cage scan', 'Scan a cage tag to start') + `<div class="cs">${cagetabs('scan')}` +
      mscan('Scan the cage tag', `<input data-field="mtag" autocomplete="off" autocapitalize="characters" placeholder="e.g. BSN1240417" enterkeyhint="go">`, 'A tag that is not on the register opens a new cage') +
      `<div class="ringpick" style="margin:0 0 6px"><small>Ring for a new cage</small>${RINGS.map(r => `<span data-act="newring" data-v="${r}">${ring(r, st.newRing === r)}</span>`).join('')}</div>` +
      (m.open.length ? `<div class="mv-sub">Open cages</div>` + mrows(m.open.slice(0, 8).map(c => [`${ring(c.ring)} ${esc(c.id)}`, `${c.location ? esc(c.location) : 'not parked'} · ${c.units} units`, `<span class="btn sm" data-act="m-pick" data-id="${esc(c.id)}">Use</span>`, ''])) : '') + '</div>';
  }
  const lines = Object.entries(t.items);
  return mhead('Cage scan', `${esc(t.id)} · scan carton, product or cage tag`) + `<div class="cs">${cagetabs('scan')}` +
    `<div class="cs-target"><div class="cs-tag"><span class="cs-cg">${ring(t.ring)}${esc(t.id)}</span><span class="chip" style="background:${RING[t.ring][1]}22;color:${RING[t.ring][1]}"><i style="width:8px;height:8px;border-radius:50%;background:${RING[t.ring][1]}"></i>${RING[t.ring][0]}</span></div><div class="cs-where">${ic('pin')}<span>${t.location ? `<b>${esc(t.location)}</b>` : 'not parked yet'} · seen ${ago(t.seen)}</span></div><div class="cs-meta">Opened ${fmtTime(t.created)} · <b>${t.units} units</b> on ${t.lines} lines</div><div class="cs-tacts"><span class="btn sm" data-act="m-change">${ic('cage')}Change cage</span><span class="btn sm" data-act="m-park">${ic('parking')}Park here</span></div></div>` +
    mscan('Scan a product', `<input data-field="mscan" inputmode="numeric" autocomplete="off" placeholder="Keycode, item barcode or cage tag" enterkeyhint="done">`, '', `<span class="cs-step"><button data-act="m-qty" data-d="-1">${ic('minus')}</button><b>${st.qty}</b><button data-act="m-qty" data-d="1">${ic('plus')}</button></span><button data-act="m-scan-btn">${ic('barcode')}Add × ${st.qty}</button>`) +
    (st.last ? `<div class="cs-last ok"><div class="cs-lh"><span class="cs-kind">${ic('tag')}Product</span><span class="cs-tick">${ic('check')}Added to ${esc(t.id)}</span></div><div class="cs-kc">${esc(st.last.kc)}<small>${nameHtml(st.last.kc)}</small></div><div class="cs-facts"><span><b>× ${st.last.qty}</b> units</span></div></div>` : '') +
    `<div class="card cs-list"><div class="pt3">On this cage<span class="cs-dim">${t.units} units · ${t.lines} lines</span></div>${lines.map(([kc, q]) => `<div class="row"><span class="kc">${esc(kc)}<small>${nameHtml(kc)}</small></span><span class="q">× ${q}</span></div>`).join('') || '<div class="row cs-dim">Nothing yet</div>'}</div>` +
    `<div class="cs-foot"><span class="btn primary" data-act="m-done">${ic('check')}Done · park ${esc(t.id)}</span></div></div>`;
}
