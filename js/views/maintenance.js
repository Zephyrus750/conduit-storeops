// Maintenance: log issues with a map pin, work them open → progress →
// completed, reopen as recurring. Reads store.get('issues').

import { $, ic, esc, vh, sub, status, fmtTime, ago, toast, mhead, mbig, mghost, mfoot } from '../ui.js';
import { mountMap, mapbar, crumbx, bindMapChrome } from '../map.js';
import { ISSUE_CATS } from '../../shared/reducers/floor.js';

const SEV = [['Low', '#6B7280'], ['Medium', '#D97706'], ['High', '#DC2626'], ['Urgent', '#7F1D1D']];
const CAT_NAME = { leak: 'Leak', light: 'Lighting', elec: 'Electrical', ac: 'Air-con', plumb: 'Plumbing', struct: 'Structural', fixture: 'Fixture', door: 'Door', safety: 'Safety', pest: 'Pest', other: 'Other' };
let filter = 'active', selected = null, draft = null;

function model(ctx) {
  const all = Object.entries(ctx.store.get('issues')).map(([id, i]) => ({ id, ...i }));
  const open = all.filter(i => i.status !== 'completed');
  const list = { active: open, recurring: open.filter(i => i.recur > 0), done: all.filter(i => i.status === 'completed'), all }[filter].sort((a, b) => (a.updated < b.updated ? 1 : -1));
  const oldest = open.length ? Math.max(...open.map(i => (Date.now() - new Date(i.created)) / 86400000)) : 0;
  return { all, open, list, recurring: open.filter(i => i.recur > 0).length, oldest: Math.floor(oldest) };
}
const colour = i => i.status === 'open' ? '#DC2626' : i.status === 'progress' ? '#2563EB' : '#16A34A';
const newId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default {
  id: 'maintenance', title: 'Maintenance', icon: 'm-maintenance',
  desktop(ctx) {
    const m = model(ctx);
    return vh('Maintenance', sub(`${m.open.length} open`, `${m.recurring} recurring`, m.open.length ? `oldest ${m.oldest} days` : ''), `<button class="btn primary" data-act="new">${ic('plus')}Log new issue</button>`, 'm-maintenance') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx('Maintenance', ctx.storeNo)}<span><i style="background:#DC2626;border-radius:50%"></i>Open</span><span><i style="background:#2563EB;border-radius:50%"></i>Done, to check</span><span><i style="background:#16A34A;border-radius:50%"></i>Completed</span><span style="color:var(--faint)">${draft ? (draft.editId ? 'Tap the map to move this issue' : 'Tap the map to place the new issue') : 'Log a new issue, then tap the map to place it'}</span></div></div>` +
      `<div class="sidecol fill" id="mtside"></div></div>`;
  },
  mobile(ctx) { return `<div id="mtmob"></div>`; },
  mount(ctx, root) {
    let map = null;
    const stage = $('#mapstage', root);
    if (stage) {
      map = mountMap(stage, { onSelect: info => {
        if (draft && (info.kind === 'floor' || info.kind === 'shelf')) { const p = info.point || map.centreOf(info.id); draft.x = p[0]; draft.y = p[1]; if (info.kind === 'shelf') { draft.loc = 'near ' + info.id; draft.dept = info.dept; } paint(); }
      } });
      bindMapChrome(root, map);
    }
    const paint = () => {
      const m = model(ctx);
      if (map) { map.clearOverlays(); map.drawPins(m.list.filter(i => i.x != null).map((i, n) => ({ x: i.x, y: i.y, colour: colour(i), label: String(n + 1) }))); if (draft?.x != null) map.drawPins([{ x: draft.x, y: draft.y, colour: 'var(--accent)', label: '+' }]); }
      const side = $('#mtside', root); if (side) side.innerHTML = sidebar(m);
      const mob = $('#mtmob', root); if (mob) mob.innerHTML = mobile(m);
    };
    paint();
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act');
      try {
        if (act === 'filter') { filter = a.getAttribute('data-filter'); paint(); }
        else if (act === 'select') { selected = a.getAttribute('data-id'); paint(); }
        else if (act === 'new') { draft = { cat: 'other', sev: 1, title: '', note: '', loc: '', x: null, y: null }; paint(); }
        else if (act === 'edit') { const i = ctx.store.get('issues')[selected]; if (i) { draft = { editId: selected, cat: i.cat, sev: i.sev, title: i.title, note: i.note || '', loc: i.loc || '', dept: i.dept || null, x: i.x, y: i.y }; paint(); } }
        else if (act === 'draft-sev') { draft.sev = Number(a.getAttribute('data-sev')); readDraft(root); paint(); }
        else if (act === 'draft-cancel') { draft = null; paint(); }
        else if (act === 'draft-save') {
          readDraft(root);
          if (!draft.title) return toast('Give the issue a title', 'bad');
          if (draft.editId) {
            await ctx.store.dispatch({ type: 'issue.update', entity: { issue: draft.editId }, payload: { cat: draft.cat, title: draft.title, note: draft.note, sev: draft.sev, loc: draft.loc, dept: draft.dept || null, x: draft.x, y: draft.y } });
            selected = draft.editId; draft = null; toast('Issue updated'); paint();
          } else {
            const id = newId();
            await ctx.store.dispatch({ type: 'issue.log', entity: { issue: id }, payload: { cat: draft.cat, title: draft.title, note: draft.note, sev: draft.sev, loc: draft.loc, dept: draft.dept || null, x: draft.x, y: draft.y, floor: 'ground' } });
            selected = id; draft = null; toast('Sent to Maintenance'); paint();
          }
        }
        else if (act === 'progress') await ctx.store.dispatch({ type: 'issue.progress', entity: { issue: selected }, payload: {} });
        else if (act === 'close') await ctx.store.dispatch({ type: 'issue.close', entity: { issue: selected }, payload: {} });
        else if (act === 'reopen') await ctx.store.dispatch({ type: 'issue.reopen', entity: { issue: a.getAttribute('data-id') || selected }, payload: {} });
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
function draftForm(mobileMode) {
  const sevs = SEV.map((s, i) => `<button class="${draft.sev === i ? 'on' : ''}" data-act="draft-sev" data-sev="${i}">${s[0]}</button>`).join('');
  const cats = `<select data-draft="cat">${ISSUE_CATS.map(c => `<option value="${c}"${draft.cat === c ? ' selected' : ''}>${CAT_NAME[c]}</option>`).join('')}</select>`;
  if (mobileMode) return mhead('Report an issue', 'Where · what · how urgent') +
    `<div class="mv-field"><small>Where</small><input data-draft="loc" placeholder="Aisle K2, bay 8963" value="${esc(draft.loc)}"></div><div class="mv-field"><small>What</small><input data-draft="title" placeholder="Fluorescent tube out over the end bay" value="${esc(draft.title)}"></div><div class="mv-field"><small>Type</small>${cats}</div><div class="mv-sub">How urgent</div><div class="mv-chips">${sevs}</div>` +
    mfoot(mbig('Send report', '', 'check', ' data-act="draft-save"') + mghost('Cancel', ' data-act="draft-cancel"'));
  return `<div class="card mtdet"><div class="ch"><h3>${draft.editId ? 'Edit issue' : 'New issue'}</h3><span class="cs-dim">${draft.x != null ? 'placed on the map' : 'tap the map to place it'}</span></div>` +
    `<label class="fld"><span>Title</span><input data-draft="title" value="${esc(draft.title)}" placeholder="Leak under the sink"></label><label class="fld"><span>Where</span><input data-draft="loc" value="${esc(draft.loc)}" placeholder="BOH kitchen · near bay 7031"></label><label class="fld"><span>Type</span>${cats}</label><label class="fld"><span>Note</span><input data-draft="note" value="${esc(draft.note)}"></label><div class="mv-sub">Severity</div><div class="mv-chips">${sevs}</div>` +
    `<div class="acts2" style="display:flex;gap:8px;margin-top:12px"><span class="btn primary sm" data-act="draft-save">${ic('check')}${draft.editId ? 'Save changes' : 'Log issue'}</span><span class="btn sm" data-act="draft-cancel">Cancel</span></div></div>`;
}
function sidebar(m) {
  const pills = [['active', `Open ${m.open.length}`], ['recurring', `Recurring ${m.recurring}`], ['done', `Completed ${m.all.length - m.open.length}`], ['all', 'All']];
  const list = `<div class="pcard"><div class="pills" style="margin-bottom:12px">${pills.map(p => `<button class="${filter === p[0] ? 'on' : ''}" style="padding:5px 11px;font-size:12.5px" data-act="filter" data-filter="${p[0]}">${p[1]}</button>`).join('')}</div><div class="list">${m.list.map((i, n) => `<div class="li mt-li${selected === i.id ? ' sel' : ''}" data-act="select" data-id="${i.id}"><span class="stopn" style="background:${colour(i)}">${n + 1}</span><span class="nm" style="white-space:normal"><b style="font-weight:600">${esc(i.title)}${i.recur ? ` <span class="recur" title="Reopened ${i.recur} times">↻ ×${i.recur}</span>` : ''}</b><span class="where" style="display:block;font-size:12px;color:var(--dim)"><i class="sevdot" style="background:${SEV[i.sev][1]}"></i>${SEV[i.sev][0]} · ${esc(i.loc || CAT_NAME[i.cat])} · ${ago(i.created)}</span></span>${status(i.status === 'open' ? 'warn' : i.status === 'progress' ? 'info' : 'good', i.status === 'open' ? 'Open' : i.status === 'progress' ? 'Done, to check' : 'Completed')}</div>`).join('') || '<div class="li" style="color:var(--dim)">Nothing here.</div>'}</div></div>`;
  if (draft) return list + draftForm(false);
  const i = m.all.find(x => x.id === selected);
  if (!i) return list;
  const det = `<div class="card mtdet"><div class="ch"><h3>${esc(i.title)}</h3>${status(i.status === 'open' ? 'warn' : i.status === 'progress' ? 'info' : 'good', i.status === 'open' ? 'Open' : i.status === 'progress' ? 'Done, to check' : 'Completed')}</div>` +
    `<div class="mt-meta"><span><i class="sevdot" style="background:${SEV[i.sev][1]}"></i>${SEV[i.sev][0]} severity</span><span>${esc(i.loc || CAT_NAME[i.cat])}</span><span>Logged ${fmtTime(i.created)}</span>${i.recur ? `<span class="recur">↻ Recurring · reopened ${i.recur}×</span>` : ''}<span class="cs-dim">${CAT_NAME[i.cat]} · by ${esc(i.by || 'unknown device')}</span></div>` +
    `<div class="list">${i.log.map(l => `<div class="li"><span class="rt" style="margin:0">${fmtTime(l.t)}</span><span class="nm">${esc(l.a)}${l.n ? ' · ' + esc(l.n) : ''}</span></div>`).join('')}</div>` +
    `<div class="acts2" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${i.x != null ? `<span class="btn sm" data-act="show">${ic('pin')}Show on map</span>` : ''}${i.status !== 'completed' ? `<span class="btn sm" data-act="edit">${ic('edit')}Edit</span>` : ''}${i.status === 'open' ? `<span class="btn sm" style="color:#B45309" data-act="progress">${ic('tool')}Maintenance done</span>` : ''}${i.status !== 'completed' ? `<span class="btn sm" style="color:var(--green-ink)" data-act="close">${ic('check')}Complete</span>` : `<span class="btn sm" data-act="reopen">${ic('refresh')}Reopen</span>`}</div></div>`;
  return list + det;
}
function mobile(m) {
  if (draft) return draftForm(true);
  return mhead('Report an issue', `${m.open.length} open at the store`) + `<div class="mv-tiles"><button class="mv-tile hot" data-act="new"><span class="ti">${ic('plus')}</span><span class="tx"><b>New report</b><span>Where, what, how urgent</span></span><span></span>${ic('chev')}</button></div>` +
    `<div class="mv-sub">Open</div><div class="mv-rows">${m.open.slice(0, 8).map(i => `<div class="mv-row"><span class="a" style="color:${SEV[i.sev][1]}">${SEV[i.sev][0]}</span><span class="b">${esc(i.title)}<br><small>${esc(i.loc || '')}</small></span><span class="c">${ago(i.created)}</span></div>`).join('') || '<div class="mv-row"><span class="b">Nothing open.</span></div>'}</div>`;
}
