// Pick list: an ordered list of shelves per device with a walked route.
// Reads store.get('picklists')[device]; writes picklist.set.

import { $, ic, esc, vh, sub, dep, DEPT_NAME, toast } from '../ui.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, canonCode, setStrip, sx } from '../map.js';
import { voiceSupported, dictate } from '../voice.js';
import { spokenCodes, spokenStops, typedStops, ofRun, STOP_WORDS } from '../../shared/voice.js';
import { haptic } from '../device.js';
import { tx, txn } from '../i18n.js';

// Voice add on the phone (ShelfSearcher's): say shelf codes, "done" to stop.
let dictation = null;

function model(ctx) { const p = ctx.store.get('picklists')[ctx.session.device]; return { items: p ? p.items : [] }; }
// The header's line: items, picked, stops to go.
function headSub(m) { const n = m.items.length, picked = m.items.filter(i => i.completed).length, left = n - picked; return sub(txn(n, 'pick::{n} item', 'pick::{n} items'), tx('{n} picked', { n: picked }), n ? txn(left, '{n} stop to go', '{n} stops to go') : ''); }
async function save(ctx, items) { try { await ctx.store.dispatch({ type: 'picklist.set', entity: { device: ctx.session.device }, payload: { items } }); } catch (e) { toast(e.message, 'bad'); } }

