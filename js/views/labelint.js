// Label integrity: one check per numbered micro-department per cycle, with
// shelf assignment and variance capture. Reads store.get('labels').

import { $, $$, ic, esc, vh, sub, prog, dep, DEPT_COLOUR, cycleId, daysLeftInCycle, fmtDate, toast, mhead, mbig, mghost, mfoot } from '../ui.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, segmentId } from '../map.js';
import { SUBS, MICRO, microId, microCode, microName, microCount } from '../data/micros.js';
import { printSheet, table, signoff } from '../print.js';

// A selected micro-department is checked; its shelves change only in
// assigning mode, which only a desk opens (Assign shelves, or Settings ›
// Departments). On the phone a tap on a shelf opens the micro-department it
// belongs to (decision 32).
let selected = null, openSub = null, varianceFor = null, assigning = false;

function model(ctx) {
  const L = ctx.store.get('labels');
  const cycle = cycleId(L.cycleLen);
  const checks = L.checks[cycle] || {}, variances = L.variances[cycle] || [];
  const total = microCount(), done = Object.keys(checks).length;
  return { L, cycle, checks, variances, total, done, daysLeft: daysLeftInCycle(L.cycleLen) };
}
// Assignments are per shelf ("A16 S2"). Older ones name a whole run
// ("A16"): they still mark and count every shelf of it, and the first edit
// that touches one splits it into its shelves.
let mapRef = null;
const shelvesOf = key => mapRef ? [...new Set(mapRef.groups(key).map(segmentId))] : [key];
const expand = list => [...new Set(list.flatMap(k => k.includes(' ') ? [k] : shelvesOf(k)))];
function marksFor(m) {
  const out = {};
  const wrong = new Set(m.variances.map(v => v.micro));
  for (const [micro, shelves] of Object.entries(m.L.assign)) for (const s of shelves) { if (wrong.has(micro)) out[s] = 'wrong'; else if (m.checks[micro]) out[s] = 'checked'; }
  if (selected) {
    for (const s of m.L.assign[selected] || []) out[s] = 'focus';
    if (!assigning) return out;
    // Unassigned shelves in the selected micro's sub-department are the
    // likely ones: dashed, as ShelfSearcher's assignment workshop.
    const sub = selected.split('-')[0], taken = new Set(expand(Object.values(m.L.assign).flat()));
    for (const id of shelvesOfDept(sub)) if (!taken.has(id) && !out[id]) out[id] = 'cand';
  }
  return out;
}
let deptShelves = {};
const shelvesOfDept = d => deptShelves[d] || [];
// Every micro in catalogue order: the workshop's Prev / Next walks this.
const ALL = SUBS.flatMap(sd => (MICRO[sd[0]] || []).map(x => microId(sd[0], x)));
const cycleLabel = c => c.endsWith('M') ? new Date(c.slice(0, 4), Number(c.slice(5, 7)) - 1, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' }) : c;

export default {
  id: 'labelint', title: 'Label integrity', icon: 'm-labelint',
  desktop(ctx) {
    const m = model(ctx);
    return vh('Label integrity', sub(cycleLabel(m.cycle), `${m.L.cycleLen[0].toUpperCase() + m.L.cycleLen.slice(1)} cycle · ${m.daysLeft} days left`, `${m.total} numbered micro-departments`), `<button class="btn" data-act="print-sheets" title="Marking sheets for the open sub-department, or all of them">${ic('print')}Marking sheets</button><button class="btn primary" data-act="check-selected">${ic('barcode')}Check a micro-dept</button>`, 'm-labelint') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx('Label integrity', ctx.storeNo)}<span><i style="background:#2563EB"></i>Checked this cycle</span><span><i style="background:#DC2626"></i>Wrong label found</span><span><i style="background:transparent;border:2px solid #D24E0E"></i>Selected micro-dept</span><span><i style="background:#CBD0D8"></i>Not yet checked</span></div></div>` +
      `<div class="sidecol" id="liside"></div></div>`;
  },
  mobile(ctx) {
    const m = model(ctx);
    return mvMap({ badge: `<b>${m.done}</b> of ${m.total} · ${cycleLabel(m.cycle)}` }) + `<div class="mv-sel mode" id="limob"></div>`;
  },
  mount(ctx, root) {
    // From Settings › Departments: open assigning that micro-department.
    if (ctx.isMobile) assigning = false;
    if (ctx.arg?.micro && ALL.includes(ctx.arg.micro) && (selected !== ctx.arg.micro || !assigning) && !ctx.isMobile) { selected = ctx.arg.micro; openSub = selected.split('-')[0]; assigning = true; setTimeout(() => ctx.rerender(), 0); }
    const microOf = id => { const mods = shelvesOf(id); return Object.entries(model(ctx).L.assign).find(([, sh]) => expand(sh).some(k => mods.includes(k)))?.[0] || null; };
    const map = mountMap($('#mapstage', root), { cls: 'li', onSelect: info => {
      if (info.kind !== 'shelf') return;
      if (!assigning || !selected) {
        const micro = microOf(info.full);
        if (micro) { selected = micro; openSub = micro.split('-')[0]; varianceFor = null; paint(); }
        else toast(`${info.full} is not on a micro-department yet` + (ctx.isMobile ? '; shelves are assigned on a desk' : '; choose one and Assign shelves'));
        return;
      }
      const m = model(ctx), cur = expand(m.L.assign[selected] || []), id = info.full;
      const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
      ctx.store.dispatch({ type: 'label.assign', entity: { micro: selected }, payload: { shelves: next } }).catch(e => toast(e.message, 'bad'));
    } });
    bindMapChrome(root, map);
    mapRef = map;
    deptShelves = {}; for (const g of map.segments()) { const d = (g.getAttribute('data-dept') || '').toLowerCase(), id = segmentId(g); const l = (deptShelves[d] ||= []); if (!l.includes(id)) l.push(id); }
    // Drag-paint (mouse): with a micro selected, press on a shelf and drag
    // across others. The first shelf decides add or remove for the stroke;
    // one label.assign saves it on release. Touch keeps panning; a tap
    // assigns one shelf through onSelect.
    const stage = $('#mapstage', root); let stroke = null;
    const shelfAt = (x, y) => { const g = document.elementFromPoint(x, y)?.closest?.('.shelf-group[data-shelf]'); return g?.getAttribute('data-shelf') ? segmentId(g) : null; };
    stage?.addEventListener('pointerdown', e => {
      if (!selected || !assigning || e.pointerType !== 'mouse' || e.button !== 0) return;
      const id = shelfAt(e.clientX, e.clientY); if (!id) return;
      e.stopPropagation(); e.preventDefault();
      const list = new Set(expand(model(ctx).L.assign[selected] || []));
      stroke = { list, op: list.has(id) ? 'remove' : 'add', touched: new Set() };
      paintShelf(id);
    }, true);
    const paintShelf = id => {
      if (!stroke || stroke.touched.has(id)) return; stroke.touched.add(id);
      if (stroke.op === 'add') stroke.list.add(id); else stroke.list.delete(id);
      map.markSegment(id, stroke.op === 'add' ? 'focus' : null);
    };
    stage?.addEventListener('pointermove', e => { if (!stroke) return; e.stopPropagation(); const id = shelfAt(e.clientX, e.clientY); if (id) paintShelf(id); }, true);
    const endStroke = async e => {
      if (!stroke) return; e.stopPropagation(); const st = stroke; stroke = null;
      try { await ctx.store.dispatch({ type: 'label.assign', entity: { micro: selected }, payload: { shelves: [...st.list] } }); } catch (err) { toast(err.message, 'bad'); paint(); }
    };
    stage?.addEventListener('pointerup', endStroke, true); stage?.addEventListener('pointercancel', endStroke, true);
    const paint = () => {
      const m = model(ctx);
      map.setMarks(marksFor(m));
      const side = $('#liside', root); if (side) side.innerHTML = sidebar(m);
      const mob = $('#limob', root); if (mob) mob.innerHTML = mobileBar(m);
      const badge = $('#mvbadge', root); if (badge) badge.innerHTML = `<b>${m.done}</b> of ${m.total} · ${cycleLabel(m.cycle)}`;
    };
    paint();
    // Carried from a shelf selected on the map: zoom to it and, when it is
    // assigned to a micro-department, open that one so its checks show.
    if (ctx.arg?.select && map.groups(ctx.arg.select).length) {
      const sel = ctx.arg.select, micro = microOf(sel);
      if (micro) { selected = micro; openSub = micro.split('-')[0]; assigning = false; paint(); }
      map.select(sel); map.zoomTo(sel);
    }
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act'), m = model(ctx);
      try {
        if (act === 'select') { selected = a.getAttribute('data-micro'); openSub = selected.split('-')[0]; paint(); }
        else if (act === 'step') { const i = ALL.indexOf(selected) + Number(a.dataset.d); if (i >= 0 && i < ALL.length) { selected = ALL[i]; openSub = selected.split('-')[0]; paint(); } }
        else if (act === 'done-assign') { assigning = false; paint(); }
        else if (act === 'assign' && !ctx.isMobile) { assigning = true; paint(); }
        else if (act === 'close-micro') { selected = null; assigning = false; paint(); }
        else if (act === 'toggle-sub') { const s = a.getAttribute('data-sub'); openSub = openSub === s ? null : s; paint(); }
        else if (act === 'check' || act === 'check-selected') { const micro = a.getAttribute('data-micro') || selected; if (!micro) return toast('Pick a micro-department first'); await ctx.store.dispatch({ type: m.checks[micro] ? 'label.uncheck' : 'label.check', entity: { micro, cycle: m.cycle } }); }
        else if (act === 'print-sheets') printMarkingSheets(m, typeof openSub === 'string' && openSub ? openSub : null, `${ctx.storeName || ''} · ${ctx.storeNo}`);
        else if (act === 'cycle') await ctx.store.dispatch({ type: 'label.cycle.set', entity: {}, payload: { cycleLen: a.getAttribute('data-len') } });
        else if (act === 'variance') { varianceFor = a.getAttribute('data-micro') || selected; paint(); }
        else if (act === 'variance-cancel') { varianceFor = null; paint(); }
        else if (act === 'variance-save') {
          const kc = $('[data-field="keycode"]', root)?.value.trim(), note = $('[data-field="note"]', root)?.value.trim();
          if (!/^\d{6,13}$/.test(kc || '')) return toast('Keycode must be 6 to 13 digits', 'bad');
          await ctx.store.dispatch({ type: 'label.variance', entity: { micro: varianceFor, cycle: m.cycle }, payload: { keycode: kc, note } });
          varianceFor = null; toast('Variance logged'); paint();
        }
        else if (act === 'zoom-dept') map.filterDept(a.getAttribute('data-dept'));
      } catch (err) { toast(err.message, 'bad'); }
    });
    return [ctx.store.on('labels', paint)];
  },
};

function varianceForm(m) {
  return `<div class="pcard"><div class="pt3">Wrong label · ${esc(varianceFor)}</div><label class="fld"><span>Keycode</span><input data-field="keycode" inputmode="numeric" placeholder="42977636"></label><label class="fld"><span>What is wrong</span><input data-field="note" placeholder="ticket $4, shelf edge $3.50"></label><div class="acts2" style="display:flex;gap:8px;margin-top:10px"><span class="btn primary sm" data-act="variance-save">${ic('check')}Log variance</span><span class="btn sm" data-act="variance-cancel">Cancel</span></div></div>`;
}
function sidebar(m) {
  const cyc = `<div class="pcard licycle${m.done === m.total ? ' done' : ''}"><div class="top"><b>${cycleLabel(m.cycle)}</b><span class="dl">${m.done === m.total ? 'Cycle complete' : m.daysLeft + 'd left'}</span></div>${prog(m.done / m.total * 100)}<div class="sub">${m.done} / ${m.total} micro-departments checked · ${m.variances.length} labels wrong</div>` +
    `<div class="seg3">${['weekly', 'fortnightly', 'monthly'].map(l => `<span class="${m.L.cycleLen === l ? 'on' : ''}" data-act="cycle" data-len="${l}">${l[0].toUpperCase() + l.slice(1)}</span>`).join('')}</div></div>`;
  let sel = '';
  if (selected) {
    const [subId, code] = selected.split('-'); const entry = (MICRO[subId] || []).find(x => microCode(x) === code) || code;
    const c = m.checks[selected], vs = m.variances.filter(v => v.micro === selected), shelves = expand(m.L.assign[selected] || []);
    const i = ALL.indexOf(selected), withShelves = SUBS.filter(sd => sd[0] === subId).flatMap(sd => MICRO[sd[0]] || []).filter(x => (m.L.assign[microId(subId, x)] || []).length).length;
    const how = assigning
      ? `<div class="pt3">Assigning · ${esc(microName(entry))}</div><p class="lbl">Click or drag-paint shelves on the map. Dashed shelves are unassigned ${esc(subId.toUpperCase())} candidates. <b>${shelves.length}</b> assigned · ${withShelves}/${(MICRO[subId] || []).length} micros in ${esc(subId.toUpperCase())} have shelving.</p>`
      : `<div class="pt3">${esc(microName(entry))}</div><p class="lbl">Its shelves are outlined on the map. Tapping a shelf opens the micro-department it is on; <b>Assign shelves</b> changes which shelves this one covers.</p>`;
    sel = `<div class="pcard lisel"><div class="li-ws"><button class="btn sm" data-act="step" data-d="-1"${i <= 0 ? ' disabled' : ''}>‹ Prev</button><span>${i + 1} / ${ALL.length}</span><button class="btn sm" data-act="step" data-d="1"${i >= ALL.length - 1 ? ' disabled' : ''}>Next ›</button></div>${how}<div class="lisel-h"><span class="lisel-code">${esc(code)}</span><div><b>${esc(microName(entry))}</b><small>${subId.toUpperCase()} · ${shelves.length} shelves assigned${shelves.length ? ' · ' + shelves.join(', ') : ''}</small></div></div>` +
      `<div class="lisel-facts"><span><b>This cycle</b>${c ? 'Checked ' + fmtDate(c.at) : 'Not checked yet'}</span><span><b>Wrong labels</b>${vs.length ? vs.map(v => esc(v.keycode) + (v.note ? ' · ' + esc(v.note) : '')).join('<br>') : 'none logged'}</span></div>` +
      `<div class="acts2" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><span class="btn primary sm" data-act="check" data-micro="${selected}">${ic(c ? 'x' : 'check')}${c ? 'Uncheck' : 'Mark checked'}</span><span class="btn sm" data-act="variance" data-micro="${selected}">${ic('alert')}Wrong label</span>${subId ? `<span class="btn sm" data-act="zoom-dept" data-dept="${subId}">${ic('pin')}Show ${subId.toUpperCase()}</span>` : ''}${assigning ? '<span class="btn sm" data-act="done-assign">Done assigning</span>' : `<span class="btn sm" data-act="assign">${ic('pin')}Assign shelves</span><span class="btn sm" data-act="close-micro">Close</span>`}</div></div>`;
  }
  const shelved = ALL.filter(id => (m.L.assign[id] || []).length).length;
  const acc = `<div class="li-shelved"><b>${shelved}</b> of <b>${ALL.length}</b> micro-departments have shelving</div><div class="subacc">${SUBS.map(sd => {
    const micros = MICRO[sd[0]] || []; const n = micros.filter(x => m.checks[microId(sd[0], x)]).length; const open = openSub === sd[0];
    const rows = micros.map(x => { const id = microId(sd[0], x), on = !!m.checks[id], wrong = m.variances.some(v => v.micro === id); return `<div class="micro${selected === id ? ' sel' : ''}" data-act="select" data-micro="${id}"><span class="tk${on ? ' on' : ''}" data-act="check" data-micro="${id}">${ic('check')}</span><span class="mc">${microCode(x)}</span><span class="mn">${esc(microName(x))}</span>${on ? `<span class="md">${fmtDate(m.checks[id].at)}</span>` : ''}${wrong ? '<span class="md" style="color:var(--red)">wrong</span>' : ''}<span class="sc">${(m.L.assign[id] || []).length} ▦</span></div>`; }).join('');
    return `<div class="subrow"><div class="sh" data-act="toggle-sub" data-sub="${sd[0]}"><span class="pt" style="background:${DEPT_COLOUR[sd[0]]}"></span><span class="code">${sd[1]}</span><span class="nm">${sd[2]}</span><span class="ct${n === micros.length ? ' full' : ''}">${n}/${micros.length}</span><span class="ib">${ic(open ? 'minus' : 'plus')}</span></div><div class="micros"${open ? '' : ' hidden'}>${rows}</div></div>`;
  }).join('')}</div>`;
  return cyc + (varianceFor ? varianceForm(m) : sel) + acc;
}
function mobileBar(m) {
  if (varianceFor) return `<div class="mv-mh">${ic('m-labelint')}<b>Wrong label · ${esc(varianceFor)}</b></div><label class="fld"><span>Keycode</span><input data-field="keycode" inputmode="numeric"></label><label class="fld"><span>What is wrong</span><input data-field="note"></label><div class="mv-two">${mbig('Log variance', '', 'check', ' data-act="variance-save"')}${mghost('Cancel', ' data-act="variance-cancel"')}</div>`;
  if (!selected) return `<div class="mv-mh">${ic('m-labelint')}<b>Label integrity</b><span>${m.done} / ${m.total}</span></div><div class="mv-hint">${cycleLabel(m.cycle)} · <b>${m.daysLeft}d left</b>. Tap a shelf on the map or pick a micro-department below, then mark it checked.</div><div class="chips" style="padding:0 12px 12px">${SUBS.map(sd => `<span class="chip" data-act="toggle-sub" data-sub="${sd[0]}"><span class="sw" style="background:${DEPT_COLOUR[sd[0]]}"></span>${sd[1]}</span>`).join('')}</div>` +
    (openSub ? `<div class="mv-rows">${(MICRO[openSub] || []).map(x => { const id = microId(openSub, x); return `<div class="mv-row" data-act="select" data-micro="${id}"><span class="a">${microCode(x)}</span><span class="b">${esc(microName(x))}</span><span class="c">${m.checks[id] ? '✓' : ''}</span></div>`; }).join('')}</div>` : '');
  const [subId, code] = selected.split('-'); const entry = (MICRO[subId] || []).find(x => microCode(x) === code) || code; const c = m.checks[selected];
  return `<div class="mv-mh">${ic('m-labelint')}<b>${esc(code)} ${esc(microName(entry))}</b><span>${m.done} / ${m.total}</span></div><div class="mv-hint">${cycleLabel(m.cycle)} · <b>${m.daysLeft}d left</b> · ${subId.toUpperCase()} · ${c ? 'checked ' + fmtDate(c.at) : 'not checked yet'}</div><div class="mv-two">${mbig(c ? 'Uncheck' : 'Checked', c ? 'sec' : '', 'check', ` data-act="check" data-micro="${selected}"`)}${mbig('Price is wrong', 'warn', 'alert', ` data-act="variance" data-micro="${selected}"`)}</div><div class="mv-hint"><a data-act="toggle-sub" data-sub="${subId}">Choose another</a></div>`;
}

// ShelfSearcher's marking sheets: one page per micro-department with 100
// numbered boxes to tick as labels are checked, a table for the wrong ones
// and a sign-off. For the open sub-department, or every one.
function printMarkingSheets(m, subId, storeLine = '') {
  const subs = SUBS.filter(sd => !subId || sd[0] === subId);
  const pages = [];
  for (const [sid, sc, sname] of subs) for (const entry of MICRO[sid] || []) {
    const done = m.checks[microId(sid, entry)];
    pages.push(`<div class="${pages.length ? 'ps-page' : ''}"><h2>Label Integrity · Correction &amp; Marking Sheet</h2>`
      + `<div class="ps-facts"><div><span>Store</span><b>${esc(storeLine)}</b></div><div><span>Cycle</span><b>${esc(cycleLabel(m.cycle))}</b></div><div><span>Sub-department</span><b>${esc(sc)} ${esc(sname)}</b></div><div><span>Micro-department</span><b>${esc(microCode(entry))} ${esc(microName(entry))}${done ? ' · already checked' : ''}</b></div></div>`
      + `<h2>Labels checked · tick each as you go (100)</h2><div class="ps-grid">${Array.from({ length: 100 }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>`
      + `<h2>Incorrect labels found</h2>` + table(['Location / keycode', 'Incorrect label description', 'True cost'], Array.from({ length: 16 }, () => ['', '', '']), ['w30', 'wd', 'w20'])
      + signoff() + '</div>');
  }
  printSheet({ title: 'Label integrity marking sheets', subtitle: `${esc(cycleLabel(m.cycle))} · ${subId ? esc(subs[0]?.[1] + ' ' + subs[0]?.[2]) : 'all sub-departments'} · ${pages.length} sheet${pages.length === 1 ? '' : 's'}`, body: pages.join('') });
}
