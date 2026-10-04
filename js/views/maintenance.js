// Maintenance: log issues with a map pin, work them open → progress →
// completed, reopen as recurring. Reads store.get('issues').

import { $, ic, esc, vh, sub, status, fmtTime, ago, toast, mhead, mbig, mghost, mfoot } from '../ui.js';
import { mountMap, mapbar, crumbx, bindMapChrome } from '../map.js';
import { ISSUE_CATS } from '../../shared/reducers/floor.js';

const SEV = [['Low', '#6B7280'], ['Medium', '#D97706'], ['High', '#DC2626'], ['Urgent', '#7F1D1D']];
const CAT_NAME = { leak: 'Leak', light: 'Lighting', elec: 'Electrical', ac: 'Air-con', plumb: 'Plumbing', struct: 'Structural', fixture: 'Fixture', door: 'Door', safety: 'Safety', pest: 'Pest', other: 'Other' };
let filter = 'active', selected = null, draft = null;
// Days an open issue may wait before it shows as overdue, by severity
// (Low, Medium, High, Urgent). Neither legacy app had targets; these are
// Conduit's defaults.
const SLA_DAYS = [14, 7, 3, 1];
const ageDays = i => (Date.now() - Date.parse(i.created)) / 86400000;
const overdue = i => i.status !== 'completed' && ageDays(i) > SLA_DAYS[i.sev ?? 1];
const doneAt = i => [...(i.log || [])].reverse().find(l => l.a === 'Completed')?.t || i.updated;
const thisMonth = iso => { const d = new Date(iso), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); };
// The pictogram per category, stroked in a -8..8 box (ShelfSearcher's set).
const GLYPH = {
  leak: '<path d="M0 -7C3 -2 5 1 5 3.5A5 5 0 0 1 -5 3.5C-5 1 -3 -2 0 -7z"/>',
  light: '<path d="M-4 -1A4.5 4.5 0 1 1 4 -1C4 1.5 2 2.5 2 4.5H-2C-2 2.5 -4 1.5 -4 -1zM-2 6.5H2"/>',
  elec: '<path d="M1.5 -7.5L-4 1H0L-1.5 7.5L4 -1H0z" fill="currentColor"/>',
  ac: '<path d="M0 -7V7M-6 -3.5L6 3.5M-6 3.5L6 -3.5"/>',
  plumb: '<path d="M-7 -3H2A3 3 0 0 1 5 0V7M-7 1H1V7"/>',
  struct: '<path d="M-7 -6H7V6H-7zM-7 -2H7M-7 2H7M-2 -6V-2M3 -2V2M-2 2V6"/>',
  fixture: '<path d="M-6 7L2 -1M0 -3L4 -7L7 -4L3 0z"/>',
  door: '<path d="M-5 7V-7H5V7M-7 7H7M2 0.5V1"/>',
  safety: '<path d="M0 -7L7.5 6.5H-7.5zM0 -2V2M0 4.2V4.4"/>',
  pest: '<path d="M0 -3A3 4.5 0 1 1 0 6A3 4.5 0 1 1 0 -3M-3 0H-7M3 0H7M-3 4H-6.5M3 4H6.5M-1.5 -4L-3 -7M1.5 -4L3 -7"/>',
  other: '<path d="M-4.5 0H-4.4M0 0H0.1M4.5 0H4.6" stroke-width="3"/>',
};
const glyphSvg = (cat, colour) => `<svg class="mt-gl" viewBox="-9 -9 18 18" aria-hidden="true"><g fill="none" stroke="${colour}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:${colour}">${GLYPH[cat] || GLYPH.other}</g></svg>`;

