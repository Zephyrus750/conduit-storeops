// Cages: every open cage with its ring colour, where it is parked, what is
// on it and when it was last seen. Desktop lists and finds; the phone
// scans cartons onto a cage (cage.scan), parks it (cage.park) and sweeps
// the room (cage.sweep). Ring colour is the physical ring on the cage.

import { $, ic, esc, vh, sub, today as storeToday, dayOf, status, fmtTime, ago, toast, mhead, mrows, mbig, mghost, mfoot, mscan } from '../../ui.js';
import { parseKeycodes } from '../../../shared/backfill.js';
import { RINGS } from '../../../shared/reducers/stockroom.js';
import { RING, ring, ageOf, ensureNames, nameHtml, nameOf, send } from './common.js';
import { gs1Parse } from '../../../shared/gs1.js';
import { ulid } from '../../../shared/ulid.js';
import { hasMap, mountMap, bindMapChrome, mvMap, segmentId } from '../../map.js';
import { printSheet } from '../../print.js';
import { barcodeSvg } from '../../../shared/barcode.js';

const st = { sel: null, find: '', filter: 'all', sort: 'age', mode: 'scan', target: null, qty: 1, last: null, newRing: 'new-lines', placing: null, feed: 'all', tags: false, zone: '', pairing: null };
const LOG_NAME = { open: 'Opened', in: 'Stock on', out: 'Stock off', park: 'Parked', move: 'Moved', seen: 'Seen', found: 'Found again', missing: 'Missing', lost: 'Lost', retag: 'Re-tagged', close: 'Closed' };
const flag = c => c.lost ? '<span class="status bad">LOST</span>' : c.missing ? `<span class="status warn">MISSING · ${c.missing.n} sweep${c.missing.n === 1 ? '' : 's'}</span>` : '';
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
    const rows = list.map(c => `<div class="row${st.sel === c.id ? ' sel' : ''}" data-act="sel" data-id="${esc(c.id)}"><span class="cg">${ring(c.ring)}${esc(c.id)}</span><span>${RING[c.ring][0]} · ${c.location ? esc(c.location) : '<i class="cs-dim">not parked</i>'}<small>${c.lines} lines · ${c.units} units · last seen ${ago(c.seen)}${c.x != null ? ' · on the map' : ''}</small>${flag(c)}</span><span class="cage-age ${c.stale ? 'old' : Date.now() - new Date(c.seen) > 2 * 86400000 ? 'mid' : 'ok'}">${ageOf(c.seen)}</span></div>`).join('') || '<div class="row cs-dim">No cages open. Start one on the right.</div>';
    const sel = m.open.find(c => c.id === st.sel);
    const detail = sel ? `<div class="cres"><div class="kc">${ring(sel.ring)}${esc(sel.id)}</div><div class="nm">${RING[sel.ring][0]} cage · opened ${fmtTime(sel.created)}</div><div class="where"><span class="by">${sel.location ? `in <b>${esc(sel.location)}</b>` : 'not parked yet'} · last seen ${ago(sel.seen)} · ${sel.sweeps.length} sweep${sel.sweeps.length === 1 ? '' : 's'}</span></div>` +
      `<div class="list" style="margin-top:8px">${Object.entries(sel.items).map(([kc, q]) => `<div class="li"><span class="kc mono">${esc(kc)}</span><span class="nm">${nameHtml(kc)}</span><b>× ${q}</b></div>`).join('') || '<div class="li cs-dim">Nothing on it yet</div>'}</div>` +
      `<div class="adj-form2" style="margin-top:10px"><input class="ad-in mono" data-field="park" placeholder="Park at… e.g. AISLE 2" value="${esc(sel.location || '')}"><button class="btn sm" data-act="park">${ic('parking')}Park</button></div>` +
      `<div class="adj-form2" style="margin-top:8px"><input class="ad-in mono" data-field="addkc" placeholder="Keycode" inputmode="numeric"><input class="ad-in" data-field="addqty" placeholder="Qty" inputmode="numeric" value="1" style="max-width:80px"><button class="btn sm" data-act="addline">${ic('plus')}Add</button></div>` +
      `<div class="acts" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">${hasMap() ? `<span class="btn sm${st.placing === sel.id ? ' primary' : ''}" data-act="place">${ic('pin')}${st.placing === sel.id ? 'Tap the map…' : 'Place on map'}</span>` : ''}<span class="btn sm" data-act="sweep">${ic('check')}Seen now</span><span class="btn sm" data-act="retag">${ic('tag')}Re-tag</span><span class="btn sm" data-act="tag1">${ic('print')}Print tag</span><span class="btn sm" data-act="close" style="color:var(--red)">${ic('x')}Emptied · close cage</span></div>${flag(sel) ? `<p class="lbl" style="margin-top:8px">${flag(sel)} Not seen on ${sel.missing.n} sweep${sel.missing.n === 1 ? '' : 's'} since ${fmtTime(sel.missing.since)}. Scanning its tag on a sweep (or Seen now) clears it.</p>` : ''}</div>` : '';
    const found = m.q ? `<div class="cres"><div class="kc">${esc(m.q)}</div>${m.hits.length ? m.hits.map(c => `<div class="where"><span class="cg">${ring(c.ring)}${esc(c.id)}</span><span class="by">${c.location ? `in <b>${esc(c.location)}</b>` : 'not parked'}${c.items[m.q] ? ` · ${c.items[m.q]} units` : ''}</span></div>`).join('') : '<div class="meta">Not on any open cage</div>'}</div>` : '';
    return vh('Cages', sub(`${m.open.length} cages open`, `${m.stale.length} not seen this week`, `${m.all.filter(c => c.status === 'closed').length} closed`), `<button class="btn" data-act="tags">${ic('print')}Print tags</button><button class="btn primary" data-act="new">${ic('plus')}New cage</button>`, 'm-cages') +
      `<div class="grid2"><div class="lcol"><div class="card"><div class="ch"><h3>Open cages</h3><span class="pills" style="margin-left:auto"><button class="${st.sort === 'age' ? 'on' : ''}" data-act="sort" data-v="age">By age</button><button class="${st.sort === 'zone' ? 'on' : ''}" data-act="sort" data-v="zone">By zone</button><button class="${st.sort === 'type' ? 'on' : ''}" data-act="sort" data-v="type">By type</button></span></div>${chips}<div class="pcard clist" style="margin-top:10px">${rows}</div></div>` +
      `<div class="card" style="margin-top:14px"><div class="ch"><h3>Sweeps</h3><span class="cs-dim">walk the room, scan every tag</span></div><div class="ad-kv"><span>Last sweep</span><b>${lastSweep(m.open)}</b><span>Not seen 7+ days</span><b>${m.stale.map(c => `<span class="mono">${esc(c.id)}</span>`).join(' · ') || 'none'}</b><span>Closed</span><b>${m.all.filter(c => c.status === 'closed').length} cage${m.all.filter(c => c.status === 'closed').length === 1 ? '' : 's'} emptied</b></div><p class="lbl">Sweeps are run from a phone: Cages › Sweep. A cage not seen on a sweep is missing, and lost after two in a row; one seen in another zone is moved there.</p>${sweepCard(ctx)}</div>${hasMap() ? `<div class="card cg-mapcard" style="margin-top:14px"><div class="ch"><h3>Back-of-house map</h3><span class="cs-dim">${m.open.filter(c => c.x != null).length} of ${m.open.length} cages placed${st.placing ? ` · placing <b>${esc(st.placing)}</b>: tap where it stands` : ''}</span></div>${mvMap({ id: 'cgmap' })}</div>` : ''}${feedCard(m)}</div>` +
      `<div class="sidecol"><div class="cfind"><div class="search">${ic('search')}<input data-field="find" value="${esc(st.find)}" placeholder="Find a cage, zone or keycode…"></div></div>${found}<div class="card" id="newCage" ${st.newOpen ? '' : 'hidden'}><div class="ch"><h3>New cage</h3></div><div class="adj-form"><input class="ad-in mono" data-field="newid" placeholder="Cage tag e.g. BSN1240421" autocapitalize="characters"><span class="ringpick"><small>Ring</small>${RINGS.map(r => `<span data-act="newring" data-v="${r}" aria-label="${RING[r][0]} ring" aria-pressed="${st.newRing === r}">${ring(r, st.newRing === r)}</span>`).join('')}</span><button class="btn primary" data-act="create">${ic('plus')}Open cage</button></div></div>${st.tags ? tagsCard(m) : ''}${detail}</div></div>`;
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
      if (e.target.matches('[data-field="pairkc"]')) { e.preventDefault(); pairAndScan(ctx, e.target.value, repaint); }
      if (e.target.matches('[data-field="msweep"]')) { e.preventDefault(); sweepTag(ctx, e.target.value, repaint); e.target.value = ''; }
      if (e.target.matches('[data-field="addkc"],[data-field="addqty"]')) { e.preventDefault(); root.querySelector('[data-act="addline"]')?.click(); }
      if (e.target.matches('[data-field="park"]')) { e.preventDefault(); root.querySelector('[data-act="park"]')?.click(); }
    });
    // The back-of-house map: open cages as pins in their ring colour (red when
    // missing or lost); while placing, a tap parks the cage there.
    const stage = !ctx.isMobile && $('#mapstage', root);
    if (stage && hasMap()) {
      const map = mountMap(stage, { onSelect: async info => {
        if (!st.placing || (info.kind !== 'floor' && info.kind !== 'shelf')) return;
        const p = info.point || map.centreOf(info.id), near = info.kind === 'shelf' ? { id: info.full } : nearestShelf(map, p), id = st.placing; st.placing = null;
        await send(ctx, 'cage.park', { cage: id }, { location: near ? `NEAR ${near.id}` : 'BOH', x: p[0], y: p[1], floor: map.floorId() || null });
        toast(`${id} placed${near ? ` near ${near.id}` : ''}`);
      } });
      bindMapChrome(root, map);
      const boh = map.floors().find(f => f.type === 'boh'); const target = model(ctx).open.find(c => c.id === st.sel && c.floor)?.floor || boh?.id; if (target) map.floor(target);
      const paint = () => { map.clearOverlays(); map.drawPins(model(ctx).open.filter(c => c.x != null && (!c.floor || c.floor === map.floorId())).map(c => ({ x: c.x, y: c.y, colour: c.lost || c.missing ? '#DC2626' : RING[c.ring][1], label: c.id === st.sel ? '★' : '▦', badge: c.lost ? '!' : '', title: `${c.id} · ${RING[c.ring][0]} · ${c.location || ''}${c.lost ? ' · LOST' : c.missing ? ' · missing' : ''}` }))); };
      paint(); stage.addEventListener('mapfloor', paint);
    }
    return [ctx.store.on('cages', () => { ensureNames(ctx, codes(), repaint); repaint(); }), ctx.store.on('cageSweeps', repaint), ctx.store.on('apnPairs', repaint)];
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
  else if (act === 'place') { st.placing = st.placing === st.sel ? null : st.sel; ctx.rerender(); }
  else if (act === 'retag') { const to = (prompt(`New tag for ${st.sel} (scan or type it)`) || '').trim().toUpperCase(); if (!to) return; const sscc = gs1Parse(to)?.sscc; if (await send(ctx, 'cage.retag', { cage: st.sel }, { to: sscc || to })) { toast(`${st.sel} is now ${sscc || to}`); st.sel = sscc || to; ctx.rerender(); } }
  else if (act === 'tag1') printTags([st.sel], ctx.storeName);
  else if (act === 'tags') { st.tags = !st.tags; ctx.rerender(); }
  else if (act === 'tags-print') { const pre = (root.querySelector('[data-field="tagpre"]')?.value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, ''), from = Number(root.querySelector('[data-field="tagfrom"]')?.value) || 1, n = Math.max(1, Math.min(48, Number(root.querySelector('[data-field="tagn"]')?.value) || 8)); if (!pre) return toast('A tag prefix is needed', 'bad'); printTags(Array.from({ length: n }, (_, i) => `${pre}${String(from + i).padStart(4, '0')}`), ctx.storeName); }
  else if (act === 'feed') { st.feed = a.dataset.v; ctx.rerender(); }
  // phone
  else if (act === 'sw-start') { const id = ulid(); if (await send(ctx, 'cage.sweepStart', { sweep: id })) toast('Sweep started: scan every cage tag you pass'); repaint(); }
  else if (act === 'sw-end') { const cur = ctx.store.get('cageSweeps')?.current; if (!cur) return; const left = m.open.filter(c => !cur.seen[c.id]).length; if (left && !confirm(`${left} cage${left === 1 ? ' has' : 's have'} not been seen on this sweep. Finish anyway? ${left === 1 ? 'It is' : 'They are'} marked missing.`)) return; if (await send(ctx, 'cage.sweepEnd', { sweep: cur.id })) { const h = ctx.store.get('cageSweeps').history.at(-1); toast(`Sweep done · ${h.seen} of ${h.total} seen${h.moved.length ? ` · ${h.moved.length} moved` : ''}${h.missing.length ? ` · ${h.missing.length} missing` : ''}`); } repaint(); }
  else if (act === 'zone') { const z = (prompt('Which zone are you in? (aisle, bay or area: a cage scanned here that was parked elsewhere is moved here)', st.zone) ?? st.zone).trim().toUpperCase(); st.zone = z; repaint(); }
  else if (act === 'pair-cancel') { st.pairing = null; repaint(); }
  else if (act === 'pair-save') { const i = root.querySelector('[data-field="pairkc"]'); await pairAndScan(ctx, i?.value, repaint); }
  else if (act === 'mode') { st.mode = a.dataset.mode; repaint(); }
  else if (act === 'm-pick') { st.target = a.dataset.id; repaint(); setTimeout(() => root.querySelector('[data-field="mscan"]')?.focus(), 30); }
  else if (act === 'm-change') { st.target = null; st.last = null; repaint(); }
  else if (act === 'm-new') { st.newOpen = !st.newOpen; repaint(); }
  else if (act === 'm-park') { const loc = prompt(`Park ${st.target} at (aisle or spot)`, m.open.find(c => c.id === st.target)?.location || ''); if (loc && loc.trim()) await send(ctx, 'cage.park', { cage: st.target }, { location: loc.trim() }); }
  else if (act === 'm-qty') { st.qty = Math.max(1, st.qty + Number(a.dataset.d)); repaint(); }
  else if (act === 'm-done') { const c = m.open.find(x => x.id === st.target); if (c && !c.location) { const loc = prompt(`Park ${c.id} at (aisle or spot)`); if (loc && loc.trim()) await send(ctx, 'cage.park', { cage: c.id }, { location: loc.trim() }); } st.target = null; st.last = null; repaint(); }
  else if (act === 'm-seen') { await send(ctx, 'cage.sweep', { cage: a.dataset.id }, sweepPayload(ctx)); }
  else if (act === 'm-scan-btn') { const i = root.querySelector('[data-field="mscan"]'); if (i) { await scanOnto(ctx, i.value, repaint); i.value = ''; } }
}
async function pickCage(ctx, raw, repaint) {
  const id = tagOf(raw); if (!id) return;
  const c = ctx.store.get('cages')[id];
  if (!c || c.status !== 'open') { if (!confirm(`${id} is not an open cage. Open it now with a ${RING[st.newRing][0]} ring?`)) return; const r = await send(ctx, 'cage.create', { cage: id }, { ring: st.newRing }); if (!r) return; }
  st.target = id; st.last = null; repaint(); setTimeout(() => document.querySelector('[data-field="mscan"]')?.focus(), 30);
}
async function scanOnto(ctx, raw, repaint) {
  const v = String(raw || '').trim().toUpperCase();
  if (ctx.store.get('cages')[v]?.status === 'open') return pickCage(ctx, v, repaint);
  if (ctx.store.get('cages')[tagOf(v)]?.status === 'open') return pickCage(ctx, v, repaint);
  // An item barcode: its paired keycode, or ask for it once.
  const g = v.replace(/\D/g, '').length >= 12 || v.startsWith('(') ? gs1Parse(v) : null;
  if (g?.gtin) { const pr = ctx.store.get('apnPairs')?.[g.gtin]; if (!pr) { st.pairing = g.gtin; repaint(); setTimeout(() => document.querySelector('[data-field="pairkc"]')?.focus(), 30); return; } return addLine(ctx, pr.kc, repaint, g.gtin); }
  const kc = parseKeycodes(v)[0]; if (!kc) return toast('That is not a keycode, an item barcode or a cage tag', 'bad');
  return addLine(ctx, kc, repaint);
}
async function addLine(ctx, kc, repaint, apn) {
  const r = await send(ctx, 'cage.scan', { cage: st.target }, { keycode: kc, qty: st.qty, ...(apn ? { apn } : {}) });
  if (r) { st.last = { kc, qty: st.qty }; st.qty = 1; ensureNames(ctx, [kc], repaint); repaint(); }
  setTimeout(() => document.querySelector('[data-field="mscan"]')?.focus(), 30);
}
async function sweepTag(ctx, raw, repaint) {
  const id = tagOf(raw);
  if (!ctx.store.get('cages')[id]) return toast(`${id} is not a cage on the register`, 'bad');
  const c = ctx.store.get('cages')[id], moved = st.zone && c.location && c.location !== st.zone;
  if (await send(ctx, 'cage.sweep', { cage: id }, sweepPayload(ctx))) toast(`${id} seen${moved ? ` · moved ${c.location} → ${st.zone}` : ''}${c.lost || c.missing ? ' · found again' : ''}`); repaint();
}
function mobile(ctx) {
  const m = model(ctx);
  if (st.mode === 'sweep') {
    const today = storeToday();
    const zones = {}; for (const c of m.open) (zones[c.location || 'Not parked'] ||= []).push(c);
    const seen = m.open.filter(c => c.sweeps.some(s => dayOf(s.at) === today)).length;
    const cur = ctx.store.get('cageSweeps')?.current, inSweep = cur ? Object.keys(cur.seen).length : 0;
    const ctl = `<div class="card cg-swctl">${cur ? `<div><b>Sweep running</b> · ${inSweep} of ${cur.open} seen<small>started ${fmtTime(cur.at)}${cur.by ? ` · ${esc(cur.by)}` : ''}</small></div><button class="btn sm primary" data-act="sw-end">${ic('check')}Finish sweep</button>` : `<div><b>No sweep running</b><small>Start one, then scan every cage tag in the room</small></div><button class="btn sm primary" data-act="sw-start">${ic('listcheck')}Start a sweep</button>`}<button class="btn sm" data-act="zone">${ic('pin')}${st.zone ? `Zone <b>${esc(st.zone)}</b>` : 'Set zone'}</button></div>`;
    return mhead('Cage sweep', `${seen} of ${m.open.length} seen today`) + `<div class="cs">${cagetabs('sweep')}` + ctl +
      `<div class="card swp-prog"><div class="swp-big"><b>${seen}</b><span>of ${m.open.length} seen</span></div><div class="track"><i style="width:${m.open.length ? Math.round(seen / m.open.length * 100) : 0}%"></i></div></div>` +
      mscan('Scan a cage tag', `<input data-field="msweep" autocomplete="off" autocapitalize="characters" placeholder="Cage tag" enterkeyhint="done">`, 'Or tap Seen on the cage in front of you') +
      `<div class="card swp-list">${Object.entries(zones).map(([z, cs]) => `<div class="swp-zone"><div class="swp-zh">${esc(z)}<span>${cs.filter(c => c.sweeps.some(s => dayOf(s.at) === today)).length} of ${cs.length}</span></div>${cs.map(c => { const ok = c.sweeps.some(s => dayOf(s.at) === today); return `<div class="swp-row ${ok ? 'ok' : c.stale ? 'lost' : 'todo'}"><span class="swp-ic">${ic(ok ? 'check' : c.stale ? 'alert' : 'clock')}</span><span class="cg">${esc(c.id)}</span><span class="st">${ok ? 'Seen' : c.stale ? `Not seen ${ageOf(c.seen)}` : 'To find'}${ok ? '' : ` <span class="btn sm" data-act="m-seen" data-id="${esc(c.id)}">Seen</span>`}</span></div>`; }).join('')}</div>`).join('') || '<div class="cs-dim" style="padding:12px">No open cages</div>'}</div></div>`;
  }
  const t = m.open.find(c => c.id === st.target);
  if (!t) {
    return mhead('Cage scan', 'Scan a cage tag to start') + `<div class="cs">${cagetabs('scan')}` +
      mscan('Scan the cage tag', `<input data-field="mtag" autocomplete="off" autocapitalize="characters" placeholder="e.g. BSN1240417" enterkeyhint="go">`, 'A tag that is not on the register opens a new cage') +
      `<div class="ringpick" style="margin:0 0 6px"><small>Ring for a new cage</small>${RINGS.map(r => `<span data-act="newring" data-v="${r}" aria-label="${RING[r][0]} ring" aria-pressed="${st.newRing === r}">${ring(r, st.newRing === r)}</span>`).join('')}</div>` +
      (m.open.length ? `<div class="mv-sub">Open cages</div>` + mrows(m.open.slice(0, 8).map(c => [`${ring(c.ring)} ${esc(c.id)}`, `${c.location ? esc(c.location) : 'not parked'} · ${c.units} units`, `<span class="btn sm" data-act="m-pick" data-id="${esc(c.id)}">Use</span>`, ''])) : '') + '</div>';
  }
  const lines = Object.entries(t.items);
  return mhead('Cage scan', `${esc(t.id)} · scan carton, product or cage tag`) + `<div class="cs">${cagetabs('scan')}` +
    `<div class="cs-target"><div class="cs-tag"><span class="cs-cg">${ring(t.ring)}${esc(t.id)}</span><span class="chip" style="background:${RING[t.ring][1]}22;color:${RING[t.ring][1]}"><i style="width:8px;height:8px;border-radius:50%;background:${RING[t.ring][1]}"></i>${RING[t.ring][0]}</span></div><div class="cs-where">${ic('pin')}<span>${t.location ? `<b>${esc(t.location)}</b>` : 'not parked yet'} · seen ${ago(t.seen)}</span></div><div class="cs-meta">Opened ${fmtTime(t.created)} · <b>${t.units} units</b> on ${t.lines} lines</div><div class="cs-tacts"><span class="btn sm" data-act="m-change">${ic('cage')}Change cage</span><span class="btn sm" data-act="m-park">${ic('parking')}Park here</span></div></div>` +
    (st.pairing ? `<div class="card cg-pair"><b>New item barcode ${esc(st.pairing)}</b><p class="lbl">Scan or type its keycode once (shelf label or carton); after that this barcode goes straight onto a cage.</p><div class="adj-form2"><input class="ad-in mono" data-field="pairkc" inputmode="numeric" placeholder="Keycode" autocomplete="off"><button class="btn sm primary" data-act="pair-save">Pair & add</button><button class="btn sm" data-act="pair-cancel">Cancel</button></div></div>` : '') +
    mscan('Scan a product', `<input data-field="mscan" inputmode="numeric" autocomplete="off" placeholder="Keycode, item barcode or cage tag" enterkeyhint="done">`, '', `<span class="cs-step"><button data-act="m-qty" data-d="-1">${ic('minus')}</button><b>${st.qty}</b><button data-act="m-qty" data-d="1">${ic('plus')}</button></span><button data-act="m-scan-btn">${ic('barcode')}Add × ${st.qty}</button>`) +
    (st.last ? `<div class="cs-last ok"><div class="cs-lh"><span class="cs-kind">${ic('tag')}Product</span><span class="cs-tick">${ic('check')}Added to ${esc(t.id)}</span></div><div class="cs-kc">${esc(st.last.kc)}<small>${nameHtml(st.last.kc)}</small></div><div class="cs-facts"><span><b>× ${st.last.qty}</b> units</span></div></div>` : '') +
    `<div class="card cs-list"><div class="pt3">On this cage<span class="cs-dim">${t.units} units · ${t.lines} lines</span></div>${lines.map(([kc, q]) => `<div class="row"><span class="kc">${esc(kc)}<small>${nameHtml(kc)}</small></span><span class="q">× ${q}</span></div>`).join('') || '<div class="row cs-dim">Nothing yet</div>'}</div>` +
    `<div class="cs-foot"><span class="btn primary" data-act="m-done">${ic('check')}Done · park ${esc(t.id)}</span></div></div>`;
}

