// Label integrity: one check per numbered micro-department per cycle, with
// shelf assignment and variance capture. Reads store.get('labels').

import { $, $$, ic, esc, vh, sub, prog, dep, DEPT_COLOUR, cycleId, daysLeftInCycle, fmtDate, toast, mhead, mbig, mghost, mfoot } from '../ui.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, segmentId, setStrip, sx } from '../map.js';
import { SUBS, MICRO, microId, microCode, microName, microCount } from '../data/micros.js';
import { printSheet, table, signoff } from '../print.js';
import { tx, txn, locale } from '../i18n.js';
import { recallFor } from '../recallflag.js';

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
const cycleLabel = c => c.endsWith('M') ? new Date(c.slice(0, 4), Number(c.slice(5, 7)) - 1, 1).toLocaleString(locale(), { month: 'long', year: 'numeric' }) : c;
// The cycle lengths, as the switch and the header say them.
const LEN_NAME = { weekly: tx('Weekly'), fortnightly: tx('Fortnightly'), monthly: tx('Monthly') };
const CYCLE_NAME = { weekly: tx('Weekly cycle'), fortnightly: tx('Fortnightly cycle'), monthly: tx('Monthly cycle') };
const badgeText = m => tx('<b>{done}</b> of {total} · {cycle}', { done: m.done, total: m.total, cycle: cycleLabel(m.cycle) });

