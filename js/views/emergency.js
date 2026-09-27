// Emergency: markers come from the published map; service records from
// store.get('assets'). Service done and schedule set are events.
//
// Nearest exit (the legacy viewer's evacuation route): press it, tap where
// you are, and the walk to the closest exit on that floor draws in green,
// then on to the assembly point. The store's assembly point from the map
// editor's Store Info shows as a banner with directions.

import { $, ic, esc, vh, sub, status, fmtDate, toast, mbig, mghost } from '../ui.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, mapInfo } from '../map.js';

const TYPES = { 'fire-ext': ['Fire extinguisher', '#DC2626', 'ext'], 'ext-set': ['Extinguisher set', '#DC2626', 'ext'], exit: ['Fire exit', '#16A34A', 'arrow'], 'fire-exit': ['Fire exit', '#16A34A', 'arrow'], 'first-aid': ['First aid kit', '#2563EB', 'plus'], aed: ['AED defibrillator', '#F59E0B', 'bolt'], 'spill-kit': ['Spill kit', '#7C3AED', 'alert'], hose: ['Fire hose', '#DC2626', 'flame'], assembly: ['Assembly point', '#16A34A', 'pin'], hazard: ['Hazard', '#F59E0B', 'alert'], hydrant: ['Hydrant', '#DC2626', 'flame'], 'call-point': ['Call point', '#DC2626', 'bolt'], 'emergency-phone': ['Emergency phone', '#2563EB', 'bolt'] };
const SOON_DAYS = 30;
let selected = null, filterType = '', evac = null;   // evac: null | 'armed' | { r, floor }

