// Emergency: markers come from the published map; service records from
// store.get('assets'). Service done and schedule set are events.
//
// Nearest exit (the legacy viewer's evacuation route): press it, tap where
// you are, and the walk to the closest exit on that floor draws in green,
// then on to the assembly point. The store's assembly point from the map
// editor's Store Info shows as a banner with directions.

import { haptic } from '../device.js';
import { $, ic, esc, vh, sub, status, fmtDate, toast, mbig, mghost, mgr } from '../ui.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, mapInfo, mapFloors, setStrip, sx } from '../map.js';
import { paperMap } from '../printmap.js';
import { printSheet, table, tick, signoff } from '../print.js';
import { markerSymbol, MARKER_NAMES } from '../../shared/maprender.js';
import { tx, txn } from '../i18n.js';

const TYPES = { 'fire-ext': [tx('Fire extinguisher'), '#DC2626', 'ext'], 'ext-set': [tx('Extinguisher set'), '#DC2626', 'ext'], exit: [tx('Fire exit'), '#16A34A', 'arrow'], 'fire-exit': [tx('Fire exit'), '#16A34A', 'arrow'], 'first-aid': [tx('First aid kit'), '#2563EB', 'plus'], aed: [tx('AED defibrillator'), '#F59E0B', 'bolt'], 'spill-kit': [tx('Spill kit'), '#7C3AED', 'alert'], hose: [tx('Fire hose'), '#DC2626', 'flame'], assembly: [tx('Assembly point'), '#16A34A', 'pin'], hazard: [tx('Hazard'), '#F59E0B', 'alert'], hydrant: [tx('Hydrant'), '#DC2626', 'flame'], 'call-point': [tx('Call point'), '#DC2626', 'bolt'], 'emergency-phone': [tx('Emergency phone'), '#2563EB', 'bolt'] };
const SOON_DAYS = 30;
// Extinguisher classes as the sign says them, with the band colour (the
// editor stores the key: wet_chem, co2…).
const EXT_NAME = { water: tx('Water'), foam: tx('Foam'), powder: tx('Dry powder'), co2: 'CO₂', wet_chem: tx('Wet chemical'), liquid: tx('Vaporising liquid') };
const EXT_BAND = { water: '#DC2626', foam: '#0057B8', powder: '#FFFFFF', co2: '#111111', wet_chem: '#E8B98A', liquid: '#FFD500' };
const extName = k => EXT_NAME[String(k || '').toLowerCase()] || String(k || '');
const extBand = k => { const c = EXT_BAND[String(k || '').toLowerCase()]; return c ? `<i class="ext-band" style="background:${c}"></i>` : ''; };
let selected = null, filterType = '', evac = null;   // evac: null | 'armed' | { r, floor }
// The map's own name for a kind of marker (shared/maprender.js), in the device's language.
const markerName = t => (MARKER_NAMES[t] ? tx(MARKER_NAMES[t]) : (TYPES[t] || [t])[0]);
// A service log line: what was done (the reducer's words) and its note.
const logNote = l => { const mo = l.a === 'Schedule set' ? /^(\d+) months$/.exec(l.n || '') : null; return mo ? txn(Number(mo[1]), '{n} month', '{n} months') : esc(l.n); };

