// Equipment checks: the store's ladders, MHE (pallet jacks, walkie
// stackers, forklifts) and trolleys, each pinned where it lives, with its
// own code, how often it is checked and every check. A failed check takes it
// out of service until one passes, and can log a Maintenance issue. The due
// list takes in Emergency's serviced markers too, so every check is in one
// place. Reads store.get('equipment') (shared/reducers/equip.js) and, for
// that list, store.get('assets') with the map's markers.
//
// Beside Maintenance under Safety & upkeep on a desk; on a phone, managers
// only, as Maintenance is. Anyone adds, edits, moves and checks; only a
// manager removes an item (its history stays, and it can come back).

import { $, ic, esc, vh, sub, status, fmtDate, toast, mgr, today } from '../ui.js';
import { mountMap, mapbar, crumbx, bindMapChrome, mvMap, setStrip, sx, mapFloors } from '../map.js';
import { printSheet, table, tick, signoff } from '../print.js';
import { qrSvg } from '../../shared/qr.js';
import { equipLink } from '../share.js';
import { MARKER_NAMES } from '../../shared/maprender.js';
import { EQUIP_GROUP, SOON_DAYS, equipStatus, daysUntil } from '../../shared/reducers/equip.js';
import { addMonths } from '../../shared/reducers/floor.js';
import { nearestShelf } from './maintenance.js';
import { tx, txn } from '../i18n.js';

const KIND = { step: tx('Step ladder'), ladder: tx('Platform ladder'), pj: tx('Pallet jack'), epj: tx('Electric pallet jack'), stacker: tx('Walkie stacker'), forklift: tx('Forklift'), trolley: tx('Trolley'), other: tx('Other equipment') };
const GROUPS = [['all', tx('All')], ['lad', tx('Ladders')], ['mhe', 'MHE'], ['trl', tx('Trolleys')], ['eqp', tx('Other')]];
const PREFIX = { lad: 'LAD', mhe: 'MHE', trl: 'TRL', eqp: 'EQP' };
const EVERY = [[1, tx('Monthly')], [3, tx('Every 3 months')], [6, tx('Every 6 months')], [12, tx('Yearly')], [0, tx('A set date')]];
const WHY = [['retired', tx('Retired'), tx('Worn out, or replaced by a new one')], ['broken', tx('Broken beyond repair'), tx('Not worth fixing')], ['lost', tx('Lost or stolen'), tx('Nobody can find it')], ['moved', tx('Moved to another store'), tx('It lives somewhere else now')], ['mistake', tx('Added by mistake'), tx('It was never here')]];
const COLOUR = { ok: '#16A34A', soon: '#D97706', late: '#DC2626', out: '#111827', none: '#64748B' };
// What a check looks at, by group; powered MHE adds its battery.
const POINTS = {
  lad: [['feet', tx('Feet and rubber pads')], ['rungs', tx('Steps and rails')], ['lock', tx('Locking bar and hinges')], ['label', tx('Label and load rating')]],
  mhe: [['wheels', tx('Wheels and rollers')], ['hyd', tx('Hydraulics hold the load')], ['handle', tx('Handle, release and brake')], ['forks', tx('Forks straight, no cracks')]],
  trl: [['wheels', tx('Wheels and castors')], ['frame', tx('Deck and frame')], ['handle', tx('Handle')]],
  eqp: [['cond', tx('Good condition')], ['safe', tx('Safe to use')]],
};
const POWERED = ['epj', 'stacker', 'forklift'];
const pointsOf = it => [...POINTS[EQUIP_GROUP[it.kind]], ...(POWERED.includes(it.kind) ? [['batt', tx('Battery and charger')]] : [])];
// The pictogram per kind, stroked in a -8..8 box (the map pins' size).
const GLYPH = {
  lad: '<path d="M-3.5 -7V7M3.5 -7V7M-3.5 -3.5H3.5M-3.5 0H3.5M-3.5 3.5H3.5"/>',
  mhe: '<path d="M-7 -7L-3.5 0V3.5H7M-3.5 1.5H7"/><circle cx="-1.5" cy="5.8" r="1.3"/><circle cx="5" cy="5.8" r="1.3"/>',
  stk: '<path d="M3 -7V4M3 -3H7M3 1H7M-7 -2H1V4H-7zM-5 -2V-5H-1"/><circle cx="-5" cy="6" r="1.3"/><circle cx="-1" cy="6" r="1.3"/>',
  trl: '<path d="M-7 -6H-5L-3.5 2.5H7M-3.5 -1H7V-5H-4.5"/><circle cx="-2" cy="5.8" r="1.3"/><circle cx="5" cy="5.8" r="1.3"/>',
  eqp: '<path d="M2.5 -5.5A3.2 3.2 0 0 0 -1.5 -1.5L-6 3L-3.5 5.5L1 1A3.2 3.2 0 0 0 5 -3L3 -1L1 -1.5L0.5 -3.5Z"/>',
};
const glyphOf = it => (it.kind === 'stacker' || it.kind === 'forklift' ? GLYPH.stk : GLYPH[EQUIP_GROUP[it.kind]] || GLYPH.eqp);
const glyphSvg = (it, colour) => `<svg class="mt-gl" viewBox="-9 -9 18 18" aria-hidden="true"><g fill="none" stroke="${colour}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyphOf(it)}</g></svg>`;
const pinMark = it => `<span class="mt-pin eq-pin ${it.st}" style="border-color:${COLOUR[it.st]}">${glyphSvg(it, it.st === 'out' ? '#fff' : COLOUR[it.st])}</span>`;
const nameOf = it => it.name || KIND[it.kind] || '';
const isManager = s => (s?.roles || []).includes('manager') || !!s?.owner;

let filter = 'all', selected = null, draft = null, checking = null, removing = null, showRemoved = false;