function state(rec) { if (!rec?.due) return 'none'; const d = (new Date(rec.due) - Date.now()) / 86400000; return d < 0 ? 'overdue' : d <= SOON_DAYS ? 'soon' : 'ok'; }
function model(ctx, map) {
  const assets = ctx.store.get('assets');
  const markers = map ? map.markers() : [];
  const rows = markers.map(mk => ({ ...mk, rec: assets[mk.id] || null, st: state(assets[mk.id]) }));
  const due = rows.filter(r => r.st === 'overdue' || r.st === 'soon').sort((a, b) => (a.rec.due < b.rec.due ? -1 : 1));
  const counts = {}; for (const r of rows) counts[r.type] = (counts[r.type] || 0) + 1;
  return { rows, due, counts, markers };
}
export default {
  id: 'emergency', title: 'Emergency', icon: 'm-emergency',
  desktop(ctx) {
    return vh('Emergency', sub('<span id="emsub">…</span>'), `<button class="btn evac" data-act="evac" id="evacBtn">${ic('pin')}Nearest exit</button><button class="btn primary" data-act="service">${ic('alert')}Log a service</button>`, 'm-emergency') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx('Emergency', ctx.storeNo)}<span><i style="background:#DC2626"></i>Fire exits and extinguishers</span><span><i style="background:#2563EB"></i>First aid</span><span><i style="background:#F59E0B"></i>AED</span><span><i style="background:#16A34A"></i>Assembly point</span><span style="color:var(--faint)">Tap a marker for its details and servicing</span></div></div>` +
      `<div class="sidecol" id="emside"></div></div>`;
  },
  mobile(ctx) { return mvMap({ badge: '<span id="emsub">…</span>' }) + `<div class="mv-sel mode em" id="emmob"></div>`; },
  mount(ctx, root) {
    evac = null;
    const map = mountMap($('#mapstage', root), { showEmergency: true, onSelect: info => {
      if (evac === 'armed') {
        const p = info.point || (info.kind === 'marker' ? [info.x, info.y] : info.id ? map.centreOf(info.id) : null); if (!p) return;
        const r = map.evacuate(p);
        if (!r) { evac = null; toast('No exit is marked on this floor of the map. Follow the green exit signs.', 'bad'); }
        else { evac = { r, floor: map.floors?.().find(f => f.id === map.floorId())?.name || '' }; try { navigator.vibrate?.([80, 60, 80]); } catch {} }
        paint(); return;
      }
      if (info.kind === 'marker') { selected = info.id; paint(); }
    } });
    bindMapChrome(root, map);
    $('#mapstage', root)?.addEventListener('mapfloor', () => { if (evac && evac !== 'armed') { map.clearOverlays(); evac = null; paint(); } });
    const paint = () => {
      const m = model(ctx, map);
      for (const r of m.rows) r.el.style.opacity = !filterType || r.type === filterType ? '' : '.15';
      const s = $('#emsub', root); if (s) s.innerHTML = `<b>${m.rows.length}</b> markers · ${m.due.length} services due`;
      const b = $('#evacBtn', root); if (b) { b.classList.toggle('on', !!evac); b.innerHTML = evac ? `${ic('x')}${evac === 'armed' ? 'Cancel' : 'Hide route'}` : `${ic('pin')}Nearest exit`; }
      const side = $('#emside', root); if (side) side.innerHTML = sidebar(m);
      const mob = $('#emmob', root); if (mob) { mob.innerHTML = mobile(m); if (evac) mob.scrollTop = 0; }
    };
    paint();
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act');
      try {
        if (act === 'evac') {
          if (evac) { map.clearOverlays(); evac = null; }
          else { selected = null; evac = 'armed'; toast('Tap where you are on the map'); }
          paint(); return;
        }
        if (act === 'select') { selected = a.getAttribute('data-id'); const r = map.markers().find(x => x.id === selected); if (r) map.setVb([r.x - 600, r.y - 400, 1200, 800]); paint(); }
        else if (act === 'close') { selected = null; paint(); }
        else if (act === 'filter') { filterType = a.getAttribute('data-type'); paint(); }
        else if (act === 'service') { if (!selected) return toast('Tap a marker on the map first'); const note = prompt('Technician / docket #', '') ?? ''; await ctx.store.dispatch({ type: 'asset.service', entity: { asset: selected }, payload: { note } }); toast('Service logged'); }
        else if (act === 'schedule') { const cur = ctx.store.get('assets')[selected]?.intMonths || 12; const v = prompt('Service interval in months', String(cur)); const n = Number(v); if (!v || !Number.isInteger(n)) return; await ctx.store.dispatch({ type: 'asset.schedule', entity: { asset: selected }, payload: { months: n } }); }
      } catch (err) { toast(err.message, 'bad'); }
    });
    return [ctx.store.on('assets', paint)];
  },
};
function detail(r) {
  const t = TYPES[r.type] || [r.type, '#64748B', 'alert'];
  const rec = r.rec;
  return `<div class="card"><div class="ch"><h3 style="color:${t[1]}">${t[0]}${r.extClass ? ` · ${esc(r.extClass)}` : ''}</h3><span class="ibtn" data-act="close">${ic('x')}</span></div>` +
    `<div class="mt-meta"><span>${esc(r.location || r.label || 'On the map')}</span>${r.dept ? `<span>${esc(r.dept.toUpperCase())}</span>` : ''}${rec ? `<span>${rec.due ? 'Due ' + fmtDate(rec.due) : 'No schedule'}</span><span>Every ${rec.intMonths} months</span>` : '<span class="cs-dim">Not serviced yet</span>'}</div>` +
    (r.detail ? `<div class="msh-sec"><b>${ic('file')}Notes</b><p>${esc(r.detail)}</p></div>` : '') +
    (r.method ? `<div class="msh-sec"><b>${ic('listcheck')}Method</b><p>${esc(r.method)}</p></div>` : '') + (r.operation ? `<div class="msh-sec"><b>${ic('tool')}Operation</b><p>${esc(r.operation)}</p></div>` : '') +
    (rec ? `<div class="list">${rec.log.slice().reverse().slice(0, 6).map(l => `<div class="li"><span class="rt" style="margin:0">${fmtDate(l.t)}</span><span class="nm">${esc(l.a)}${l.n ? ' · ' + esc(l.n) : ''}</span></div>`).join('')}</div>` : '') +
    `<div class="acts2" style="display:flex;gap:8px;margin-top:12px"><span class="btn primary sm" data-act="service">${ic('check')}Service done</span><span class="btn sm" data-act="schedule">Set schedule</span></div></div>`;
}
function sidebar(m) {
  const sel = m.rows.find(r => r.id === selected);
  const due = `<div class="card"><div class="ch"><h3>Service due</h3></div><div class="list emlist">${m.due.map(r => `<div class="li" data-act="select" data-id="${r.id}"><span class="pt" style="background:${(TYPES[r.type] || [])[1] || '#64748B'}"></span><span class="nm">${(TYPES[r.type] || [r.type])[0]} · ${esc(r.location || r.label || '')}<span class="where" style="display:block;font-size:12px;color:var(--dim)">every ${r.rec.intMonths} months · due ${fmtDate(r.rec.due)}</span></span>${status('warn', r.st === 'overdue' ? 'Overdue' : 'Due')}</div>`).join('') || '<div class="li" style="color:var(--dim)">Nothing due in the next 30 days.</div>'}</div></div>`;
  const eq = `<div class="card"><div class="ch"><h3>Equipment</h3></div><div class="list">${Object.entries(m.counts).map(([t, n]) => `<div class="li" data-act="filter" data-type="${filterType === t ? '' : t}"><span class="pt" style="background:${(TYPES[t] || [])[1] || '#64748B'}"></span><span class="nm">${(TYPES[t] || [t])[0]}</span><span class="rt">${m.rows.filter(r => r.type === t && r.st === 'ok').length} in date</span><b>${n}</b></div>`).join('')}</div></div>`;
  return evacCard() + assemblyCard() + (sel ? detail(sel) : '') + due + eq;
}
function mobile(m) {
  const sel = m.rows.find(r => r.id === selected);
  if (evac) return evacCard(true) + assemblyCard();
  if (sel) return detail(sel);
  const types = Object.keys(m.counts);
  return `<div class="mv-mh">${ic('m-emergency')}<b>Emergency</b><span>${m.rows.length}</span></div><div class="em-filt"><button class="${!filterType ? 'on' : ''}" data-act="filter" data-type="">${ic('grid')}All</button>${types.map(t => `<button class="${filterType === t ? 'on' : ''}" data-act="filter" data-type="${t}">${ic((TYPES[t] || [])[2] || 'alert')}${(TYPES[t] || [t])[0]}</button>`).join('')}</div>` +
    `<div class="em-mevac">${mbig('Nearest exit', 'evac', 'pin', ' data-act="evac"')}</div>` + assemblyCard() +
    (m.due.length ? `<div class="mv-hint">${m.due.length} service${m.due.length === 1 ? '' : 's'} due · tap a marker to log one</div>` : '<div class="mv-hint">Tap a marker for its method, operation and servicing.</div>');
}

// ── evacuation ─────────────────────────────────────────────────────────
// Distances in metres only when the map carries its scale (metresPerUnit).
function metres(units) { const mpu = mapInfo()?.metresPerUnit; return mpu ? `about ${Math.max(5, Math.round(units * mpu / 5) * 5)} m` : ''; }
function evacCard(mobile) {
  if (!evac) return '';
  const hide = `<span class="btn sm" data-act="evac">${ic('x')}${evac === 'armed' ? 'Cancel' : 'Hide route'}</span>`;
  if (evac === 'armed') return `<div class="card em-evac"><div class="ch"><h3>${ic('pin')}Nearest exit</h3>${hide}</div><p class="lbl" style="margin:0">Tap where you are on the map. The walk to the closest exit on this floor draws in green.</p></div>`;
  const { exit, assembly } = evac.r, where = x => esc(x.label || x.location || '');
  const steps = [`Walk to the <b>fire exit</b>${where(exit.target) ? ` (${where(exit.target)})` : ''}${metres(exit.dist) ? `, ${metres(exit.dist)}` : ''}.${exit.straight ? ' <i>No walk paths on this floor: the line is straight, so follow the aisles and the green exit signs.</i>' : ''}`];
  if (assembly) steps.push(`Go on to the <b>assembly point</b>${where(assembly.target) ? ` (${where(assembly.target)})` : ''}${!assembly.straight && metres(assembly.dist) ? `, ${metres(assembly.dist)}` : ''}${assembly.straight ? ', marked on the map' : ''}.`);
  else steps.push(assemblyText() ? `Then go to the <b>assembly point</b>: ${esc(assemblyText())}.` : 'Then go to the <b>assembly point</b>.');
  return `<div class="card em-evac"><div class="ch"><h3>${ic('pin')}Nearest exit${evac.floor ? ` · ${esc(evac.floor)}` : ''}</h3>${hide}</div><ol class="em-steps">${steps.map(x => `<li>${x}</li>`).join('')}</ol>${mobile ? '' : '<p class="lbl" style="margin:8px 0 0">Blue is where you tapped. Tap Nearest exit again to start from somewhere else.</p>'}</div>`;
}
const assemblyText = () => mapInfo()?.storeInfo?.assemblyNotes || '';
// The store's assembly point from the map editor's Store Info, with
// directions when it has coordinates.
function assemblyCard() {
  const si = mapInfo()?.storeInfo || {}, has = si.assemblyLat != null && si.assemblyLng != null;
  if (!si.assemblyNotes && !has) return '';
  const q = has ? `${si.assemblyLat},${si.assemblyLng}` : '';
  const links = has ? `<div class="em-asm-links"><a class="btn sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}" target="_blank" rel="noopener noreferrer">${ic('pin')}Google Maps</a><a class="btn sm" href="https://maps.apple.com/?ll=${encodeURIComponent(q)}&q=${encodeURIComponent('Assembly point')}" target="_blank" rel="noopener noreferrer">${ic('pin')}Apple Maps</a></div>` : '';
  return `<div class="em-asm" role="note">${ic('users')}<div><b>Assembly point</b><span>${esc(si.assemblyNotes || 'Directions to the assembly point')}</span>${links}</div></div>`;
}