export default {
  id: 'picklist', title: tx('Pick list'), icon: 'm-picklist',
  desktop(ctx) {
    const m = model(ctx);
    return vh(tx('Pick list'), headSub(m), `<button class="btn primary" data-act="plan" ${m.items.length > 2 ? '' : 'disabled'} title="${tx('Order the stops by the shortest walk from the first')}">${ic('route')}${tx('Plan route')}</button><button class="btn" data-act="clear">${ic('trash')}${tx('Clear all')}</button>`, 'm-picklist') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx(tx('Pick route'), ctx.storeNo)}<span><i style="background:#22c55e;border-radius:50%"></i>${tx('route::Start')}</span><span><i style="background:#f59e0b;border-radius:50%"></i>${tx('route::Next')}</span><span><i style="background:#6b7280;border-radius:50%"></i>${tx('Picked')}</span><span><i style="background:#0E7490;height:5px;border-radius:3px"></i>${tx('Walk path')}</span><span id="pkdist" style="color:var(--faint)"></span></div></div>` +
      `<div class="card" id="pkside"></div></div>`;
  },
  mobile(ctx) { return mvMap({ badge: '<span id="pkbadge"></span>' }) + `<div class="mv-sel route" id="pkmob"></div>`; },
  mount(ctx, root) {
    const map = mountMap($('#mapstage', root), { cls: 'pk', onSelect: info => { if (info.kind !== 'shelf') return; const m = model(ctx); if (m.items.some(i => canonCode(i.code) === info.code)) return; save(ctx, [...m.items, { code: info.code, completed: false }]); } });
    bindMapChrome(root, map);
    // A typed, pasted or spoken code as the map names it, or null (groupsFor through map.groups).
    const lookup = c => (map.groups(c).length ? canonCode(c) : null);
    const paint = () => {
      const m = model(ctx);
      const marks = {}; for (const i of m.items) marks[i.code] = i.completed ? 'done' : 'stop';
      const w = walked(map, m), r = map.drawRoute(w.map(i => i.code), m.items.filter(i => i.completed).map(i => i.code));
      const pd = $('#pkdist', root); if (pd) pd.textContent = !m.items.length ? tx('Tap a shelf or type codes to build the list') : (r.network ? txn(r.stops, '{n} stop on this level · along the walk paths', '{n} stops on this level · along the walk paths') : tx('No walk paths on this level yet: straight lines')) + (r.metres ? ' · ' + tx('~{m} m', { m: r.metres }) : '') + (r.exit ? ' · ' + tx('then the stairs') : '');
      const side = $('#pkside', root); if (side) side.innerHTML = list(map, m);
      const mob = $('#pkmob', root); if (mob) mob.innerHTML = mobile(map, m, r);
      setStrip(root, rtStrip({ items: w }));
      const pb = document.querySelector('[data-act="plan"]'); if (pb) pb.disabled = m.items.length <= 2;
      const hs = document.querySelector('.vh .sub'); if (hs) hs.innerHTML = headSub(m);
      const b = $('#pkbadge', root); if (b) { const next = w.find(i => !i.completed); b.innerHTML = tx('<b>{done} / {n}</b> picked', { done: m.items.filter(i => i.completed).length, n: m.items.length }) + (next ? ' · ' + tx('next {code}', { code: esc(next.code) }) : ''); }
    };
    paint();
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act'), m = model(ctx), code = a.getAttribute('data-code');
      if (act === 'toggle') await save(ctx, m.items.map(i => i.code === code ? { ...i, completed: !i.completed } : i));
      else if (act === 'remove') await save(ctx, m.items.filter(i => i.code !== code));
      else if (act === 'clear') { const n = m.items.length; if (n && confirm(txn(n, 'Clear all {n} stop from the pick list?', 'Clear all {n} stops from the pick list?'))) await save(ctx, []); }
      else if (act === 'pick-next') { const n = walked(map, m).find(i => !i.completed); if (n) await save(ctx, m.items.map(i => i === n ? { ...i, completed: true } : i)); }
      else if (act === 'add') { const inp = $('[data-field="add"]', root); const { codes, bad } = typedStops(inp.value, lookup); if (bad.length) toast(tx('Not in this store: {codes}', { codes: bad.join(', ') }), 'bad'); const ok = codes.filter(c => !m.items.some(i => i.code === c)); if (ok.length) await save(ctx, [...m.items, ...ok.map(code => ({ code, completed: false }))]); inp.value = ''; }
      else if (act === 'plan') { const order = map.planOrder(m.items.map(i => i.code)); const by = Object.fromEntries(m.items.map(i => [i.code, i])); await save(ctx, order.map(c => by[c])); setRouteView(false); toast(tx('List reordered by the shortest walk')); }
      else if (act === 'route-on' || act === 'route-off') { setRouteView(act === 'route-on'); paint(); }
      else if (act === 'zoom') { map.zoomTo(code); map.select(code); map.ping(code); }
      else if (act === 'floor') { map.floor(a.dataset.floor); paint(); }
    });
    // Drag a stop by its grip to reorder (mouse or touch): the row under the
    // pointer shows where it lands; the list saves once on release.
    let drag = null;
    root.addEventListener('pointerdown', e => { const h = e.target.closest('.pk-grip'); if (!h) return; e.preventDefault(); drag = { from: Number(h.dataset.i), to: Number(h.dataset.i) }; h.closest('.li')?.classList.add('dragging'); try { h.setPointerCapture(e.pointerId); } catch {} });
    root.addEventListener('pointermove', e => {
      if (!drag) return;
      const row = document.elementFromPoint(e.clientX, e.clientY)?.closest('.pk-list .li[data-i]'); if (!row) return;
      drag.to = Number(row.dataset.i); for (const r of root.querySelectorAll('.pk-list .li.drop')) r.classList.remove('drop'); row.classList.add('drop');
    });
    const endDrag = async () => {
      if (!drag) return; const { from, to } = drag; drag = null;
      for (const r of root.querySelectorAll('.pk-list .li.drop, .pk-list .li.dragging')) r.classList.remove('drop', 'dragging');
      if (from === to) return; const items = model(ctx).items.slice(), [it] = items.splice(from, 1); items.splice(to, 0, it); await save(ctx, items);
    };
    root.addEventListener('pointerup', endDrag); root.addEventListener('pointercancel', endDrag);
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-field="add"]')) root.querySelector('[data-act="add"]').click(); });
    root.addEventListener('click', e => {
      if (!e.target.closest('[data-act="voice-add"]')) return;
      if (dictation) { dictation.stop(); return; }
      haptic('select');
      // The run voice added last, for a moment: a shelf said straight after
      // replaces it ("C4", then "C4 S1" or "side one"), and the run said again
      // after its shelf is ignored, so a phrase heard in pieces adds one stop.
      let recent = null;
      const say = (msg, bad) => toast(msg, bad ? 'bad' : '', null, 'voice');
      dictation = dictate({
        onUtterance: guesses => {
          const text = guesses[0];
          if (STOP_WORDS.test(text.toUpperCase())) return false;
          const fresh = recent && Date.now() - recent.at < 6000 ? recent : null;
          let { codes, bad } = spokenStops(guesses, lookup);
          // Only a side ("side one", "S1"): the run just added, on that side.
          if (!codes.length && fresh) { const side = spokenCodes(text).join('').match(/^[A-Z]?([SEP]\d)$/) || text.toUpperCase().match(/\b(?:SIDE|END)\s*(ONE|TWO|[12])\b/); if (side) { const sd = side[1].length === 2 ? side[1] : (/END/.test(side[0]) ? 'E' : 'S') + ({ ONE: 1, TWO: 2 }[side[1]] || side[1]); const hit = lookup(fresh.code + sd); if (hit) { codes = [hit]; bad = []; } } }
          if (!codes.length && !bad.length) { say(tx('Didn’t catch a shelf: “{text}”', { text }), true); return; }
          const m = model(ctx), have = c => m.items.some(i => canonCode(i.code) === c);
          let items = m.items.slice(); const added = [], swapped = [], had = [];
          for (const c of codes) {
            // A run whose shelf is already listed is that shelf heard again.
            const shelf = m.items.find(i => !i.completed && ofRun(canonCode(i.code), c));
            if (have(c) || shelf) { had.push(shelf ? canonCode(shelf.code) : c); continue; }
            const k = fresh && ofRun(c, fresh.code) ? items.findIndex(i => canonCode(i.code) === fresh.code && !i.completed) : -1;
            if (k >= 0) { items[k] = { code: c, completed: false }; swapped.push(tx('{code} (for {old})', { code: c, old: fresh.code })); } else { items.push({ code: c, completed: false }); added.push(c); }
            recent = { code: c, at: Date.now() };
          }
          if (added.length || swapped.length) { haptic('navigate'); save(ctx, items); }
          const said = [added.length && tx('Added {codes}', { codes: added.join(', ') }), swapped.length && tx('Now {codes}', { codes: swapped.join(', ') }), bad.length && tx('not in this store: {codes}', { codes: bad.join(', ') }), !added.length && !swapped.length && had.length && tx('already in the list: {codes}', { codes: had.join(', ') })].filter(Boolean).join(' · ');
          say(said.charAt(0).toUpperCase() + said.slice(1), !added.length && !swapped.length);
        },
        onError: msg => toast(msg, 'bad'),
        onEnd: reason => { dictation = null; paint(); if (reason === 'silence') toast(tx('Voice stopped (no speech)'), '', null, 'voice'); else if (reason !== 'error') toast(tx('Voice stopped'), '', null, 'voice'); },
      });
      paint();
      if (dictation) toast(tx('Listening: say shelf codes, “done” to stop'), '', null, 'voice');
    });
    return [ctx.store.on('picklists', paint), () => { dictation?.stop(); dictation = null; }];
  },
};
const deptOf = (map, code) => { const g = map.groups(code)[0]; return g ? (g.getAttribute('data-dept') || '').toLowerCase() : ''; };
// Stops floor by floor, in the order the walk reaches each floor, with the
// stairs between them; each floor header shows that floor on the map.
function list(map, m) {
  const add = `<div class="ch"><h3>${tx('Stops')}</h3><span class="go" data-act="clear">${tx('Clear all')}</span></div><div class="msh-add"><div class="search"><svg class="i"><use href="icons.svg#i-search"/></svg><input data-field="add" placeholder="${tx('Add shelf or paste list (e.g. A10, K12, Q15)')}"></div><button class="btn primary sm" data-act="add">${tx('Add')}</button>${voiceSupported() ? `<button class="btn sm pk-say${dictation ? ' listening' : ''}" data-act="voice-add" title="${dictation ? tx('Stop listening') : tx('Say shelf codes; say “done” to stop')}">${ic('mic')}${dictation ? tx('Stop') : tx('Say it')}</button>` : ''}</div>`;
  if (!m.items.length) return add + `<div class="list pk-list"><div class="li" style="color:var(--dim)">${voiceSupported() ? tx('Tap shelves on the map, add codes above or press Say it and say them.') : tx('Tap shelves on the map, add codes above.')}</div></div>`;
  const idx = new Map(m.items.map((i, n) => [i.code, n])), plan = map.floorPlan(m.items.map(i => i.code)), multi = plan.length > 1, here = map.floorId();
  const w = walked(map, m), rn = w === m.items ? null : new Map(w.map((i, n) => [i.code, n + 1])), next = w.find(i => !i.completed);
  const row = i => { const n = idx.get(i.code); return `<div class="li${i === next ? ' cur' : ''}" data-i="${n}"><span class="pk-grip" data-i="${n}" title="${tx('Drag to reorder')}" aria-label="${tx('Drag to reorder')}">${ic('grip')}</span><span class="stopn${i.completed ? ' done' : ''}" title="${tx('List order')}">${n + 1}</span>${rn ? `<span class="stopn walk${i.completed ? ' done' : ''}" title="${tx('Route order')}">${rn.get(i.code)}</span>` : ''}<span class="tick${i.completed ? ' done' : ''}" data-act="toggle" data-code="${esc(i.code)}"></span><span class="loc" data-act="zoom" data-code="${esc(i.code)}">${esc(i.code)}</span>${deptOf(map, i.code) ? dep(deptOf(map, i.code)) : ''}<span class="nm">${DEPT_NAME[deptOf(map, i.code)] || ''}</span><span class="ibtn" data-act="remove" data-code="${esc(i.code)}">${ic('x')}</span></div>`; };
  const byCode = new Map(m.items.map(i => [i.code, i])), placed = new Set(plan.flatMap(f => f.codes));
  const body = plan.map((f, k) => (multi ? `<div class="pk-floor${f.id === here ? ' on' : ''}" data-act="floor" data-floor="${esc(f.id)}">${ic('map')}<b>${esc(f.name)}</b><span>${f.type === 'boh' ? tx('Back of house') : tx('Front of house')} · ${txn(f.codes.length, '{n} stop', '{n} stops')}</span></div>` : '') + f.codes.map(c => row(byCode.get(c))).join('') + (multi && k < plan.length - 1 ? `<div class="pk-stairs">${ic('stairs')}${tx('Stairs to {floor}', { floor: esc(plan[k + 1].name) })}</div>` : '')).join('') + m.items.filter(i => !placed.has(i.code)).map(row).join('');
  return add + routeNote(map, m) + `<div class="list pk-list">${body}</div>`;
}
// The route order beside the list's own: the list keeps the order it was
// given (the official system's, or as built), and when a shorter walk
// exists for the stops still to pick it is offered next to it. "Show route
// order" walks that order (map, Next, Picked) and numbers each stop with
// it; "Reorder list" makes it the list's order. Measured over every floor.
const RV_KEY = 'picklist_route';
let routeView = false; try { routeView = localStorage.getItem(RV_KEY) === '1'; } catch {}
const setRouteView = on => { routeView = on; try { localStorage.setItem(RV_KEY, on ? '1' : '0'); } catch {} };
let bestMemo = { key: null, v: null };
function best(map, m) {
  const left = m.items.filter(i => !i.completed).map(i => i.code), key = m.items.map(i => i.code + (i.completed ? '+' : '')).join(',');
  if (bestMemo.key === key && bestMemo.map === map) return bestMemo.v;
  let v = null;
  if (left.length >= 3) {
    const order = map.planOrder(left), cur = map.routeLength(left), opt = map.routeLength(order), gain = cur.dist - opt.dist, pct = cur.dist ? gain / cur.dist : 0;
    const same = order.every((c, k) => c === left[k]);
    v = { order, cur, opt, pct, same, worth: !same && pct >= 0.08, saved: cur.metres != null && opt.metres != null ? cur.metres - opt.metres : null };
  }
  bestMemo = { key, map, v }; return v;
}
// The stops in the order they are walked: the list's, or the route order's when it is shown.
function walked(map, m) {
  const b = routeView ? best(map, m) : null; if (!b || b.same) return m.items;
  const by = new Map(m.items.map(i => [i.code, i]));
  return [...m.items.filter(i => i.completed), ...b.order.map(c => by.get(c))];
}
// How much shorter the route order walks, in metres when the map is calibrated.
const gain = b => ({ from: b.cur.metres, to: b.opt.metres, pct: Math.round(b.pct * 100) });
const metred = b => b.cur.metres != null && b.opt.metres != null;
// The recommendation over the list: a shorter walk exists, or the route order is being walked.
function routeNote(map, m) {
  const b = best(map, m); if (!b) return '';
  if (routeView && !b.same) return `<div class="pk-opt on">${ic('route')}<div><b>${tx('Walking the route order')}</b><span>${tx('The teal numbers are the walk; the list keeps its own numbers.')} ${b.pct > 0 ? esc(metred(b) ? tx('about {from} m → {to} m · {pct}% shorter than the list order.', gain(b)) : tx('{pct}% shorter than the list order.', gain(b))) : ''}</span></div><div class="pk-opt-a"><button class="btn sm" data-act="route-off">${tx('List order')}</button><button class="btn sm" data-act="plan">${tx('Reorder list')}</button></div></div>`;
  if (b.worth) return `<div class="pk-opt">${ic('route')}<div><b>${tx('A shorter route is available')}</b><span>${esc(metred(b) ? tx('about {from} m → {to} m · {pct}% shorter than walking the list in order.', gain(b)) : tx('{pct}% shorter than walking the list in order.', gain(b)))}</span></div><div class="pk-opt-a"><button class="btn sm primary" data-act="route-on">${tx('Show route order')}</button><button class="btn sm" data-act="plan">${tx('Reorder list')}</button></div></div>`;
  return `<div class="pk-opt ok">${ic('check')}<div><span>${tx('This order is already about the shortest walk.')}</span></div></div>`;
}
// The phone's Route sheet (opened from the strip): every stop in walking
// order with its department, ticks to pick (a tap toggles, × removes), the
// walk, and what to do next.
function mobile(map, m, r) {
  const w = walked(map, m), rn = w === m.items ? null : new Map(w.map((i, n) => [i.code, n + 1]));
  const cur = w.find(i => !i.completed), done = m.items.filter(i => i.completed).length, n = m.items.length;
  const walk = !n ? (voiceSupported() ? tx('Tap shelves on the map, or tap Say it and say them, to build the list.') : tx('Tap shelves on the map to build the list.')) : [txn(n, '{n} stop', '{n} stops'), r?.metres ? tx('about {m} m', { m: r.metres }) : '', r && !r.network ? tx('no walk paths on this level yet') : '', r?.exit ? tx('then the stairs') : ''].filter(Boolean).join(' · ');
  const head = `<div class="sx-h">${ic('m-picklist')}${tx('Pick list')}<span class="n">${done} / ${n}</span></div><div class="sx-sub">${walk}</div>`;
  const stops = n ? sx.sec(tx('Stops'), sx.rows(m.items.map((i, k) => { const d = deptOf(map, i.code);
    return `<div class="sx-r rt-r${i.completed ? ' done' : i === cur ? ' cur' : ''}" data-act="toggle" data-code="${esc(i.code)}"><span class="rt-chk">${i.completed ? ic('check') : ''}</span><span class="rt-no" title="${tx('List order')}">${k + 1}</span>${rn ? `<span class="rt-no walk" title="${tx('Route order')}">${rn.get(i.code)}</span>` : ''}<div class="k"><b>${esc(i.code)}</b><span class="rt-d">${d ? dep(d) : ''}${esc(DEPT_NAME[d] || '')}</span></div>${i === cur ? `<span class="v acc">${tx('route::Next')}</span>` : i.completed ? `<span class="v ok">${tx('Picked')}</span>` : ''}<button class="rt-x" type="button" data-act="remove" data-code="${esc(i.code)}" aria-label="${tx('Remove {code}', { code: esc(i.code) })}">${ic('x')}</button></div>`; })), done ? tx('{n} picked', { n: done }) : '') : '';
  const acts = sx.acts([cur ? sx.btn('check', tx('Picked · next'), 'data-act="pick-next"', true) : '', voiceSupported() ? sx.btn('mic', dictation ? tx('Stop listening') : tx('Say it'), 'data-act="voice-add"') : '', cur ? sx.btn('pin', tx('Show {code}', { code: esc(cur.code) }), `data-act="zoom" data-code="${esc(cur.code)}"`) : '', n ? sx.btn('trash', tx('Clear'), 'data-act="clear"') : '']);
  return `<div class="sx">${head}${routeNote(map, m)}${stops}${acts}</div>`;
}
// The strip under the phone's Route map: the count, the next stop and Picked.
function rtStrip(m) {
  const cur = m.items.find(i => !i.completed), done = m.items.filter(i => i.completed).length, n = m.items.length;
  return `${ic('m-picklist')}<b>${tx('Route')}</b><span class="n">${done} / ${n}</span><span class="s">${cur ? tx('Next {code}', { code: esc(cur.code) }) : n ? tx('All picked') : tx('Tap shelves to add them')}</span>` +
    (cur ? `<button class="act go" type="button" data-act="pick-next">${ic('check')}${tx('Picked')}</button>` : voiceSupported() ? `<button class="act" type="button" data-act="voice-add">${ic('mic')}${dictation ? tx('Stop') : tx('Say it')}</button>` : '');
}
