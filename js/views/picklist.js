// Pick list: an ordered list of shelves per device with a walked route.
// Reads store.get('picklists')[device]; writes picklist.set.

import { $, ic, esc, vh, sub, dep, DEPT_NAME, toast } from '../ui.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, canonCode } from '../map.js';
import { voiceSupported, dictate } from '../voice.js';
import { spokenCodes, STOP_WORDS } from '../../shared/voice.js';
import { haptic } from '../device.js';

// Voice add on the phone (ShelfSearcher's): say shelf codes, "done" to stop.
let dictation = null;

function model(ctx) { const p = ctx.store.get('picklists')[ctx.session.device]; return { items: p ? p.items : [] }; }
async function save(ctx, items) { try { await ctx.store.dispatch({ type: 'picklist.set', entity: { device: ctx.session.device }, payload: { items } }); } catch (e) { toast(e.message, 'bad'); } }

export default {
  id: 'picklist', title: 'Pick list', icon: 'm-picklist',
  desktop(ctx) {
    const m = model(ctx), picked = m.items.filter(i => i.completed).length;
    return vh('Pick list', sub(`${m.items.length} items`, `${picked} picked`, m.items.length ? `${m.items.length - picked} stops to go` : ''), `<button class="btn primary" data-act="plan" ${m.items.length > 2 ? '' : 'disabled'} title="Order the stops by the shortest walk from the first">${ic('route')}Plan route</button><button class="btn" data-act="clear">${ic('trash')}Clear all</button>`, 'm-picklist') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx('Pick route', ctx.storeNo)}<span><i style="background:#22c55e;border-radius:50%"></i>Start</span><span><i style="background:#f59e0b;border-radius:50%"></i>Next</span><span><i style="background:#6b7280;border-radius:50%"></i>Picked</span><span><i style="background:#0E7490;height:5px;border-radius:3px"></i>Walk path</span><span id="pkdist" style="color:var(--faint)"></span></div></div>` +
      `<div class="card" id="pkside"></div></div>`;
  },
  mobile(ctx) { return mvMap({ badge: '<span id="pkbadge"></span>' }) + `<div class="mv-sel route" id="pkmob"></div>`; },
  mount(ctx, root) {
    const map = mountMap($('#mapstage', root), { cls: 'pk', onSelect: info => { if (info.kind !== 'shelf') return; const m = model(ctx); if (m.items.some(i => canonCode(i.code) === info.code)) return; save(ctx, replan(map, [...m.items, { code: info.code, completed: false }], 1)); } });
    bindMapChrome(root, map);
    const paint = () => {
      const m = model(ctx);
      const marks = {}; for (const i of m.items) marks[i.code] = i.completed ? 'done' : 'stop';
      const r = map.drawRoute(m.items.map(i => i.code), m.items.filter(i => i.completed).map(i => i.code));
      const pd = $('#pkdist', root); if (pd) pd.textContent = !m.items.length ? 'Tap a shelf or type codes to build the list' : (r.network ? `${r.stops} stop${r.stops === 1 ? '' : 's'} on this level · along the walk paths` : 'No walk paths on this level yet: straight lines') + (r.metres ? ` · ~${r.metres} m` : '') + (r.exit ? ' · then the stairs' : '');
      const side = $('#pkside', root); if (side) side.innerHTML = list(map, m);
      const mob = $('#pkmob', root); if (mob) mob.innerHTML = mobile(map, m);
      const pb = document.querySelector('[data-act="plan"]'); if (pb) pb.disabled = m.items.length <= 2;
      const hs = document.querySelector('.vh .sub'); if (hs) { const picked = m.items.filter(i => i.completed).length; hs.innerHTML = sub(`${m.items.length} items`, `${picked} picked`, m.items.length ? `${m.items.length - picked} stops to go` : ''); }
      const b = $('#pkbadge', root); if (b) { const next = m.items.find(i => !i.completed); b.innerHTML = `<b>${m.items.filter(i => i.completed).length} / ${m.items.length}</b> picked${next ? ' · next ' + esc(next.code) : ''}`; }
    };
    paint();
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act'), m = model(ctx), code = a.getAttribute('data-code');
      if (act === 'toggle') await save(ctx, m.items.map(i => i.code === code ? { ...i, completed: !i.completed } : i));
      else if (act === 'remove') await save(ctx, m.items.filter(i => i.code !== code));
      else if (act === 'clear') { const n = m.items.length; if (n && confirm(`Clear all ${n} stop${n === 1 ? '' : 's'} from the pick list?`)) await save(ctx, []); }
      else if (act === 'pick-next') { const n = m.items.find(i => !i.completed); if (n) await save(ctx, m.items.map(i => i === n ? { ...i, completed: true } : i)); }
      else if (act === 'add') { const inp = $('[data-field="add"]', root); const codes = [...new Set(inp.value.toUpperCase().replace(/([A-Z]+\d+)\s*[- ]\s*([SE]\d+)/g, '$1$2').split(/[\s,;]+/).map(canonCode).filter(Boolean))]; const bad = codes.filter(c => !map.groups(c).length); if (bad.length) toast(`Not in this store: ${bad.join(', ')}`, 'bad'); const ok = codes.filter(c => map.groups(c).length && !m.items.some(i => i.code === c)); if (ok.length) await save(ctx, replan(map, [...m.items, ...ok.map(code => ({ code, completed: false }))], ok.length)); inp.value = ''; }
      else if (act === 'plan') { const order = map.planOrder(m.items.map(i => i.code)); const by = Object.fromEntries(m.items.map(i => [i.code, i])); await save(ctx, order.map(c => by[c])); toast('Stops ordered by the shortest walk'); }
      else if (act === 'zoom') { map.zoomTo(code); map.select(code); }
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
      dictation = dictate({
        onUtterance: text => {
          if (STOP_WORDS.test(text.toUpperCase())) return false;
          const codes = spokenCodes(text);
          if (!codes.length) { toast(`Didn’t catch a shelf: “${text.trim()}”`, 'bad'); return; }
          const m = model(ctx), bad = codes.filter(c => !map.groups(c).length), fresh = codes.filter(c => map.groups(c).length && !m.items.some(i => canonCode(i.code) === c));
          if (fresh.length) { haptic('navigate'); save(ctx, replan(map, [...m.items, ...fresh.map(code => ({ code, completed: false }))], 0)); }
          const said = [fresh.length && `Added ${fresh.join(', ')}`, bad.length && `not in this store: ${bad.join(', ')}`, !fresh.length && !bad.length && `already in the list: ${codes.join(', ')}`].filter(Boolean).join(' · ');
          toast(said.charAt(0).toUpperCase() + said.slice(1), fresh.length ? '' : 'bad');
        },
        onError: msg => toast(msg, 'bad'),
        onEnd: reason => { dictation = null; paint(); if (reason === 'silence') toast('Voice stopped (no speech)'); else if (reason !== 'error') toast('Voice stopped'); },
      });
      paint();
      if (dictation) toast('Listening: say shelf codes, “done” to stop');
    });
    return [ctx.store.on('picklists', paint), () => { dictation?.stop(); dictation = null; }];
  },
};
const deptOf = (map, code) => { const g = map.groups(code)[0]; return g ? (g.getAttribute('data-dept') || '').toLowerCase() : ''; };
// Stops floor by floor, in the order the walk reaches each floor, with the
// stairs between them; each floor header shows that floor on the map.
function list(map, m) {
  const add = `<div class="ch"><h3>Stops</h3><span class="go" data-act="clear">Clear all</span></div><div class="msh-add"><div class="search"><svg class="i"><use href="icons.svg#i-search"/></svg><input data-field="add" placeholder="Add shelf or paste list (e.g. A10, K12, Q15)"></div><button class="btn primary sm" data-act="add">Add</button></div>`;
  if (!m.items.length) return add + '<div class="list pk-list"><div class="li" style="color:var(--dim)">Tap shelves on the map or add codes above.</div></div>';
  const idx = new Map(m.items.map((i, n) => [i.code, n])), plan = map.floorPlan(m.items.map(i => i.code)), multi = plan.length > 1, here = map.floorId();
  const row = i => { const n = idx.get(i.code); return `<div class="li" data-i="${n}"><span class="pk-grip" data-i="${n}" title="Drag to reorder" aria-label="Drag to reorder">${ic('grip')}</span><span class="stopn${i.completed ? ' done' : ''}">${n + 1}</span><span class="tick${i.completed ? ' done' : ''}" data-act="toggle" data-code="${esc(i.code)}"></span><span class="loc" data-act="zoom" data-code="${esc(i.code)}">${esc(i.code)}</span><span class="nm">${DEPT_NAME[deptOf(map, i.code)] || ''}</span>${dep(deptOf(map, i.code))}<span class="ibtn" data-act="remove" data-code="${esc(i.code)}">${ic('x')}</span></div>`; };
  const byCode = new Map(m.items.map(i => [i.code, i])), placed = new Set(plan.flatMap(f => f.codes));
  const body = plan.map((f, k) => (multi ? `<div class="pk-floor${f.id === here ? ' on' : ''}" data-act="floor" data-floor="${esc(f.id)}">${ic('map')}<b>${esc(f.name)}</b><span>${f.type === 'boh' ? 'Back of house' : 'Front of house'} · ${f.codes.length} stop${f.codes.length === 1 ? '' : 's'}</span></div>` : '') + f.codes.map(c => row(byCode.get(c))).join('') + (multi && k < plan.length - 1 ? `<div class="pk-stairs">${ic('stairs')}Stairs to ${esc(plan[k + 1].name)}</div>` : '')).join('') + m.items.filter(i => !placed.has(i.code)).map(row).join('');
  return add + `<div class="list pk-list">${body}</div>`;
}
// Adding stops re-plans the walk for what is left: picked stops keep their
// places at the front and the rest follow the shortest walk.
function replan(map, items, added) {
  const left = items.filter(i => !i.completed); if (left.length < 3) return items;
  const by = new Map(left.map(i => [i.code, i])), order = map.planOrder(left.map(i => i.code));
  if (added) toast('Stops re-planned for the shortest walk');
  return [...items.filter(i => i.completed), ...order.map(c => by.get(c))];
}
function mobile(map, m) {
  const cur = m.items.find(i => !i.completed);
  return `<div class="rt-top">${ic('m-picklist')}<b>Pick list</b><span class="cnt">${m.items.filter(i => i.completed).length} / ${m.items.length}</span><span class="tools">${voiceSupported() ? `<button class="${dictation ? 'listening' : ''}" title="${dictation ? 'Stop listening' : 'Add shelves by voice'}" aria-label="${dictation ? 'Stop listening' : 'Add shelves by voice'}" data-act="voice-add">${ic('mic')}</button>` : ''}<button title="Zoom to next" data-act="zoom" data-code="${cur ? esc(cur.code) : ''}">${ic('pin')}</button><button title="Clear" data-act="clear">${ic('trash')}</button></span></div>` +
    `<div class="rt-stops">${m.items.map((i, n) => `<span class="rt-stop ${i.completed ? 'done' : i === cur ? 'cur' : ''}" data-act="toggle" data-code="${esc(i.code)}"><i>${n + 1}</i>${esc(i.code)}${i.completed ? ic('check') : i === cur ? '<em>▶</em>' : ''}</span>`).join('') || `<span class="mv-hint" style="margin:0">Tap shelves on the map${voiceSupported() ? ', or tap the microphone and say them,' : ''} to build the list.</span>`}</div>` +
    (cur ? `<div class="rt-h">${dep(deptOf(map, cur.code))}<b>${esc(cur.code)}</b><span class="nm">${DEPT_NAME[deptOf(map, cur.code)] || ''}</span><button class="rt-pick" data-act="pick-next" title="Picked · next stop">${ic('check')}Picked</button></div>` : '');
}
