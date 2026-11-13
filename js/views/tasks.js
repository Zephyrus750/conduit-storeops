// Tasks (the owner's note on the store walk, 11 Nov 2026): the checklists
// the managers keep, each with its area, who it is for, its days and its
// items, and each day's walk of them. On the PC, Tasks · today lists the
// checklists due today by area with their progress, the photos the walks
// took, what the walks raised and where it went, and the checklists to
// edit; Walks lists the walks of the last 90 days. On a manager's phone a
// checklist is walked item by item, ✓ or ✗ in one tap; a ✗ takes a photo
// (Maintenance's camera and upload), a note, and where it goes: a bay's
// backfill list (submission.request, as Backfill review requests a bay), a
// Maintenance issue (issue.log with the same photo), or noted on the walk.
// Reads store.get('tasks') (shared/reducers/tasks.js); the PC repaints as
// the phone's events arrive.

import { ic, esc, vh, sub, toast, mgr, today, fmtDay, empty, mhead, camButton, DEPT_NAME, DEPT_GROUPS } from '../ui.js';
import { openSheet, ask } from '../sheet.js';
import { printSheet, table, signoff, section, tick } from '../print.js';
import { tx, txn } from '../i18n.js';
import { dueOn, walkKey, walkCounts, ITEMS_MAX } from '../../shared/reducers/tasks.js';
import { addDays } from '../../shared/time.js';
import { toolOff } from '../../shared/tools.js';
import { phoneCode } from '../../shared/backfill.js';
import { postPhoto, photoError, loadThumbs, thumbs, openPhoto, dropPhotoWhenSent } from './maintenance.js';

