// Suggest map edits: the simple, staff-safe side of map authoring (the
// legacy viewer's "Suggest edits" mode). Tap a shelf, then suggest a new
// name for it or flag what is wrong. A suggestion never changes the map:
// the owner works the queue in the console's Map tab, makes the change in
// the separate map editor and publishes a new version. A manager can
// decline one here. Reads store.get('mapedits').

import { $, ic, esc, vh, sub, status, ago, toast, mhead, mbig, mghost, mfoot } from '../ui.js';
import { mountMap, mapbar, crumbx, bindMapChrome, tipLine, canonCode } from '../map.js';

let filter = 'open', draft = null;
const newId = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const KIND = { rename: ['Rename', 'edit'], flag: ['Flag', 'alert'] };
const STATE = { open: ['warn', 'Waiting'], accepted: ['good', 'Accepted'], declined: ['', 'Declined'] };

function model(ctx) {
  const all = Object.entries(ctx.store.get('mapedits') || {}).map(([id, x]) => ({ id, ...x })).sort((a, b) => (a.at < b.at ? 1 : -1));
  const open = all.filter(x => x.status === 'open');
  return { all, open, list: filter === 'open' ? open : all.filter(x => x.status !== 'open'), manager: (ctx.session.current?.roles || []).includes('manager') };
}
const line = x => x.kind === 'rename' ? `Rename to <b>${esc(x.to)}</b>${x.note ? ` · ${esc(x.note)}` : ''}` : esc(x.note);

