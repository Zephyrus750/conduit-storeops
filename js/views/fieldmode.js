// Field Mode (ShelfSearcher's field-mode, Floor P2): a manager walks the
// floor with a phone and checks each shelf against its label. Tap a shelf
// (or Save & next), scan or type what the label reads, add a comment:
//
//   · the label matches the map      → checked, nothing to send
//   · the label reads something else → a rename (A16 S2 → A17 S2)
//   · a comment alone                → a note on that shelf
//   · a shelf the map has no name for (outlined in blue) → a name for it,
//     known by its floor and position
//
// Captures wait on this phone until Send, which turns each into a suggested
// map edit (map.edit.suggest, src 'field') in the owner's queue; the owner
// applies or declines it there or in the map editor, and the phone shows
// how each went. Export still writes the field-capture/1 file.
// Opened by a manager from Settings.

import { $, ic, esc, vh, sub, mhead, toast, today, fmtTime } from '../ui.js';
import { mountMap, mvMap, bindMapChrome, segmentId, canonCode, hasMap, setStrip, sx } from '../map.js';
import { haptic } from '../device.js';

const KEY = no => `fieldcapture:${no}`;
// { caps: key → capture, sent: [{ id, kind, shelf, to, note, at }] }; an
// older device kept the captures alone, flat, with code/comment/differs.
const read = no => {
  let v = {}; try { v = JSON.parse(localStorage.getItem(KEY(no)) || '{}') || {}; } catch {}
  if (v.caps) return { caps: v.caps, sent: v.sent || [] };
  const caps = {}; for (const [k, c] of Object.entries(v)) caps[k] = c.kind ? c : { key: k, kind: c.differs ? 'rename' : c.comment ? 'flag' : 'ok', shelf: k, to: c.differs ? c.code : '', note: c.comment || '', floor: c.floor || null, at: c.at };
  return { caps, sent: [] };
};
const write = (no, v) => { try { localStorage.setItem(KEY(no), JSON.stringify(v)); return true; } catch { toast('This device’s storage is full: send or export the captures, then clear them', 'bad'); return false; } };
const isManager = ctx => (ctx.session.current?.roles || []).includes('manager');
const newId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pending = d => Object.values(d.caps).filter(c => c.kind !== 'ok' && !c.sent);
const what = c => c.kind === 'rename' ? `Rename ${esc(c.shelf)} → ${esc(c.to)}` : c.kind === 'name' ? `Name a new shelf → ${esc(c.to)}` : `Note on ${esc(c.shelf)}`;
const detail = c => c.kind === 'name' ? [c.near ? `beside ${esc(c.near)}` : '', c.note ? `“${esc(c.note)}”` : ''].filter(Boolean).join(' · ') : c.kind === 'rename' ? (c.note ? `“${esc(c.note)}”` : `label reads ${esc(c.to)}`) : `“${esc(c.note)}”`;
const unnamedKey = (floor, pos) => `@${floor || ''}:${pos.x},${pos.y}`;
let sel = null;   // { key, shelf, unnamed, floor, pos, near, dept }

