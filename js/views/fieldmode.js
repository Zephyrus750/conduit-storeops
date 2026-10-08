// Field Mode (ShelfSearcher's field-mode, Floor P2): walk the floor with a
// phone and record each shelf module's location code and a comment, to
// bring back into the map editor. Tap a shelf (or Save & next), scan or type
// its label, save. Captures stay on this device until exported as a file;
// they are notes for the map editor, not store records, so no event is sent.
// Opened by a manager from Settings › Store.

import { $, ic, esc, vh, sub, mhead, toast, today } from '../ui.js';
import { mountMap, mvMap, bindMapChrome, segmentId, canonCode, hasMap } from '../map.js';
import { haptic } from '../device.js';

const KEY = no => `fieldcapture:${no}`;
const read = no => { try { return JSON.parse(localStorage.getItem(KEY(no)) || '{}') || {}; } catch { return {}; } };
const write = (no, v) => { try { localStorage.setItem(KEY(no), JSON.stringify(v)); return true; } catch { toast('This device’s storage is full: export the captures, then clear them', 'bad'); return false; } };
const isManager = ctx => (ctx.session.current?.roles || []).includes('manager');
let sel = null;

const panel = (ctx, map) => {
  const caps = read(ctx.storeNo), segs = map ? map.segments().filter(g => g.closest('.mfl')?.getAttribute('data-fid') === map.floorId()) : [];
  const ids = [...new Set(segs.map(segmentId))], done = ids.filter(id => caps[id]).length, all = Object.keys(caps).length;
  const pct = ids.length ? Math.round(done / ids.length * 100) : 0, c = sel ? caps[sel] : null;
  const head = `<div class="fm-prog"><b>${done} of ${ids.length}</b> modules on this floor · ${all} captured in all<div class="track"><i style="width:${pct}%"></i></div></div>`;
  const form = sel ? `<form class="fm-form" data-form="fm"><div class="fm-id">${ic('m-map')}<b>${esc(sel)}</b>${c ? `<span class="status good">Captured</span>` : ''}</div>` +
    `<label>Location code</label><div class="mv-field"><input data-field="fmcode" name="code" value="${esc(c?.code || '')}" autocomplete="off" autocapitalize="characters" placeholder="Scan or type the shelf label" enterkeyhint="next"><button type="button" class="mv-cam" data-camera="fmcode" aria-label="Scan with the camera">${ic('camera')}</button></div>` +
    `<label>Comment</label><textarea name="comment" rows="2" maxlength="300" placeholder="Anything the editor should know">${esc(c?.comment || '')}</textarea>` +
    `<div class="fm-acts"><button class="btn" type="submit" data-save="stay">${ic('check')}Save</button><button class="btn primary" type="submit" data-save="next">Save &amp; next${ic('arrow')}</button>${c ? `<button class="btn ghost danger" type="button" data-act="fm-clear">Clear</button>` : ''}</div></form>`
    : `<p class="lbl">Tap a shelf on the map to capture it, or start with the first one not yet done.</p><button class="btn primary" data-act="fm-next">${ic('arrow')}First uncaptured</button>`;
  const tools = `<div class="fm-tools"><button class="btn sm" data-act="fm-export"${all ? '' : ' disabled'}>${ic('file')}Export ${all} capture${all === 1 ? '' : 's'}</button><button class="btn sm ghost danger" data-act="fm-wipe"${all ? '' : ' disabled'}>${ic('trash')}Clear all</button></div>`;
  return head + form + tools;
};