function model(ctx) {
  const day = today(), items = ctx.store.get('equipment')?.items || {};
  const all = Object.values(items).map(it => ({ ...it, st: equipStatus(it, day) }));
  const live = all.filter(it => !it.removed), removed = all.filter(it => it.removed);
  const n = k => live.filter(it => it.st === k).length;
  const list = (showRemoved ? removed : live).filter(it => filter === 'all' || EQUIP_GROUP[it.kind] === filter).sort(byNeed);
  return { day, all, live, removed, list, late: n('late'), out: n('out'), soon: n('soon') };
}
const RANK = { out: 0, late: 1, soon: 2, none: 3, ok: 4 };
const byNeed = (a, b) => RANK[a.st] - RANK[b.st] || String(a.due || '9').localeCompare(String(b.due || '9')) || a.code.localeCompare(b.code);
// Where it stands, in words.
function stText(it, day) {
  if (it.removed) return tx('Removed {date}', { date: fmtDate(it.removed.at) });
  if (it.st === 'out') return tx('Out of service since {date}', { date: fmtDate(it.out.since) });
  if (!it.due) return it.last ? tx('No next date set') : tx('Not checked yet');
  const d = daysUntil(it.due, day);
  return d < 0 ? txn(-d, 'Overdue {n} day', 'Overdue {n} days') : d === 0 ? tx('Due today') : d <= SOON_DAYS ? txn(d, 'Due in {n} day', 'Due in {n} days') : tx('Next {date}', { date: fmtDate(it.due) });
}
const tone = st => (st === 'out' || st === 'late' ? 'bad' : st === 'soon' ? 'warn' : st === 'ok' ? 'good' : 'info');
const everyText = it => (it.every ? txn(it.every, 'every {n} month', 'every {n} months') : tx('on a set date'));
const headSub = m => sub(txn(m.live.length, '{n} piece of equipment', '{n} pieces of equipment'), m.late ? tx('{n} overdue', { n: m.late }) : '', m.out ? tx('{n} out of service', { n: m.out }) : '', m.soon ? tx('{n} due in 14 days', { n: m.soon }) : '');
// The next free code in a group: LAD-01, LAD-02…
function nextCode(m, group) {
  const p = PREFIX[group] || 'EQP', used = new Set(m.live.map(it => it.code));
  for (let n = 1; n < 1000; n += 1) { const c = `${p}-${String(n).padStart(2, '0')}`; if (!used.has(c)) return c; }
  return p;
}
const newId = () => 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Emergency's markers with a service due in the window (their records come
// from Emergency's Service done). Only with the map on screen.
function emergencyDue(ctx, map, day) {
  if (!map) return [];
  const assets = ctx.store.get('assets') || {};
  return map.markers().map(mk => ({ mk, rec: assets[mk.id] || assets[mk.legacyId] }))
    .filter(r => r.rec?.due && daysUntil(r.rec.due, day) <= SOON_DAYS)
    .map(({ mk, rec }) => ({ id: mk.id, name: MARKER_NAMES[mk.type] ? tx(MARKER_NAMES[mk.type]) : mk.type, where: mk.location || mk.label || '', due: rec.due, st: daysUntil(rec.due, day) < 0 ? 'late' : 'soon' }));
}