export default {
  id: 'fieldmode', title: 'Field Mode', icon: 'm-map',
  desktop(ctx) {
    if (!isManager(ctx)) return vh('Field Mode', 'Needs the manager code', '', 'm-map') + `<div class="card"><p class="lbl">Field Mode checks shelves against their labels for the map. Enter the manager code on this device to use it.</p></div>`;
    return vh('Field Mode', sub('Check shelves against their labels', 'kept on this device until sent to the owner'), `<button class="btn" data-go="settings">${ic('x')}Exit</button>`, 'm-map') +
      `<div class="mapview fmview"><div class="mapbox"><div class="mapstage" id="mapstage"></div><div class="mapleg"><span><i style="background:#F1F5F9;border:1.5px dashed #94A3B8"></i>Not checked</span><span><i style="background:#16A34A"></i>Checked</span><span><i style="background:#E0F2FE;border:1.5px dashed #0EA5E9"></i>No name on the map</span></div></div><div class="card fm-panel fm-desk" id="fmpanel"></div></div>`;
  },
  mobile(ctx) {
    if (!isManager(ctx)) return mhead('Field Mode', 'Needs the manager code') + `<div class="mv-note">${ic('lock')}Enter the manager code on this device to check shelves.</div>`;
    return mvMap({ badge: `<span>Field Mode</span>` }) + `<div class="mv-sel mode fm-mob" id="fmpanel"></div>`;
  },
  mount(ctx, root) {
    if (!isManager(ctx) || !hasMap()) return [];
    sel = null;
    const map = mountMap($('#mapstage', root), { cls: 'fm', badges: false, tips: false, unnamed: true, onSelect: info => {
      if (info.kind === 'shelf') { sel = { key: info.full, shelf: info.full, unnamed: false, floor: map.floorId() || null, dept: info.dept, ...(info.pos ? { pos: info.pos } : {}) }; haptic('select'); paint(true); }
      else if (info.kind === 'unnamed' && info.pos && Number.isFinite(info.pos.x)) { const floor = info.floor || map.floorId() || null; sel = { key: unnamedKey(floor, info.pos), shelf: '', unnamed: true, floor, pos: info.pos, near: nearest(info.el) }; haptic('select'); paint(true); }
    } });
    bindMapChrome(root, map);
    const onFloor = () => map.segments().filter(g => g.closest('.mfl')?.getAttribute('data-fid') === map.floorId());
    // The named shelf nearest an unnamed one, to say where it is.
    const nearest = el => { const r = el.getBBox(), cx = r.x + r.width / 2, cy = r.y + r.height / 2; let best = null; for (const g of onFloor()) { if (!g.getAttribute('data-shelf')) continue; const b = g.getBBox(), d = (b.x + b.width / 2 - cx) ** 2 + (b.y + b.height / 2 - cy) ** 2; if (!best || d < best.d) best = { d, id: segmentId(g) }; } return best?.id || ''; };
    const paint = (focus = false) => {
      const d = read(ctx.storeNo), marks = {}; for (const c of Object.values(d.caps)) if (!c.kind || c.kind !== 'name') marks[c.key || c.shelf] = 'counted';
      map.setMarks(marks);
      for (const g of map.svg.querySelectorAll('.shelf-group[data-sel], .shelf-group[data-fmnamed]')) { g.removeAttribute('data-sel'); g.removeAttribute('data-fmnamed'); }
      for (const g of onFloor()) {
        if (!g.getAttribute('data-shelf')) { const r = g.querySelector('.shelf'), n = k => Number(r?.getAttribute(k)), pos = r?.tagName === 'circle' ? { x: n('cx'), y: n('cy') } : { x: n('x'), y: n('y') }, key = unnamedKey(map.floorId(), pos); if (d.caps[key]) g.setAttribute('data-fmnamed', '1'); if (sel?.key === key) g.setAttribute('data-sel', '1'); }
        else if (sel && !sel.unnamed && segmentId(g) === sel.key) g.setAttribute('data-sel', '1');
      }
      $('#fmpanel', root).innerHTML = panel(ctx, map, d);
      setStrip(root, strip(d));
      if (focus) $('[data-field="fmcode"]', root)?.focus({ preventScroll: true });
    };
    // Live: what Save will send, as the label is typed.
    const hint = () => { const el = $('[data-field="fmcode"]', root), out = $('.fm-hint', root); if (!el || !out || !sel) return; out.innerHTML = hintFor(sel, el.value); };
    const nextOpen = () => {
      const d = read(ctx.storeNo), ids = [...new Set(onFloor().filter(g => g.getAttribute('data-shelf')).map(segmentId))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const from = sel && !sel.unnamed ? ids.indexOf(sel.key) : -1, next = [...ids.slice(from + 1), ...ids.slice(0, from + 1)].find(id => !d.caps[id]);
      if (!next) { toast('Every named shelf on this floor is checked', 'good'); sel = null; return paint(); }
      const g = map.segments().find(x => segmentId(x) === next);
      sel = { key: next, shelf: next, unnamed: false, floor: map.floorId() || null, dept: (g?.getAttribute('data-dept') || '').toLowerCase() }; if (g) map.zoomTo(next, 400);
      paint(true);
    };
    // One send at a time: a second tap while the first is still going used
    // to read the same unsent checks and send each of them twice.
    let sending = false;
    const send = async () => {
      if (sending) return;
      const d = read(ctx.storeNo), list = pending(d); if (!list.length) return toast('Nothing to send yet');
      sending = true; const btn = root.querySelector('[data-act="fm-send"]'); if (btn) btn.disabled = true;
      let ok = 0;
      try { for (const c of list) {
        const id = newId();
        try {
          await ctx.store.dispatch({ type: 'map.edit.suggest', entity: { edit: id }, payload: { kind: c.kind, shelf: c.shelf || '', ...(c.to ? { to: c.to } : {}), ...(c.note ? { note: c.note } : {}), ...(c.floor ? { floor: c.floor } : {}), ...(c.pos ? { pos: c.pos } : {}), ...(c.near ? { near: c.near } : {}), src: 'field' } });
          c.sent = id; d.sent.unshift({ id, kind: c.kind, shelf: c.shelf || '', to: c.to || '', note: c.note || '', near: c.near || '', at: new Date().toISOString() }); ok++;
          d.sent = d.sent.slice(0, 60); write(ctx.storeNo, d);   // kept as it goes: a reload mid-send does not send it again
        } catch (e) { toast(e.message, 'bad'); break; }
      } } finally { sending = false; }
      if (ok) { haptic('success'); toast(`Sent ${ok} to the owner`); }
      paint();
    };
    root.addEventListener('submit', e => {
      const f = e.target.closest('[data-form="fm"]'); if (!f || !sel) return; e.preventDefault();
      const fd = new FormData(f), code = String(fd.get('code') || '').trim().toUpperCase().slice(0, 40), note = String(fd.get('comment') || '').trim().slice(0, 300);
      if (sel.unnamed && !code) return toast('Scan or type the name on its label', 'bad');
      if (!code && !note) return toast('Scan or type the label first', 'bad');
      const d = read(ctx.storeNo), was = d.caps[sel.key];
      const kind = sel.unnamed ? 'name' : code && canonCode(code) !== canonCode(sel.shelf) ? 'rename' : note ? 'flag' : 'ok';
      // A change after sending is a new suggestion; the sent one keeps its place in Sent.
      d.caps[sel.key] = { key: sel.key, kind, shelf: sel.shelf, to: kind === 'rename' || kind === 'name' ? code : '', note, floor: sel.floor, ...(sel.pos ? { pos: sel.pos } : {}), ...(sel.near ? { near: sel.near } : {}), at: new Date().toISOString(), ...(was?.sent && was.kind === kind && was.to === (kind === 'rename' || kind === 'name' ? code : '') && was.note === note ? { sent: was.sent } : {}) };
      if (!write(ctx.storeNo, d)) return;
      haptic('success');
      if (e.submitter?.dataset.save === 'next') nextOpen(); else { sel = null; paint(); }
    });
    root.addEventListener('input', e => { if (e.target.matches('[data-field="fmcode"]')) hint(); });
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'fm-next') nextOpen();
      else if (act === 'fm-back') { sel = null; paint(); }
      else if (act === 'fm-send') await send();
      else if (act === 'fm-drop') { const d = read(ctx.storeNo); delete d.caps[a.dataset.key]; write(ctx.storeNo, d); paint(); }
      else if (act === 'fm-clear' && sel) { const d = read(ctx.storeNo); delete d.caps[sel.key]; write(ctx.storeNo, d); paint(true); }
      else if (act === 'fm-wipe') { if (confirm('Clear every check on this device? Anything not sent yet is lost; what was sent stays in the owner’s queue.')) { write(ctx.storeNo, { caps: {}, sent: [] }); sel = null; paint(); } }
      else if (act === 'fm-export') {
        const d = read(ctx.storeNo), caps = {};
        for (const c of Object.values(d.caps)) if (c.kind !== 'name') caps[c.shelf] = { shelf: c.shelf.split(' ')[0], sub: c.shelf.split(' ').slice(1).join(' '), floor: c.floor, code: c.to || c.shelf, comment: c.note || '', at: c.at, ...(c.kind === 'rename' ? { differs: true } : {}) };
        const doc = { kind: 'field-capture', version: 1, storeNumber: ctx.storeNo, storeName: ctx.storeName, capturedAt: new Date().toISOString(), count: Object.keys(caps).length, captures: caps };
        const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })), link = document.createElement('a');
        link.href = url; link.download = `field-${ctx.storeNo}-${today()}.json`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast(`Exported ${doc.count} check${doc.count === 1 ? '' : 's'}`);
      }
    });
    map.stage.addEventListener('mapfloor', () => { sel = null; paint(); });
    paint();
    // The owner's answers come back through the store.
    return [ctx.store.on('mapedits', () => { if (!sel) paint(); })];

    function panel(ctx, map, d) {
      const named = [...new Set(onFloor().filter(g => g.getAttribute('data-shelf')).map(segmentId))];
      const checked = named.filter(id => d.caps[id]).length, waiting = pending(d), edits = ctx.store.get('mapedits') || {};
      if (sel) {
        const c = d.caps[sel.key], code = c ? (c.to || (sel.unnamed ? '' : sel.shelf)) : '';
        return `<form class="sx fmx-form" data-form="fm">` +
          (sel.unnamed ? `<div class="sx-h">${ic('plus')}New shelf<span class="n">Not on the map</span></div><div class="sx-sub">This shelf has no name on the map${sel.near ? ` · beside ${esc(sel.near)}` : ''}</div>`
            : `<div class="sx-h">${ic('m-map')}${esc(sel.shelf)}<span class="n">${c ? 'Checked' : 'On the map'}</span></div>`) +
          sx.sec(sel.unnamed ? 'Name on its label' : 'The label reads', `<div class="fmx-scan"><input class="sx-in" data-field="fmcode" name="code" value="${esc(code)}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${sel.unnamed ? 'Scan or type its label' : esc(sel.shelf)}" enterkeyhint="next"><button type="button" data-camera="fmcode" aria-label="Scan with the camera">${ic('barcode')}</button></div>`) +
          `<div class="fm-hint">${hintFor(sel, code)}</div>` +
          sx.sec('Comment', `<input class="sx-in" name="comment" maxlength="300" value="${esc(c?.note || '')}" placeholder="Anything the owner should know">`, 'optional') +
          `<div class="sx-acts"><button class="sx-btn sx-pri" type="submit" data-save="stay">${ic('check')}Save</button><button class="sx-btn" type="submit" data-save="next">${ic('arrow')}Save &amp; next</button><button class="sx-btn" type="button" data-act="fm-back">${ic('x')}${c ? 'Close' : 'Skip'}</button>${c ? `<button class="sx-btn" type="button" data-act="fm-clear">${ic('trash')}Clear</button>` : ''}</div></form>`;
      }
      const row = (icon, title, subl, tag, tone, extra = '') => `<div class="sx-r">${ic(icon)}<div class="k"><b>${title}</b>${subl ? `<span>${subl}</span>` : ''}</div>${tag ? `<span class="fmx-tag ${tone}">${tag}</span>` : ''}${extra}</div>`;
      const icon = c => c.kind === 'rename' ? 'edit' : c.kind === 'name' ? 'plus' : 'alert';
      const wait = waiting.map(c => row(icon(c), what(c), detail(c), '', '', `<button class="rt-x" type="button" data-act="fm-drop" data-key="${esc(c.key || c.shelf)}" aria-label="Remove">${ic('x')}</button>`));
      const sent = d.sent.slice(0, 12).map(x => { const e = edits[x.id], st = !e ? ['Sent', ''] : e.status === 'accepted' ? [/^on the map/i.test(e.reply || '') ? 'On the map' : 'Accepted', 'ok'] : e.status === 'declined' ? ['Declined', 'no'] : ['Waiting', 'wait'];
        return row(e?.status === 'accepted' ? 'check' : e?.status === 'declined' ? 'x' : icon(x), what(x), [`sent ${esc(fmtTime(x.at))}`, e?.reply && e.status === 'declined' ? `“${esc(e.reply)}”` : ''].filter(Boolean).join(' · '), st[0], st[1]); });
      return `<div class="sx"><div class="sx-h">${ic('m-map')}Field Mode<span class="n">${waiting.length ? `${waiting.length} to send` : 'Nothing to send'}</span></div>` +
        `<div class="sx-sub">${checked} of ${named.length} named shelves on this floor checked · tap a shelf; a shelf outlined in blue has no name on the map</div>` +
        (waiting.length ? sx.sec('Waiting to send', `<div class="sx-rows">${wait.join('')}</div>`, 'kept on this device until sent') : '') +
        `<div class="sx-acts">${waiting.length ? `<button class="sx-btn sx-pri" type="button" data-act="fm-send">${ic('arrow')}Send ${waiting.length} to the owner</button>` : ''}<button class="sx-btn${waiting.length ? '' : ' sx-pri'}" type="button" data-act="fm-next">${ic('arrow')}First unchecked</button>${Object.keys(d.caps).length ? `<button class="sx-btn" type="button" data-act="fm-export">${ic('file')}Export a file</button><button class="sx-btn" type="button" data-act="fm-wipe">${ic('trash')}Clear all</button>` : ''}</div>` +
        (sent.length ? sx.sec('Sent', `<div class="sx-rows">${sent.join('')}</div>`, 'the owner reviews these') : '') + `</div>`;
    }
    function strip(d) {
      const n = pending(d).length;
      if (sel) return `${ic(sel.unnamed ? 'plus' : 'm-map')}<b>${sel.unnamed ? 'New shelf' : esc(sel.shelf)}</b><span class="s">${sel.unnamed ? 'name it from its label' : 'check its label'}</span><button class="act" type="button" data-act="fm-back">${ic('x')}Close</button>`;
      return `${ic('m-map')}<b>Field Mode</b>${n ? `<span class="n">${n}</span><span class="s">to send</span><button class="act go" type="button" data-act="fm-send">${ic('arrow')}Send</button>` : `<span class="s">tap a shelf</span><button class="act" type="button" data-act="fm-next">${ic('arrow')}Next</button>`}`;
    }
  },
};

// What Save will do with what the label reads.
function hintFor(sel, value) {
  const code = String(value || '').trim().toUpperCase();
  if (sel.unnamed) return code ? `<div class="fmx-diff">${ic('plus')}<div>Sends a suggestion to <b>name this shelf ${esc(code)}</b>. The owner applies it to the map.</div></div>` : '';
  if (!code || canonCode(code) === canonCode(sel.shelf)) return code ? `<div class="fmx-diff ok">${ic('check')}<div>Matches the map. Save marks it checked; a comment goes to the owner as a note.</div></div>` : '';
  return `<div class="fmx-diff">${ic('edit')}<div>Different from the map: sends a suggestion to <b>rename ${esc(sel.shelf)} to ${esc(code)}</b>.</div></div>`;
}