export default {
  id: 'fieldmode', title: 'Field Mode', icon: 'm-map',
  desktop(ctx) {
    if (!isManager(ctx)) return vh('Field Mode', 'Needs the manager code', '', 'm-map') + `<div class="card"><p class="lbl">Field Mode records shelf codes for the map editor. Enter the manager code on this device to use it.</p></div>`;
    return vh('Field Mode', sub('Capture shelf codes for the map editor', 'kept on this device until exported'), `<button class="btn" data-go="settings">${ic('x')}Exit</button>`, 'm-map') +
      `<div class="mapview fmview"><div class="mapbox"><div class="mapstage" id="mapstage"></div><div class="mapleg"><span><i style="background:#F1F5F9;border:1.5px dashed #94A3B8"></i>Not captured</span><span><i style="background:#16A34A"></i>Captured</span><span><i style="background:transparent;border:2px solid #D24E0E"></i>Selected</span></div></div><div class="card fm-panel" id="fmpanel"></div></div>`;
  },
  mobile(ctx) {
    if (!isManager(ctx)) return mhead('Field Mode', 'Needs the manager code') + `<div class="mv-note">${ic('lock')}Enter the manager code on this device to capture shelf codes.</div>`;
    return mvMap({ badge: `<span>Field Mode</span>` }) + `<div class="mv-sel mode fm-mob" id="fmpanel"></div>`;
  },
  mount(ctx, root) {
    if (!isManager(ctx) || !hasMap()) return [];
    const map = mountMap($('#mapstage', root), { cls: 'fm', badges: false, tips: false, onSelect: info => { if (info.kind === 'shelf') { sel = info.full; haptic('select'); paint(true); } } });
    bindMapChrome(root, map);
    const paint = (focus = false) => {
      const caps = read(ctx.storeNo), marks = {}; for (const id of Object.keys(caps)) marks[id] = 'counted';
      map.setMarks(marks);
      for (const g of map.svg.querySelectorAll('.shelf-group[data-sel]')) g.removeAttribute('data-sel');
      if (sel) for (const g of map.segments()) if (segmentId(g) === sel) g.setAttribute('data-sel', '1');
      $('#fmpanel', root).innerHTML = panel(ctx, map);
      if (focus) $('[data-field="fmcode"]', root)?.focus({ preventScroll: true });
    };
    const nextOpen = () => {
      const caps = read(ctx.storeNo), ids = [...new Set(map.segments().filter(g => g.closest('.mfl')?.getAttribute('data-fid') === map.floorId()).map(segmentId))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const from = sel ? ids.indexOf(sel) : -1, next = [...ids.slice(from + 1), ...ids.slice(0, from + 1)].find(id => !caps[id]);
      if (!next) { toast('Every module on this floor is captured', 'good'); sel = null; return paint(); }
      sel = next; const g = map.segments().find(x => segmentId(x) === next); if (g) map.zoomTo(g.getAttribute('data-shelf'), 400);
      paint(true);
    };
    root.addEventListener('submit', e => {
      const f = e.target.closest('[data-form="fm"]'); if (!f || !sel) return; e.preventDefault();
      const fd = new FormData(f), code = String(fd.get('code') || '').trim().toUpperCase(), comment = String(fd.get('comment') || '').trim();
      if (!code && !comment) return toast('Scan or type the location code first', 'bad');
      const caps = read(ctx.storeNo), [shelf, ...rest] = sel.split(' ');
      caps[sel] = { shelf, sub: rest.join(' '), code: code.slice(0, 40), comment: comment.slice(0, 300), at: new Date().toISOString(), ...(code && canonCode(code) !== canonCode(sel) ? { differs: true } : {}) };
      if (!write(ctx.storeNo, caps)) return;
      haptic('success');
      if (e.submitter?.dataset.save === 'next') nextOpen(); else paint();
    });
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'fm-next') nextOpen();
      else if (a.dataset.act === 'fm-clear' && sel) { const caps = read(ctx.storeNo); delete caps[sel]; write(ctx.storeNo, caps); paint(true); }
      else if (a.dataset.act === 'fm-wipe') { if (confirm('Clear every capture on this device? Export them first if the editor still needs them.')) { write(ctx.storeNo, {}); sel = null; paint(); } }
      else if (a.dataset.act === 'fm-export') {
        const caps = read(ctx.storeNo), doc = { kind: 'field-capture', version: 1, storeNumber: ctx.storeNo, storeName: ctx.storeName, capturedAt: new Date().toISOString(), count: Object.keys(caps).length, captures: caps };
        const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })), link = document.createElement('a');
        link.href = url; link.download = `field-${ctx.storeNo}-${today()}.json`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast(`Exported ${doc.count} capture${doc.count === 1 ? '' : 's'}`);
      }
    });
    map.stage.addEventListener('mapfloor', () => { sel = null; paint(); });
    paint();
    return [];
  },
};