const isManager = s => (s?.roles || []).includes('manager') || !!s?.owner;
const tasksOf = ctx => ctx.store.get('tasks') || { lists: {}, walks: {} };
// The phone: the checklist being walked, its summary, or its answers again.
const st = { walk: null, summary: false };
const AREA_NAME = { store: tx('Store'), backdock: tx('Back dock'), stockroom: tx('Stockroom') };
export const areaName = x => (x.area === 'dept' ? DEPT_NAME[x.dept] || String(x.dept || '').toUpperCase() : AREA_NAME[x.area] || '');
const DOW = [[1, tx('Mon')], [2, tx('Tue')], [3, tx('Wed')], [4, tx('Thu')], [5, tx('Fri')], [6, tx('Sat')], [7, tx('Sun')]];
const daysText = days => (days.length === 7 ? tx('Every day') : days.join() === '1,2,3,4,5' ? tx('Weekdays') : days.map(d => DOW[d - 1][1]).join(', '));
const pad = n => String(n).padStart(2, '0');
const hm = iso => { const d = iso instanceof Date ? iso : new Date(iso); return isNaN(d) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const whoLine = v => [v.who ? esc(v.who) : '', v.due ? tx('by {time}', { time: v.due }) : ''].filter(Boolean).join(' · ');
const rid = (p, n = 6) => p + Math.random().toString(36).slice(2, 2 + n);
const BAR = { bad: 'var(--red)', good: 'var(--green)', warn: 'var(--amber)', late: 'var(--amber)', info: 'var(--accent)', dim: 'var(--accent)' };

// Where a ✗ can go on this store and device: Backfill needs the Stockroom
// and its tool, an issue needs Maintenance.
function routes(ctx) {
  const off = ctx.store.get('tools')?.off || [], caps = ctx.session.current?.caps || [];
  return { backfill: caps.includes('stockroom') && !toolOff(off, 'backfill'), issue: !toolOff(off, 'maintenance'), find: caps.includes('stockroom') && !toolOff(off, 'livepull') };
}

// ── today ─────────────────────────────────────────────────────────────
// Each checklist due today and any walked today (a walk keeps its checklist
// as it was, so one whose checklist was removed still shows), by due time.
function model(ctx) {
  const t = tasksOf(ctx), day = today(), rows = [];
  for (const l of Object.values(t.lists)) { const w = t.walks[walkKey(l.id, day)]; if (dueOn(l, day) || (w && !l.removed)) rows.push({ id: l.id, v: w || l, w }); }
  for (const w of Object.values(t.walks)) if (w.day === day && !rows.some(r => r.id === w.list)) rows.push({ id: w.list, v: w, w });
  rows.sort((a, b) => (a.v.due || '99').localeCompare(b.v.due || '99') || a.v.name.localeCompare(b.v.name));
  const walks = rows.filter(r => r.w).map(r => r.w);
  const answers = walks.flatMap(w => w.items.filter(it => w.answers[it.id]).map(it => ({ w, it, a: w.answers[it.id] })));
  const raised = answers.filter(x => x.a.sent && x.a.sent.to !== 'note').sort((a, b) => b.a.at.localeCompare(a.a.at));
  const photos = answers.filter(x => x.a.photo).sort((a, b) => b.a.at.localeCompare(a.a.at));
  const lists = Object.values(t.lists).filter(l => !l.removed).sort((a, b) => a.name.localeCompare(b.name));
  const left = rows.filter(r => !r.w?.done).length;
  return { t, day, rows, raised, photos, lists, left };
}
// Where a checklist stands today: its words and tone, as the PC and the phone show it.
function stateOf(v, w, day) {
  const c = walkCounts(w), shot = w ? Object.values(w.answers).some(a => a.a === 'n' && a.photo) : false;
  if (c.n) return ['bad', shot ? tx('{n} ✗ · photo', { n: c.n }) : tx('{n} ✗', { n: c.n })];
  if (w?.done) return ['good', tx('Done {time}', { time: hm(w.done) })];
  if (w) return ['info', tx('In progress')];
  if (v.due) return day === today() && hm(new Date()) > v.due ? ['late', tx('Late · due {time}', { time: v.due })] : ['warn', tx('Due {time}', { time: v.due })];
  return ['dim', tx('Not yet')];
}
const progress = (v, w) => { const c = walkCounts(w), of = w ? c.of : v.items.length; return { n: c.answered, of, pct: of ? Math.round(100 * c.answered / of) : 0 }; };
const sentShort = s => (!s || s.to === 'note' ? '' : s.to === 'issue' ? tx('Raised in Maintenance') : tx('On {bay}’s backfill list', { bay: esc(s.bay) }));
function sentLine(ctx, s) {
  if (s.to === 'note') return tx('Noted on the walk');
  if (s.to === 'backfill') return tx('On {bay}’s backfill list', { bay: `<b>${esc(s.bay)}</b>` }) + (s.kc ? ` · <span class="mono">${esc(s.kc)}</span>` : '');
  const i = ctx.store.get('issues')?.[s.issue];
  return i ? tx('Raised in Maintenance: {title}', { title: esc(i.title) }) : tx('Raised in Maintenance');
}
const img = (id, alt) => { const u = thumbs.get(id); return u && u !== 'gone' ? `<img src="${esc(u)}" alt="${esc(alt)}">` : u === 'gone' ? `<span class="tk-gone">${tx('expired')}</span>` : ic('camera'); };

function todayRow(r, day) {
  const p = progress(r.v, r.w), [tone, word] = stateOf(r.v, r.w, day);
  return `<button type="button" class="tk-row" data-act="walk" data-list="${esc(r.id)}" data-day="${day}"><span class="tk-area">${esc(areaName(r.v))}</span>` +
    `<span class="tk-nm"><b>${esc(r.v.name)}</b><small>${whoLine(r.v)}</small></span>` +
    `<span class="tk-pr"><span class="tk-bar"><i style="width:${p.pct}%;background:${BAR[tone]}"></i></span><small>${tx('{n} of {m}', { n: p.n, m: p.of })}</small></span><span class="tk-st ${tone}">${word}</span></button>`;
}
function desk(ctx) {
  const m = model(ctx);
  const head = vh(tx('Tasks · today'), sub(esc(fmtDay(m.day)), txn(m.rows.length, '{n} checklist', '{n} checklists'), m.rows.length ? tx('{n} still to do', { n: m.left }) : '', m.raised.length ? txn(m.raised.length, '{n} raised from walks', '{n} raised from walks') : ''),
    `<button class="btn" data-act="print"${m.rows.length ? '' : ' disabled'}>${ic('print')}${tx('Print today’s')}</button><button class="btn primary" data-act="new">${ic('plus')}${tx('New checklist')}</button>`, 'm-tasks');
  if (!m.lists.length && !m.rows.length) return head + `<div class="card">${empty(tx('No checklists yet. Write the first: its area, who walks it, the days it is due and what to check, one line each.'), { icon: 'm-tasks', act: `<button class="btn primary" data-act="new">${ic('plus')}${tx('New checklist')}</button>` })}</div>`;
  const due = `<section class="card tk-today" aria-label="${tx('Today’s checklists')}"><div class="ch"><h3>${tx('Today’s checklists')}</h3><span class="cs-dim">${tx('by area, with who it is for')}</span></div>` +
    (m.rows.length ? `<div class="tk-rows">${m.rows.map(r => todayRow(r, m.day)).join('')}</div>` : empty(tx('Nothing is due today.'), { icon: 'check', sm: true })) + `</section>`;
  const photos = `<section class="card tk-photos" aria-label="${tx('Photos from today’s walks')}"><div class="ch"><h3>${tx('Photos from today’s walks')}</h3><span class="cs-dim">${tx('each one is on its walk, and on the issue it raised')}</span></div>` +
    (m.photos.length ? `<div class="tk-pics">${m.photos.map(({ w, it, a }) => `<button type="button" class="tk-pic" data-act="photo" data-photo="${esc(a.photo)}"><span class="tk-img">${img(a.photo, it.t)}<span class="tk-tag ${a.a}">${a.a === 'y' ? '✓' : '✗'} ${esc(areaName(w))}</span></span><b>${esc(it.t)}</b><small>${[w.who ? esc(w.who) : '', hm(a.at), sentShort(a.sent)].filter(Boolean).join(' · ')}</small></button>`).join('')}</div>`
      : empty(tx('No photos yet today. A ✗ on a walk asks for one.'), { icon: 'camera', sm: true })) + `</section>`;
  const raised = `<section class="card tk-raised" aria-label="${tx('Raised from walks')}"><div class="ch"><h3>${tx('Raised from walks')}</h3><span class="cs-dim">${tx('each ✗ that went somewhere')}</span></div>` +
    (m.raised.length ? `<div class="tk-rzs">${m.raised.map(({ w, it, a }) => `<button type="button" class="tk-rz" data-act="raised" data-to="${a.sent.to}" data-ref="${esc(a.sent.issue || a.sent.bay)}"><i class="tk-dot ${a.sent.to}"></i><span class="tk-nm"><b>${esc(it.t)}</b><small>${[esc(w.name), w.who ? esc(w.who) : '', hm(a.at), a.photo ? tx('photo') : ''].filter(Boolean).join(' · ')}</small></span><span class="tk-to">${a.sent.to === 'issue' ? tx('Maintenance') : tx('Backfill {bay}', { bay: esc(a.sent.bay) })}</span></button>`).join('')}</div>`
      : empty(tx('Nothing raised yet today.'), { icon: 'check', sm: true })) + `</section>`;
  const lists = `<section class="card tk-lists" aria-label="${tx('Checklists the managers keep')}"><div class="ch"><h3>${tx('Checklists the managers keep')}</h3><span class="cs-dim">${txn(m.lists.length, '{n} checklist', '{n} checklists')}</span></div>` +
    (m.lists.length ? `<div class="tk-lis">${m.lists.map(l => `<button type="button" class="tk-li" data-act="edit" data-list="${esc(l.id)}"><span class="tk-nm"><b>${esc(l.name)}</b><small>${[esc(areaName(l)), l.who ? esc(l.who) : '', txn(l.items.length, 'checklist::{n} item', 'checklist::{n} items'), esc(daysText(l.days)), l.due ? tx('by {time}', { time: l.due }) : ''].filter(Boolean).join(' · ')}</small></span>${ic('edit')}</button>`).join('')}</div>`
      : empty(tx('Every checklist was removed. Write a new one.'), { icon: 'm-tasks', sm: true })) + `</section>`;
  return head + `<div class="tk-grid"><div class="tk-col">${due}${photos}</div><div class="tk-col">${raised}${lists}</div></div>`;
}

// ── a walk on the PC: its answers, photos and where each ✗ went ─────────
let detail = null;   // { sheet, list, day }
function walkBody(ctx, list, day) {
  const t = tasksOf(ctx), w = t.walks[walkKey(list, day)], v = w || t.lists[list];
  if (!v) return empty(tx('That checklist is no longer on the list.'), { sm: true });
  const c = walkCounts(w);
  const head = w ? `<div class="tk-tiles"><span class="g"><b>${c.y}</b>${tx('✓ fine')}</span><span class="r"><b>${c.n}</b>${tx('✗ to fix')}</span><span class="n"><b>${c.photos}</b>${tx('Photos')}</span></div><p class="tk-when">${timesLine(w)}</p>`
    : empty(tx('Not started yet. A manager walks it on a phone, under Tasks.'), { icon: 'm-tasks', sm: true });
  const ids = w ? Object.values(w.answers).map(a => a.photo).filter(Boolean) : [];
  if (ids.length) loadThumbs(ctx, ids, () => repaintDetail(ctx));
  const rows = (w ? w.items : v.items).map(it => { const a = w?.answers[it.id]; return `<div class="tk-ans ${a ? a.a : 'none'}"><span class="tk-mk">${a ? ic(a.a === 'y' ? 'check' : 'x') : ''}</span><div class="tk-at"><b>${esc(it.t)}</b>${a?.note ? `<small>${esc(a.note)}</small>` : ''}${a?.sent ? `<small class="tk-sent">${sentLine(ctx, a.sent)}</small>` : ''}${a ? `<small class="cs-dim">${hm(a.at)}</small>` : ''}</div>${a?.photo ? `<button type="button" class="tk-th" data-act="photo" data-photo="${esc(a.photo)}" aria-label="${tx('Open the photo')}">${img(a.photo, it.t)}</button>` : ''}</div>`; }).join('');
  return head + `<div class="tk-anss">${rows}</div>` + (w?.trimmed ? `<p class="cs-dim">${tx('Older than 14 days: only its ✗ and photographed answers are kept.')}</p>` : '');
}
function timesLine(w) {
  const mins = w.done ? Math.max(1, Math.round((Date.parse(w.done) - Date.parse(w.started)) / 60000)) : 0;
  return [w.who ? esc(w.who) : '', esc(fmtDay(w.day)), w.done ? tx('{from} to {to}', { from: hm(w.started), to: hm(w.done) }) : tx('started {time}', { time: hm(w.started) }), w.done ? txn(mins, '{n} min', '{n} min') : ''].filter(Boolean).join(' · ');
}
function repaintDetail(ctx) { if (detail && !detail.sheet.closed) detail.sheet.set({ body: walkBody(ctx, detail.list, detail.day) }); }
function openWalk(ctx, list, day) {
  const t = tasksOf(ctx), v = t.walks[walkKey(list, day)] || t.lists[list]; if (!v) return;
  const live = t.lists[list] && !t.lists[list].removed;
  const sheet = openSheet({
    kind: 'side', cls: 'tk-det', title: esc(v.name), sub: [esc(areaName(v)), whoLine(v)].filter(Boolean).join(' · '), body: walkBody(ctx, list, day),
    foot: `${live ? `<button type="button" class="btn" data-dt="edit">${ic('edit')}${tx('Edit checklist')}</button>` : ''}<button type="button" class="btn" data-dt="print">${ic('print')}${tx('Print')}</button>`,
    onClose: () => { if (detail?.sheet === sheet) detail = null; },
    onClick: e => {
      const ph = e.target.closest('[data-act="photo"]'); if (ph) return openPhoto(thumbs.get(ph.dataset.photo), tx('Photo from a walk'));
      const b = e.target.closest('[data-dt]'); if (!b) return;
      if (b.dataset.dt === 'edit') { sheet.close(); openEditor(ctx, list); }
      else printWalks(ctx, [{ id: list, v: tasksOf(ctx).walks[walkKey(list, day)] || tasksOf(ctx).lists[list], w: tasksOf(ctx).walks[walkKey(list, day)] }], day);
    },
  });
  detail = { sheet, list, day };
}

// ── the checklist editor (PC) ────────────────────────────────────────────
function editorBody(d) {
  const depts = Object.keys(DEPT_NAME).length ? Object.keys(DEPT_NAME) : DEPT_GROUPS.flatMap(g => g[2]);
  const opt = (v, l) => `<option value="${esc(v)}"${d.area === v ? ' selected' : ''}>${esc(l)}</option>`;
  const lines = d.text.split('\n').map(s => s.trim()).filter(Boolean).length;
  return `<label class="askf"><span>${tx('Name')}</span><input data-ed="name" maxlength="60" value="${esc(d.name)}" placeholder="${tx('Opening checks')}" autocomplete="off"></label>` +
    `<label class="askf"><span>${tx('Area')}</span><select data-ed="area">${opt('store', tx('Store'))}${opt('backdock', tx('Back dock'))}${opt('stockroom', tx('Stockroom'))}<optgroup label="${tx('Departments')}">${depts.map(id => opt('dept:' + id, `${id.toUpperCase()} ${DEPT_NAME[id] || ''}`.trim())).join('')}</optgroup></select></label>` +
    `<label class="askf"><span>${tx('Who it is for')}</span><input data-ed="who" maxlength="60" value="${esc(d.who)}" placeholder="${tx('Store manager, D1, Homewares manager')}" autocomplete="off"><small>${tx('A role or a person, as the store says it.')}</small></label>` +
    `<div class="askf"><span>${tx('Days')}</span><div class="tk-days" role="group" aria-label="${tx('Days')}">${DOW.map(([n, l]) => `<button type="button" class="tk-day${d.days.includes(n) ? ' on' : ''}" data-ed-day="${n}" aria-pressed="${d.days.includes(n)}">${l}</button>`).join('')}</div>` +
    `<div class="tk-quick"><button type="button" class="btn sm" data-ed-days="all">${tx('Every day')}</button><button type="button" class="btn sm" data-ed-days="wk">${tx('Weekdays')}</button></div></div>` +
    `<label class="askf"><span>${tx('Due by (optional)')}</span><input type="time" data-ed="due" value="${esc(d.due)}"></label>` +
    `<label class="askf"><span>${tx('What to check')}</span><textarea data-ed="items" rows="12" placeholder="${tx('Aisles clear of cartons and cages')}">${esc(d.text)}</textarea><small data-ed-count>${txn(lines, 'checklist::{n} item', 'checklist::{n} items')} · ${tx('one line each, up to {max}', { max: ITEMS_MAX })}</small></label>`;
}
function openEditor(ctx, id) {
  const l = id ? tasksOf(ctx).lists[id] : null;
  const d = { id: id || rid('t', 10), name: l?.name || '', area: l ? (l.area === 'dept' ? 'dept:' + l.dept : l.area) : 'store', who: l?.who || '', days: l ? [...l.days] : [1, 2, 3, 4, 5, 6, 7], due: l?.due || '', text: l ? l.items.map(i => i.t).join('\n') : '' };
  const read = () => { for (const k of ['name', 'area', 'who', 'due']) d[k] = sheet.el.querySelector(`[data-ed="${k}"]`).value.trim(); d.text = sheet.el.querySelector('[data-ed="items"]').value; };
  const paint = () => { read(); sheet.set({ body: editorBody(d) }); };
  const sheet = openSheet({
    kind: 'side', cls: 'tk-ed', title: l ? tx('Edit checklist') : tx('New checklist'), sub: l ? esc(l.name) : tx('Its area, who it is for, its days and what to check'), body: editorBody(d),
    foot: `${l ? `<button type="button" class="btn ghost danger tk-rm" data-ed-act="remove">${ic('trash')}${tx('Remove')}</button>` : ''}<button type="button" class="btn" data-ed-act="cancel">${tx('Cancel')}</button><button type="button" class="btn primary" data-ed-act="save">${ic('check')}${tx('Save checklist')}</button>`,
    onClick: async e => {
      const day = e.target.closest('[data-ed-day]'), quick = e.target.closest('[data-ed-days]'), act = e.target.closest('[data-ed-act]')?.dataset.edAct;
      if (day) { const n = Number(day.dataset.edDay); d.days = d.days.includes(n) ? d.days.filter(x => x !== n) : [...d.days, n].sort(); return paint(); }
      if (quick) { d.days = quick.dataset.edDays === 'all' ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5]; return paint(); }
      if (act === 'cancel') return sheet.close();
      if (act === 'remove') {
        if (!await ask({ title: tx('Remove "{title}"?', { title: l.name }), text: [tx('It leaves every list on every device.'), tx('Its walks stay in the store’s record.')], ok: tx('Remove checklist') })) return;
        try { await ctx.store.dispatch({ type: 'task.list.remove', entity: { list: id }, payload: {} }); toast(tx('Checklist removed')); sheet.close(); } catch (err) { toast(err.message, 'bad'); }
        return;
      }
      if (act !== 'save') return;
      read();
      const lines = d.text.split('\n').map(s => s.trim()).filter(Boolean);
      if (!d.name) return toast(tx('Give the checklist a name'), 'bad');
      if (!d.days.length) return toast(tx('Pick at least one day'), 'bad');
      if (!lines.length) return toast(tx('Write at least one thing to check'), 'bad');
      if (lines.length > ITEMS_MAX) return toast(tx('At most {max} things to check', { max: ITEMS_MAX }), 'bad');
      // An item keeps its id while its words stay the same.
      const pool = new Map(); for (const it of l?.items || []) pool.set(it.t, [...(pool.get(it.t) || []), it.id]);
      const used = new Set(), items = lines.map(t => { let iid = pool.get(t)?.shift(); while (!iid || used.has(iid)) iid = rid('i'); used.add(iid); return { id: iid, t }; });
      const [area, dept] = d.area.startsWith('dept:') ? ['dept', d.area.slice(5)] : [d.area, undefined];
      sheet.busy(true);
      try {
        await ctx.store.dispatch({ type: 'task.list.set', entity: { list: d.id }, payload: { name: d.name, area, ...(dept ? { dept } : {}), who: d.who, days: d.days, due: d.due, items } });
        toast(l ? tx('Checklist saved') : tx('Checklist added: it shows on the managers’ phones on its days')); sheet.busy(false); sheet.close();
      } catch (err) { sheet.busy(false); if (err.code === 'unchanged') sheet.close(); else toast(err.message, 'bad'); }
    },
  });
  sheet.el.addEventListener('input', e => {
    if (!e.target.matches('[data-ed="items"]')) return;
    const n = e.target.value.split('\n').map(s => s.trim()).filter(Boolean).length, c = sheet.el.querySelector('[data-ed-count]');
    if (c) { c.textContent = `${txn(n, 'checklist::{n} item', 'checklist::{n} items')} · ${tx('one line each, up to {max}', { max: ITEMS_MAX })}`; c.classList.toggle('bad', n > ITEMS_MAX); }
  });
}