function model(ctx) {
  const all = Object.entries(ctx.store.get('issues')).map(([id, i]) => ({ id, ...i })).filter(i => !i.removed);
  const open = all.filter(i => i.status !== 'completed'), month = all.filter(i => i.status === 'completed' && thisMonth(doneAt(i)));
  const list = { active: open, overdue: open.filter(overdue), recurring: open.filter(i => i.recur > 0), month, done: all.filter(i => i.status === 'completed'), all }[filter].sort((a, b) => (a.updated < b.updated ? 1 : -1));
  const oldest = open.length ? Math.max(...open.map(ageDays)) : 0;
  return { all, open, list, month, overdue: open.filter(overdue).length, recurring: open.filter(i => i.recur > 0).length, oldest: Math.floor(oldest) };
}
// Issues already logged near a point on the same floor (70 map units, any
// category, completed ones too): a warning, never a block.
const nearby = (m, d) => d.x == null ? [] : m.all.filter(i => i.id !== d.editId && i.x != null && (i.floor || null) === (d.floor || null) && (i.x - d.x) ** 2 + (i.y - d.y) ** 2 <= 4900);
const colour = i => i.status === 'open' ? '#DC2626' : i.status === 'progress' ? '#D97706' : '#16A34A';
const newId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default {
  id: 'maintenance', title: 'Maintenance', icon: 'm-maintenance',
  desktop(ctx) {
    const m = model(ctx);
    return vh('Maintenance', sub(`${m.open.length} open`, `${m.overdue} overdue`, `${m.recurring} recurring`, m.open.length ? `oldest ${m.oldest} days` : ''), `<button class="btn primary" data-act="new">${ic('plus')}Log new issue</button>`, 'm-maintenance') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx('Maintenance', ctx.storeNo)}<span><i style="background:#DC2626;border-radius:50%"></i>Open</span><span><i style="background:#D97706;border-radius:50%"></i>Done, to check</span><span><i style="background:#16A34A;border-radius:50%"></i>Completed</span><span style="color:var(--faint)">${draft ? (draft.editId ? 'Tap the map to move this issue' : 'Tap the map to place the new issue') : 'Log a new issue, then tap the map to place it'}</span></div></div>` +
      `<div class="sidecol fill" id="mtside"></div></div>`;
  },
  mobile(ctx) { return `<div id="mtmob"></div>`; },
  mount(ctx, root) {
    let map = null;
    const stage = $('#mapstage', root);
    if (stage) {
      map = mountMap(stage, { onSelect: info => {
        if (draft && (info.kind === 'floor' || info.kind === 'shelf')) {
          readDraft(root);
          const p = info.point || map.centreOf(info.id); draft.x = Math.round(p[0] * 10) / 10; draft.y = Math.round(p[1] * 10) / 10; draft.floor = map.floorId() || null;
          // A tap on bare floor still names the nearest shelf on this floor.
          const near = info.kind === 'shelf' ? { id: info.id, dept: info.dept } : nearestShelf(map, p);
          if (near && (!draft.loc || /^near /.test(draft.loc))) { draft.loc = 'near ' + near.id; draft.dept = near.dept; }
          paint();
        }
      } });
      bindMapChrome(root, map);
      stage.addEventListener('mapfloor', () => paint());
    }
    // Pins show on their own floor. An issue whose floor the map does not
    // know (logged before issues recorded their floor) shows on every floor.
    const here = i => { if (!map) return true; const ids = map.floors().map(f => f.id); return !i.floor || !ids.includes(i.floor) || i.floor === map.floorId(); };
    const paint = () => {
      const m = model(ctx);
      if (map) { map.clearOverlays(); map.drawPins(m.list.filter(i => i.x != null && here(i)).map(i => ({ x: i.x, y: i.y, colour: colour(i), glyph: GLYPH[i.cat] || GLYPH.other, badge: i.recur ? (i.recur > 9 ? '9+' : String(i.recur)) : '', title: `${i.title} · ${CAT_NAME[i.cat]}` }))); if (draft?.x != null && here(draft)) map.drawPins([{ x: draft.x, y: draft.y, colour: 'var(--accent)', label: '+' }]); }
      const side = $('#mtside', root); if (side) side.innerHTML = sidebar(m);
      const mob = $('#mtmob', root); if (mob) mob.innerHTML = mobile(m);
      const hs = root.querySelector('.vh .sub'); if (hs) hs.innerHTML = sub(`${m.open.length} open`, `${m.overdue} overdue`, `${m.recurring} recurring`, m.open.length ? `oldest ${m.oldest} days` : '');
    };
    paint();
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act');
      try {
        if (act === 'filter') { filter = a.getAttribute('data-filter'); paint(); }
        else if (act === 'select') { selected = a.getAttribute('data-id'); paint(); }
        else if (act === 'new') { draft = { cat: 'other', sev: 1, title: '', note: '', loc: '', x: null, y: null }; paint(); }
        else if (act === 'edit') { const i = ctx.store.get('issues')[selected]; if (i) { draft = { editId: selected, cat: i.cat, sev: i.sev, title: i.title, note: i.note || '', loc: i.loc || '', dept: i.dept || null, x: i.x, y: i.y, floor: i.floor || null }; paint(); } }
        else if (act === 'draft-sev') { draft.sev = Number(a.getAttribute('data-sev')); readDraft(root); paint(); }
        else if (act === 'draft-cancel') { draft = null; paint(); }
        else if (act === 'draft-save') {
          readDraft(root);
          if (!draft.title) return toast('Give the issue a title', 'bad');
          if (draft.editId) {
            await ctx.store.dispatch({ type: 'issue.update', entity: { issue: draft.editId }, payload: { cat: draft.cat, title: draft.title, note: draft.note, sev: draft.sev, loc: draft.loc, dept: draft.dept || null, x: draft.x, y: draft.y, ...(draft.floor ? { floor: draft.floor } : {}) } });
            selected = draft.editId; draft = null; toast('Issue updated'); paint();
          } else {
            const id = newId();
            await ctx.store.dispatch({ type: 'issue.log', entity: { issue: id }, payload: { cat: draft.cat, title: draft.title, note: draft.note, sev: draft.sev, loc: draft.loc, dept: draft.dept || null, x: draft.x, y: draft.y, floor: draft.floor || map?.floorId() || null } });
            selected = id; draft = null; toast('Sent to Maintenance'); paint();
          }
        }
        // Each status change asks for a note for the log, as ShelfSearcher did; Cancel keeps the status.
        else if (act === 'progress' || act === 'close' || act === 'reopen') {
          const note = prompt(act === 'progress' ? 'Maintenance done. Note (optional):' : act === 'close' ? 'Completed. Note (optional):' : 'Reopen as recurring. What is wrong again?', '');
          if (note === null) return;
          const type = act === 'progress' ? 'issue.progress' : act === 'close' ? 'issue.close' : 'issue.reopen';
          await ctx.store.dispatch({ type, entity: { issue: act === 'reopen' ? a.getAttribute('data-id') || selected : selected }, payload: note.trim() ? { note: note.trim().slice(0, 500) } : {} });
        }
        else if (act === 'remove') {
          const i = ctx.store.get('issues')[selected]; if (!i) return;
          if (!confirm(`Remove "${i.title || CAT_NAME[i.cat]}"?\n\nIt leaves every list on every device. Its log stays in the store's record.`)) return;
          await ctx.store.dispatch({ type: 'issue.remove', entity: { issue: selected }, payload: {} }); selected = null; toast('Issue removed');
        }
        else if (act === 'show') { const i = ctx.store.get('issues')[selected]; if (map && i?.x != null) map.setVb([i.x - 700, i.y - 450, 1400, 900]); }
      } catch (err) { toast(err.message, 'bad'); }
    });
    root.addEventListener('change', e => { if (e.target.closest('[data-draft]')) readDraft(root); });
    return [ctx.store.on('issues', paint)];
  },
};
function readDraft(root) {
  if (!draft) return;
  for (const f of ['title', 'note', 'loc', 'cat']) { const el = root.querySelector(`[data-draft="${f}"]`); if (el) draft[f] = el.value.trim(); }
}
function draftForm(mobileMode, m) {
  const sevs = SEV.map((s, i) => `<button class="${draft.sev === i ? 'on' : ''}" data-act="draft-sev" data-sev="${i}">${s[0]}</button>`).join('');
  const cats = `<select data-draft="cat">${ISSUE_CATS.map(c => `<option value="${c}"${draft.cat === c ? ' selected' : ''}>${CAT_NAME[c]}</option>`).join('')}</select>`;
  if (mobileMode) return mhead('Report an issue', 'Where · what · how urgent') +
    `<div class="mv-field"><small>Where</small><input data-draft="loc" placeholder="Aisle K2, bay 8963" value="${esc(draft.loc)}"></div><div class="mv-field"><small>What</small><input data-draft="title" placeholder="Fluorescent tube out over the end bay" value="${esc(draft.title)}"></div><div class="mv-field"><small>Type</small>${cats}</div><div class="mv-sub">How urgent</div><div class="mv-chips">${sevs}</div>` +
    mfoot(mbig('Send report', '', 'check', ' data-act="draft-save"') + mghost('Cancel', ' data-act="draft-cancel"'));
  const dup = m ? nearby(m, draft).length : 0;
  return `<div class="card mtdet"><div class="ch"><h3>${draft.editId ? 'Edit issue' : 'New issue'}</h3><span class="cs-dim">${draft.x != null ? 'placed on the map' : 'tap the map to place it'}</span></div>` +
    (dup ? `<div class="mt-dup">${ic('alert')}${dup} previous issue${dup === 1 ? '' : 's'} logged near here. Check the list before saving.</div>` : '') +
    `<label class="fld"><span>Title</span><input data-draft="title" value="${esc(draft.title)}" placeholder="Leak under the sink"></label><label class="fld"><span>Where</span><input data-draft="loc" value="${esc(draft.loc)}" placeholder="BOH kitchen · near bay 7031"></label><label class="fld"><span>Type</span>${cats}</label><label class="fld"><span>Note</span><input data-draft="note" value="${esc(draft.note)}"></label><div class="mv-sub">Severity</div><div class="mv-chips">${sevs}</div>` +
    `<div class="acts2" style="display:flex;gap:8px;margin-top:12px"><span class="btn primary sm" data-act="draft-save">${ic('check')}${draft.editId ? 'Save changes' : 'Log issue'}</span><span class="btn sm" data-act="draft-cancel">Cancel</span></div></div>`;
}
function sidebar(m) {
  const pills = [['active', `Open ${m.open.length}`], ['overdue', `Overdue ${m.overdue}`], ['recurring', `Recurring ${m.recurring}`], ['month', `Done this month ${m.month.length}`], ['done', `Completed ${m.all.length - m.open.length}`], ['all', 'All']];
  const list = `<div class="pcard"><div class="pills" style="margin-bottom:12px">${pills.map(p => `<button class="${filter === p[0] ? 'on' : ''}" style="padding:5px 11px;font-size:12.5px" data-act="filter" data-filter="${p[0]}">${p[1]}</button>`).join('')}</div><div class="list">${m.list.map((i, n) => `<div class="li mt-li${selected === i.id ? ' sel' : ''}" data-act="select" data-id="${i.id}"><span class="mt-pin" style="border-color:${colour(i)}">${glyphSvg(i.cat, colour(i))}</span><span class="nm" style="white-space:normal"><b style="font-weight:600">${esc(i.title)}${i.recur ? ` <span class="recur" title="Reopened ${i.recur} times">↻ ×${i.recur}</span>` : ''}</b><span class="where" style="display:block;font-size:12px;color:var(--dim)"><i class="sevdot" style="background:${SEV[i.sev][1]}"></i>${SEV[i.sev][0]} · ${esc(i.loc || CAT_NAME[i.cat])} · ${ago(i.created)}${overdue(i) ? ` · <b class="mt-od">overdue</b>` : ''}</span></span>${status(i.status === 'open' ? 'warn' : i.status === 'progress' ? 'info' : 'good', i.status === 'open' ? 'Open' : i.status === 'progress' ? 'Done, to check' : 'Completed')}</div>`).join('') || '<div class="li" style="color:var(--dim)">Nothing here.</div>'}</div></div>`;
  if (draft) return list + draftForm(false, m);
  const i = m.all.find(x => x.id === selected);
  if (!i) return list;
  const det = `<div class="card mtdet"><div class="ch"><h3>${esc(i.title)}</h3>${status(i.status === 'open' ? 'warn' : i.status === 'progress' ? 'info' : 'good', i.status === 'open' ? 'Open' : i.status === 'progress' ? 'Done, to check' : 'Completed')}</div>` +
    `<div class="mt-meta"><span><i class="sevdot" style="background:${SEV[i.sev][1]}"></i>${SEV[i.sev][0]} severity</span><span>${esc(i.loc || CAT_NAME[i.cat])}</span><span>Logged ${fmtTime(i.created)}</span>${i.recur ? `<span class="recur">↻ Recurring · reopened ${i.recur}×</span>` : ''}${i.status !== 'completed' ? `<span class="${overdue(i) ? 'mt-od' : 'cs-dim'}">Target ${SLA_DAYS[i.sev ?? 1]} day${SLA_DAYS[i.sev ?? 1] === 1 ? '' : 's'}${overdue(i) ? ' · overdue' : ''}</span>` : ''}<span class="cs-dim">${CAT_NAME[i.cat]} · by ${esc(i.by || 'unknown device')}</span></div>` +
    `<div class="list">${i.log.map(l => `<div class="li"><span class="rt" style="margin:0">${fmtTime(l.t)}</span><span class="nm">${esc(l.a)}${l.n ? ' · ' + esc(l.n) : ''}</span></div>`).join('')}</div>` +
    `<div class="acts2" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${i.x != null ? `<span class="btn sm" data-act="show">${ic('pin')}Show on map</span>` : ''}${i.status !== 'completed' ? `<span class="btn sm" data-act="edit">${ic('edit')}Edit</span>` : ''}${i.status === 'open' ? `<span class="btn sm" style="color:#B45309" data-act="progress">${ic('tool')}Maintenance done</span>` : ''}${i.status !== 'completed' ? `<span class="btn sm" style="color:var(--green-ink)" data-act="close">${ic('check')}Complete</span>` : `<span class="btn sm" data-act="reopen">${ic('refresh')}Reopen</span>`}<span class="btn sm" style="color:var(--red)" data-act="remove">${ic('trash')}Remove</span></div></div>`;
  return list + det;
}
function mobile(m) {
  if (draft) return draftForm(true, m);
  return mhead('Report an issue', `${m.open.length} open at the store`) + `<div class="mv-tiles"><button class="mv-tile hot" data-act="new"><span class="ti">${ic('plus')}</span><span class="tx"><b>New report</b><span>Where, what, how urgent</span></span><span></span>${ic('chev')}</button></div>` +
    `<div class="mv-sub">Open</div><div class="mv-rows">${m.open.slice(0, 8).map(i => `<div class="mv-row"><span class="a" style="color:${SEV[i.sev][1]}">${SEV[i.sev][0]}</span><span class="b">${esc(i.title)}<br><small>${esc(i.loc || '')}</small></span><span class="c">${ago(i.created)}</span></div>`).join('') || '<div class="mv-row"><span class="b">Nothing open.</span></div>'}</div>`;
}

// The shelf nearest a point on the shown floor, by the centre of its box.
function nearestShelf(map, p) {
  let best = null;
  for (const g of map.segments()) {
    if (g.closest('.mfl')?.getAttribute('data-fid') !== map.floorId()) continue;
    const r = g.querySelector('.shelf'); if (!r) continue;
    const b = r.getBBox(), d = (b.x + b.width / 2 - p[0]) ** 2 + (b.y + b.height / 2 - p[1]) ** 2;
    if (!best || d < best.d) best = { d, id: g.getAttribute('data-shelf'), dept: (g.getAttribute('data-dept') || '').toLowerCase() };
  }
  return best;
}