export default {
  id: 'equipment', title: tx('Equipment checks'), icon: 'm-equipment',
  deskOnly: s => !isManager(s),
  desktop(ctx) {
    const m = model(ctx);
    return vh(tx('Equipment checks'), headSub(m), `<button class="btn" data-act="labels">${ic('qr')}${tx('Print QR labels')}</button><button class="btn" data-act="sheet">${ic('print')}${tx('Print check sheet')}</button><button class="btn primary" data-act="new">${ic('plus')}${tx('Add equipment')}</button>`, 'm-equipment') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx(tx('Equipment checks'), ctx.storeNo)}${['ok', 'soon', 'late', 'out'].map(k => `<span><i style="background:${COLOUR[k]};border-radius:50%"></i>${{ ok: tx('In date'), soon: tx('Due in 14 days'), late: tx('Overdue'), out: tx('Out of service') }[k]}</span>`).join('')}<span style="color:var(--faint)" id="eqhint"></span></div></div>` +
      `<div class="sidecol fill" id="eqside"></div></div>`;
  },
  mobile(ctx) {
    const m = model(ctx);
    return mvMap({ badge: badgeText(m) }) + `<div class="mv-sel mode mt eq" id="eqmob"></div>`;
  },
  mount(ctx, root) {
    let map = null;
    const manager = isManager(ctx.session.current);
    // From a QR label or the Today page: open that item.
    if (ctx.arg?.equip) { const it = (ctx.store.get('equipment')?.items || {})[ctx.arg.equip]; if (it) { selected = it.id; draft = checking = removing = null; showRemoved = !!it.removed; filter = 'all'; } }
    const stage = $('#mapstage', root);
    if (stage) {
      map = mountMap(stage, { onSelect: info => {
        if (draft && (info.kind === 'floor' || info.kind === 'shelf' || info.kind === 'pin')) {
          readForms(root);
          const p = info.point || map.centreOf(info.id); draft.x = Math.round(p[0] * 10) / 10; draft.y = Math.round(p[1] * 10) / 10; draft.floor = map.floorId() || null;
          const near = info.kind === 'shelf' ? { id: info.full } : nearestShelf(map, p);
          if (near && (!draft.loc || /^near /.test(draft.loc))) draft.loc = 'near ' + near.id;
          paint(); openSheet(); return;
        }
        if (info.kind === 'pin') { selected = info.id; checking = removing = null; showRemoved = false; paint(); openSheet(); }
      } });
      bindMapChrome(root, map);
      stage.addEventListener('mapfloor', () => paint());
    }
    // Pins show on their own floor; one whose floor the map does not know shows on every floor.
    const here = it => { if (!map) return true; const ids = map.floors().map(f => f.id); return !it.floor || !ids.includes(it.floor) || it.floor === map.floorId(); };
    const sheet = open => { if (ctx.isMobile && root.classList.contains('sheet-open') !== open) root.querySelector(':scope > .mv-strip .mv-tog')?.click(); };
    const openSheet = () => sheet(true);
    const paint = () => {
      const m = model(ctx);
      if (map) {
        map.clearOverlays();
        map.drawPins(m.live.filter(it => it.x != null && here(it) && (filter === 'all' || EQUIP_GROUP[it.kind] === filter) && it.id !== draft?.editId)
          .map(it => ({ id: it.id, x: it.x, y: it.y, colour: COLOUR[it.st], glyph: glyphOf(it), title: `${it.code} · ${nameOf(it)} · ${stText(it, m.day)}` })));
        if (draft?.x != null && here(draft)) map.drawPins([{ x: draft.x, y: draft.y, colour: 'var(--accent)', label: '+' }]);
      }
      const em = emergencyDue(ctx, map, m.day);
      const side = $('#eqside', root); if (side) side.innerHTML = sidebar(m, em, manager);
      const mob = $('#eqmob', root); if (mob) { mob.innerHTML = phone(m, manager); setStrip(root, phoneStrip(m)); }
      const badge = $('#mvbadge', root); if (badge) badge.innerHTML = badgeText(m);
      const hint = $('#eqhint', root); if (hint) hint.textContent = draft ? (draft.x != null ? tx('Placed. Tap again to move it.') : tx('Tap the map where it lives')) : tx('Tap a pin for its checks');
      const hs = root.querySelector('.vh .sub'); if (hs) hs.innerHTML = headSub(m);
    };
    paint();
    const item = id => { const it = (ctx.store.get('equipment')?.items || {})[id]; return it ? { ...it, st: equipStatus(it, today()) } : null; };
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act');
      try {
        if (act === 'filter') { filter = a.dataset.filter; showRemoved = false; paint(); }
        else if (act === 'removed') { showRemoved = !showRemoved; filter = 'all'; selected = null; paint(); }
        else if (act === 'select') { selected = a.dataset.id; checking = removing = draft = null; paint(); openSheet(); }
        else if (act === 'back') { selected = null; checking = removing = draft = null; paint(); }
        else if (act === 'emergency') ctx.go('emergency');
        else if (act === 'new') { const m = model(ctx); draft = { kind: 'step', code: nextCode(m, 'lad'), auto: true, name: '', every: 3, last: m.day, due: '', x: null, y: null, floor: null, loc: '' }; selected = checking = removing = null; paint(); sheet(false); }
        else if (act === 'draft-kind') { readForms(root); draft.kind = a.dataset.kind; if (draft.auto) draft.code = nextCode(model(ctx), EQUIP_GROUP[draft.kind]); paint(); }
        else if (act === 'draft-every') { readForms(root); draft.every = Number(a.dataset.every); paint(); }
        else if (act === 'draft-open') openSheet();
        else if (act === 'edit' || act === 'move') {
          const it = item(selected); if (!it) return;
          draft = { editId: it.id, kind: it.kind, code: it.code, name: it.name, every: it.every, last: it.last, due: it.due || '', x: it.x, y: it.y, floor: it.floor, loc: it.loc || '', moving: act === 'move' };
          paint(); if (act === 'move') { sheet(false); toast(tx('Tap the map where it lives now')); } else openSheet();
        }
        else if (act === 'draft-cancel') { draft = null; paint(); }
        else if (act === 'draft-save') await saveDraft(ctx, root);
        else if (act === 'check') { const it = item(a.dataset.id || selected); if (!it) return; selected = it.id; checking = { id: it.id, day: today(), pts: {}, note: '', issue: true, due: '' }; draft = removing = null; paint(); openSheet(); }
        else if (act === 'pt') { readForms(root); checking.pts[a.dataset.key] = a.dataset.v; paint(); }
        else if (act === 'all-ok') { readForms(root); const it = item(checking.id); for (const [k] of pointsOf(it)) checking.pts[k] = 'ok'; paint(); }
        else if (act === 'issue-toggle') { readForms(root); checking.issue = !checking.issue; paint(); }
        else if (act === 'check-cancel') { checking = null; paint(); }
        else if (act === 'check-save') await saveCheck(ctx, root, map);
        else if (act === 'remove') { if (!manager) return toast(tx('Only a manager can remove equipment'), 'bad'); removing = { id: selected, why: '', note: '' }; checking = draft = null; paint(); openSheet(); }
        else if (act === 'why') { readForms(root); removing.why = a.dataset.why; paint(); }
        else if (act === 'remove-cancel') { removing = null; paint(); }
        else if (act === 'remove-save') {
          readForms(root); const it = item(removing.id); if (!it || !removing.why) return;
          await ctx.store.dispatch({ type: 'equip.remove', entity: { equip: it.id }, payload: { why: removing.why, ...(removing.note ? { note: removing.note } : {}) } });
          removing = null; selected = null; paint();
          toast(tx('{code} removed', { code: it.code }), '', { label: tx('Undo'), run: () => ctx.store.dispatch({ type: 'equip.restore', entity: { equip: it.id }, payload: {} }).catch(err => toast(err.message, 'bad')) });
        }
        else if (act === 'restore') { const it = item(selected); if (!it) return; await ctx.store.dispatch({ type: 'equip.restore', entity: { equip: it.id }, payload: {} }); showRemoved = false; toast(tx('{code} is back on the list', { code: it.code })); paint(); }
        else if (act === 'show') { const it = item(selected); if (map && it?.x != null) { if (it.floor && it.floor !== map.floorId() && map.floors().some(f => f.id === it.floor)) map.floor(it.floor); map.setVb([it.x - 700, it.y - 450, 1400, 900]); } }
        else if (act === 'label') { const it = item(selected); if (it) printLabels(ctx, [it]); }
        else if (act === 'labels') { const m = model(ctx); if (!m.live.length) return toast(tx('Add equipment first'), 'bad'); printLabels(ctx, [...m.live].sort((x, y) => x.code.localeCompare(y.code))); }
        else if (act === 'sheet') { const m = model(ctx); if (!m.live.length) return toast(tx('Add equipment first'), 'bad'); printCheckSheet(ctx, m); }
      } catch (err) { toast(err.message, 'bad'); }
    });
    root.addEventListener('change', e => { if (e.target.closest('[data-draft],[data-check],[data-remove]')) readForms(root); });
    // A store update mid-form keeps what was typed.
    return [ctx.store.on('equipment', () => { readForms(root); paint(); }), ctx.store.on('assets', paint)];
  },
};

// The text a person typed, kept across repaints.
function readForms(root) {
  const val = sel => root.querySelector(sel)?.value;
  if (draft) for (const f of ['code', 'name', 'loc', 'last', 'due']) { const v = val(`[data-draft="${f}"]`); if (v != null) { if (f === 'code' && v.trim().toUpperCase() !== draft.code) draft.auto = false; draft[f] = f === 'code' ? v.trim().toUpperCase() : v.trim(); } }
  if (checking) for (const f of ['day', 'note', 'due']) { const v = val(`[data-check="${f}"]`); if (v != null) checking[f] = v.trim(); }
  if (removing) { const v = val('[data-remove="note"]'); if (v != null) removing.note = v.trim(); }
}
async function saveDraft(ctx, root) {
  readForms(root);
  if (!draft.code) return toast(tx('Give it a code, like LAD-01'), 'bad');
  if (draft.every === 0 && !draft.due && !draft.editId) return toast(tx('A set date needs its next due date'), 'bad');
  const pos = draft.x != null ? { x: draft.x, y: draft.y, floor: draft.floor || null, loc: draft.loc } : { loc: draft.loc };
  if (draft.editId) {
    const it = ctx.store.get('equipment').items[draft.editId], p = { ...pos };
    if (draft.x === it.x && draft.y === it.y && (draft.floor || null) === (it.floor || null)) { delete p.x; delete p.y; delete p.floor; }
    if ((draft.loc || '') === (it.loc || '')) delete p.loc;
    if (draft.code !== it.code) p.code = draft.code;
    if (draft.kind !== it.kind) p.kind = draft.kind;
    if (draft.name !== it.name) p.name = draft.name;
    if (draft.every !== it.every) p.every = draft.every;
    if ((draft.due || null) !== (it.due || null) && (draft.every === 0 || draft.due)) p.due = draft.due || null;
    if (Object.keys(p).length) { await ctx.store.dispatch({ type: 'equip.update', entity: { equip: draft.editId }, payload: p }); toast(tx('Saved')); }
    selected = draft.editId; draft = null;
  } else {
    const id = newId();
    await ctx.store.dispatch({ type: 'equip.add', entity: { equip: id }, payload: { code: draft.code, kind: draft.kind, name: draft.name, every: draft.every, last: draft.last || null, ...(draft.due ? { due: draft.due } : {}), ...pos } });
    selected = id; toast(tx('{code} added', { code: draft.code })); draft = null;
  }
}
async function saveCheck(ctx, root, map) {
  readForms(root);
  const c = checking, it = ctx.store.get('equipment').items[c.id]; if (!it) return;
  const pts = pointsOf(it), failed = pts.filter(([k]) => c.pts[k] === 'fail');
  if (pts.some(([k]) => !c.pts[k])) return toast(tx('Mark each point OK or Fail'), 'bad');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.day) || c.day > today()) return toast(tx('Pick the day it was checked'), 'bad');
  let issue = null;
  if (failed.length && c.issue) {
    issue = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const what = failed.map(([, label]) => label).join(', ');
    await ctx.store.dispatch({ type: 'issue.log', entity: { issue }, payload: { cat: 'safety', sev: 2, title: tx('{code} failed its check: {what}', { code: it.code, what }).slice(0, 120), note: c.note || '', loc: it.loc || '', dept: null, x: it.x, y: it.y, floor: it.floor || map?.floorId() || null } });
  }
  const payload = { day: c.day, result: failed.length ? 'fail' : 'ok', points: Object.fromEntries(pts.map(([k]) => [k, c.pts[k]])), ...(c.note ? { note: c.note } : {}), ...(issue ? { issue } : {}), ...(it.every === 0 && c.due ? { due: c.due } : {}) };
  await ctx.store.dispatch({ type: 'equip.check', entity: { equip: c.id }, payload });
  checking = null;
  toast(failed.length ? tx('{code} is out of service', { code: it.code }) + (issue ? ' · ' + tx('issue logged') : '') : tx('{code} checked OK', { code: it.code }), failed.length ? 'warn' : '');
}

// ── the desk's side column ───────────────────────────────────────────────
function pills(m) {
  const count = g => (g === 'all' ? m.live.length : m.live.filter(it => EQUIP_GROUP[it.kind] === g).length);
  const groups = GROUPS.filter(([g]) => g === 'all' || count(g) || filter === g);
  return groups.map(([g, label]) => `<button class="${!showRemoved && filter === g ? 'on' : ''}" style="padding:5px 11px;font-size:12.5px" data-act="filter" data-filter="${g}">${label} ${count(g)}</button>`).join('') +
    (m.removed.length ? `<button class="${showRemoved ? 'on' : ''}" style="padding:5px 11px;font-size:12.5px" data-act="removed">${tx('Removed {n}', { n: m.removed.length })}</button>` : '');
}
function row(it, m) {
  return `<div class="li mt-li${selected === it.id ? ' sel' : ''}" data-act="select" data-id="${esc(it.id)}">${pinMark(it)}<span class="nm" style="white-space:normal"><b style="font-weight:600"><span class="mono">${esc(it.code)}</span> ${esc(nameOf(it))}</b><span class="where" style="display:block;font-size:12px;color:var(--dim)">${esc(it.loc || tx('Not on the map'))} · ${everyText(it)}${it.last ? ' · ' + tx('last {date}', { date: fmtDate(it.last) }) : ''}</span></span>${status(it.removed ? 'info' : tone(it.st), esc(stText(it, m.day)))}</div>`;
}
function sidebar(m, em, manager) {
  const empty = showRemoved ? tx('Nothing removed.') : m.live.length ? tx('Nothing here.') : tx('No equipment yet. Add the store’s ladders, pallet jacks and trolleys, then tap the map where each lives.');
  const list = `<div class="pcard"><div class="pills" style="margin-bottom:12px">${pills(m)}</div><div class="list">${m.list.map(it => row(it, m)).join('') || `<div class="li" style="color:var(--dim)">${empty}</div>`}</div></div>`;
  if (draft) return draftForm(m) + list;
  const it = m.all.find(x => x.id === selected);
  if (checking && it) return checkForm(it, m) + list;
  if (removing && it) return removeForm(it) + list;
  if (it) return detail(it, m, manager) + list;
  return list + dueCard(m, em);
}
// Everything due in the window: this equipment and Emergency's markers.
function dueCard(m, em) {
  const eq = m.live.filter(it => it.st === 'out' || it.st === 'late' || it.st === 'soon');
  const rows = [...eq.map(it => ({ rank: RANK[it.st], due: it.due || '', html: `<div class="li" data-act="select" data-id="${esc(it.id)}">${pinMark(it)}<span class="nm"><b style="font-weight:600"><span class="mono">${esc(it.code)}</span> ${esc(nameOf(it))}</b><span class="where" style="display:block;font-size:12px;color:var(--dim)">${esc(it.loc || '')} · ${tx('Equipment')}</span></span>${status(tone(it.st), esc(stText(it, m.day)))}</div>` })),
    ...em.map(r => ({ rank: RANK[r.st], due: r.due, html: `<div class="li" data-act="emergency"><span class="mt-pin" style="border-color:${COLOUR[r.st]}">${ic('m-emergency')}</span><span class="nm"><b style="font-weight:600">${esc(r.name)}</b><span class="where" style="display:block;font-size:12px;color:var(--dim)">${esc(r.where)}${r.where ? ' · ' : ''}${tx('Emergency')}</span></span>${status(tone(r.st), esc(r.st === 'late' ? txn(-daysUntil(r.due, m.day), 'Overdue {n} day', 'Overdue {n} days') : tx('Due {date}', { date: fmtDate(r.due) })))}</div>` }))]
    .sort((a, b) => a.rank - b.rank || a.due.localeCompare(b.due));
  return `<div class="card"><div class="ch"><h3>${tx('Due in the next 14 days')}</h3><span class="cs-dim">${tx('Equipment and Emergency')}</span></div><div class="list">${rows.map(r => r.html).join('') || `<div class="li" style="color:var(--dim)">${tx('Nothing due. Every check is in date.')}</div>`}</div></div>`;
}
function logRows(it) {
  const label = Object.fromEntries(pointsOf(it));
  return [...it.log].reverse().slice(0, 12).map(l => {
    const bad = l.pts ? Object.entries(l.pts).filter(([, v]) => v === 'fail').map(([k]) => label[k] || k) : [];
    return { when: fmtDate(l.day || l.t), what: tx(l.a), note: [bad.join(', '), l.n || ''].filter(Boolean).join(' · ') };
  });
}
function facts(it, m) {
  return [[tx('What'), esc(KIND[it.kind])], [tx('Where'), esc(it.loc || tx('Not on the map'))], [tx('Checked'), everyText(it)], [tx('Last check'), it.last ? esc(fmtDate(it.last)) : tx('Not checked yet')], [tx('Next due'), it.due ? esc(fmtDate(it.due)) : '—'], [tx('Added'), esc(fmtDate(it.added))]];
}
function outNote(it) {
  if (!it.out) return '';
  return `<div class="mt-dup eq-out">${ic('alert')}<span><b>${tx('Out of service: do not use')}</b> ${tx('Since {date}.', { date: esc(fmtDate(it.out.since)) })}${it.out.note ? ' ' + esc(it.out.note) : ''} ${tx('A check that passes brings it back.')}</span></div>`;
}
function detail(it, m, manager) {
  const acts = it.removed
    ? [manager ? `<span class="btn sm primary" data-act="restore">${ic('refresh')}${tx('Bring it back')}</span>` : '']
    : [`<span class="btn sm primary" data-act="check">${ic('listcheck')}${tx('Record a check')}</span>`, it.x != null ? `<span class="btn sm" data-act="show">${ic('pin')}${tx('Show on map')}</span>` : '', `<span class="btn sm" data-act="move">${ic('pin')}${it.x != null ? tx('Move on the map') : tx('Put it on the map')}</span>`, `<span class="btn sm" data-act="edit">${ic('edit')}${tx('Edit')}</span>`, `<span class="btn sm" data-act="label">${ic('qr')}${tx('Print label')}</span>`, manager ? `<span class="btn sm" style="color:var(--red)" data-act="remove">${ic('trash')}${tx('Remove')}</span>` : ''];
  return `<div class="card mtdet"><div class="ch"><h3>${pinMark(it)} <span class="mono">${esc(it.code)}</span> ${esc(nameOf(it))}</h3>${status(it.removed ? 'info' : tone(it.st), esc(stText(it, m.day)))}</div>` +
    (it.removed ? `<div class="mt-dup">${ic('trash')}<span>${tx('Removed {date}: {why}.', { date: esc(fmtDate(it.removed.at)), why: esc((WHY.find(w => w[0] === it.removed.why) || [, it.removed.why])[1]) })}${it.removed.note ? ' ' + esc(it.removed.note) : ''}</span></div>` : outNote(it)) +
    `<div class="mt-meta">${facts(it, m).map(([k, v]) => `<span>${k}: <b>${v}</b></span>`).join('')}</div>` +
    `<div class="list">${logRows(it).map(l => `<div class="li"><span class="rt" style="margin:0">${esc(l.when)}</span><span class="nm">${esc(l.what)}${l.note ? ' · ' + esc(l.note) : ''}</span></div>`).join('')}</div>` +
    `<div class="acts2" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center">${acts.join('')}<span class="btn sm" data-act="back">${ic('x')}${tx('Close')}</span></div></div>`;
}
function draftForm(m) {
  const kinds = Object.entries(KIND).map(([k, label]) => `<button class="${draft.kind === k ? 'on' : ''}" data-act="draft-kind" data-kind="${k}">${label}</button>`).join('');
  const every = EVERY.map(([n, label]) => `<button class="${draft.every === n ? 'on' : ''}" data-act="draft-every" data-every="${n}">${label}</button>`).join('');
  const nextNote = draft.every ? (draft.last ? tx('Next due {date}, worked out from the last check.', { date: esc(fmtDate(addMonths(draft.last + 'T00:00:00Z', draft.every))) }) : tx('Due {n} months after its first check.', { n: draft.every })) : tx('A booked date, like a contractor’s service. After each one, enter the next.');
  return `<div class="card mtdet eq-form"><div class="ch"><h3>${draft.editId ? tx('Edit {code}', { code: esc(draft.code) }) : tx('Add equipment')}</h3><span class="cs-dim">${draft.x != null ? tx('placed on the map') : tx('tap the map to place it')}</span></div>` +
    `<div class="mv-sub">${tx('What is it?')}</div><div class="mv-chips">${kinds}</div>` +
    `<div class="eq-two"><label class="fld"><span>${tx('Code')}</span><input data-draft="code" class="mono" value="${esc(draft.code)}" maxlength="16" autocapitalize="characters"></label><label class="fld"><span>${tx('Description')}</span><input data-draft="name" value="${esc(draft.name)}" maxlength="80" placeholder="${esc(KIND[draft.kind])}"></label></div>` +
    `<p class="cs-dim" style="margin:0 0 8px;font-size:12.5px">${tx('The next free number for its group. Use the number on its tag if it has one: the QR label prints with this code.')}</p>` +
    `<label class="fld"><span>${tx('Where it lives')}</span><input data-draft="loc" value="${esc(draft.loc)}" maxlength="60" placeholder="${tx('Stockroom, by bay 7012')}"></label>` +
    `<div class="mv-sub">${tx('Checked how often?')}</div><div class="mv-chips">${every}</div>` +
    `<div class="eq-two">${draft.editId ? '' : `<label class="fld"><span>${tx('Last checked')}</span><input type="date" data-draft="last" value="${esc(draft.last || '')}" max="${today()}"></label>`}${draft.every === 0 || draft.editId ? `<label class="fld"><span>${tx('Next due')}</span><input type="date" data-draft="due" value="${esc(draft.due || '')}"></label>` : ''}</div>` +
    `<p class="cs-dim" style="margin:0;font-size:12.5px">${nextNote}</p>` +
    `<div class="acts2" style="display:flex;gap:8px;margin-top:12px"><span class="btn primary sm" data-act="draft-save">${ic('check')}${draft.editId ? tx('Save changes') : tx('Add {code}', { code: esc(draft.code) })}</span><span class="btn sm" data-act="draft-cancel">${tx('Cancel')}</span></div></div>`;
}
function checkVals(it) {
  const pts = pointsOf(it), failed = pts.filter(([k]) => checking.pts[k] === 'fail'), done = pts.every(([k]) => checking.pts[k]);
  const next = it.every && checking.day ? addMonths(checking.day + 'T00:00:00Z', it.every) : null;
  return { pts, failed, done, next };
}
function checkForm(it, m) {
  const { pts, failed, done, next } = checkVals(it);
  const rows = pts.map(([k, label]) => `<div class="eq-pt"><span>${label}</span><span class="eq-okf" role="group" aria-label="${esc(label)}"><button class="${checking.pts[k] === 'ok' ? 'on ok' : ''}" data-act="pt" data-key="${k}" data-v="ok" aria-pressed="${checking.pts[k] === 'ok'}">${tx('OK')}</button><button class="${checking.pts[k] === 'fail' ? 'on fail' : ''}" data-act="pt" data-key="${k}" data-v="fail" aria-pressed="${checking.pts[k] === 'fail'}">${tx('Fail')}</button></span></div>`).join('');
  const save = failed.length ? tx('Save: out of service') : done ? (next ? tx('Save: checked OK · next due {date}', { date: esc(fmtDate(next)) }) : tx('Save: checked OK')) : tx('Mark each point OK or Fail');
  return `<div class="card mtdet eq-form"><div class="ch"><h3>${tx('Check {code}', { code: esc(it.code) })}</h3>${status(tone(it.st), esc(stText(it, m.day)))}</div>` +
    `<div class="eq-two"><label class="fld"><span>${tx('Checked on')}</span><input type="date" data-check="day" value="${esc(checking.day)}" max="${today()}"></label>${it.every === 0 ? `<label class="fld"><span>${tx('Next due')}</span><input type="date" data-check="due" value="${esc(checking.due)}"></label>` : ''}</div>` +
    `<div class="eq-pts"><div class="eq-pth"><b>${tx('{kind} check', { kind: esc(KIND[it.kind]) })}</b><span class="btn sm" data-act="all-ok">${tx('All OK')}</span></div>${rows}</div>` +
    (failed.length ? `<div class="mt-dup eq-out">${ic('alert')}<span><b>${tx('It fails the check.')}</b> ${tx('{code} goes out of service: marked do not use on the map until a check passes.', { code: esc(it.code) })}</span></div><label class="eq-sw"><input type="checkbox" data-act="issue-toggle"${checking.issue ? ' checked' : ''}> ${tx('Log it in Maintenance too, so it gets fixed')}</label>` : '') +
    `<label class="fld"><span>${tx('Note')}</span><input data-check="note" value="${esc(checking.note)}" maxlength="300" placeholder="${tx('What you saw, or what was fixed')}"></label>` +
    `<div class="acts2" style="display:flex;gap:8px;margin-top:12px"><span class="btn sm ${failed.length ? 'eq-bad' : 'primary'}${done ? '' : ' eq-off'}" data-act="check-save">${ic(failed.length ? 'alert' : 'check')}${save}</span><span class="btn sm" data-act="check-cancel">${tx('Cancel')}</span></div></div>`;
}
function removeForm(it) {
  const why = WHY.map(([k, name, hint]) => `<label class="eq-why${removing.why === k ? ' on' : ''}"><input type="radio" name="eqwhy" data-act="why" data-why="${k}"${removing.why === k ? ' checked' : ''}><span><b>${name}</b><small>${hint}</small></span></label>`).join('');
  return `<div class="card mtdet eq-form"><div class="ch"><h3>${tx('Remove {code}', { code: esc(it.code) })} ${mgr()}</h3></div><div class="mv-sub">${tx('Why is it going?')}</div>${why}` +
    `<label class="fld"><span>${tx('Note')}</span><input data-remove="note" value="${esc(removing.note)}" maxlength="300" placeholder="${tx('Replaced by LAD-04')}"></label>` +
    `<p class="cs-dim" style="margin:0;font-size:12.5px">${tx('It leaves the map, not the history: its checks stay. Undo for a few seconds, or bring it back later from Removed.')}</p>` +
    `<div class="acts2" style="display:flex;gap:8px;margin-top:12px"><span class="btn sm eq-bad${removing.why ? '' : ' eq-off'}" data-act="remove-save">${ic('trash')}${tx('Remove {code}', { code: esc(it.code) })}</span><span class="btn sm" data-act="remove-cancel">${tx('Cancel')}</span></div></div>`;
}