// ── paper: today's checklists to walk with a pen ─────────────────────────
function printWalks(ctx, rows, day) {
  const fact = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  const body = rows.map(r => {
    const v = r.v, w = r.w;
    const items = (w ? w.items : v.items).map(it => { const a = w?.answers[it.id]; return [esc(it.t), a?.a === 'y' ? '✓' : tick, a?.a === 'n' ? '✗' : tick, [a?.note ? esc(a.note) : '', sentShort(a?.sent)].filter(Boolean).join(' · ')]; });
    return section(esc(v.name), `<div class="ps-facts">${fact(tx('Area'), esc(areaName(v)))}${fact(tx('Who'), esc(v.who || '—'))}${fact(tx('Due'), esc(v.due || '—'))}${fact(tx('Walked'), w ? timesLine(w) : '—')}</div>` +
      table([tx('What to check'), '✓', '✗', tx('Note')], items, ['', 'tk', 'tk', 'w']) + signoff(tx('Walked by')));
  }).join('');
  printSheet({ title: tx('Today’s checklists'), subtitle: tx('{name} · store {no}', { name: esc(ctx.storeName || ''), no: esc(ctx.storeNo) }) + ' · ' + esc(fmtDay(day)), body });
}

// ── the phone (managers): today's checklists, the walk, the summary ─────
function phoneHome(ctx) {
  const m = model(ctx), others = m.lists.filter(l => !m.rows.some(r => r.id === l.id));
  const card = r => { const p = progress(r.v, r.w), [tone, word] = stateOf(r.v, r.w, m.day); return `<button type="button" class="tk-card" data-act="m-open" data-list="${esc(r.id)}"><span class="tk-area">${esc(areaName(r.v))}</span><b>${esc(r.v.name)}</b><small>${whoLine(r.v)}</small><span class="tk-pr"><span class="tk-bar"><i style="width:${p.pct}%;background:${BAR[tone]}"></i></span><small>${tx('{n} of {m}', { n: p.n, m: p.of })}</small><span class="tk-st ${tone}">${word}</span></span></button>`; };
  return `<div class="tk-m">` + mhead(`${tx('Tasks')} ${mgr()}`, [esc(fmtDay(m.day)), m.rows.length ? tx('{n} still to do', { n: m.left }) : ''].filter(Boolean).join(' · ')) +
    (m.rows.length ? `<div class="tk-cards">${m.rows.map(card).join('')}</div>` : `<div class="card">${empty(m.lists.length ? tx('Nothing is due today.') : tx('No checklists yet. Managers write them on a store PC, under Tasks.'), { icon: 'm-tasks' })}</div>`) +
    (others.length ? `<div class="tk-lbl">${tx('Not due today')}</div><div class="tk-others">${others.map(l => `<button type="button" class="tk-other" data-act="m-open" data-list="${esc(l.id)}"><span class="tk-nm"><b>${esc(l.name)}</b><small>${esc(areaName(l))} · ${esc(daysText(l.days))}</small></span>${ic('chev')}</button>`).join('')}</div>` : '') + `</div>`;
}
function phoneWalk(ctx) {
  const t = tasksOf(ctx), day = today(), w = t.walks[walkKey(st.walk, day)], v = w || t.lists[st.walk];
  if (!v) { st.walk = null; return phoneHome(ctx); }
  if (w?.done && st.summary) return phoneDone(ctx, w);
  const p = progress(v, w), meta = [fmtDay(day), v.due ? tx('due {time}', { time: v.due }) : '', v.who].filter(Boolean).map(esc).join(' · ');
  const rows = (w ? w.items : v.items).map(it => {
    const a = w?.answers[it.id], y = a?.a === 'y', n = a?.a === 'n';
    return `<div class="tk-it${y ? ' y' : n ? ' n' : ''}"><span class="tk-it-t">${esc(it.t)}${a?.note || a?.photo || a?.sent ? `<small>${a.photo ? ic('camera') : ''}<span>${[a.note ? esc(a.note) : '', a.sent ? sentShort(a.sent) || tx('Noted on the walk') : ''].filter(Boolean).join(' · ')}</span></small>` : ''}</span>` +
      `<button type="button" class="tk-yn y${y ? ' on' : ''}" data-act="m-y" data-item="${esc(it.id)}" aria-pressed="${y}" aria-label="${tx('✓ fine')}">${ic('check')}</button><button type="button" class="tk-yn n${n ? ' on' : ''}" data-act="m-n" data-item="${esc(it.id)}" aria-pressed="${n}" aria-label="${tx('✗ to fix')}">${ic('x')}</button></div>`;
  }).join('');
  return `<div class="tk-m tk-walk"><div class="tk-wh"><button type="button" class="ibtn tk-back" data-act="m-back" aria-label="${tx('Back to Tasks')}" title="${tx('Back to Tasks')}">${ic('chev')}</button><b>${esc(v.name)}</b><span class="tk-n">${tx('{n} of {m}', { n: p.n, m: p.of })}</span></div>` +
    `<div class="tk-wbar" role="progressbar" aria-valuemin="0" aria-valuemax="${p.of}" aria-valuenow="${p.n}"><i style="width:${p.pct}%"></i></div><div class="tk-lbl">${meta}</div>` +
    `<div class="tk-items">${rows}</div>` + (w?.done ? `<button type="button" class="btn primary tk-wide" data-act="m-summary">${ic('check')}${tx('See the summary')}</button>` : `<p class="tk-hint">${tx('Tap ✓ when it is fine, ✗ when it needs fixing: a ✗ asks for a photo and where it goes.')}</p>`) + `</div>`;
}
function phoneDone(ctx, w) {
  const c = walkCounts(w), next = nextDue(ctx, w.list, w.day);
  const sent = w.items.filter(it => { const a = w.answers[it.id]; return a && (a.a === 'n' || a.note); }).map(it => {
    const a = w.answers[it.id];
    return `<div class="tk-sentrow"><i class="tk-dot ${a.sent?.to || (a.a === 'n' ? 'note' : 'none')}"></i><span class="tk-nm"><b>${esc(it.t)}</b><small>${a.a === 'y' ? '✓ · ' : ''}${a.sent ? sentLine(ctx, a.sent) : a.a === 'n' ? tx('Noted on the walk') : ''}${a.note ? ` · ${esc(a.note)}` : ''}</small></span></div>`;
  }).join('');
  return `<div class="tk-m tk-done"><div class="tk-wh"><b>${tx('Walk done')}</b><span class="tk-n">${hm(w.done)}</span></div>` +
    `<div class="card tk-sum"><b class="tk-sum-t">${esc(w.name)}</b><div class="tk-tiles"><span class="g"><b>${c.y}</b>${tx('✓ fine')}</span><span class="r"><b>${c.n}</b>${tx('✗ to fix')}</span><span class="n"><b>${c.photos}</b>${tx('Photos')}</span></div><small>${timesLine(w)}</small></div>` +
    `<div class="tk-lbl">${tx('What it sent')}</div>` + (sent ? `<div class="tk-sents">${sent}</div>` : `<div class="card">${empty(tx('Everything was fine: nothing to send.'), { icon: 'check', sm: true })}</div>`) +
    `<p class="tk-hint">${next ? tx('The walk is kept with its photos. The next one is due {day}.', { day: esc(fmtDay(next)) }) : tx('The walk is kept with its photos.')}</p>` +
    `<button type="button" class="btn primary tk-wide" data-act="m-back">${tx('Back to Tasks')}</button><button type="button" class="btn tk-wide" data-act="m-answers">${tx('See the answers')}</button></div>`;
}
function nextDue(ctx, list, day) {
  const l = tasksOf(ctx).lists[list]; if (!l || l.removed) return null;
  for (let i = 1; i <= 7; i++) { const d = addDays(day, i); if (dueOn(l, d)) return d; }
  return null;
}