export default {
  id: 'labelint', title: tx('Label integrity'), icon: 'm-labelint',
  desktop(ctx) {
    const m = model(ctx);
    return vh(tx('Label integrity'), sub(cycleLabel(m.cycle), txn(m.daysLeft, '{cycle} · {n} day left', '{cycle} · {n} days left', { cycle: CYCLE_NAME[m.L.cycleLen] || m.L.cycleLen }), txn(m.total, '{n} numbered micro-department', '{n} numbered micro-departments')), `<button class="btn" data-act="print-sheets" title="${tx('Marking sheets for the open sub-department, or all of them')}">${ic('print')}${tx('Marking sheets')}</button><button class="btn primary" data-act="check-selected">${ic('barcode')}${tx('Check a micro-dept')}</button>`, 'm-labelint') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx(tx('Label integrity'), ctx.storeNo)}<span><i style="background:#2563EB"></i>${tx('Checked this cycle')}</span><span><i style="background:#DC2626"></i>${tx('Wrong label found')}</span><span><i style="background:transparent;border:2px solid #D24E0E"></i>${tx('Selected micro-dept')}</span><span><i style="background:#CBD0D8"></i>${tx('Not yet checked')}</span></div></div>` +
      `<div class="sidecol" id="liside"></div></div>`;
  },
  mobile(ctx) {
    const m = model(ctx);
    return mvMap({ badge: badgeText(m) }) + `<div class="mv-sel mode" id="limob"></div>`;
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
        else toast(ctx.isMobile ? tx('{code} is not on a micro-department yet', { code: info.full }) : tx('{code} is not on a micro-department yet; choose one and Assign shelves', { code: info.full }));
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
      setStrip(root, liStrip(m));
      const badge = $('#mvbadge', root); if (badge) badge.innerHTML = badgeText(m);
    };
    paint();
    // Carried from a shelf selected on the map: zoom to it and, when it is
    // assigned to a micro-department, open that one so its checks show.
    if (ctx.arg?.select && map.groups(ctx.arg.select).length) {
      const sel = ctx.arg.select, micro = microOf(sel);
      if (micro) { selected = micro; openSub = micro.split('-')[0]; assigning = false; paint(); }
      map.select(sel); requestAnimationFrame(() => { map.zoomTo(sel); map.ping(sel); });
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
        else if (act === 'check' || act === 'check-selected') { const micro = a.getAttribute('data-micro') || selected; if (!micro) return toast(tx('Pick a micro-department first')); await ctx.store.dispatch({ type: m.checks[micro] ? 'label.uncheck' : 'label.check', entity: { micro, cycle: m.cycle } }); }
        else if (act === 'print-sheets') printMarkingSheets(m, typeof openSub === 'string' && openSub ? openSub : null, `${ctx.storeName || ''} · ${ctx.storeNo}`);
        else if (act === 'cycle') await ctx.store.dispatch({ type: 'label.cycle.set', entity: {}, payload: { cycleLen: a.getAttribute('data-len') } });
        else if (act === 'variance') { varianceFor = a.getAttribute('data-micro') || selected; paint(); }
        else if (act === 'variance-cancel') { varianceFor = null; paint(); }
        else if (act === 'variance-save') {
          const kc = $('[data-field="keycode"]', root)?.value.trim(), note = $('[data-field="note"]', root)?.value.trim();
          if (!/^\d{6,13}$/.test(kc || '')) return toast(tx('Keycode must be 6 to 13 digits'), 'bad');
          await ctx.store.dispatch({ type: 'label.variance', entity: { micro: varianceFor, cycle: m.cycle }, payload: { keycode: kc, note } });
          // A label for a recalled product: the stock behind it comes off sale.
          const rec = recallFor(ctx.store, kc);
          varianceFor = null; paint();
          if (rec) toast(tx('Variance logged. {product} is recalled: move it to the recall bay and tell a manager.', { product: rec.title }), 'bad'); else toast(tx('Variance logged'));
        }
        else if (act === 'zoom-dept') map.filterDept(a.getAttribute('data-dept'));
      } catch (err) { toast(err.message, 'bad'); }
    });
    return [ctx.store.on('labels', paint)];
  },
};

function varianceForm(m) {
  return `<div class="pcard"><div class="pt3">${tx('Wrong label · {micro}', { micro: esc(varianceFor) })}</div><label class="fld"><span>${tx('Keycode')}</span><input data-field="keycode" inputmode="numeric" placeholder="42977636"></label><label class="fld"><span>${tx('What is wrong')}</span><input data-field="note" placeholder="${tx('ticket $4, shelf edge $3.50')}"></label><div class="acts2" style="display:flex;gap:8px;margin-top:10px"><span class="btn primary sm" data-act="variance-save">${ic('check')}${tx('Log variance')}</span><span class="btn sm" data-act="variance-cancel">${tx('Cancel')}</span></div></div>`;
}
function sidebar(m) {
  const cyc = `<div class="pcard licycle${m.done === m.total ? ' done' : ''}"><div class="top"><b>${cycleLabel(m.cycle)}</b><span class="dl">${m.done === m.total ? tx('Cycle complete') : tx('{n}d left', { n: m.daysLeft })}</span></div>${prog(m.done / m.total * 100)}<div class="sub">${txn(m.variances.length, '{done} / {total} micro-departments checked · {n} label wrong', '{done} / {total} micro-departments checked · {n} labels wrong', { done: m.done, total: m.total })}</div>` +
    `<div class="seg3">${['weekly', 'fortnightly', 'monthly'].map(l => `<span class="${m.L.cycleLen === l ? 'on' : ''}" data-act="cycle" data-len="${l}">${LEN_NAME[l]}</span>`).join('')}</div></div>`;
  let sel = '';
  if (selected) {
    const [subId, code] = selected.split('-'); const entry = (MICRO[subId] || []).find(x => microCode(x) === code) || code;
    const c = m.checks[selected], vs = m.variances.filter(v => v.micro === selected), shelves = expand(m.L.assign[selected] || []);
    const i = ALL.indexOf(selected), withShelves = SUBS.filter(sd => sd[0] === subId).flatMap(sd => MICRO[sd[0]] || []).filter(x => (m.L.assign[microId(subId, x)] || []).length).length;
    const how = assigning
      ? `<div class="pt3">${tx('Assigning · {micro}', { micro: esc(microName(entry)) })}</div><p class="lbl">${tx('Click or drag-paint shelves on the map. Dashed shelves are unassigned {sub} candidates. <b>{n}</b> assigned · {with}/{of} micros in {sub} have shelving.', { sub: esc(subId.toUpperCase()), n: shelves.length, with: withShelves, of: (MICRO[subId] || []).length })}</p>`
      : `<div class="pt3">${esc(microName(entry))}</div><p class="lbl">${tx('Its shelves are outlined on the map. Tapping a shelf opens the micro-department it is on; <b>Assign shelves</b> changes which shelves this one covers.')}</p>`;
    sel = `<div class="pcard lisel"><div class="li-ws"><button class="btn sm" data-act="step" data-d="-1"${i <= 0 ? ' disabled' : ''}>${tx('‹ Prev')}</button><span>${i + 1} / ${ALL.length}</span><button class="btn sm" data-act="step" data-d="1"${i >= ALL.length - 1 ? ' disabled' : ''}>${tx('Next ›')}</button></div>${how}<div class="lisel-h"><span class="lisel-code">${esc(code)}</span><div><b>${esc(microName(entry))}</b><small>${txn(shelves.length, '{sub} · {n} shelf assigned', '{sub} · {n} shelves assigned', { sub: subId.toUpperCase() })}${shelves.length ? ' · ' + shelves.join(', ') : ''}</small></div></div>` +
      `<div class="lisel-facts"><span><b>${tx('This cycle')}</b>${c ? tx('Checked {date}', { date: fmtDate(c.at) }) : tx('Not checked yet')}</span><span><b>${tx('Wrong labels')}</b>${vs.length ? vs.map(v => esc(v.keycode) + (v.note ? ' · ' + esc(v.note) : '')).join('<br>') : tx('none logged')}</span></div>` +
      `<div class="acts2" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><span class="btn primary sm" data-act="check" data-micro="${esc(selected)}">${ic(c ? 'x' : 'check')}${c ? tx('Uncheck') : tx('Mark checked')}</span><span class="btn sm" data-act="variance" data-micro="${esc(selected)}">${ic('alert')}${tx('Wrong label')}</span>${subId ? `<span class="btn sm" data-act="zoom-dept" data-dept="${subId}">${ic('pin')}${tx('Show {sub}', { sub: subId.toUpperCase() })}</span>` : ''}${assigning ? `<span class="btn sm" data-act="done-assign">${tx('Done assigning')}</span>` : `<span class="btn sm" data-act="assign">${ic('pin')}${tx('Assign shelves')}</span><span class="btn sm" data-act="close-micro">${tx('Close')}</span>`}</div></div>`;
  }
  const shelved = ALL.filter(id => (m.L.assign[id] || []).length).length;
  const acc = `<div class="li-shelved">${tx('<b>{n}</b> of <b>{total}</b> micro-departments have shelving', { n: shelved, total: ALL.length })}</div><div class="subacc">${SUBS.map(sd => {
    const micros = MICRO[sd[0]] || []; const n = micros.filter(x => m.checks[microId(sd[0], x)]).length; const open = openSub === sd[0];
    const rows = micros.map(x => { const id = microId(sd[0], x), on = !!m.checks[id], wrong = m.variances.some(v => v.micro === id); return `<div class="micro${selected === id ? ' sel' : ''}" data-act="select" data-micro="${id}"><span class="tk${on ? ' on' : ''}" data-act="check" data-micro="${id}">${ic('check')}</span><span class="mc">${microCode(x)}</span><span class="mn">${esc(microName(x))}</span>${on ? `<span class="md">${fmtDate(m.checks[id].at)}</span>` : ''}${wrong ? `<span class="md" style="color:var(--red)">${tx('wrong')}</span>` : ''}<span class="sc">${(m.L.assign[id] || []).length} ▦</span></div>`; }).join('');
    return `<div class="subrow"><div class="sh" data-act="toggle-sub" data-sub="${sd[0]}"><span class="pt" style="background:${DEPT_COLOUR[sd[0]]}"></span><span class="code">${sd[1]}</span><span class="nm">${sd[2]}</span><span class="ct${n === micros.length ? ' full' : ''}">${n}/${micros.length}</span><span class="ib">${ic(open ? 'minus' : 'plus')}</span></div><div class="micros"${open ? '' : ' hidden'}>${rows}</div></div>`;
  }).join('')}</div>`;
  return cyc + (varianceFor ? varianceForm(m) : sel) + acc;
}
// The phone's Labels sheet (opened from the strip): the cycle's progress,
// then the micro-department in hand, or each department's progress (a tap
// lists its micro-departments) and the wrong labels found this cycle.
function mobileBar(m) {
  const head = `<div class="sx-h">${ic('m-labelint')}${tx('Label check')}<span class="n">${m.done} / ${m.total}</span></div><div class="sx-sub">${txn(m.daysLeft, '{cycle} · {n} day left', '{cycle} · {n} days left', { cycle: cycleLabel(m.cycle) })}</div><div style="margin:8px 0 4px">${sx.bar(m.done, m.total)}</div>`;
  if (varianceFor || selected) return `<div class="sx">${head}<div class="li-mob">${mobileInner(m)}</div></div>`;
  const depts = sx.rows(SUBS.map(([sd, code, name]) => { const list = MICRO[sd] || [], n = list.filter(x => m.checks[microId(sd, x)]).length;
    return `<div class="sx-r" data-act="toggle-sub" data-sub="${sd}">${dep(sd)}<div class="k"><b>${esc(name)}</b></div>${sx.bar(n, list.length, DEPT_COLOUR[sd])}<span class="v">${n}/${list.length}</span></div>` +
      (openSub === sd ? list.map(x => { const id = microId(sd, x); return `<div class="sx-r li-micro" data-act="select" data-micro="${id}"><span class="mc">${microCode(x)}</span><div class="k"><b>${esc(microName(x))}</b></div><span class="v ${m.checks[id] ? 'ok' : 'dim'}">${m.checks[id] ? tx('Checked') : tx('Not yet')}</span></div>`; }).join('') : ''); }));
  const wrong = m.variances.slice(-5).reverse().map(v => { const [sd, code] = String(v.micro || '').split('-'), e = (MICRO[sd] || []).find(x => microCode(x) === code); return sx.row('alert', `${esc(code || v.micro)} ${e ? esc(microName(e)) : ''}`, `${v.keycode ? tx('Keycode {code}', { code: esc(v.keycode) }) + ' · ' : ''}${esc(v.note || '')}`, esc(fmtDate(v.at)), 'warn'); });
  return `<div class="sx">${head}${sx.sec(tx('By department'), depts, tx('tap one to list it'))}${wrong.length ? sx.sec(tx('Wrong labels this cycle'), sx.rows(wrong), tx('{n} found', { n: m.variances.length })) : ''}</div>`;
}
// The strip under the phone's Labels map: the cycle's count, or the
// micro-department in hand with its Checked button.
function liStrip(m) {
  if (varianceFor) return `${ic('alert')}<b>${tx('Wrong label')}</b><span class="s">${esc(varianceFor)}</span>`;
  if (selected) { const [sd, code] = selected.split('-'), e = (MICRO[sd] || []).find(x => microCode(x) === code), c = m.checks[selected];
    return `${ic('m-labelint')}<b>${esc(code)}</b><span class="s">${e ? esc(microName(e)) : ''}</span><button class="act${c ? '' : ' go'}" type="button" data-act="check" data-micro="${esc(selected)}">${ic('check')}${c ? tx('Checked') : tx('Mark checked')}</button>`; }
  return `${ic('m-labelint')}<b>${tx('Labels')}</b><span class="n">${m.done} / ${m.total}</span><span class="s">${tx('{n}d left · tap a shelf', { n: m.daysLeft })}</span>`;
}
function mobileInner(m) {
  if (varianceFor) return `<div class="mv-mh">${ic('m-labelint')}<b>${tx('Wrong label · {micro}', { micro: esc(varianceFor) })}</b></div><label class="fld"><span>${tx('Keycode')}</span><input data-field="keycode" inputmode="numeric"></label><label class="fld"><span>${tx('What is wrong')}</span><input data-field="note"></label><div class="mv-two">${mbig(tx('Log variance'), '', 'check', ' data-act="variance-save"')}${mghost(tx('Cancel'), ' data-act="variance-cancel"')}</div>`;
  const [subId, code] = selected.split('-'); const entry = (MICRO[subId] || []).find(x => microCode(x) === code) || code; const c = m.checks[selected];
  return `<div class="mv-mh">${ic('m-labelint')}<b>${esc(code)} ${esc(microName(entry))}</b><span>${m.done} / ${m.total}</span></div><div class="mv-hint">${c ? tx('{cycle} · <b>{n}d left</b> · {sub} · checked {date}', { cycle: cycleLabel(m.cycle), n: m.daysLeft, sub: subId.toUpperCase(), date: fmtDate(c.at) }) : tx('{cycle} · <b>{n}d left</b> · {sub} · not checked yet', { cycle: cycleLabel(m.cycle), n: m.daysLeft, sub: subId.toUpperCase() })}</div><div class="mv-two">${mbig(c ? tx('Uncheck') : tx('Checked'), c ? 'sec' : '', 'check', ` data-act="check" data-micro="${esc(selected)}"`)}${mbig(tx('Price is wrong'), 'warn', 'alert', ` data-act="variance" data-micro="${esc(selected)}"`)}</div><div class="mv-hint"><a data-act="toggle-sub" data-sub="${subId}">${tx('Choose another')}</a></div>`;
}

// ShelfSearcher's marking sheets: one page per micro-department with 100
// numbered boxes to tick as labels are checked, a table for the wrong ones
// and a sign-off. For the open sub-department, or every one.
function printMarkingSheets(m, subId, storeLine = '') {
  const subs = SUBS.filter(sd => !subId || sd[0] === subId);
  const pages = [];
  for (const [sid, sc, sname] of subs) for (const entry of MICRO[sid] || []) {
    const done = m.checks[microId(sid, entry)];
    pages.push(`<div class="${pages.length ? 'ps-page' : ''}"><h2>${tx('Label Integrity · Correction &amp; Marking Sheet')}</h2>`
      + `<div class="ps-facts"><div><span>${tx('Store')}</span><b>${esc(storeLine)}</b></div><div><span>${tx('Cycle')}</span><b>${esc(cycleLabel(m.cycle))}</b></div><div><span>${tx('Sub-department')}</span><b>${esc(sc)} ${esc(sname)}</b></div><div><span>${tx('Micro-department')}</span><b>${esc(microCode(entry))} ${esc(microName(entry))}${done ? ' · ' + tx('already checked') : ''}</b></div></div>`
      + `<h2>${tx('Labels checked · tick each as you go (100)')}</h2><div class="ps-grid">${Array.from({ length: 100 }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>`
      + `<h2>${tx('Incorrect labels found')}</h2>` + table([tx('Location / keycode'), tx('Incorrect label description'), tx('True cost')], Array.from({ length: 16 }, () => ['', '', '']), ['w30', 'wd', 'w20'])
      + signoff() + '</div>');
  }
  printSheet({ title: tx('Label integrity marking sheets'), subtitle: `${esc(cycleLabel(m.cycle))} · ${subId ? esc(subs[0]?.[1] + ' ' + subs[0]?.[2]) : tx('all sub-departments')} · ${txn(pages.length, '{n} sheet', '{n} sheets')}`, body: pages.join('') });
}