// ── the phone (managers) ──────────────────────────────────────────────────
function badgeText(m) {
  const bad = m.late + m.out;
  return bad ? tx('<b>{n}</b> need attention', { n: bad }) : txn(m.live.length, '<b>{n}</b> piece of equipment', '<b>{n}</b> pieces of equipment');
}
function phoneStrip(m) {
  if (draft) return `${ic('m-equipment')}<b>${draft.editId ? esc(draft.code) : tx('Add equipment')}</b><span class="s">${draft.x != null ? tx('Placed') : tx('Tap the map where it lives')}</span>` +
    (draft.moving && draft.x != null ? `<button class="act go" type="button" data-act="draft-save">${ic('check')}${tx('Save')}</button>` : `<button class="act" type="button" data-act="draft-open">${ic('chev')}${tx('Details')}</button>`);
  const it = m.all.find(x => x.id === selected);
  if (it) return `<span class="mt-sgl">${glyphSvg(it, COLOUR[it.st])}</span><b class="mono">${esc(it.code)}</b><span class="s">${esc(stText(it, m.day))}</span><button class="act" type="button" data-act="back">${ic('x')}${tx('Close')}</button>`;
  const bad = m.late + m.out;
  return `${ic('m-equipment')}<b>${tx('Equipment')}</b>${mgr()}<span class="n${bad ? ' red' : ''}">${m.live.length}</span><span class="s">${bad ? tx('{n} need attention', { n: bad }) : m.soon ? tx('{n} due in 14 days', { n: m.soon }) : ''}</span><button class="act go" type="button" data-act="new">${ic('plus')}${tx('Add')}</button>`;
}
function phone(m, manager) {
  const it = m.all.find(x => x.id === selected);
  if (draft) {
    const kinds = Object.entries(KIND).map(([k, label]) => `<button class="sx-chip${draft.kind === k ? ' on' : ''}" type="button" data-act="draft-kind" data-kind="${k}">${label}</button>`).join('');
    const every = EVERY.map(([n, label]) => `<button class="sx-chip${draft.every === n ? ' on' : ''}" type="button" data-act="draft-every" data-every="${n}">${label}</button>`).join('');
    return `<div class="sx"><div class="sx-h">${ic('m-equipment')}${draft.editId ? tx('Edit {code}', { code: esc(draft.code) }) : tx('Add equipment')}</div><div class="sx-sub">${draft.x != null ? tx('Placed on the map. Tap again to move it.') : tx('Tap the map where it lives.')}</div>` +
      sx.sec(tx('What is it?'), `<div class="sx-chips">${kinds}</div>`) +
      sx.sec(tx('Code'), `<input class="sx-in mono" data-draft="code" value="${esc(draft.code)}" maxlength="16" autocapitalize="characters" aria-label="${tx('Code')}">`, tx('or the number on its tag')) +
      sx.sec(tx('Description'), `<input class="sx-in" data-draft="name" value="${esc(draft.name)}" maxlength="80" placeholder="${esc(KIND[draft.kind])}" aria-label="${tx('Description')}">`, tx('optional')) +
      sx.sec(tx('Where it lives'), `<input class="sx-in" data-draft="loc" value="${esc(draft.loc)}" maxlength="60" placeholder="${tx('Stockroom, by bay 7012')}" aria-label="${tx('Where it lives')}">`) +
      sx.sec(tx('Checked how often?'), `<div class="sx-chips">${every}</div>`) +
      (draft.editId ? '' : sx.sec(tx('Last checked'), `<input class="sx-in" type="date" data-draft="last" value="${esc(draft.last || '')}" max="${today()}" aria-label="${tx('Last checked')}">`)) +
      (draft.every === 0 || draft.editId ? sx.sec(tx('Next due'), `<input class="sx-in" type="date" data-draft="due" value="${esc(draft.due || '')}" aria-label="${tx('Next due')}">`) : '') +
      sx.acts([sx.btn('check', draft.editId ? tx('Save changes') : tx('Add {code}', { code: esc(draft.code) }), 'data-act="draft-save"', true), sx.btn('x', tx('Cancel'), 'data-act="draft-cancel"')]) + `</div>`;
  }
  if (it && checking) {
    const { pts, failed, done, next } = checkVals(it);
    const rows = pts.map(([k, label]) => `<div class="eq-pt dark"><span>${label}</span><span class="eq-okf" role="group" aria-label="${esc(label)}"><button class="${checking.pts[k] === 'ok' ? 'on ok' : ''}" type="button" data-act="pt" data-key="${k}" data-v="ok" aria-pressed="${checking.pts[k] === 'ok'}">${tx('OK')}</button><button class="${checking.pts[k] === 'fail' ? 'on fail' : ''}" type="button" data-act="pt" data-key="${k}" data-v="fail" aria-pressed="${checking.pts[k] === 'fail'}">${tx('Fail')}</button></span></div>`).join('');
    const save = failed.length ? tx('Save: out of service') : done ? (next ? tx('Save: checked OK · next due {date}', { date: esc(fmtDate(next)) }) : tx('Save: checked OK')) : tx('Mark each point OK or Fail');
    return `<div class="sx"><div class="sx-h"><span class="mt-sgl">${glyphSvg(it, COLOUR[it.st])}</span>${tx('Check {code}', { code: esc(it.code) })}</div><div class="sx-sub">${esc(nameOf(it))}${it.loc ? ' · ' + esc(it.loc) : ''}</div>` +
      sx.sec(tx('Checked on'), `<input class="sx-in" type="date" data-check="day" value="${esc(checking.day)}" max="${today()}" aria-label="${tx('Checked on')}">`) +
      sx.sec(tx('{kind} check', { kind: esc(KIND[it.kind]) }), rows, `<button class="sx-link" type="button" data-act="all-ok">${tx('All OK')}</button>`) +
      (failed.length ? `<div class="mt-dup">${ic('alert')}<span>${tx('{code} goes out of service: marked do not use on the map until a check passes.', { code: esc(it.code) })}</span></div><label class="eq-sw dark"><input type="checkbox" data-act="issue-toggle"${checking.issue ? ' checked' : ''}> ${tx('Log it in Maintenance too, so it gets fixed')}</label>` : '') +
      (it.every === 0 ? sx.sec(tx('Next due'), `<input class="sx-in" type="date" data-check="due" value="${esc(checking.due)}" aria-label="${tx('Next due')}">`) : '') +
      sx.sec(tx('Note'), `<input class="sx-in" data-check="note" value="${esc(checking.note)}" maxlength="300" placeholder="${tx('What you saw, or what was fixed')}" aria-label="${tx('Note')}">`, tx('optional')) +
      sx.acts([sx.btn(failed.length ? 'alert' : 'check', save, `data-act="check-save"${done ? '' : ' disabled'}`, true), sx.btn('x', tx('Cancel'), 'data-act="check-cancel"')]) + `</div>`;
  }
  if (it && removing) {
    const why = WHY.map(([k, name, hint]) => sx.row(removing.why === k ? 'check' : 'minus', name, hint, '', '', `data-act="why" data-why="${k}" role="button" tabindex="0" aria-pressed="${removing.why === k}"`));
    return `<div class="sx"><div class="sx-h">${ic('trash')}${tx('Remove {code}', { code: esc(it.code) })}${mgr()}</div><div class="sx-sub">${tx('It leaves the map, not the history: its checks stay. Undo for a few seconds, or bring it back later from Removed.')}</div>` +
      sx.sec(tx('Why is it going?'), sx.rows(why)) + sx.sec(tx('Note'), `<input class="sx-in" data-remove="note" value="${esc(removing.note)}" maxlength="300" aria-label="${tx('Note')}">`, tx('optional')) +
      sx.acts([sx.btn('trash', tx('Remove {code}', { code: esc(it.code) }), `data-act="remove-save"${removing.why ? '' : ' disabled'}`, true), sx.btn('x', tx('Cancel'), 'data-act="remove-cancel"')]) + `</div>`;
  }
  if (it) {
    return `<div class="sx"><div class="sx-h"><span class="mt-sgl">${glyphSvg(it, COLOUR[it.st])}</span><span class="mono">${esc(it.code)}</span><span class="n${it.st === 'late' || it.st === 'out' ? ' red' : ''}">${esc(stText(it, m.day))}</span></div><div class="sx-sub">${esc(nameOf(it))}${it.loc ? ' · ' + esc(it.loc) : ''}</div>` +
      (it.out ? `<div class="mt-dup">${ic('alert')}<span>${tx('Out of service: do not use')}${it.out.note ? ' · ' + esc(it.out.note) : ''}</span></div>` : '') +
      `<div class="sx-sec">${sx.facts(facts(it, m))}</div>` +
      sx.acts(it.removed ? [manager ? sx.btn('refresh', tx('Bring it back'), 'data-act="restore"', true) : ''] : [sx.btn('listcheck', tx('Record a check'), 'data-act="check"', true), it.x != null ? sx.btn('pin', tx('Show on map'), 'data-act="show"') : '', sx.btn('pin', it.x != null ? tx('Move on the map') : tx('Put it on the map'), 'data-act="move"'), sx.btn('edit', tx('Edit'), 'data-act="edit"'), manager ? sx.btn('trash', tx('Remove'), 'data-act="remove"') : '']) +
      sx.sec(tx('Checks'), sx.rows(logRows(it).map(l => sx.row('history', esc(l.what), esc(l.note), esc(l.when))))) +
      sx.acts([sx.btn('x', tx('Back to the list'), 'data-act="back"')]) + `</div>`;
  }
  const r = x => sx.row(`<span class="mt-sgl">${glyphSvg(x, COLOUR[x.st])}</span>`, `<span class="mono">${esc(x.code)}</span> ${esc(nameOf(x))}`, esc(x.loc || tx('Not on the map')), esc(stText(x, m.day)), x.st === 'late' || x.st === 'out' ? 'bad' : x.st === 'soon' ? 'warn' : 'dim', `data-act="select" data-id="${esc(x.id)}"`);
  const chips = GROUPS.filter(([g]) => g === 'all' || m.live.some(x => EQUIP_GROUP[x.kind] === g)).map(([g, label]) => `<button class="sx-chip${!showRemoved && filter === g ? ' on' : ''}" type="button" data-act="filter" data-filter="${g}">${label}</button>`).join('') + (m.removed.length ? `<button class="sx-chip${showRemoved ? ' on' : ''}" type="button" data-act="removed">${tx('Removed {n}', { n: m.removed.length })}</button>` : '');
  return `<div class="sx"><div class="sx-h">${ic('m-equipment')}${tx('Equipment')}<span class="n${m.late + m.out ? ' red' : ''}">${txn(m.live.length, '{n} piece', '{n} pieces')}</span></div>` +
    sx.acts([sx.btn('plus', tx('Add equipment'), 'data-act="new"', true)]) + `<div class="sx-chips" style="margin-top:10px">${chips}</div>` +
    sx.sec(showRemoved ? tx('Removed') : tx('Equipment'), m.list.length ? sx.rows(m.list.slice(0, 80).map(r)) : sx.rows([sx.row('check', m.live.length || showRemoved ? tx('Nothing here.') : tx('No equipment yet'))]), tx('tap one to open it')) + `</div>`;
}