// One answer from the phone: the walk starts with its first answer, and is
// done with its last.
async function answer(ctx, list, item, payload) {
  const day = today(), key = walkKey(list, day);
  if (!tasksOf(ctx).walks[key]) await ctx.store.dispatch({ type: 'task.walk.start', entity: { list, day }, payload: {} });
  const ev = await ctx.store.dispatch({ type: 'task.walk.item', entity: { list, day, item }, payload });
  const w = tasksOf(ctx).walks[key], c = walkCounts(w);
  if (w && !w.done && c.answered === c.of) {
    st.summary = true;
    try { await ctx.store.dispatch({ type: 'task.walk.done', entity: { list, day }, payload: {} }); } catch (e) { st.summary = false; throw e; }
  }
  return ev;
}

// A ✗: the photo, a note, and where it goes. Nothing is sent until Save.
function openFix(ctx, list, item, repaint) {
  const day = today(), w = tasksOf(ctx).walks[walkKey(list, day)], cur = w?.answers[item.id], was = cur?.a === 'n' ? cur : null, can = routes(ctx);
  const fx = { file: null, url: null, photo: was?.photo || null, note: was?.note || '', dest: was?.sent?.to || 'note', bay: '', kc: '', found: null, looking: false };
  const fixed = cur?.sent && cur.sent.to !== 'note' ? cur.sent : null;   // already sent: it stays where it went
  const opt = (v, t, s) => `<label class="tk-opt${fx.dest === v ? ' on' : ''}"><input type="radio" name="tkdest" value="${v}"${fx.dest === v ? ' checked' : ''}><span><b>${t}</b><small>${s}</small></span></label>`;
  const shot = fx.url || (fx.photo && thumbs.get(fx.photo) !== 'gone' ? thumbs.get(fx.photo) : null);
  const body = () => {
    const pic = fx.url || (fx.photo ? thumbs.get(fx.photo) : null);
    return `<div class="tk-fx-top"><label class="tk-ph${pic ? ' has' : ''}">${pic && pic !== 'gone' ? `<img src="${esc(pic)}" alt="${tx('Photo from a walk')}">` : ''}<span class="tk-ph-b">${ic('camera')}${pic ? tx('Retake') : tx('Take a photo')}</span><input type="file" accept="image/*" capture="environment" data-fx-photo hidden></label>` +
      `<textarea data-fx="note" rows="4" maxlength="300" placeholder="${tx('What is wrong, and where')}" aria-label="${tx('Note')}">${esc(fx.note)}</textarea></div>` +
      (pic ? `<button type="button" class="btn sm tk-phx" data-fx-act="photo-x">${ic('trash')}${tx('Remove photo')}</button>` : `<p class="tk-ph-note">${tx('Photograph the fault, not people.')}</p>`) +
      `<div class="tk-lbl">${tx('Where does it go?')}</div>` +
      (fixed ? `<div class="tk-opt on fixed">${ic('check')}<span><b>${fixed.to === 'issue' ? tx('Raised in Maintenance') : tx('Sent to Backfill')}</b><small>${sentLine(ctx, fixed)}</small></span></div>`
        : (can.backfill ? opt('backfill', tx('Send to Backfill'), tx('On a bay’s backfill list today')) + (fx.dest === 'backfill' ? bayField() : '') : '') +
          (can.issue ? opt('issue', tx('Raise a maintenance issue'), tx('Something broken or unsafe')) : '') +
          opt('note', tx('Just note it on the walk'), tx('Fixed it now, or for the record')));
  };
  const bayField = () => `<div class="tk-bay"><div class="tk-bayrow"><input class="tk-in" data-field="tkbay" value="${esc(fx.bay)}" placeholder="${can.find ? tx('Bay, or scan the item') : tx('Bay, like 7012')}" aria-label="${tx('Bay')}" autocomplete="off" autocapitalize="characters" enterkeyhint="done">${camButton('tkbay', false)}</div>` +
    (fx.looking ? `<small class="cs-dim">${tx('Looking it up…')}</small>` : fx.found ? `<small>${fx.found.name ? esc(fx.found.name) + ' · ' : ''}<span class="mono">${esc(fx.found.kc)}</span>${fx.found.bays.length ? '' : ' · ' + tx('no stockroom bay on the latest report: type the bay')}</small>${fx.found.bays.length ? `<div class="tk-chips">${fx.found.bays.map(b => `<button type="button" class="tk-chip${fx.bay === b ? ' on' : ''}" data-fx-bay="${esc(b)}">${esc(b)}</button>`).join('')}</div>` : ''}` : '') + `</div>`;
  const read = () => { const n = sheet.el.querySelector('[data-fx="note"]'); if (n) fx.note = n.value.trim(); const b = sheet.el.querySelector('[data-field="tkbay"]'); if (b) fx.bay = b.value.trim().toUpperCase(); };
  const paint = () => { read(); sheet.set({ body: body() }); };
  // A typed or scanned item (7 to 9 digits, or its 13-digit barcode) is looked up for its bays; anything else is the bay.
  const lookup = async () => {
    read(); const code = phoneCode(fx.bay).code;
    if (!code || !can.find) return;
    fx.looking = true; fx.found = null; paint();
    try { const f = await ctx.api(`/v1/store/${ctx.storeNo}/pull/find?code=${encodeURIComponent(code)}`); if (!f.kc) throw new Error(tx('No keycode for that barcode: type the bay instead.')); fx.found = { kc: f.kc, name: f.name || f.desc || '', bays: (f.bays || []).slice(0, 6) }; fx.kc = f.kc; fx.bay = fx.found.bays[0] || ''; }
    catch (e) { fx.bay = ''; toast(e.network ? tx('Looking up needs a connection: type the bay instead.') : e.message, 'bad'); }
    fx.looking = false; sheet.set({ body: body() });
  };
  const save = async () => {
    read();
    if (!fixed && fx.dest === 'backfill' && (!fx.bay || phoneCode(fx.bay).code)) return toast(tx('Say which bay: type it, or scan the item to find it'), 'bad');
    sheet.busy(true);
    try {
      const old = was?.photo || null;
      if (fx.file) { fx.photo = await postPhoto(ctx, fx.file); fx.file = null; }
      let sent = fixed;
      if (!sent && fx.dest === 'backfill') { await ctx.store.dispatch({ type: 'submission.request', entity: { bay: fx.bay, date: day }, payload: {} }); sent = { to: 'backfill', bay: fx.bay, ...(fx.kc && fx.found?.bays.includes(fx.bay) ? { kc: fx.kc } : {}) }; }
      else if (!sent && fx.dest === 'issue') {
        const v = tasksOf(ctx).walks[walkKey(list, day)] || tasksOf(ctx).lists[list], issue = rid('m' + Date.now().toString(36), 4);
        await ctx.store.dispatch({ type: 'issue.log', entity: { issue }, payload: { cat: 'other', title: item.t, note: fx.note, sev: 1, loc: `${areaName(v)} · ${v.name}` } });
        if (fx.photo) await ctx.store.dispatch({ type: 'issue.photo', entity: { issue }, payload: { photo: fx.photo } });
        sent = { to: 'issue', issue };
      } else if (!sent) sent = { to: 'note' };
      const ev = await answer(ctx, list, item.id, { a: 'n', ...(fx.note ? { note: fx.note } : {}), ...(fx.photo ? { photo: fx.photo } : {}), sent });
      if (old && old !== fx.photo) dropPhotoWhenSent(ctx, ev, old);
      toast(sent.to === 'issue' ? tx('Sent to Maintenance') : sent.to === 'backfill' ? tx('{bay} is on today’s backfill list', { bay: sent.bay }) : tx('Noted on the walk'));
      sheet.busy(false); sheet.close(); repaint();
    } catch (e) { sheet.busy(false); toast(e.code === 'unchanged' ? tx('That is already the answer') : photoError(e), 'bad'); if (e.code === 'unchanged') sheet.close(); }
  };
  const sheet = openSheet({
    cls: 'tk-fx', title: `${ic('x')}${esc(item.t)}`, label: item.t, sub: tx('Marked ✗ · {time}', { time: hm(was?.at || new Date()) }), body: body(),
    foot: `<button type="button" class="btn" data-fx-act="cancel">${tx('Cancel')}</button><button type="button" class="btn primary" data-fx-act="save">${ic('check')}${tx('Save and carry on')}</button>`,
    onClose: () => { if (fx.url) URL.revokeObjectURL(fx.url); },
    onClick: e => {
      const act = e.target.closest('[data-fx-act]')?.dataset.fxAct, bay = e.target.closest('[data-fx-bay]');
      if (bay) { read(); fx.bay = bay.dataset.fxBay; return sheet.set({ body: body() }); }
      if (act === 'cancel') return sheet.close();
      if (act === 'save') return save();
      if (act === 'photo-x') { read(); if (fx.url) URL.revokeObjectURL(fx.url); fx.url = null; fx.file = null; fx.photo = null; return sheet.set({ body: body() }); }
    },
  });
  sheet.el.addEventListener('change', e => {
    if (e.target.matches('[name="tkdest"]')) { read(); fx.dest = e.target.value; sheet.set({ body: body() }); if (fx.dest === 'backfill') setTimeout(() => sheet.el.querySelector('[data-field="tkbay"]')?.focus(), 30); return; }
    if (e.target.matches('[data-field="tkbay"]')) return lookup();
    if (e.target.matches('[data-fx-photo]')) { const f = e.target.files?.[0]; if (!f) return; read(); if (fx.url) URL.revokeObjectURL(fx.url); fx.file = f; fx.url = URL.createObjectURL(f); sheet.set({ body: body() }); }
  });
  sheet.el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-field="tkbay"]')) { e.preventDefault(); lookup(); } });
  if (fx.photo && !shot) loadThumbs(ctx, [fx.photo], () => { if (!sheet.closed) paint(); });
}

