// Maintenance: log issues with a map pin, work them open → progress →
// completed, reopen as recurring. Reads store.get('issues').

import { $, ic, esc, vh, sub, status, fmtTime, ago, toast, mgr } from '../ui.js';
import { mountMap, mapbar, crumbx, bindMapChrome, segmentId, mvMap, setStrip, sx } from '../map.js';
import { ISSUE_CATS } from '../../shared/reducers/floor.js';
import { printSheet, table, signoff } from '../print.js';
import { paperMap } from '../printmap.js';
import { issueLink } from '../share.js';
import { qrSvg } from '../../shared/qr.js';
import { mapFloors } from '../map.js';
import { tx, txn, locale } from '../i18n.js';

const SEV = [[tx('Low'), '#6B7280'], [tx('Medium'), '#D97706'], [tx('High'), '#DC2626'], [tx('Urgent'), '#7F1D1D']];
// An issue's status word ("Open" alone is the verb on every link and button).
const OPEN = tx('issue status::Open');
const CAT_NAME = { leak: tx('Leak'), light: tx('Lighting'), elec: tx('Electrical'), ac: tx('Air-con'), plumb: tx('Plumbing'), struct: tx('Structural'), fixture: tx('Fixture'), door: tx('Door'), safety: tx('Safety'), pest: tx('Pest'), other: tx('Other') };
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
// ── photos ──────────────────────────────────────────────────────────────
// Shrunk on the device (longest side 1280 px, JPEG) before upload; read
// back through the worker with this device's token and shown as blob URLs.
const thumbs = new Map();      // photo id → object URL | 'gone'
async function shrink(file) {
  const bmp = await createImageBitmap(file), k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  for (const q of [0.72, 0.55, 0.4]) { const b = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); if (b && b.size < 780_000) return b; }
  throw new Error(tx('that photo is too large even after shrinking'));
}
async function uploadPhoto(ctx, issueId, file) {
  const blob = await shrink(file);
  const r = await ctx.api(`/v1/store/${ctx.storeNo}/photo`, { method: 'POST', raw: blob, rawType: 'image/jpeg', timeoutMs: 30000 });
  thumbs.set(r.id, URL.createObjectURL(blob));
  await ctx.store.dispatch({ type: 'issue.photo', entity: { issue: issueId }, payload: { photo: r.id } });
}
const photoError = e => e.status === 501 ? tx('Photos are not switched on for this store yet.') : e.network ? tx('Photos need a connection. Try again when online.') : e.message;
function loadThumbs(ctx, ids, repaint) {
  const want = ids.filter(id => !thumbs.has(id)); if (!want.length) return;
  for (const id of want) thumbs.set(id, null);
  Promise.all(want.map(id => ctx.api(`/v1/store/${ctx.storeNo}/photo/${id}`, { blob: true }).then(b => thumbs.set(id, URL.createObjectURL(b))).catch(() => thumbs.set(id, 'gone')))).then(repaint);
}
const photoStrip = (i, editable) => {
  const list = i.photos || [];
  const cells = list.map(p => { const u = thumbs.get(p.id); return `<div class="mt-ph">${u && u !== 'gone' ? `<img src="${esc(u)}" alt="${tx('Photo of the issue')}" data-act="photo-open" data-photo="${esc(p.id)}">` : `<span class="cs-dim">${u === 'gone' ? tx('expired') : tx('loading…')}</span>`}${editable ? `<button class="mt-ph-x" data-act="photo-remove" data-photo="${esc(p.id)}" aria-label="${tx('Remove photo')}" title="${tx('Remove photo')}">${ic('x')}</button>` : ''}</div>`; }).join('');
  const add = editable && list.length < 4 ? `<label class="mt-ph add" title="${tx('Add a photo')}">${ic('camera')}<span>${tx('Add photo')}</span><input type="file" accept="image/*" capture="environment" data-photo-input hidden></label>` : '';
  return cells || add ? `<div class="mt-phs">${cells}${add}</div>${add ? `<p class="mt-ph-note">${tx('Photograph the fault, not people. Photos are deleted 90 days after the issue is closed.')}</p>` : ''}` : '';
};