function state(rec) { if (!rec?.due) return 'none'; const d = (new Date(rec.due) - Date.now()) / 86400000; return d < 0 ? 'overdue' : d <= SOON_DAYS ? 'soon' : 'ok'; }
// The old key a marker's history may sit under (see the asset reducers).
const fromKey = (map, id) => { const mk = map.markers().find(x => x.id === id); return mk && mk.legacyId !== mk.id ? { from: mk.legacyId } : {}; };
function model(ctx, map) {
  const assets = ctx.store.get('assets');
  const markers = map ? map.markers() : [];
  // A marker's record is under its editor id; one serviced before markers
  // had ids is still under its old type-and-position key until next used.
  const recOf = mk => assets[mk.id] || assets[mk.legacyId] || null;
  const rows = markers.map(mk => ({ ...mk, rec: recOf(mk), st: state(recOf(mk)) }));
  const due = rows.filter(r => r.st === 'overdue' || r.st === 'soon').sort((a, b) => (a.rec.due < b.rec.due ? -1 : 1));
  const counts = {}; for (const r of rows) counts[r.type] = (counts[r.type] || 0) + 1;
  return { rows, due, counts, markers };
}
export default {
  id: 'emergency', title: tx('Emergency'), icon: 'm-emergency',
  desktop(ctx) {
    return vh(tx('Emergency'), sub('<span id="emsub">…</span>'), `<button class="btn" data-act="evacprint" title="${tx('An evacuation map for the staff room, one page per floor, and the equipment walk sheet')}">${ic('print')}${tx('Print evacuation map')}</button><button class="btn evac" data-act="evac" id="evacBtn">${ic('pin')}${tx('Nearest exit')}</button><button class="btn primary" data-act="service">${ic('alert')}${tx('Log a service')}</button>`, 'm-emergency') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx(tx('Emergency'), ctx.storeNo)}<span><i style="background:#DC2626"></i>${tx('Fire exits and extinguishers')}</span><span><i style="background:#2563EB"></i>${tx('First aid')}</span><span><i style="background:#F59E0B"></i>${tx('AED')}</span><span><i style="background:#16A34A"></i>${tx('Assembly point')}</span><span style="color:var(--faint)">${tx('Tap a marker for its details and servicing')}</span></div></div>` +
      `<div class="sidecol" id="emside"></div></div>`;
  },
  mobile(ctx) { return mvMap({ badge: '<span id="emsub">…</span>' }) + `<div class="mv-sel mode em" id="emmob"></div>`; },
  mount(ctx, root) {
    evac = null;
    const map = mountMap($('#mapstage', root), { showEmergency: true, onSelect: info => {
      if (evac === 'armed') {
        const p = info.point || (info.kind === 'marker' ? [info.x, info.y] : info.id ? map.centreOf(info.id) : null); if (!p) return;
        const r = map.evacuate(p);
        if (!r) { evac = null; toast(tx('No exit is marked on this floor of the map. Follow the green exit signs.'), 'bad'); }
        else { evac = { r, floor: map.floors?.().find(f => f.id === map.floorId())?.name || '', fid: map.floorId(), origin: p }; haptic('warning'); }
        paint(); return;
      }
      if (info.kind === 'marker') { selected = info.id; paint(); }
    } });
    bindMapChrome(root, map);
    $('#mapstage', root)?.addEventListener('mapfloor', () => { if (evac && evac !== 'armed') { map.clearOverlays(); evac = null; paint(); } });
    const paint = () => {
      const m = model(ctx, map);
      // A kind picked shows only its markers, as ShelfSearcher's equipment bar did.
      for (const r of m.rows) { const on = !filterType || r.type === filterType; r.el.style.opacity = on ? '' : '0'; r.el.style.pointerEvents = on ? '' : 'none'; }
      const s = $('#emsub', root); if (s) s.innerHTML = txn(m.rows.length, '<b>{n}</b> marker', '<b>{n}</b> markers') + ($('#emmob', root) ? '' : ' · ' + txn(m.due.length, '{n} service due', '{n} services due'));
      const b = $('#evacBtn', root); if (b) { b.classList.toggle('on', !!evac); b.innerHTML = evac ? `${ic('x')}${evac === 'armed' ? tx('Cancel') : tx('Hide route')}` : `${ic('pin')}${tx('Nearest exit')}`; }
      const side = $('#emside', root); if (side) side.innerHTML = sidebar(m);
      const mob = $('#emmob', root); if (mob) { mob.innerHTML = mobile(m, isManager(ctx)); if (evac) mob.scrollTop = 0; }
      setStrip(root, emStrip(m));
    };
    paint();
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act');
      try {
        if (act === 'evac') {
          if (evac) { map.clearOverlays(); evac = null; }
          else { selected = null; evac = 'armed'; toast(tx('Tap where you are on the map')); }
          paint(); return;
        }
        if (act === 'evacprint') { printEvacuation(ctx, model(ctx, map), evac && evac !== 'armed' ? evac : null); return; }
        if (act === 'select') { selected = a.getAttribute('data-id'); const r = map.markers().find(x => x.id === selected); if (r) map.setVb([r.x - 600, r.y - 400, 1200, 800]); paint(); }
        else if (act === 'close') { selected = null; paint(); }
        else if (act === 'filter') { filterType = a.getAttribute('data-type'); paint(); }
        else if (act === 'service') { if (!selected) return toast(tx('Tap a marker on the map first')); const note = prompt(tx('Technician / docket #'), ''); if (note == null) return; await ctx.store.dispatch({ type: 'asset.service', entity: { asset: selected }, payload: { note, ...fromKey(map, selected) } }); toast(tx('Service logged')); }
        else if (act === 'schedule') { const mk = map.markers().find(x => x.id === selected), cur = (ctx.store.get('assets')[selected] || ctx.store.get('assets')[mk?.legacyId])?.intMonths || 12; const v = prompt(tx('Service interval in months'), String(cur)); const n = Number(v); if (!v || !Number.isInteger(n)) return; await ctx.store.dispatch({ type: 'asset.schedule', entity: { asset: selected }, payload: { months: n, ...fromKey(map, selected) } }); }
      } catch (err) { toast(err.message, 'bad'); }
    });
    return [ctx.store.on('assets', paint)];
  },
};
// A marker's card. Servicing (due dates, the log, Service done) is for
// managers on the desktop; the phone shows what it is and how to use it.
function detail(r, phone = false, mark = false) {
  const t = TYPES[r.type] || [r.type, '#64748B', 'alert'];
  const rec = r.rec;
  return `<div class="card"><div class="ch"><h3 style="color:${t[1]}">${t[0]}${r.extClass ? ` · ${extBand(r.extClass)}${esc(extName(r.extClass))}` : ''}</h3><span class="ibtn" data-act="close">${ic('x')}</span></div>` +
    `<div class="mt-meta"><span>${esc(r.location || r.label || tx('On the map'))}</span>${r.dept ? `<span>${esc(r.dept.toUpperCase())}</span>` : ''}${phone ? '' : rec ? `<span>${rec.due ? tx('Due {date}', { date: fmtDate(rec.due) }) : tx('No schedule')}</span><span>${txn(rec.intMonths, 'Every {n} month', 'Every {n} months')}</span>` : `<span class="cs-dim">${tx('Not serviced yet')}</span>`}</div>` +
    (r.detail ? `<div class="msh-sec"><b>${ic('file')}${tx('Notes')}</b><p>${esc(r.detail)}</p></div>` : '') +
    (r.method ? `<div class="msh-sec"><b>${ic('listcheck')}${tx('Method')}</b><p>${esc(r.method)}</p></div>` : '') + (r.operation ? `<div class="msh-sec"><b>${ic('tool')}${tx('Operation')}</b><p>${esc(r.operation)}</p></div>` : '') +
    (phone ? '' : (rec ? `<div class="list">${rec.log.slice().reverse().slice(0, 6).map(l => `<div class="li"><span class="rt" style="margin:0">${fmtDate(l.t)}</span><span class="nm">${esc(tx(l.a))}${l.n ? ' · ' + logNote(l) : ''}</span></div>`).join('')}</div>` : '') +
    `<div class="acts2" style="display:flex;gap:8px;margin-top:12px;align-items:center">${mark ? mgr() : ''}<span class="btn primary sm" data-act="service">${ic('check')}${tx('Service done')}</span><span class="btn sm" data-act="schedule">${tx('Set schedule')}</span></div>`) + '</div>';
}
function sidebar(m) {
  const sel = m.rows.find(r => r.id === selected);
  const due = `<div class="card"><div class="ch"><h3>${tx('Service due')}</h3></div><div class="list emlist">${m.due.map(r => `<div class="li" data-act="select" data-id="${r.id}"><span class="pt" style="background:${(TYPES[r.type] || [])[1] || '#64748B'}"></span><span class="nm">${(TYPES[r.type] || [r.type])[0]} · ${esc(r.location || r.label || '')}<span class="where" style="display:block;font-size:12px;color:var(--dim)">${txn(r.rec.intMonths, 'every {n} month · due {date}', 'every {n} months · due {date}', { date: fmtDate(r.rec.due) })}</span></span>${status('warn', r.st === 'overdue' ? tx('Overdue') : tx('Due'))}</div>`).join('') || `<div class="li" style="color:var(--dim)">${tx('Nothing due in the next 30 days.')}</div>`}</div></div>`;
  const eq = `<div class="card"><div class="ch"><h3>${tx('Equipment')}</h3></div><div class="list">${Object.entries(m.counts).map(([t, n]) => `<div class="li" data-act="filter" data-type="${filterType === t ? '' : t}"><span class="pt" style="background:${(TYPES[t] || [])[1] || '#64748B'}"></span><span class="nm">${(TYPES[t] || [t])[0]}</span><span class="rt">${tx('{n} in date', { n: m.rows.filter(r => r.type === t && r.st === 'ok').length })}</span><b>${n}</b></div>`).join('')}</div></div>`;
  return evacCard() + assemblyCard() + (sel ? detail(sel) : '') + due + eq;
}
// The phone's Emergency sheet (opened from the strip): the nearest exit,
// a tile per kind of marker with the map's own symbol (a tap shows only
// those markers, as ShelfSearcher's equipment bar did) and the assembly
// point. Service dates and history are for managers: with the manager code
// on, the sheet adds what is due and each kind's in-date count, and a
// marker's card shows its schedule and log.
const isManager = ctx => (ctx.session.current?.roles || []).includes('manager') || !!ctx.session.current?.owner;
function mobile(m, manager = false) {
  const sel = m.rows.find(r => r.id === selected);
  if (evac) return `<div class="sx">${evacCard(true)}${assemblyCard()}</div>`;
  if (sel) return `<div class="sx">${detail(sel, !manager, manager)}</div>`;
  const types = Object.keys(m.counts), name = t => (TYPES[t] || [t])[0], icon = t => (TYPES[t] || [])[2] || 'alert';
  const head = `<div class="sx-h">${ic('m-emergency')}${tx('Emergency')}<span class="n red">${txn(m.rows.length, '{n} marker', '{n} markers')}</span></div>`;
  const tile = (t, sym, label, n) => `<button class="em-kind${filterType === t ? ' on' : ''}${filterType && filterType !== t ? ' off' : ''}" type="button" data-act="filter" data-type="${filterType === t ? '' : t}" aria-pressed="${filterType === t}"><span class="sym">${sym}</span><b>${label}</b>${n != null ? `<small>${n}</small>` : ''}</button>`;
  const kinds = `<div class="em-kinds">${tile('', `<span class="all">${ic('grid')}</span>`, tx('All'), m.rows.length)}${types.map(t => tile(t, markerSymbol(t, 28), esc(name(t)), m.counts[t])).join('')}</div>`;
  const due = manager ? m.due.map(r => sx.row(icon(r.type), `${name(r.type)} · ${esc(r.location || r.label || tx('on the map'))}`, txn(r.rec.intMonths, 'every {n} month · due {date}', 'every {n} months · due {date}', { date: fmtDate(r.rec.due) }), r.st === 'overdue' ? tx('Overdue') : tx('Due soon'), r.st === 'overdue' ? 'bad' : 'warn', `data-act="select" data-id="${esc(r.id)}"`)) : [];
  const eq = manager ? types.map(t => { const inDate = m.rows.filter(r => r.type === t && r.st === 'ok').length; return sx.row(icon(t), name(t), tx('{n} of {total} in date', { n: inDate, total: m.counts[t] }), '', '', `data-act="filter" data-type="${filterType === t ? '' : t}"`); }) : [];
  return `<div class="sx">${head}<div class="em-mevac">${mbig(tx('Nearest exit'), 'evac', 'pin', ' data-act="evac"')}</div>${sx.sec(tx('Show on the map'), kinds, filterType ? tx('tap again for all') : tx('tap a kind'))}${assemblyCard()}` +
    (due.length ? sx.sec(`<b class="sx-lt">${tx('Service due')}${mgr()}</b>`, sx.rows(due), tx('next 30 days · manager')) : '') + (eq.length ? sx.sec(`<b class="sx-lt">${tx('Equipment')}${mgr()}</b>`, sx.rows(eq), tx('manager')) : '') +
    `<div class="sx-sub" style="margin-top:12px">${tx('Tap a marker for what it is and how to use it.')}</div></div>`;
}
// The strip under the phone's Emergency map: the marker count and the
// nearest exit, the walk once it is drawn, or the marker in hand.
function emStrip(m) {
  const sel = m.rows.find(r => r.id === selected);
  if (evac === 'armed') return `${ic('pin')}<b>${tx('Nearest exit')}</b><span class="s">${tx('Tap where you are')}</span><button class="act" type="button" data-act="evac">${ic('x')}${tx('Cancel')}</button>`;
  if (evac) { const x = evac.r?.exit, where = x?.target?.label || x?.target?.location || '', far = x && !x.straight ? metres(x.dist) : ''; return `${ic('pin')}<b>${tx('Nearest exit')}</b><span class="s">${esc([where, far].filter(Boolean).join(' · ') || tx('Follow the green line'))}</span><button class="act" type="button" data-act="evac">${ic('x')}${tx('Hide')}</button>`; }
  if (sel) { const t = TYPES[sel.type] || [sel.type]; return `<span class="em-ssym">${markerSymbol(sel.type, 22)}</span><b>${esc(t[0])}</b><span class="s">${esc(sel.location || sel.label || '')}</span><button class="act" type="button" data-act="close">${ic('x')}${tx('Close')}</button>`; }
  return `${ic('m-emergency')}<b>${tx('Emergency')}</b><span class="n red">${m.rows.length}</span><span class="s"></span><button class="act evac" type="button" data-act="evac">${ic('pin')}${tx('Nearest exit')}</button>`;
}

// ── evacuation ─────────────────────────────────────────────────────────
// Distances in metres only when the map carries its scale (metresPerUnit).
function metres(units) { const mpu = mapInfo()?.metresPerUnit; return mpu ? tx('about {n} m', { n: Math.max(5, Math.round(units * mpu / 5) * 5) }) : ''; }
function evacCard(mobile) {
  if (!evac) return '';
  const hide = `<span class="btn sm" data-act="evac">${ic('x')}${evac === 'armed' ? tx('Cancel') : tx('Hide route')}</span>`;
  if (evac === 'armed') return `<div class="card em-evac"><div class="ch"><h3>${ic('pin')}${tx('Nearest exit')}</h3>${hide}</div><p class="lbl" style="margin:0">${tx('Tap where you are on the map. The walk to the closest exit on this floor draws in green.')}</p></div>`;
  const { exit, assembly } = evac.r, where = x => esc(x.label || x.location || '');
  // Each step is one sentence, with or without where the exit is and how far.
  const ew = where(exit.target), ed = metres(exit.dist);
  const first = ew && ed ? tx('Walk to the <b>fire exit</b> ({where}), {dist}.', { where: ew, dist: ed }) : ew ? tx('Walk to the <b>fire exit</b> ({where}).', { where: ew }) : ed ? tx('Walk to the <b>fire exit</b>, {dist}.', { dist: ed }) : tx('Walk to the <b>fire exit</b>.');
  const steps = [first + (exit.straight ? ' ' + tx('<i>No walk paths on this floor: the line is straight, so follow the aisles and the green exit signs.</i>') : '')];
  if (assembly) {
    const aw = where(assembly.target), ad = !assembly.straight ? metres(assembly.dist) : '';
    steps.push(assembly.straight ? (aw ? tx('Go on to the <b>assembly point</b> ({where}), marked on the map.', { where: aw }) : tx('Go on to the <b>assembly point</b>, marked on the map.'))
      : ad ? (aw ? tx('Go on to the <b>assembly point</b> ({where}), {dist}.', { where: aw, dist: ad }) : tx('Go on to the <b>assembly point</b>, {dist}.', { dist: ad }))
      : aw ? tx('Go on to the <b>assembly point</b> ({where}).', { where: aw }) : tx('Go on to the <b>assembly point</b>.'));
  }
  else steps.push(assemblyText() ? tx('Then go to the <b>assembly point</b>: {where}.', { where: esc(assemblyText()) }) : tx('Then go to the <b>assembly point</b>.'));
  return `<div class="card em-evac"><div class="ch"><h3>${ic('pin')}${tx('Nearest exit')}${evac.floor ? ` · ${esc(evac.floor)}` : ''}</h3>${hide}</div><ol class="em-steps">${steps.map(x => `<li>${x}</li>`).join('')}</ol>${mobile ? '' : `<p class="lbl" style="margin:8px 0 0">${tx('Blue is where you tapped. Tap Nearest exit again to start from somewhere else.')}</p>`}</div>`;
}
const assemblyText = () => mapInfo()?.storeInfo?.assemblyNotes || '';
// The store's assembly point from the map editor's Store Info, with
// directions when it has coordinates.
function assemblyCard() {
  const si = mapInfo()?.storeInfo || {}, has = si.assemblyLat != null && si.assemblyLng != null;
  if (!si.assemblyNotes && !has) return '';
  const q = has ? `${si.assemblyLat},${si.assemblyLng}` : '';
  const links = has ? `<div class="em-asm-links"><a class="btn sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}" target="_blank" rel="noopener noreferrer">${ic('pin')}Google Maps</a><a class="btn sm" href="https://maps.apple.com/?ll=${encodeURIComponent(q)}&q=${encodeURIComponent(tx('Assembly point'))}" target="_blank" rel="noopener noreferrer">${ic('pin')}Apple Maps</a></div>` : '';
  return `<div class="em-asm" role="note">${ic('users')}<div><b>${tx('Assembly point')}</b><span>${esc(si.assemblyNotes || tx('Directions to the assembly point'))}</span>${links}</div></div>`;
}

// ── the evacuation map on paper ─────────────────────────────────────────
// For the staff room: each floor with its exits, extinguishers, first aid,
// AEDs and the assembly point standing out over grey shelves, a key of the
// signs on it, where to assemble and who to call. With a Nearest exit route
// on the screen, that floor prints it from "You are here". Then the monthly
// equipment walk: every marker with its service due date and a tick box.
function printEvacuation(ctx, m, route) {
  const fls = mapFloors(); if (!fls.length) return toast(tx('No map is published for this store yet'), 'bad');
  const si = mapInfo()?.storeInfo || {}, store = tx('{name} · store {no}', { name: ctx.storeName || '', no: ctx.storeNo });
  const asm = si.assemblyNotes ? esc(si.assemblyNotes) : tx('the assembly point marked on the map');
  const pages = fls.map(f => {
    const here = route && route.fid === f.id;
    const pm = paperMap({ floor: f.id, mono: true, layers: { emergency: true, priceChecks: false, labels: false, badges: true }, evacFrom: here ? route.origin : null, aspect: 277 / 150 });
    const types = {}; for (const mk of pm?.markers || []) types[mk.type] = (types[mk.type] || 0) + 1;
    const key = Object.entries(types).map(([t, n]) => `<span>${markerSymbol(t, 22)}${esc(markerName(t))}${n > 1 ? ` ×${n}` : ''}</span>`).join('') + (here ? `<span><i class="ev-you"></i>${tx('You are here')}</span><span><i class="ev-route"></i>${tx('Way out')}</span>` : '');
    return `<div class="pm-page ev-page" style="height:190mm"><div class="ev-head"><div><h1>${tx('Evacuation map')}</h1><span>${esc(store)} · ${esc(f.type === 'boh' ? tx('Back of house') : tx('Sales floor'))}, ${esc(f.name)}</span></div><div class="ev-call">${tx('In an emergency')}<b>000</b></div></div>` +
      `<div class="pm-pmap" style="height:150mm">${pm ? pm.svg : ''}</div>` +
      `<div class="ev-foot"><div class="ev-key">${key || `<span>${tx('No emergency equipment is marked on this floor.')}</span>`}</div><div class="ev-asm">${tx('<b>Leave by the nearest exit.</b> Do not use lifts. Go to {place} and wait to be checked off.', { place: asm })}</div></div></div>`;
  });
  const order = mk => fls.findIndex(f => f.id === mk.floor);
  const rows = m.rows.slice().sort((a, b) => order(a) - order(b) || String(a.type).localeCompare(b.type)).map(r => [tick, esc(markerName(r.type)) + (r.extClass ? ` · ${esc(extName(r.extClass))}` : ''), esc(r.location || r.label || ''), esc(fls.find(f => f.id === r.floor)?.name || ''), r.rec?.due ? esc(fmtDate(r.rec.due)) + (r.st === 'overdue' ? ' · ' + tx('<b>overdue</b>') : '') : tx('not scheduled'), '']);
  const walk = `<div class="ps-page"><header class="ps-head"><div><h1>${tx('Emergency equipment walk')}</h1><div class="ps-sub">${tx('{store} · check each one is present, unobstructed and in date', { store: esc(store) })}</div></div></header>` + table(['✓', tx('Equipment'), tx('Where'), tx('building level::Floor'), tx('Service due'), tx('Note')], rows, ['tk', 'w20', '', 'w12', 'w20', 'w20']) + signoff(tx('Walked by')) + '</div>';
  printSheet({ title: tx('Evacuation map'), body: pages.join('') + walk, page: 'A4 landscape', bare: true });
}
