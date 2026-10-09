// Maintenance: log issues with a map pin, work them open → progress →
// completed, reopen as recurring. Reads store.get('issues').

import { $, ic, esc, vh, sub, status, fmtTime, ago, toast, mhead, mbig, mghost, mfoot } from '../ui.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, segmentId } from '../map.js';
import { ISSUE_CATS } from '../../shared/reducers/floor.js';
import { printSheet, table, signoff } from '../print.js';
import { paperMap } from '../printmap.js';
import { issueLink } from '../share.js';
import { qrSvg } from '../../shared/qr.js';
import { mapFloors } from '../map.js';

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
// ── photos ──────────────────────────────────────────────────────────────
// Shrunk on the device (longest side 1280 px, JPEG) before upload; read
// back through the worker with this device's token and shown as blob URLs.
const thumbs = new Map();      // photo id → object URL | 'gone'
async function shrink(file) {
  const bmp = await createImageBitmap(file), k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  for (const q of [0.72, 0.55, 0.4]) { const b = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); if (b && b.size < 780_000) return b; }
  throw new Error('that photo is too large even after shrinking');
}
async function uploadPhoto(ctx, issueId, file) {
  const blob = await shrink(file);
  const r = await ctx.api(`/v1/store/${ctx.storeNo}/photo`, { method: 'POST', raw: blob, rawType: 'image/jpeg', timeoutMs: 30000 });
  thumbs.set(r.id, URL.createObjectURL(blob));
  await ctx.store.dispatch({ type: 'issue.photo', entity: { issue: issueId }, payload: { photo: r.id } });
}
const photoError = e => e.status === 501 ? 'Photos are not switched on for this store yet.' : e.network ? 'Photos need a connection. Try again when online.' : e.message;
function loadThumbs(ctx, ids, repaint) {
  const want = ids.filter(id => !thumbs.has(id)); if (!want.length) return;
  for (const id of want) thumbs.set(id, null);
  Promise.all(want.map(id => ctx.api(`/v1/store/${ctx.storeNo}/photo/${id}`, { blob: true }).then(b => thumbs.set(id, URL.createObjectURL(b))).catch(() => thumbs.set(id, 'gone')))).then(repaint);
}
const photoStrip = (i, editable) => {
  const list = i.photos || [];
  const cells = list.map(p => { const u = thumbs.get(p.id); return `<div class="mt-ph">${u && u !== 'gone' ? `<img src="${esc(u)}" alt="Photo of the issue" data-act="photo-open" data-photo="${esc(p.id)}">` : `<span class="cs-dim">${u === 'gone' ? 'expired' : 'loading…'}</span>`}${editable ? `<button class="mt-ph-x" data-act="photo-remove" data-photo="${esc(p.id)}" aria-label="Remove photo" title="Remove photo">${ic('x')}</button>` : ''}</div>`; }).join('');
  const add = editable && list.length < 4 ? `<label class="mt-ph add" title="Add a photo">${ic('camera')}<span>Add photo</span><input type="file" accept="image/*" capture="environment" data-photo-input hidden></label>` : '';
  return cells || add ? `<div class="mt-phs">${cells}${add}</div>${add ? '<p class="mt-ph-note">Photograph the fault, not people. Photos are deleted 90 days after the issue is closed.</p>' : ''}` : '';
};

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
  // The phone gets the map too, so a report is pinned where the fault is.
  mobile(ctx) {
    const m = model(ctx);
    return mvMap({ badge: `<b>${m.open.length}</b> open${m.recurring ? ` · ${m.recurring} recurring` : ''}` }) + `<div id="mtmob"></div>`;
  },
  mount(ctx, root) {
    let map = null;
    // From the dashboard's map: open the issue whose pin was tapped.
    if (ctx.arg?.issue && ctx.store.get('issues')[ctx.arg.issue]) { selected = ctx.arg.issue; draft = null; if (ctx.store.get('issues')[selected].status === 'completed' && filter !== 'all' && filter !== 'done' && filter !== 'month') filter = 'all'; }
    const stage = $('#mapstage', root);
    if (stage) {
      map = mountMap(stage, { onSelect: info => {
        // A pin opens its issue; while placing one it is just a spot on the floor.
        if (info.kind === 'pin' && !draft) { selected = info.id; paint(); if (ctx.isMobile) $('#mtmob', root)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
        if (draft && (info.kind === 'floor' || info.kind === 'shelf' || info.kind === 'pin')) {
          readDraft(root);
          const p = info.point || map.centreOf(info.id); draft.x = Math.round(p[0] * 10) / 10; draft.y = Math.round(p[1] * 10) / 10; draft.floor = map.floorId() || null;
          // A tap on bare floor still names the nearest shelf on this floor.
          const near = info.kind === 'shelf' ? { id: info.full, dept: info.dept } : nearestShelf(map, p);
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
      if (map) { map.clearOverlays(); map.drawPins(m.list.filter(i => i.x != null && here(i)).map(i => ({ id: i.id, x: i.x, y: i.y, colour: colour(i), glyph: GLYPH[i.cat] || GLYPH.other, badge: i.recur ? (i.recur > 9 ? '9+' : String(i.recur)) : '', title: `${i.title} · ${CAT_NAME[i.cat]}` }))); if (draft?.x != null && here(draft)) map.drawPins([{ x: draft.x, y: draft.y, colour: 'var(--accent)', label: '+' }]); }
      const sel = m.all.find(x => x.id === selected); if (sel?.photos?.length) loadThumbs(ctx, sel.photos.map(p => p.id), paint);
      const side = $('#mtside', root); if (side) side.innerHTML = sidebar(m);
      const mob = $('#mtmob', root); if (mob) mob.innerHTML = mobile(m);
      const badge = $('#mvbadge', root); if (badge) badge.innerHTML = `<b>${m.open.length}</b> open${m.recurring ? ` · ${m.recurring} recurring` : ''}`;
      const hs = root.querySelector('.vh .sub'); if (hs) hs.innerHTML = sub(`${m.open.length} open`, `${m.overdue} overdue`, `${m.recurring} recurring`, m.open.length ? `oldest ${m.oldest} days` : '');
    };
    paint();
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act');
      try {
        if (act === 'filter') { filter = a.getAttribute('data-filter'); paint(); }
        else if (act === 'select') { selected = a.getAttribute('data-id'); paint(); }
        else if (act === 'back') { selected = null; paint(); }
        else if (act === 'new') { draft = { cat: 'other', sev: 1, title: '', note: '', loc: '', x: null, y: null, files: [] }; paint(); }
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
            const files = draft.files || []; selected = id; draft = null; toast('Sent to Maintenance'); paint();
            for (const f of files) { try { await uploadPhoto(ctx, id, f); } catch (e) { toast(photoError(e), 'bad'); break; } }
          }
        }
        // Each status change asks for a note for the log, as ShelfSearcher did; Cancel keeps the status.
        else if (act === 'progress' || act === 'close' || act === 'reopen') {
          const cur = ctx.store.get('issues')[a.getAttribute('data-id') || selected];
          const note = prompt(act === 'progress' ? 'Maintenance done. Note (optional):' : act === 'close' ? 'Completed. Note (optional):' : cur?.status === 'progress' ? 'Not fixed: reopen it. What is still wrong?' : 'Reopen as recurring. What is wrong again?', '');
          if (note === null) return;
          const type = act === 'progress' ? 'issue.progress' : act === 'close' ? 'issue.close' : 'issue.reopen';
          await ctx.store.dispatch({ type, entity: { issue: act === 'reopen' ? a.getAttribute('data-id') || selected : selected }, payload: note.trim() ? { note: note.trim().slice(0, 500) } : {} });
        }
        else if (act === 'remove') {
          const i = ctx.store.get('issues')[selected]; if (!i) return;
          if (!confirm(`Remove "${i.title || CAT_NAME[i.cat]}"?\n\nIt leaves every list on every device. Its log stays in the store's record.`)) return;
          const ev = await ctx.store.dispatch({ type: 'issue.remove', entity: { issue: selected }, payload: {} }); selected = null; toast('Issue removed');
          for (const p of i.photos || []) dropPhotoWhenSent(ctx, ev, p.id);
        }
        else if (act === 'work-order') { const i = m0(ctx); if (i) printWorkOrder(ctx, i); }
        else if (act === 'visit') {
          const who = prompt('Contractor visited: who came (name or company)?', ''); if (who === null) return;
          if (!who.trim()) return toast('Say who visited', 'bad');
          const note = prompt('What did they do? (optional)', ''); if (note === null) return;
          await ctx.store.dispatch({ type: 'issue.visit', entity: { issue: selected }, payload: { who: who.trim().slice(0, 80), ...(note.trim() ? { note: note.trim().slice(0, 500) } : {}) } }); toast('Visit logged');
        }
        else if (act === 'photo-open') { openPhoto(thumbs.get(a.dataset.photo)); }
        else if (act === 'photo-remove') {
          if (!confirm('Remove this photo? It is deleted from the store’s records.')) return;
          const ev = await ctx.store.dispatch({ type: 'issue.photo', entity: { issue: selected }, payload: { photo: a.dataset.photo, remove: true } });
          dropPhotoWhenSent(ctx, ev, a.dataset.photo);
        }
        else if (act === 'draft-photo-x') { draft.files.splice(Number(a.dataset.i), 1); readDraft(root); paint(); }
        else if (act === 'show') { const i = ctx.store.get('issues')[selected]; if (map && i?.x != null) { if (i.floor && i.floor !== map.floorId() && map.floors().some(f => f.id === i.floor)) map.floor(i.floor); map.setVb([i.x - 700, i.y - 450, 1400, 900]); if (ctx.isMobile) stage?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }
      } catch (err) { toast(err.message, 'bad'); }
    });
    root.addEventListener('change', async e => {
      if (e.target.closest('[data-draft]')) readDraft(root);
      if (e.target.matches('[data-photo-input]')) {
        const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
        if (draft) { readDraft(root); (draft.files ||= []).push(f); if (draft.files.length > 4) draft.files.length = 4; return paint(); }
        try { toast('Adding the photo…'); await uploadPhoto(ctx, selected, f); toast('Photo added'); } catch (err) { toast(photoError(err), 'bad'); }
      }
    });
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
  if (mobileMode) return mhead(draft.editId ? 'Edit issue' : 'Report an issue', draft.x != null ? 'Pinned on the map · where · what · how urgent' : 'Tap the map above to pin it · where · what · how urgent') +
    `<div class="mv-field"><small>Where</small><input data-draft="loc" placeholder="Aisle K2, bay 8963" value="${esc(draft.loc)}"></div><div class="mv-field"><small>What</small><input data-draft="title" placeholder="Fluorescent tube out over the end bay" value="${esc(draft.title)}"></div><div class="mv-field"><small>Type</small>${cats}</div><div class="mv-sub">How urgent</div><div class="mv-chips">${sevs}</div>` +
    draftPhotos() + mfoot(mbig(draft.editId ? 'Save changes' : 'Send report', '', 'check', ' data-act="draft-save"') + mghost('Cancel', ' data-act="draft-cancel"'));
  const dup = m ? nearby(m, draft).length : 0;
  return `<div class="card mtdet"><div class="ch"><h3>${draft.editId ? 'Edit issue' : 'New issue'}</h3><span class="cs-dim">${draft.x != null ? 'placed on the map' : 'tap the map to place it'}</span></div>` +
    (dup ? `<div class="mt-dup">${ic('alert')}${dup} previous issue${dup === 1 ? '' : 's'} logged near here. Check the list before saving.</div>` : '') +
    `<label class="fld"><span>Title</span><input data-draft="title" value="${esc(draft.title)}" placeholder="Leak under the sink"></label><label class="fld"><span>Where</span><input data-draft="loc" value="${esc(draft.loc)}" placeholder="BOH kitchen · near bay 7031"></label><label class="fld"><span>Type</span>${cats}</label><label class="fld"><span>Note</span><input data-draft="note" value="${esc(draft.note)}"></label><div class="mv-sub">Severity</div><div class="mv-chips">${sevs}</div>` +
    (draft.editId ? '' : draftPhotos()) + `<div class="acts2" style="display:flex;gap:8px;margin-top:12px"><span class="btn primary sm" data-act="draft-save">${ic('check')}${draft.editId ? 'Save changes' : 'Log issue'}</span><span class="btn sm" data-act="draft-cancel">Cancel</span></div></div>`;
}
function sidebar(m) {
  const pills = [['active', `Open ${m.open.length}`], ['overdue', `Overdue ${m.overdue}`], ['recurring', `Recurring ${m.recurring}`], ['month', `Done this month ${m.month.length}`], ['done', `Completed ${m.all.length - m.open.length}`], ['all', 'All']];
  const list = `<div class="pcard"><div class="pills" style="margin-bottom:12px">${pills.map(p => `<button class="${filter === p[0] ? 'on' : ''}" style="padding:5px 11px;font-size:12.5px" data-act="filter" data-filter="${p[0]}">${p[1]}</button>`).join('')}</div><div class="list">${m.list.map((i, n) => `<div class="li mt-li${selected === i.id ? ' sel' : ''}" data-act="select" data-id="${i.id}"><span class="mt-pin" style="border-color:${colour(i)}">${glyphSvg(i.cat, colour(i))}</span><span class="nm" style="white-space:normal"><b style="font-weight:600">${esc(i.title)}${i.recur ? ` <span class="recur" title="Reopened ${i.recur} times">↻ ×${i.recur}</span>` : ''}</b><span class="where" style="display:block;font-size:12px;color:var(--dim)"><i class="sevdot" style="background:${SEV[i.sev][1]}"></i>${SEV[i.sev][0]} · ${esc(i.loc || CAT_NAME[i.cat])} · ${ago(i.created)}${overdue(i) ? ` · <b class="mt-od">overdue</b>` : ''}</span></span>${status(i.status === 'open' ? 'warn' : i.status === 'progress' ? 'info' : 'good', i.status === 'open' ? 'Open' : i.status === 'progress' ? 'Done, to check' : 'Completed')}</div>`).join('') || '<div class="li" style="color:var(--dim)">Nothing here.</div>'}</div></div>`;
  if (draft) return list + draftForm(false, m);
  const i = m.all.find(x => x.id === selected);
  if (!i) return list;
  const det = `<div class="card mtdet"><div class="ch"><h3>${esc(i.title)}</h3>${status(i.status === 'open' ? 'warn' : i.status === 'progress' ? 'info' : 'good', i.status === 'open' ? 'Open' : i.status === 'progress' ? 'Done, to check' : 'Completed')}</div>` +
    `<div class="mt-meta"><span><i class="sevdot" style="background:${SEV[i.sev][1]}"></i>${SEV[i.sev][0]} severity</span><span>${esc(i.loc || CAT_NAME[i.cat])}</span><span>Logged ${fmtTime(i.created)}</span>${i.recur ? `<span class="recur">↻ Recurring · reopened ${i.recur}×</span>` : ''}${i.status !== 'completed' ? `<span class="${overdue(i) ? 'mt-od' : 'cs-dim'}">Target ${SLA_DAYS[i.sev ?? 1]} day${SLA_DAYS[i.sev ?? 1] === 1 ? '' : 's'}${overdue(i) ? ' · overdue' : ''}</span>` : ''}<span class="cs-dim">${CAT_NAME[i.cat]} · by ${esc(i.by || 'unknown device')}</span></div>` +
    photoStrip(i, i.status !== 'completed') +
    `<div class="list">${i.log.map(l => `<div class="li"><span class="rt" style="margin:0">${fmtTime(l.t)}</span><span class="nm">${esc(l.a)}${l.n ? ' · ' + esc(l.n) : ''}</span></div>`).join('')}</div>` +
    `<div class="acts2" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${i.x != null ? `<span class="btn sm" data-act="show">${ic('pin')}Show on map</span>` : ''}${i.status !== 'completed' ? `<span class="btn sm" data-act="edit">${ic('edit')}Edit</span>` : ''}${i.status === 'open' ? `<span class="btn sm" style="color:#B45309" data-act="progress">${ic('tool')}Maintenance done</span>` : ''}${i.status === 'progress' ? `<span class="btn sm" data-act="reopen">${ic('refresh')}Not fixed</span>` : ''}${i.status !== 'completed' ? `<span class="btn sm" style="color:var(--green-ink)" data-act="close">${ic('check')}Complete</span>` : `<span class="btn sm" data-act="reopen">${ic('refresh')}Reopen</span>`}<span class="btn sm" data-act="work-order" title="A printed sheet for the contractor, with a QR code back to this issue">${ic('print')}Work order</span>${i.status !== 'completed' ? `<span class="btn sm" data-act="visit">${ic('users')}Contractor visited</span>` : ''}<span class="btn sm" style="color:var(--red)" data-act="remove">${ic('trash')}Remove</span></div></div>`;
  return list + det;
}
const stName = i => i.status === 'open' ? 'Open' : i.status === 'progress' ? 'Done, to check' : 'Completed';
// The phone: the open list, and an issue opened from it or from its pin,
// with the same actions as the desk (photos, done, complete, not fixed,
// reopen, edit).
function mobile(m) {
  if (draft) return draftForm(true, m);
  const i = m.all.find(x => x.id === selected);
  if (i) {
    const acts = [
      i.status === 'open' ? mbig('Maintenance done', 'warn', 'tool', ' data-act="progress"') : '',
      i.status !== 'completed' ? mbig('Complete', '', 'check', ' data-act="close"') : mbig('Reopen', 'sec', 'refresh', ' data-act="reopen"'),
      i.status === 'progress' ? mbig('Not fixed', 'sec', 'refresh', ' data-act="reopen"') : '',
    ].filter(Boolean);
    return mhead(esc(i.title), `${stName(i)} · ${SEV[i.sev][0]} · ${esc(i.loc || CAT_NAME[i.cat])}`, `<button class="ibtn" data-act="back" aria-label="Back to the list">${ic('x')}</button>`) +
      `<div class="mt-meta mv-pad"><span>Logged ${fmtTime(i.created)}</span>${i.recur ? `<span class="recur">↻ Reopened ${i.recur}×</span>` : ''}${i.status !== 'completed' ? `<span class="${overdue(i) ? 'mt-od' : 'cs-dim'}">Target ${SLA_DAYS[i.sev ?? 1]} day${SLA_DAYS[i.sev ?? 1] === 1 ? '' : 's'}${overdue(i) ? ' · overdue' : ''}</span>` : ''}<span class="cs-dim">${CAT_NAME[i.cat]} · by ${esc(i.by || 'unknown device')}</span></div>` +
      `<div class="mv-pad">${photoStrip(i, i.status !== 'completed')}</div>` +
      `<div class="mv-sub">Log</div><div class="mv-rows">${i.log.map(l => `<div class="mv-row"><span class="b">${esc(l.a)}${l.n ? '<br><small>' + esc(l.n) + '</small>' : ''}</span><span class="c">${fmtTime(l.t)}</span></div>`).join('')}</div>` +
      mfoot(`<div class="mv-two">${acts.join('')}</div>` + `<div class="mv-two">${i.x != null ? mghost('Show on map', ' data-act="show"') : ''}${i.status !== 'completed' ? mghost('Edit', ' data-act="edit"') : ''}${mghost('Back to the list', ' data-act="back"')}</div><div class="mv-two">${mghost('Work order', ' data-act="work-order"')}${i.status !== 'completed' ? mghost('Contractor visited', ' data-act="visit"') : ''}</div>`);
  }
  const row = i => `<div class="mv-row" data-act="select" data-id="${esc(i.id)}"><span class="a" style="color:${SEV[i.sev][1]}">${SEV[i.sev][0]}</span><span class="b">${esc(i.title)}<br><small>${esc(i.loc || CAT_NAME[i.cat])}${i.status === 'progress' ? ' · done, to check' : ''}${overdue(i) ? ' · <b class="mt-od">overdue</b>' : ''}</small></span><span class="c">${ago(i.created)}</span></div>`;
  return mhead('Report an issue', `${m.open.length} open at the store · tap a pin or a row to open it`) + `<div class="mv-tiles"><button class="mv-tile hot" data-act="new"><span class="ti">${ic('plus')}</span><span class="tx"><b>New report</b><span>Where, what, how urgent</span></span><span></span>${ic('chev')}</button></div>` +
    `<div class="mv-sub">Open</div><div class="mv-rows">${m.open.sort((a, b) => (a.updated < b.updated ? 1 : -1)).slice(0, 40).map(row).join('') || '<div class="mv-row"><span class="b">Nothing open.</span></div>'}</div>`;
}

// The shelf nearest a point on the shown floor, by the centre of its box.
function nearestShelf(map, p) {
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
function draftPhotos() {
  const files = draft.files || [];
  return `<div class="mv-sub">Photos</div><div class="mt-phs">${files.map((f, n) => `<div class="mt-ph pend"><span>${ic('camera')}${esc(String(n + 1))}</span><button class="mt-ph-x" data-act="draft-photo-x" data-i="${n}" aria-label="Remove photo">${ic('x')}</button></div>`).join('')}${files.length < 4 ? `<label class="mt-ph add">${ic('camera')}<span>Add photo</span><input type="file" accept="image/*" capture="environment" data-photo-input hidden></label>` : ''}</div><p class="mt-ph-note">Photograph the fault, not people.</p>`;
}
function openPhoto(url) {
  if (!url || url === 'gone') return;
  const el = document.createElement('div'); el.className = 'sharesheet mt-full'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Photo');
  el.innerHTML = `<img src="${esc(url)}" alt="Photo of the issue"><button class="ibtn" aria-label="Close">${ic('x')}</button>`;
  const close = () => { el.remove(); document.removeEventListener('keydown', k); }, k = e => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', close); document.addEventListener('keydown', k); document.body.appendChild(el);
}

// An issue as a map pin, for other views that show the maintenance layer
// (the dashboard's map).
export const issuePin = i => ({ x: i.x, y: i.y, colour: colour(i), glyph: GLYPH[i.cat] || GLYPH.other, badge: i.recur ? (i.recur > 9 ? '9+' : String(i.recur)) : '', title: `${i.title} · ${CAT_NAME[i.cat] || 'Other'}` });

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
  const body = `<div class="ps-facts">${fact('Issue', esc(i.title))}${fact('Type', esc(CAT_NAME[i.cat] || 'Other'))}${fact('Severity', esc(SEV[i.sev ?? 1][0]))}${fact('Status', esc(stName(i)))}` +
    `${fact('Where', esc(i.loc || '—') + (fl ? ` · ${esc(fl.name)}` : ''))}${fact('Logged', esc(fmtTime(i.created)))}${fact('Target', esc(due.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })) + (overdue(i) ? ' · overdue' : ''))}${fact('Reference', `<span class="mono">${esc(i.id)}</span>`)}</div>` +
    (i.note ? `<p class="ps-note"><b>Details:</b> ${esc(i.note)}</p>` : '') +
    `<div class="ps-wo">${pm ? `<div class="ps-wo-map">${pm.svg}</div>` : '<div class="ps-wo-map ps-none">Not pinned on the map</div>'}<div class="ps-wo-qr">${qr || ''}<span>Scan on a store device to open this issue in Conduit</span></div></div>` +
    `<h2>Log so far</h2>` + table(['When', 'What', 'Note'], i.log.slice(-5).map(l => [esc(fmtTime(l.t)), esc(l.a), esc(l.n || '')]), ['w20', 'w20', '']) +
    `<h2>Contractor</h2><table class="ps-tbl ps-kv"><tbody>${[['Company / name', ''], ['Arrived', ''], ['Left', ''], ['Work done', ''], ['', ''], ['Parts used', ''], ['Fixed?', '☐ Yes &nbsp;&nbsp; ☐ No, follow-up needed']].map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>` + signoff('Contractor') + signoff('Checked by (store)');
  printSheet({ title: 'Maintenance work order', subtitle: `${esc(ctx.storeName || '')} · store ${esc(ctx.storeNo)}`, body });
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