// ── paper ─────────────────────────────────────────────────────────────────
// QR labels to stick on each item: scanning one opens its card on a store
// device (a manager's phone, or any store PC).
function printLabels(ctx, list) {
  const store = tx('{name} · store {no}', { name: esc(ctx.storeName || ''), no: esc(ctx.storeNo) });
  const body = `<div class="eq-labels">${list.map(it => `<div class="eq-label"><div class="eq-lq">${qrSvg(equipLink(ctx.storeNo, it.id), { cell: 3 }) || ''}</div><div class="eq-lt"><b>${esc(it.code)}</b><span>${esc(nameOf(it))}</span><small>${tx('Checked {every}. Scan to see its checks or record one.', { every: everyText(it) })}</small><small>${store}</small></div></div>`).join('')}</div>`;
  printSheet({ title: tx('Equipment labels'), subtitle: store, body });
}
// The walk sheet: every item with its next due date and a tick box.
function printCheckSheet(ctx, m) {
  const fls = mapFloors(), store = tx('{name} · store {no}', { name: esc(ctx.storeName || ''), no: esc(ctx.storeNo) });
  const rows = [...m.live].sort(byNeed).map(it => [tick, `<b>${esc(it.code)}</b> ${esc(nameOf(it))}`, esc(it.loc || '') + (fls.length > 1 && it.floor ? ` · ${esc(fls.find(f => f.id === it.floor)?.name || '')}` : ''), everyText(it), esc(stText(it, m.day)), '']);
  printSheet({ title: tx('Equipment check sheet'), subtitle: tx('{store} · check each one, then record it in Conduit', { store }), body: table(['✓', tx('Equipment'), tx('Where'), tx('How often'), tx('Due'), tx('OK / Fail and note')], rows, ['tk', 'w25', 'w20', 'w12', 'w15', '']) + signoff(tx('Checked by')) });
}

// For the Today page and the rail's badge: what needs a person now.
export function equipmentNeeds(store) {
  const day = today(), live = Object.values(store.get('equipment')?.items || {}).filter(it => !it.removed).map(it => equipStatus(it, day));
  return { late: live.filter(s => s === 'late').length, out: live.filter(s => s === 'out').length, soon: live.filter(s => s === 'soon').length, total: live.length };
}