// A cage tag as typed or scanned; an SSCC label (GS1 AI 00) is its 18 digits.
function tagOf(raw) { const v = String(raw || '').trim().toUpperCase(); return gs1Parse(v)?.sscc || v; }
function sweepPayload(ctx) { const cur = ctx.store.get('cageSweeps')?.current; return { ...(cur ? { session: cur.id } : {}), ...(st.zone ? { location: st.zone } : {}) }; }
async function pairAndScan(ctx, raw, repaint) {
  const kc = parseKeycodes(raw)[0]; if (!kc) return toast('Scan or type the keycode on the shelf label or carton', 'bad');
  const apn = st.pairing; if (!apn) return;
  if (await send(ctx, 'cage.pair', { apn }, { keycode: kc })) { st.pairing = null; toast(`${apn} paired with ${kc}: next time it needs no keycode`); await addLine(ctx, kc, repaint, apn); }
}
function nearestShelf(map, p) {
  let best = null;
  for (const g of map.segments()) {
    if (g.closest('.mfl')?.getAttribute('data-fid') !== map.floorId()) continue;
    const r = g.querySelector('.shelf'); if (!r) continue;
    const b = r.getBBox(), d = (b.x + b.width / 2 - p[0]) ** 2 + (b.y + b.height / 2 - p[1]) ** 2;
    if (!best || d < best.d) best = { d, id: segmentId(g) };   // the module, "A16 S2"
  }
  return best;
}
// The activity feed: every open and recently closed cage's log, newest first.
function feedCard(m) {
  const rows = m.all.flatMap(c => (c.log || []).map(l => ({ ...l, id: c.id, ring: c.ring }))).filter(l => st.feed === 'all' || (st.feed === 'sel' ? l.id === st.sel : ['missing', 'lost', 'move', 'found'].includes(l.k))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
  const tab = (v, l) => `<button class="${st.feed === v ? 'on' : ''}" data-act="feed" data-v="${v}">${l}</button>`;
  return `<div class="card" style="margin-top:14px"><div class="ch"><h3>Activity</h3><span class="pills" style="margin-left:auto">${tab('all', 'All')}${tab('flags', 'Moves & missing')}${st.sel ? tab('sel', esc(st.sel)) : ''}</span></div><div class="cg-feed">${rows.map(l => `<div class="cg-ev ${l.k}"><span class="cs-dim">${fmtTime(l.at)}</span><span class="cg">${ring(l.ring)}${esc(l.id)}</span><b>${LOG_NAME[l.k] || l.k}</b><span>${esc(l.d)}</span><span class="cs-dim">${esc(l.by || '')}</span></div>`).join('') || '<p class="lbl">Nothing yet. Opening, parking, scanning and sweeping cages all show here.</p>'}</div></div>`;
}
function sweepCard(ctx) {
  const sw = ctx.store.get('cageSweeps') || { current: null, history: [] }, cur = sw.current;
  const now = cur ? `<div class="cg-sweep live"><b>Sweep running</b> since ${fmtTime(cur.at)}${cur.by ? ` · ${esc(cur.by)}` : ''} · ${Object.keys(cur.seen).length} of ${cur.open} seen${cur.moved.length ? ` · ${cur.moved.length} moved` : ''}${cur.found.length ? ` · ${cur.found.length} found again` : ''}</div>` : '';
  const hist = sw.history.slice(-5).reverse().map(h => `<div class="cg-sweep"><span><b>${fmtTime(h.at)}</b> · ${h.seen} of ${h.total} seen</span>${h.moved.length ? `<span>moved: ${h.moved.map(x => `<span class="mono">${esc(x.id)}</span> ${esc(x.from)} → ${esc(x.to)}`).join(', ')}</span>` : ''}${h.missing.length ? `<span class="warn">missing: ${h.missing.map(esc).join(', ')}</span>` : ''}${h.lost.length ? `<span class="bad">lost: ${h.lost.map(esc).join(', ')}</span>` : ''}${h.found.length ? `<span class="good">found: ${h.found.map(esc).join(', ')}</span>` : ''}</div>`).join('');
  return now || hist ? `<div class="cg-sweeps">${now}${hist}</div>` : '';
}
// Tags: a sheet of cage tags to print and laminate, each with its barcode.
function tagsCard(m) {
  const ids = Object.keys(m.all.reduce((o, c) => (o[c.id] = 1, o), {})), mx = /^([A-Z-]+?)(\d+)$/.exec(ids.sort().at(-1) || '');
  return `<div class="card"><div class="ch"><h3>Print cage tags</h3><span class="go" data-act="tags">Close</span></div><div class="adj-form"><div class="adj-form2"><input class="ad-in mono" data-field="tagpre" placeholder="Prefix" value="${esc(mx ? mx[1] : 'CG')}" autocapitalize="characters"><input class="ad-in" data-field="tagfrom" inputmode="numeric" value="${mx ? Number(mx[2]) + 1 : 1}" aria-label="Start at"><input class="ad-in" data-field="tagn" inputmode="numeric" value="8" aria-label="How many"></div><button class="btn primary" data-act="tags-print">${ic('print')}Print tags</button><div class="cs-dim">Eight to a page. Numbers carry on from the highest tag on the register. A tag can also be an SSCC label: scanning it reads the 18 digits.</div></div></div>`;
}
function printTags(ids, store) {
  const tag = id => `<div class="ps-cagetag"><div class="ct-store">${esc(store || '')} · cage</div><div class="ct-id">${esc(id)}</div>${barcodeSvg(id, { module: 2, height: 64 })}<div class="ct-rings">${RINGS.map(r => `<span><i></i>${esc(RING[r][0])}</span>`).join('')}</div></div>`;
  const pages = []; for (let i = 0; i < ids.length; i += 8) pages.push(`<div class="${i ? 'ps-page ' : ''}ps-tags">${ids.slice(i, i + 8).map(tag).join('')}</div>`);
  printSheet({ title: `Cage tags · ${ids.length}`, subtitle: `${ids[0]}${ids.length > 1 ? ` to ${ids.at(-1)}` : ''} · tick the ring colour on each`, body: pages.join('') });
}