export default {
  id: 'mapedits', title: 'Suggest map edits', rail: 'Suggest edits', icon: 'edit', area: 'floor',
  desktop(ctx) {
    const m = model(ctx);
    return vh('Suggest map edits', sub(`<span data-me-count>${m.open.length}</span> waiting`, 'the owner applies them in the map editor'), '', 'edit') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx('Suggest edits', ctx.storeNo)}<span><i style="background:#F59E0B"></i>Edit suggested</span><span style="color:var(--faint)">Tap a shelf to suggest a new name or flag a problem</span></div></div>` +
      `<div class="sidecol fill" id="meside"></div></div>`;
  },
  mobile() { return `<div id="memob"></div>`; },
  mount(ctx, root) {
    let map = null;
    const stage = $('#mapstage', root);
    const openFor = full => model(ctx).open.filter(x => x.shelf === full);
    if (stage) {
      map = mountMap(stage, {
        onSelect: info => { if (info.kind !== 'shelf') return; draft = { shelf: info.full.toUpperCase(), kind: draft?.kind || 'rename', to: '', note: '', floor: map.floorId() || null }; paint(); },
        tip: info => { const n = openFor(info.full.toUpperCase()).length; return n ? tipLine('o', 'edit', `${n} edit${n === 1 ? '' : 's'} suggested`) : ''; },
      });
      bindMapChrome(root, map);
    }
    const paint = () => {
      const m = model(ctx);
      if (map) { const marks = {}; for (const x of m.open) marks[x.shelf] = 'plana'; map.setMarks(marks); }
      const side = $('#meside', root); if (side) side.innerHTML = sidebar(m);
      const n = $('[data-me-count]', root); if (n) n.textContent = m.open.length;
      const mob = $('#memob', root); if (mob) mob.innerHTML = phone(m);
    };
    paint();
    const read = () => { if (!draft) return; for (const f of ['to', 'note', 'shelf']) { const el = root.querySelector(`[data-draft="${f}"]`); if (el) draft[f] = el.value.trim(); } };
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act');
      try {
        if (act === 'filter') { filter = a.getAttribute('data-filter'); paint(); }
        else if (act === 'new') { draft = { shelf: '', kind: 'rename', to: '', note: '' }; paint(); }
        else if (act === 'kind') { read(); draft.kind = a.getAttribute('data-kind'); paint(); }
        else if (act === 'cancel') { draft = null; paint(); }
        else if (act === 'send') {
          read();
          const shelf = draft.shelf.toUpperCase();
          if (!shelf) return toast('Which shelf? Tap it on the map or type its code', 'bad');
          if (draft.kind === 'rename' && !draft.to) return toast('Type the new name', 'bad');
          if (draft.kind === 'flag' && !draft.note) return toast('Say what is wrong', 'bad');
          await ctx.store.dispatch({ type: 'map.edit.suggest', entity: { edit: newId() }, payload: { shelf, kind: draft.kind, ...(draft.kind === 'rename' ? { to: draft.to } : {}), ...(draft.note ? { note: draft.note } : {}), ...(draft.floor ? { floor: draft.floor } : {}) } });
          draft = null; filter = 'open'; toast('Suggestion sent to the owner'); paint();
        }
        else if (act === 'decline') {
          const note = prompt('Decline this suggestion. Why? (optional)', ''); if (note === null) return;
          await ctx.store.dispatch({ type: 'map.edit.resolve', entity: { edit: a.getAttribute('data-id') }, payload: { status: 'declined', ...(note.trim() ? { note: note.trim() } : {}) } });
        }
        else if (act === 'show' && map) { const s = a.getAttribute('data-shelf'); map.select?.(s.split(' ')[0]); }
      } catch (err) { toast(err.message, 'bad'); }
    });
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset?.draft === 'shelf') { e.preventDefault(); read(); draft.shelf = canonCode(draft.shelf).replace(/^([A-Z]*\d+)([SE]\d+)$/, '$1 $2'); paint(); } });
    return [ctx.store.on('mapedits', paint)];
  },
};

function form(mobile) {
  const kinds = Object.entries(KIND).map(([k, v]) => `<button class="${draft.kind === k ? 'on' : ''}" data-act="kind" data-kind="${k}">${ic(v[1])}${v[0]}</button>`).join('');
  const what = draft.kind === 'rename'
    ? `<label class="fld"><span>New name</span><input data-draft="to" maxlength="40" value="${esc(draft.to)}" placeholder="e.g. Kitchen gadgets"></label><label class="fld"><span>Why (optional)</span><input data-draft="note" maxlength="300" value="${esc(draft.note)}"></label>`
    : `<label class="fld"><span>What is wrong</span><input data-draft="note" maxlength="300" value="${esc(draft.note)}" placeholder="e.g. This bay moved to the other side of the aisle"></label>`;
  const shelf = mobile || !draft.shelf ? `<label class="fld"><span>Shelf</span><input data-draft="shelf" class="mono" maxlength="40" value="${esc(draft.shelf)}" placeholder="A16 S1" autocapitalize="characters"></label>` : `<div class="me-shelf">${ic('pin')}<b>${esc(draft.shelf)}</b><span class="cs-dim">tap another shelf to change</span></div>`;
  if (mobile) return mhead('Suggest a map edit', 'the owner makes the change') + `<div class="mv-chips me-kinds">${kinds}</div>` + `<div class="me-form">${shelf}${what}</div>` + mfoot(mbig('Send suggestion', '', 'check', ' data-act="send"') + mghost('Cancel', ' data-act="cancel"'));
  return `<div class="card me-card"><div class="ch"><h3>Suggest an edit</h3></div><div class="pills me-kinds">${kinds}</div>${shelf}${what}` +
    `<div class="acts2" style="display:flex;gap:8px;margin-top:12px"><span class="btn primary sm" data-act="send">${ic('check')}Send suggestion</span><span class="btn sm" data-act="cancel">Cancel</span></div></div>`;
}
function item(x, m) {
  const [cls, label] = STATE[x.status] || STATE.open;
  return `<div class="li me-li"><span class="me-k">${ic(KIND[x.kind]?.[1] || 'edit')}</span><span class="nm" style="white-space:normal"><b class="mono">${esc(x.shelf)}</b><span class="me-line">${line(x)}</span><small class="cs-dim">${ago(x.at)}${x.by ? ' · ' + esc(x.by) : ''}${x.reply ? ' · “' + esc(x.reply) + '”' : ''}</small></span>${status(cls, label)}${x.status === 'open' && m.manager ? `<button class="btn sm" data-act="decline" data-id="${esc(x.id)}">Decline</button>` : ''}</div>`;
}
function sidebar(m) {
  const pills = [['open', `Waiting ${m.open.length}`], ['done', `Resolved ${m.all.length - m.open.length}`]];
  const list = `<div class="pcard"><div class="pills" style="margin-bottom:12px">${pills.map(p => `<button class="${filter === p[0] ? 'on' : ''}" style="padding:5px 11px;font-size:12.5px" data-act="filter" data-filter="${p[0]}">${p[1]}</button>`).join('')}</div><div class="list">${m.list.map(x => item(x, m)).join('') || `<div class="li" style="color:var(--dim)">${filter === 'open' ? 'Nothing waiting. Tap a shelf to suggest an edit.' : 'Nothing resolved yet.'}</div>`}</div></div>`;
  return (draft ? form(false) : `<div class="card me-card"><p class="lbl" style="margin:0">Tap a shelf on the map to suggest a new name or flag something wrong. The map only changes when the owner publishes a new version.</p><div style="margin-top:10px"><span class="btn sm" data-act="new">${ic('edit')}Type a shelf code instead</span></div></div>`) + list;
}
function phone(m) {
  if (draft) return form(true);
  return mhead('Suggest map edits', `${m.open.length} waiting for the owner`) + `<div class="mv-tiles"><button class="mv-tile hot" data-act="new"><span class="ti">${ic('edit')}</span><span class="tx"><b>Suggest an edit</b><span>Rename a shelf or flag a problem</span></span><span></span>${ic('chev')}</button></div>` +
    `<div class="mv-sub">Waiting</div><div class="list me-plist">${m.open.slice(0, 20).map(x => item(x, m)).join('') || '<div class="li cs-dim">Nothing waiting.</div>'}</div>`;
}