const nearby = (m, d) => d.x == null ? [] : m.all.filter(i => i.id !== d.editId && i.x != null && (i.floor || null) === (d.floor || null) && (i.x - d.x) ** 2 + (i.y - d.y) ** 2 <= 4900);
const colour = i => i.status === 'open' ? '#DC2626' : i.status === 'progress' ? '#D97706' : '#16A34A';
const newId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default {
  id: 'maintenance', title: tx('Maintenance'), icon: 'm-maintenance',
  // On a phone, managers only (2026-10-14): a manager reports and works
  // issues on the go, photos and all, from More in any area; for everyone
  // else it stays a desk tool (no menu row, no search result, a link goes home).
  deskOnly: s => !isManager(s),
  desktop(ctx) {
    const m = model(ctx);
    return vh(tx('Maintenance'), headSub(m), `<button class="btn primary" data-act="new">${ic('plus')}${tx('Log new issue')}</button>`, 'm-maintenance') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx(tx('Maintenance'), ctx.storeNo)}<span><i style="background:#DC2626;border-radius:50%"></i>${OPEN}</span><span><i style="background:#D97706;border-radius:50%"></i>${tx('Done, to check')}</span><span><i style="background:#16A34A;border-radius:50%"></i>${tx('Completed')}</span><span style="color:var(--faint)">${draft ? (draft.editId ? tx('Tap the map to move this issue') : tx('Tap the map to place the new issue')) : tx('Log a new issue, then tap the map to place it')}</span></div></div>` +
      `<div class="sidecol fill" id="mtside"></div></div>`;
  },
  // The phone gets the map too, so a report is pinned where the fault is;
  // the strip carries the count and Report, the sheet the list, the issue
  // or the report form.
  mobile(ctx) {
    const m = model(ctx);
    return mvMap({ badge: tx('<b>{n}</b> open', { n: m.open.length }) }) + `<div class="mv-sel mode mt" id="mtmob"></div>`;
  },
  mount(ctx, root) {
    let map = null;
    // From the dashboard's map: open the issue whose pin was tapped.
    if (ctx.arg?.issue && ctx.store.get('issues')[ctx.arg.issue]) { selected = ctx.arg.issue; draft = null; if (ctx.store.get('issues')[selected].status === 'completed' && filter !== 'all' && filter !== 'done' && filter !== 'month') filter = 'all'; }
    const stage = $('#mapstage', root);
    if (stage) {
      map = mountMap(stage, { onSelect: info => {
        // A pin opens its issue; while placing one it is just a spot on the floor.
        if (info.kind === 'pin' && !draft) { selected = info.id; paint(); openSheet(); return; }
        if (draft && (info.kind === 'floor' || info.kind === 'shelf' || info.kind === 'pin')) {
          readDraft(root);
          const p = info.point || map.centreOf(info.id); draft.x = Math.round(p[0] * 10) / 10; draft.y = Math.round(p[1] * 10) / 10; draft.floor = map.floorId() || null;
          // A tap on bare floor still names the nearest shelf on this floor.
          const near = info.kind === 'shelf' ? { id: info.full, dept: info.dept } : nearestShelf(map, p);
          if (near && (!draft.loc || /^near /.test(draft.loc))) { draft.loc = 'near ' + near.id; draft.dept = near.dept; }
          paint(); openSheet();
        }
      } });
      bindMapChrome(root, map);
      stage.addEventListener('mapfloor', () => paint());
    }
    // Pins show on their own floor. An issue whose floor the map does not
    // know (logged before issues recorded their floor) shows on every floor.
    const here = i => { if (!map) return true; const ids = map.floors().map(f => f.id); return !i.floor || !ids.includes(i.floor) || i.floor === map.floorId(); };
    // The phone's sheet opens on its own for a report or an issue.
    // A new report starts with the map clear to pin it; the form comes up once it is pinned.
    const sheet = open => { if (ctx.isMobile && root.classList.contains('sheet-open') !== open) root.querySelector(':scope > .mv-strip .mv-tog')?.click(); };
    const openSheet = () => sheet(true);
    const paint = () => {
      const m = model(ctx);
      if (map) { map.clearOverlays(); map.drawPins(m.list.filter(i => i.x != null && here(i)).map(i => ({ id: i.id, x: i.x, y: i.y, colour: colour(i), glyph: GLYPH[i.cat] || GLYPH.other, badge: i.recur ? (i.recur > 9 ? '9+' : String(i.recur)) : '', title: `${i.title} · ${CAT_NAME[i.cat]}` }))); if (draft?.x != null && here(draft)) map.drawPins([{ x: draft.x, y: draft.y, colour: 'var(--accent)', label: '+' }]); }
      const sel = m.all.find(x => x.id === selected); if (sel?.photos?.length) loadThumbs(ctx, sel.photos.map(p => p.id), paint);
      const side = $('#mtside', root); if (side) side.innerHTML = sidebar(m);
      const mob = $('#mtmob', root); if (mob) { mob.innerHTML = phone(m); setStrip(root, phoneStrip(m)); }
      const badge = $('#mvbadge', root); if (badge) badge.innerHTML = m.recurring ? tx('<b>{n}</b> open · {k} recurring', { n: m.open.length, k: m.recurring }) : tx('<b>{n}</b> open', { n: m.open.length });
      const hs = root.querySelector('.vh .sub'); if (hs) hs.innerHTML = headSub(m);
    };
    paint();
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act');
      try {
        if (act === 'filter') { filter = a.getAttribute('data-filter'); paint(); }
        else if (act === 'select') { selected = a.getAttribute('data-id'); paint(); openSheet(); }
        else if (act === 'back') { selected = null; paint(); }
        else if (act === 'new') { draft = { cat: 'other', sev: 1, title: '', note: '', loc: '', x: null, y: null, files: [] }; paint(); sheet(false); }
        else if (act === 'draft-open') openSheet();
        else if (act === 'edit') { const i = ctx.store.get('issues')[selected]; if (i) { draft = { editId: selected, cat: i.cat, sev: i.sev, title: i.title, note: i.note || '', loc: i.loc || '', dept: i.dept || null, x: i.x, y: i.y, floor: i.floor || null }; paint(); openSheet(); } }
        else if (act === 'draft-sev') { draft.sev = Number(a.getAttribute('data-sev')); readDraft(root); paint(); }
        else if (act === 'draft-cancel') { draft = null; paint(); }
        else if (act === 'draft-save') {
          readDraft(root);
          if (!draft.title) return toast(tx('Give the issue a title'), 'bad');
          if (draft.editId) {
            await ctx.store.dispatch({ type: 'issue.update', entity: { issue: draft.editId }, payload: { cat: draft.cat, title: draft.title, note: draft.note, sev: draft.sev, loc: draft.loc, dept: draft.dept || null, x: draft.x, y: draft.y, ...(draft.floor ? { floor: draft.floor } : {}) } });
            selected = draft.editId; draft = null; toast(tx('Issue updated')); paint();
          } else {
            const id = newId();
            await ctx.store.dispatch({ type: 'issue.log', entity: { issue: id }, payload: { cat: draft.cat, title: draft.title, note: draft.note, sev: draft.sev, loc: draft.loc, dept: draft.dept || null, x: draft.x, y: draft.y, floor: draft.floor || map?.floorId() || null } });
            const files = draft.files || []; selected = id; draft = null; toast(tx('Sent to Maintenance')); paint();
            for (const f of files) { try { await uploadPhoto(ctx, id, f); } catch (e) { toast(photoError(e), 'bad'); break; } }
          }
        }
        // Each status change asks for a note for the log, as ShelfSearcher did; Cancel keeps the status.
        else if (act === 'progress' || act === 'close' || act === 'reopen') {
          const cur = ctx.store.get('issues')[a.getAttribute('data-id') || selected];
          const note = prompt(act === 'progress' ? tx('Maintenance done. Note (optional):') : act === 'close' ? tx('Completed. Note (optional):') : cur?.status === 'progress' ? tx('Not fixed: reopen it. What is still wrong?') : tx('Reopen as recurring. What is wrong again?'), '');
          if (note === null) return;
          const type = act === 'progress' ? 'issue.progress' : act === 'close' ? 'issue.close' : 'issue.reopen';
          await ctx.store.dispatch({ type, entity: { issue: act === 'reopen' ? a.getAttribute('data-id') || selected : selected }, payload: note.trim() ? { note: note.trim().slice(0, 500) } : {} });
        }
        else if (act === 'remove') {
          const i = ctx.store.get('issues')[selected]; if (!i) return;
          if (!confirm(tx('Remove "{title}"?\n\nIt leaves every list on every device. Its log stays in the store\'s record.', { title: i.title || CAT_NAME[i.cat] }))) return;
          const ev = await ctx.store.dispatch({ type: 'issue.remove', entity: { issue: selected }, payload: {} }); selected = null; toast(tx('Issue removed'));
          for (const p of i.photos || []) dropPhotoWhenSent(ctx, ev, p.id);
        }
        else if (act === 'work-order') { const i = m0(ctx); if (i) printWorkOrder(ctx, i); }
        else if (act === 'visit') {
          const who = prompt(tx('Contractor visited: who came (name or company)?'), ''); if (who === null) return;
          if (!who.trim()) return toast(tx('Say who visited'), 'bad');
          const note = prompt(tx('What did they do? (optional)'), ''); if (note === null) return;
          await ctx.store.dispatch({ type: 'issue.visit', entity: { issue: selected }, payload: { who: who.trim().slice(0, 80), ...(note.trim() ? { note: note.trim().slice(0, 500) } : {}) } }); toast(tx('Visit logged'));
        }
        else if (act === 'photo-open') { openPhoto(thumbs.get(a.dataset.photo)); }
        else if (act === 'photo-remove') {
          if (!confirm(tx('Remove this photo? It is deleted from the store’s records.'))) return;
          const ev = await ctx.store.dispatch({ type: 'issue.photo', entity: { issue: selected }, payload: { photo: a.dataset.photo, remove: true } });
          dropPhotoWhenSent(ctx, ev, a.dataset.photo);
        }
        else if (act === 'draft-photo-x') { draft.files.splice(Number(a.dataset.i), 1); readDraft(root); paint(); }
        else if (act === 'show') { const i = ctx.store.get('issues')[selected]; if (map && i?.x != null) { if (i.floor && i.floor !== map.floorId() && map.floors().some(f => f.id === i.floor)) map.floor(i.floor); map.setVb([i.x - 700, i.y - 450, 1400, 900]); } }
      } catch (err) { toast(err.message, 'bad'); }
    });
    root.addEventListener('change', async e => {
      if (e.target.closest('[data-draft]')) readDraft(root);
      if (e.target.matches('[data-photo-input]')) {
        const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
        if (draft) { readDraft(root); (draft.files ||= []).push(f); if (draft.files.length > 4) draft.files.length = 4; return paint(); }
        try { toast(tx('Adding the photo…')); await uploadPhoto(ctx, selected, f); toast(tx('Photo added')); } catch (err) { toast(photoError(err), 'bad'); }
      }
    });
    // A store update mid-report keeps what was typed.
    return [ctx.store.on('issues', () => { readDraft(root); paint(); })];
  },
};
function readDraft(root) {
  if (!draft) return;
  for (const f of ['title', 'note', 'loc', 'cat']) { const el = root.querySelector(`[data-draft="${f}"]`); if (el) draft[f] = el.value.trim(); }
}
function draftForm(m) {
  const sevs = SEV.map((s, i) => `<button class="${draft.sev === i ? 'on' : ''}" data-act="draft-sev" data-sev="${i}">${s[0]}</button>`).join('');
  const cats = `<select data-draft="cat">${ISSUE_CATS.map(c => `<option value="${c}"${draft.cat === c ? ' selected' : ''}>${CAT_NAME[c]}</option>`).join('')}</select>`;
  const dup = m ? nearby(m, draft).length : 0;
  return `<div class="card mtdet"><div class="ch"><h3>${draft.editId ? tx('Edit issue') : tx('New issue')}</h3><span class="cs-dim">${draft.x != null ? tx('placed on the map') : tx('tap the map to place it')}</span></div>` +
    (dup ? `<div class="mt-dup">${ic('alert')}${txn(dup, '{n} previous issue logged near here. Check the list before saving.', '{n} previous issues logged near here. Check the list before saving.')}</div>` : '') +
    `<label class="fld"><span>${tx('Title')}</span><input data-draft="title" value="${esc(draft.title)}" placeholder="${tx('Leak under the sink')}"></label><label class="fld"><span>${tx('Where')}</span><input data-draft="loc" value="${esc(draft.loc)}" placeholder="${tx('BOH kitchen · near bay 7031')}"></label><label class="fld"><span>${tx('Type')}</span>${cats}</label><label class="fld"><span>${tx('Note')}</span><input data-draft="note" value="${esc(draft.note)}"></label><div class="mv-sub">${tx('Severity')}</div><div class="mv-chips">${sevs}</div>` +
    (draft.editId ? '' : draftPhotos()) + `<div class="acts2" style="display:flex;gap:8px;margin-top:12px"><span class="btn primary sm" data-act="draft-save">${ic('check')}${draft.editId ? tx('Save changes') : tx('Log issue')}</span><span class="btn sm" data-act="draft-cancel">${tx('Cancel')}</span></div></div>`;
}
function sidebar(m) {
  const pills = [['active', tx('Open {n}', { n: m.open.length })], ['overdue', tx('Overdue {n}', { n: m.overdue })], ['recurring', tx('Recurring {n}', { n: m.recurring })], ['month', tx('Done this month {n}', { n: m.month.length })], ['done', tx('Completed {n}', { n: m.all.length - m.open.length })], ['all', tx('All')]];
  const list = `<div class="pcard"><div class="pills" style="margin-bottom:12px">${pills.map(p => `<button class="${filter === p[0] ? 'on' : ''}" style="padding:5px 11px;font-size:12.5px" data-act="filter" data-filter="${p[0]}">${p[1]}</button>`).join('')}</div><div class="list">${m.list.map((i, n) => `<div class="li mt-li${selected === i.id ? ' sel' : ''}" data-act="select" data-id="${esc(i.id)}"><span class="mt-pin" style="border-color:${colour(i)}">${glyphSvg(i.cat, colour(i))}</span><span class="nm" style="white-space:normal"><b style="font-weight:600">${esc(i.title)}${i.recur ? ` <span class="recur" title="${txn(i.recur, 'Reopened {n} time', 'Reopened {n} times')}">↻ ×${i.recur}</span>` : ''}</b><span class="where" style="display:block;font-size:12px;color:var(--dim)"><i class="sevdot" style="background:${SEV[i.sev][1]}"></i>${SEV[i.sev][0]} · ${esc(i.loc || CAT_NAME[i.cat])} · ${ago(i.created)}${overdue(i) ? ` · <b class="mt-od">${tx('overdue')}</b>` : ''}</span></span>${status(i.status === 'open' ? 'warn' : i.status === 'progress' ? 'info' : 'good', stName(i))}</div>`).join('') || `<div class="li" style="color:var(--dim)">${tx('Nothing here.')}</div>`}</div></div>`;
  if (draft) return list + draftForm(m);
  const i = m.all.find(x => x.id === selected);
  if (!i) return list;
  const sla = SLA_DAYS[i.sev ?? 1];
  const det = `<div class="card mtdet"><div class="ch"><h3>${esc(i.title)}</h3>${status(i.status === 'open' ? 'warn' : i.status === 'progress' ? 'info' : 'good', stName(i))}</div>` +
    `<div class="mt-meta"><span><i class="sevdot" style="background:${SEV[i.sev][1]}"></i>${tx('{sev} severity', { sev: SEV[i.sev][0] })}</span><span>${esc(i.loc || CAT_NAME[i.cat])}</span><span>${tx('Logged {time}', { time: fmtTime(i.created) })}</span>${i.recur ? `<span class="recur">${tx('↻ Recurring · reopened {n}×', { n: i.recur })}</span>` : ''}${i.status !== 'completed' ? `<span class="${overdue(i) ? 'mt-od' : 'cs-dim'}">${txn(sla, 'Target {n} day', 'Target {n} days')}${overdue(i) ? ' · ' + tx('overdue') : ''}</span>` : ''}<span class="cs-dim">${i.by ? tx('{type} · by {who}', { type: CAT_NAME[i.cat], who: esc(i.by) }) : tx('{type} · by unknown device', { type: CAT_NAME[i.cat] })}</span></div>` +
    photoStrip(i, i.status !== 'completed') +
    `<div class="list">${i.log.map(l => `<div class="li"><span class="rt" style="margin:0">${fmtTime(l.t)}</span><span class="nm">${esc(tx(l.a))}${l.n ? ' · ' + esc(l.n) : ''}</span></div>`).join('')}</div>` +
    `<div class="acts2" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${i.x != null ? `<span class="btn sm" data-act="show">${ic('pin')}${tx('Show on map')}</span>` : ''}${i.status !== 'completed' ? `<span class="btn sm" data-act="edit">${ic('edit')}${tx('Edit')}</span>` : ''}${i.status === 'open' ? `<span class="btn sm" style="color:#B45309" data-act="progress">${ic('tool')}${tx('Maintenance done')}</span>` : ''}${i.status === 'progress' ? `<span class="btn sm" data-act="reopen">${ic('refresh')}${tx('Not fixed')}</span>` : ''}${i.status !== 'completed' ? `<span class="btn sm" style="color:var(--green-ink)" data-act="close">${ic('check')}${tx('Complete')}</span>` : `<span class="btn sm" data-act="reopen">${ic('refresh')}${tx('Reopen')}</span>`}<span class="btn sm" data-act="work-order" title="${tx('A printed sheet for the contractor, with a QR code back to this issue')}">${ic('print')}${tx('Work order')}</span>${i.status !== 'completed' ? `<span class="btn sm" data-act="visit">${ic('users')}${tx('Contractor visited')}</span>` : ''}<span class="btn sm" style="color:var(--red)" data-act="remove">${ic('trash')}${tx('Remove')}</span></div></div>`;
  return list + det;
}
const stName = i => i.status === 'open' ? OPEN : i.status === 'progress' ? tx('Done, to check') : tx('Completed');
const isManager = s => (s?.roles || []).includes('manager') || !!s?.owner;
// The header's counts: open, overdue, recurring and the oldest open issue's age.
const headSub = m => sub(tx('{n} open', { n: m.open.length }), tx('{n} overdue', { n: m.overdue }), tx('{n} recurring', { n: m.recurring }), m.open.length ? txn(m.oldest, 'oldest {n} day', 'oldest {n} days') : '');

// ── the phone (managers) ──────────────────────────────────────────────
// The strip: the open count and Report; the issue in hand and Close; or the
// report being written, where to pin it, and Send.
function phoneStrip(m) {
  if (draft) return `${ic('m-maintenance')}<b>${draft.editId ? tx('Edit issue') : tx('New report')}</b><span class="s">${draft.x != null ? tx('Pinned') : tx('Tap the map to pin it')}</span>` +
    (draft.x != null || draft.editId ? `<button class="act go" type="button" data-act="draft-save">${ic('check')}${draft.editId ? tx('Save') : tx('Send')}</button>` : `<button class="act" type="button" data-act="draft-open">${ic('chev')}${tx('Skip')}</button>`);
  const i = m.all.find(x => x.id === selected);
  if (i) return `<span class="mt-sgl">${glyphSvg(i.cat, colour(i))}</span><b>${esc(i.title)}</b><span class="s">${stName(i)}</span><button class="act" type="button" data-act="back">${ic('x')}${tx('Close')}</button>`;
  return `${ic('m-maintenance')}<b>${tx('Maintenance')}</b>${mgr()}<span class="n${m.overdue ? ' red' : ''}">${m.open.length}</span><span class="s">${m.overdue ? tx('{n} overdue', { n: m.overdue }) : ''}</span><button class="act go" type="button" data-act="new">${ic('plus')}${tx('Report')}</button>`;
}
// The sheet: the report form, an issue with its photos, log and actions, or
// the open list.
function phone(m) {
  if (draft) {
    const dup = nearby(m, draft).length;
    const sevs = SEV.map((v, n) => `<button class="sx-chip${draft.sev === n ? ' on' : ''}" type="button" data-act="draft-sev" data-sev="${n}"><i class="sevdot" style="background:${v[1]}"></i>${v[0]}</button>`).join('');
    const cats = `<select class="sx-in" data-draft="cat" aria-label="${tx('Type')}">${ISSUE_CATS.map(c => `<option value="${c}"${draft.cat === c ? ' selected' : ''}>${CAT_NAME[c]}</option>`).join('')}</select>`;
    return `<div class="sx"><div class="sx-h">${ic('m-maintenance')}${draft.editId ? tx('Edit issue') : tx('Report an issue')}</div><div class="sx-sub">${draft.x != null ? (draft.loc ? tx('Pinned on the map · {where}. Tap again to move it.', { where: esc(draft.loc) }) : tx('Pinned on the map. Tap again to move it.')) : tx('Tap the map to pin where the fault is.')}</div>` +
      (dup ? `<div class="mt-dup">${ic('alert')}${txn(dup, '{n} issue already logged near here. Check the list before sending.', '{n} issues already logged near here. Check the list before sending.')}</div>` : '') +
      sx.sec(tx('What'), `<input class="sx-in" data-draft="title" placeholder="${tx('Light out over the end bay')}" value="${esc(draft.title)}" aria-label="${tx('What')}">`) +
      sx.sec(tx('Where'), `<input class="sx-in" data-draft="loc" placeholder="${tx('Aisle K2, bay 8963')}" value="${esc(draft.loc)}" aria-label="${tx('Where')}">`) +
      sx.sec(tx('Type'), cats) + sx.sec(tx('How urgent'), `<div class="sx-chips">${sevs}</div>`) +
      sx.sec(tx('Note'), `<input class="sx-in" data-draft="note" placeholder="${tx('Anything the contractor should know')}" value="${esc(draft.note)}" aria-label="${tx('Note')}">`, tx('optional')) +
      (draft.editId ? '' : sx.sec(tx('Photos'), draftPhotos(false), tx('up to 4'))) +
      sx.acts([sx.btn('check', draft.editId ? tx('Save changes') : tx('Send report'), 'data-act="draft-save"', true), sx.btn('x', tx('Cancel'), 'data-act="draft-cancel"')]) + `</div>`;
  }
  const i = m.all.find(x => x.id === selected);
  if (i) {
    const sla = SLA_DAYS[i.sev ?? 1], open = i.status !== 'completed';
    return `<div class="sx"><div class="sx-h"><span class="mt-sgl">${glyphSvg(i.cat, colour(i))}</span>${esc(i.title)}<span class="n${i.status === 'open' ? ' red' : ''}">${stName(i)}</span></div>` +
      `<div class="sx-sub">${esc(i.loc || CAT_NAME[i.cat])}${i.recur ? ` · <span class="recur">${tx('↻ reopened {n}×', { n: i.recur })}</span>` : ''}</div><div class="sx-sec">` +
      sx.facts([[tx('Urgency'), SEV[i.sev][0]], [tx('Type'), CAT_NAME[i.cat]], [tx('Logged'), esc(fmtTime(i.created))], open ? [tx('repair::Target'), `${txn(sla, '{n} day', '{n} days')}${overdue(i) ? ' · ' + tx('overdue') : ''}`] : [tx('Completed'), esc(fmtTime(doneAt(i)))]]) + `</div>` +
      (i.note ? sx.sec(tx('Note'), `<div class="sx-sub" style="margin:0">${esc(i.note)}</div>`) : '') +
      ((i.photos || []).length || open ? sx.sec(tx('Photos'), photoStrip(i, open), tx('{n} of 4', { n: (i.photos || []).length })) : '') +
      sx.acts([
        i.status === 'open' ? sx.btn('tool', tx('Maintenance done'), 'data-act="progress"', true) : '',
        i.status === 'progress' ? sx.btn('check', tx('Complete'), 'data-act="close"', true) : '',
        i.status === 'progress' ? sx.btn('refresh', tx('Not fixed'), 'data-act="reopen"') : '',
        i.status === 'open' ? sx.btn('check', tx('Complete'), 'data-act="close"') : '',
        i.status === 'completed' ? sx.btn('refresh', tx('Reopen'), 'data-act="reopen"', true) : '',
        i.x != null ? sx.btn('pin', tx('Show on map'), 'data-act="show"') : '',
        open ? sx.btn('edit', tx('Edit'), 'data-act="edit"') : '',
        open ? sx.btn('users', tx('Contractor visited'), 'data-act="visit"') : '',
      ]) +
      sx.sec(tx('Log'), sx.rows([...i.log].reverse().map(l => sx.row('history', esc(tx(l.a)), l.n ? esc(l.n) : '', esc(fmtTime(l.t)))))) +
      sx.acts([sx.btn('x', tx('Back to the list'), 'data-act="back"')]) + `</div>`;
  }
  const row = i => sx.row(`<span class="mt-sgl">${glyphSvg(i.cat, colour(i))}</span>`, esc(i.title), `${SEV[i.sev][0]} · ${esc(i.loc || CAT_NAME[i.cat])} · ${ago(i.created)}`, overdue(i) ? tx('Overdue') : i.status === 'progress' ? tx('To check') : OPEN, overdue(i) ? 'bad' : i.status === 'progress' ? 'warn' : 'dim', `data-act="select" data-id="${esc(i.id)}"`);
  const open = [...m.open].sort((a, b) => (overdue(b) - overdue(a)) || (a.updated < b.updated ? 1 : -1));
  const done = m.all.filter(i => i.status === 'completed').sort((a, b) => (doneAt(a) < doneAt(b) ? 1 : -1)).slice(0, 5);
  return `<div class="sx"><div class="sx-h">${ic('m-maintenance')}${tx('Maintenance')}<span class="n${m.overdue ? ' red' : ''}">${tx('{n} open', { n: m.open.length })}</span></div>` +
    sx.acts([sx.btn('plus', tx('Report an issue'), 'data-act="new"', true)]) +
    sx.sec(OPEN, open.length ? sx.rows(open.slice(0, 40).map(row)) : sx.rows([sx.row('check', tx('Nothing open'))]), m.overdue ? tx('{n} overdue', { n: m.overdue }) : tx('tap one to open it')) +
    (done.length ? sx.sec(tx('Recently completed'), sx.rows(done.map(i => sx.row(`<span class="mt-sgl">${glyphSvg(i.cat, colour(i))}</span>`, esc(i.title), tx('{where} · done {ago}', { where: esc(i.loc || CAT_NAME[i.cat]), ago: ago(doneAt(i)) }), '', '', `data-act="select" data-id="${esc(i.id)}"`)))) : '') + `</div>`;
}

// The shelf nearest a point on the shown floor, by the centre of its box.
export function nearestShelf(map, p) {
  let best = null;
  for (const g of map.segments()) {
    if (g.closest('.mfl')?.getAttribute('data-fid') !== map.floorId()) continue;
    const r = g.querySelector('.shelf'); if (!r) continue;
    const b = r.getBBox(), d = (b.x + b.width / 2 - p[0]) ** 2 + (b.y + b.height / 2 - p[1]) ** 2;
    if (!best || d < best.d) best = { d, id: segmentId(g), dept: (g.getAttribute('data-dept') || '').toLowerCase() };   // the shelf, "A16 S2"
  }
  return best;
}

// Photos chosen while writing a report go up once it is logged.
function draftPhotos(head = true) {
  const files = draft.files || [];
  return `${head ? `<div class="mv-sub">${tx('Photos')}</div>` : ''}<div class="mt-phs">${files.map((f, n) => `<div class="mt-ph pend"><span>${ic('camera')}${esc(String(n + 1))}</span><button class="mt-ph-x" data-act="draft-photo-x" data-i="${n}" aria-label="${tx('Remove photo')}">${ic('x')}</button></div>`).join('')}${files.length < 4 ? `<label class="mt-ph add">${ic('camera')}<span>${tx('Add photo')}</span><input type="file" accept="image/*" capture="environment" data-photo-input hidden></label>` : ''}</div><p class="mt-ph-note">${tx('Photograph the fault, not people.')}</p>`;
}
function openPhoto(url) {
  if (!url || url === 'gone') return;
  const el = document.createElement('div'); el.className = 'sharesheet mt-full'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', tx('Photo'));
  el.innerHTML = `<img src="${esc(url)}" alt="${tx('Photo of the issue')}"><button class="ibtn" aria-label="${tx('Close')}">${ic('x')}</button>`;
  const close = () => { el.remove(); document.removeEventListener('keydown', k); }, k = e => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', close); document.addEventListener('keydown', k); document.body.appendChild(el);
}

// An issue as a map pin, for other views that show the maintenance layer
// (the dashboard's map).
export const issuePin = i => ({ x: i.x, y: i.y, colour: colour(i), glyph: GLYPH[i.cat] || GLYPH.other, badge: i.recur ? (i.recur > 9 ? '9+' : String(i.recur)) : '', title: `${i.title} · ${CAT_NAME[i.cat] || tx('Other')}` });

const m0 = ctx => { const i = ctx.store.get('issues')[selected]; return i && !i.removed ? { id: selected, ...i } : null; };
// The work order (October audit §6): what is wrong and where, with the map
// around the pin, a QR code that opens the issue on a store device, the
// log so far, and lines for the contractor to fill in; "Contractor visited"
// logs it back.
function printWorkOrder(ctx, i) {
  const fl = mapFloors().find(f => f.id === i.floor), due = new Date(Date.parse(i.created) + SLA_DAYS[i.sev ?? 1] * 86400000);
  const pm = i.x != null ? paperMap({ floor: i.floor, frame: { around: [i.x, i.y], span: 1600 }, pins: [{ x: i.x, y: i.y, colour: '#DC2626', glyph: GLYPH[i.cat] || GLYPH.other }], layers: { emergency: false, priceChecks: false }, aspect: 2 }) : null;
  const url = issueLink(ctx.storeNo, i.id), qr = qrSvg(url, { cell: 3 });
  const fact = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  const body = `<div class="ps-facts">${fact(tx('Issue'), esc(i.title))}${fact(tx('Type'), esc(CAT_NAME[i.cat] || tx('Other')))}${fact(tx('Severity'), esc(SEV[i.sev ?? 1][0]))}${fact(tx('Status'), esc(stName(i)))}` +
    `${fact(tx('Where'), esc(i.loc || '—') + (fl ? ` · ${esc(fl.name)}` : ''))}${fact(tx('Logged'), esc(fmtTime(i.created)))}${fact(tx('repair::Target'), esc(due.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })) + (overdue(i) ? ' · ' + tx('overdue') : ''))}${fact(tx('Reference'), `<span class="mono">${esc(i.id)}</span>`)}</div>` +
    (i.note ? `<p class="ps-note">${tx('<b>Details:</b> {note}', { note: esc(i.note) })}</p>` : '') +
    `<div class="ps-wo">${pm ? `<div class="ps-wo-map">${pm.svg}</div>` : `<div class="ps-wo-map ps-none">${tx('Not pinned on the map')}</div>`}<div class="ps-wo-qr">${qr || ''}<span>${tx('Scan on a store device to open this issue in Conduit')}</span></div></div>` +
    `<h2>${tx('Log so far')}</h2>` + table([tx('When'), tx('What'), tx('Note')], i.log.slice(-5).map(l => [esc(fmtTime(l.t)), esc(tx(l.a)), esc(l.n || '')]), ['w20', 'w20', '']) +
    `<h2>${tx('Contractor')}</h2><table class="ps-tbl ps-kv"><tbody>${[[tx('Company / name'), ''], [tx('Arrived'), ''], [tx('Left'), ''], [tx('Work done'), ''], ['', ''], [tx('Parts used'), ''], [tx('Fixed?'), tx('☐ Yes &nbsp;&nbsp; ☐ No, follow-up needed')]].map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>` + signoff(tx('Contractor')) + signoff(tx('Checked by (store)'));
  printSheet({ title: tx('Maintenance work order'), subtitle: tx('{name} · store {no}', { name: esc(ctx.storeName || ''), no: esc(ctx.storeNo) }), body });
}

// The worker deletes a photo's bytes only once no live issue lists it, so
// the delete follows the event that took it off (or removed the issue) to
// the worker. Offline, or if the event is refused, the nightly sweep drops
// the bytes instead.
function dropPhotoWhenSent(ctx, ev, photo) {
  const go = () => ctx.api(`/v1/store/${ctx.storeNo}/photo/${photo}`, { method: 'DELETE' }).catch(() => {});
  const sent = () => !ctx.store.pending.some(p => p.id === ev.id);
  if (sent()) return go();
  const off = ctx.store.on('status', () => { if (sent()) { off(); clearTimeout(t); go(); } });
  const t = setTimeout(off, 120_000);
}