const view = {
  id: 'tasks', title: tx('Tasks'), icon: 'm-tasks',
  managers: true,   // a store's managers (the shell asks a team session for the manager code)
  // On a phone, managers only, from More in any area (as Maintenance is).
  deskOnly: s => !isManager(s),
  desktop: desk,
  mobile: ctx => (st.walk ? phoneWalk(ctx) : phoneHome(ctx)),
  mount(ctx, root) {
    // The PC's photo tiles (the phone shows a walk's photos in its ✗ sheet).
    if (!ctx.isMobile) loadThumbs(ctx, model(ctx).photos.map(x => x.a.photo), () => { if (root.isConnected) ctx.rerender(); });
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      try {
        if (act === 'new') openEditor(ctx, null);
        else if (act === 'edit') openEditor(ctx, a.dataset.list);
        else if (act === 'walk') openWalk(ctx, a.dataset.list, a.dataset.day);
        else if (act === 'photo') openPhoto(thumbs.get(a.dataset.photo), tx('Photo from a walk'));
        else if (act === 'print') printWalks(ctx, model(ctx).rows, today());
        else if (act === 'raised') a.dataset.to === 'issue' ? ctx.go('maintenance', { issue: a.dataset.ref }) : ctx.go('bfreview');
        else if (act === 'm-open') { st.walk = a.dataset.list; st.summary = !!tasksOf(ctx).walks[walkKey(st.walk, today())]?.done; ctx.rerender(); }
        else if (act === 'm-back') { st.walk = null; st.summary = false; ctx.rerender(); }
        else if (act === 'm-summary') { st.summary = true; ctx.rerender(); }
        else if (act === 'm-answers') { st.summary = false; ctx.rerender(); }
        else if (act === 'm-y' || act === 'm-n') {
          const t = tasksOf(ctx), w = t.walks[walkKey(st.walk, today())], v = w || t.lists[st.walk], item = v?.items.find(it => it.id === a.dataset.item); if (!item) return;
          const cur = w?.answers[item.id];
          if (act === 'm-n') return openFix(ctx, st.walk, item, () => { if (root.isConnected) ctx.rerender(); });
          if (cur?.a === 'y') return;
          if (cur?.a === 'n' && (cur.photo || (cur.sent && cur.sent.to !== 'note')) && !await ask({ title: tx('Mark it ✓ instead?'), text: [tx('What it sent stays where it went.'), tx('Its photo and note come off this walk.')], ok: tx('Mark it ✓'), danger: false })) return;
          const ev = await answer(ctx, st.walk, item.id, { a: 'y' });
          if (cur?.photo) dropPhotoWhenSent(ctx, ev, cur.photo);
        }
      } catch (err) { toast(err.message, 'bad'); }
    });
    return [ctx.store.on('tasks', () => { if (root.isConnected) ctx.rerender(); repaintDetail(ctx); }), ctx.store.on('issues', () => repaintDetail(ctx))];
  },
};
export default view;

// ── Walks: the last 90 days, newest first ─────────────────────────────────
let histList = '';
export const taskwalks = {
  id: 'taskwalks', title: tx('Walks'), icon: 'history',
  managers: true, deskOnly: true,   // the phone walks today's from Tasks
  desktop(ctx) {
    const t = tasksOf(ctx), all = Object.values(t.walks).sort((a, b) => b.day.localeCompare(a.day) || a.name.localeCompare(b.name));
    const names = [...new Map(all.map(w => [w.list, w.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    if (histList && !names.some(n => n[0] === histList)) histList = '';
    const list = all.filter(w => !histList || w.list === histList), x = list.reduce((n, w) => n + walkCounts(w).n, 0);
    const head = vh(tx('Walks'), sub(txn(list.length, '{n} walk', '{n} walks'), txn(x, '{n} ✗ found', '{n} ✗ found'), tx('the last 90 days')), names.length > 1 ? `<label class="tk-filter"><span>${tx('Checklist')}</span><select data-hist>${[['', tx('All checklists')], ...names].map(([v, l]) => `<option value="${esc(v)}"${v === histList ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : '', 'history');
    if (!list.length) return head + `<div class="card">${empty(tx('No walks yet. Each checklist is walked on a manager’s phone, under Tasks.'), { icon: 'm-tasks' })}</div>`;
    const rows = list.map(w => { const c = walkCounts(w), [tone, word] = stateOf(w, w, w.day); return `<tr data-act="walk" data-list="${esc(w.list)}" data-day="${w.day}"><td>${esc(fmtDay(w.day))}</td><td><b>${esc(w.name)}</b></td><td>${esc(areaName(w))}</td><td>${esc(w.who || '')}</td><td class="n">${c.y}</td><td class="n">${c.n ? `<b class="bad">${c.n}</b>` : 0}</td><td class="n">${c.photos}</td><td><span class="tk-st ${tone}">${w.done ? tx('Done {time}', { time: hm(w.done) }) : word}</span></td></tr>`; }).join('');
    return head + `<div class="card tk-hist"><table class="wb-t tk-t"><thead><tr><th>${tx('Day')}</th><th>${tx('Checklist')}</th><th>${tx('Area')}</th><th>${tx('Who')}</th><th class="n">✓</th><th class="n">✗</th><th class="n">${tx('Photos')}</th><th>${tx('Status')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  },
  mount(ctx, root) {
    root.addEventListener('click', e => { const r = e.target.closest('[data-act="walk"]'); if (r) openWalk(ctx, r.dataset.list, r.dataset.day); });
    root.addEventListener('change', e => { if (e.target.matches('[data-hist]')) { histList = e.target.value; ctx.rerender(); } });
    return [ctx.store.on('tasks', () => { if (root.isConnected) ctx.rerender(); repaintDetail(ctx); })];
  },
};
