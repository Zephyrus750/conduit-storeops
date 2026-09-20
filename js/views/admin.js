// Admin console: the owner's views. Stores (overview), one store (overview,
// events, devices, access), register a store, and the owner action log.
// Everything here talks to the worker's /v1/admin/* routes through
// ctx.admin.api(); nothing touches a store's event log except "Act as store",
// which hands the shell a store-scoped token whose writes carry actor.owner.
//
// Reads are cached per store while the console is open; a Refresh button
// or any write clears the relevant cache.

import { $, $$, ic, esc, vh, sub, fmtTime, ago, status, toast } from '../ui.js';

const AREAS = ['floor', 'stockroom', 'backdock'];
const AREA_NAME = { floor: 'Floor', stockroom: 'Stockroom', backdock: 'Back dock', store: 'Store', owner: 'Owner' };
const CODES = [['stockroom', 'Stockroom code', 'unlocks the Stockroom area on a device'], ['dock', 'Dock code', 'unlocks the Back dock on a device'], ['manager', 'Manager code', 'opens every entitled area on a device']];
const STATUSES = ['registered', 'migrating', 'live', 'legacy'];
const TOOLS = { floor: ['Store map', 'Pick list', 'Location refresh', 'Label integrity', 'Emergency', 'Maintenance', 'Stocktake'], stockroom: ['Backfill review', 'Cages', 'Adjustments', 'Day list', 'History'], backdock: ['Receiving', 'Decant', 'Manifests', 'Carton profiles', 'Planner', 'Receiving history'] };

// Credential formats: PIN six digits; SR-/BD- four digits; MG- six digits.
// Codes compare with case, spaces and hyphens ignored, so these stay readable.
const digits = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b % 10).join('');
export const gen = { pin: () => digits(6), stockroom: () => 'SR-' + digits(4), dock: () => 'BD-' + digits(4), manager: () => 'MG-' + digits(6) };

// ── state and cache ───────────────────────────────────────────────────
const st = { no: null, tab: 'over', filter: '', area: 'all', rot: null, edit: false, reg: null, regDone: null, health: null, actions: null };
const cache = {};                     // no → { rec, devices, tail, snap }
const forStore = no => cache[no] || (cache[no] = {});
export function invalidate(no) { if (no) delete cache[no]; else for (const k of Object.keys(cache)) delete cache[k]; st.actions = null; }

async function load(ctx, no, keys) {
  const c = forStore(no), calls = [];
  if (keys.includes('rec') && !c.rec) calls.push(ctx.admin.api(`/v1/admin/stores/${no}`).then(r => { c.rec = r; }));
  if (keys.includes('devices') && !c.devices) calls.push(ctx.admin.api(`/v1/admin/stores/${no}/devices`).then(r => { c.devices = r.devices || {}; }));
  if (keys.includes('tail') && !c.tail) calls.push(ctx.admin.api(`/v1/admin/stores/${no}/tail?limit=300`).then(r => { c.tail = r.events || []; c.seq = r.seq; }));
  if (keys.includes('map') && c.map === undefined) calls.push(ctx.admin.api(`/v1/store/${no}/map`).then(r => { c.map = r; }).catch(e => { c.map = e.status === 404 ? null : { error: e.message }; }));
  if (keys.includes('snap') && !c.snap) calls.push(ctx.admin.api(`/v1/admin/stores/${no}/snapshot?areas=floor,stockroom,backdock,store`).then(r => { c.snap = r.state; c.seq = r.seq; }).catch(() => { c.snap = {}; }));
  if (!calls.length) return false;
  await Promise.all(calls); return true;
}
const fail = e => toast(e.code === 'unauthorised' ? 'Owner session expired. Sign in again.' : e.message, 'bad');

// ── shared bits ───────────────────────────────────────────────────────
const tile = (n, label, small, cls = '') => `<div class="ad-tile${cls ? ' ' + cls : ''}"><b>${n}</b><span>${label}</span>${small ? `<small>${small}</small>` : ''}</div>`;
const tst = (s) => `<span class="tst ${s === 'live' ? 'live' : s === 'migrating' ? 'staged' : ''}">${esc(s || 'off')}</span>`;
const areaChips = rec => `<span class="ad-areas">${AREAS.map(a => { const on = rec.entitlements?.[a], v = rec.areas?.[a]; return `<i class="${!on ? '' : v === 'live' ? 'on' : v === 'migrating' ? 'mig' : 'leg'}" title="${a} · ${on ? esc(v) : 'off'}">${AREA_NAME[a]}</i>`; }).join('')}</span>`;
const health = rec => !AREAS.some(a => rec.entitlements?.[a]) ? 'leg' : rec.status === 'live' ? 'ok' : rec.status === 'migrating' ? 'mig' : 'leg';
const when = iso => iso ? `${fmtTime(iso)} · ${ago(iso)}` : '—';
const banner = (text, ro) => `<div class="ad-banner${ro ? ' ro' : ''}">${ic('lock')}<div>${text}</div></div>`;
const table = (heads, rows, cls = '') => `<div class="ad-scroll"><table class="rstbl ${cls}"><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr>${rows.join('') || `<tr><td colspan="${heads.length}" class="cs-dim">Nothing yet</td></tr>`}</table></div>`;
const field = (l, inp, hint) => `<label class="ad-field"><span>${l}</span>${inp}${hint ? `<small>${hint}</small>` : ''}</label>`;
const inp = (name, v, ph, cls = '', extra = '') => `<input class="ad-in${cls ? ' ' + cls : ''}" name="${name}" value="${esc(v ?? '')}" placeholder="${esc(ph || '')}" autocomplete="off" ${extra}>`;
const genRow = (name, v, ph, disabled) => `<span class="ad-inrow">${inp(name, v, ph, 'mono', disabled ? 'disabled' : '')}<button class="btn sm" type="button" data-act="gen" data-name="${name}" ${disabled ? 'disabled' : ''}>${ic('refresh')}Generate</button></span>`;
const actor = a => a?.owner ? 'owner' : esc(a?.device || '—');
const short = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > 90 ? s.slice(0, 87) + '…' : s; };
const ent = e => Object.entries(e || {}).map(([k, v]) => `${k} ${v}`).join(' · ');

// ── views ─────────────────────────────────────────────────────────────
const overview = {
  id: 'admin', title: 'Stores', icon: 'grid',
  desktop(ctx) {
    const stores = ctx.admin.stores || [];
    const live = stores.filter(s => s.status === 'live').length, mig = stores.filter(s => s.status === 'migrating').length;
    const rows = stores.map(s => `<tr class="ad-row" data-view="adminstore" data-no="${esc(s.no)}"><td><b class="mono">${esc(s.no)}</b></td><td><b>${esc(s.name)}</b><small>${esc(s.region || '')}</small></td><td>${tst(s.status)}</td><td>${areaChips(s)}</td><td class="mono">${esc(s.mapVersion || '—')}</td><td class="mono">${fmtTime(s.updated)}</td><td><span class="btn sm">Open</span></td></tr>`);
    const acts = (st.actions || []).slice(0, 8).map(a => `<div class="li"><span class="rt" style="min-width:92px">${fmtTime(a.at)}</span><span class="nm">${actionText(a)}</span></div>`).join('') || '<div class="li cs-dim">No owner actions logged yet</div>';
    const h = st.health;
    return vh('Stores', sub('Owner mode', 'read-only until you act as a store', 'every owner action is logged'), `<a class="btn primary" data-view="adminreg">${ic('plus')}Register a store</a><button class="btn" data-act="refresh">${ic('refresh')}Refresh</button>`) +
      banner(`<b>Owner</b> · you are viewing every store the system knows about. Opening a store shows its log and devices read-only; <b>Act as store</b> switches to writes that carry your owner id.`) +
      `<div class="ad-tiles">${tile(stores.length, `store${stores.length === 1 ? '' : 's'} registered`, `${live} live · ${mig} migrating · ${stores.length - live - mig} registered or legacy`)}${tile(stores.filter(s => s.entitlements?.floor).length, 'with the Floor', `${stores.filter(s => s.entitlements?.stockroom).length} Stockroom · ${stores.filter(s => s.entitlements?.backdock).length} Back dock`)}${tile((st.actions || []).length, 'owner actions', 'last 200 kept in the registry')}${tile(h ? esc(h.version) : '…', 'worker', h ? `${esc(h.env)} · ${esc(ctx.admin.base)}` : 'checking health')}</div>` +
      `<div class="card"><div class="ch"><h3>Registered stores</h3><span class="cs-dim">tap a row to open it</span></div>${table(['Store', 'Name', 'Status', 'Areas', 'Map', 'Updated', ''], rows, 'ad-tbl')}</div>` +
      `<div class="grid2 ad-two"><div class="card"><div class="ch"><h3>Recent owner actions</h3><a class="go" data-view="adminactions">All</a></div><div class="list">${acts}</div></div>` +
      `<div class="card"><div class="ch"><h3>Service</h3></div><div class="ad-kv"><span>Worker</span><b class="mono">${h ? esc(h.version) + ' · ' + esc(h.env) : '…'}</b><span>Endpoint</span><b class="mono">${esc(ctx.admin.base)}</b><span>Owner device</span><b class="mono">${esc(ctx.session.device)}</b><span>Session</span><b>expires ${fmtTime(new Date(ctx.session.current.expires * 1000).toISOString())}</b></div></div></div>`;
  },
  mount(ctx, root) {
    const need = [];
    if (!st.health) need.push(ctx.admin.api('/v1/health').then(h => { st.health = h; }));
    if (!st.actions) need.push(ctx.admin.api('/v1/admin/actions').then(r => { st.actions = r.actions || []; }));
    if (need.length) Promise.all(need).then(() => ctx.rerender()).catch(fail);
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'refresh') { invalidate(); st.health = null; try { await ctx.admin.refreshStores(); } catch (err) { return fail(err); } ctx.rerender(); }
    });
    return [];
  },
};

const storeView = {
  id: 'adminstore', title: 'Store', icon: 'store',
  desktop(ctx) {
    if (ctx.arg?.no) { if (ctx.arg.no !== st.no) { st.tab = ctx.arg.tab || 'over'; st.rot = null; st.edit = false; st.filter = ''; st.area = 'all'; } st.no = ctx.arg.no; }
    if (!st.no) st.no = ctx.admin.stores?.[0]?.no || null;
    const c = forStore(st.no), rec = c.rec || (ctx.admin.stores || []).find(s => s.no === st.no);
    if (!rec) return vh('Store', '', `<a class="btn" data-view="admin">${ic('arrow')}All stores</a>`) + banner('No store selected. Pick one from the rail or the Stores list.');
    const tabs = [['over', 'Overview'], ['events', 'Events'], ['devices', 'Devices'], ['access', 'Access'], ['map', 'Map'], ['migr', 'Migration']];
    const head = vh(`${esc(rec.no)} <span class="pd-name">${esc(rec.name)}</span>`, sub(esc(rec.region || ''), tst(rec.status), `registered ${fmtTime(rec.created)}`), `<a class="btn" data-view="admin">${ic('arrow')}All stores</a><button class="btn" data-act="refresh">${ic('refresh')}Refresh</button><button class="btn primary" data-act="actas">${ic('users')}Act as store</button>`);
    const seg = `<div class="ad-tabs">${tabs.map(t => `<button class="${t[0] === st.tab ? 'on' : ''}" data-act="tab" data-tab="${t[0]}">${t[1]}</button>`).join('')}</div>`;
    const ro = ['access', 'map', 'migr'].includes(st.tab) ? '' : banner(`Read-only view of <b>${esc(rec.name)}</b>. Nothing you do here changes the store until you <b>Act as store</b>.`, true);
    const body = st.tab === 'events' ? eventsTab(c) : st.tab === 'devices' ? devicesTab(c) : st.tab === 'access' ? accessTab(rec) : st.tab === 'map' ? mapTab(rec, c) : st.tab === 'migr' ? migrTab(rec, c) : overTab(rec, c);
    return head + ro + seg + body;
  },
  mount(ctx, root) {
    if (!st.no) return [];
    const keys = st.tab === 'events' ? ['rec', 'tail'] : st.tab === 'devices' ? ['rec', 'devices'] : st.tab === 'access' ? ['rec'] : st.tab === 'map' ? ['rec', 'map'] : ['rec', 'devices', 'snap'];
    load(ctx, st.no, keys).then(did => { if (did) ctx.rerender(); }).catch(fail);
    root.addEventListener('click', e => onStoreClick(e, ctx));
    root.addEventListener('change', e => { if (e.target.matches('select[data-act="areastate"]')) patchStore(ctx, { areas: { [e.target.dataset.area]: e.target.value } }); });
    root.addEventListener('input', e => { if (e.target.matches('[data-field="filter"]')) { st.filter = e.target.value; const t = $('#adTail', root); if (t) t.innerHTML = tailRows(forStore(st.no)); } });
    root.addEventListener('submit', e => { e.preventDefault(); const f = e.target.getAttribute('data-form'); if (f === 'rotate') saveRotate(ctx, e.target); else if (f === 'edit') saveEdit(ctx, e.target); else if (f === 'publish') publishMap(ctx, e.target); else if (f === 'import') runImport(ctx, e.target, e.submitter?.dataset.dry === '1'); });
    root.addEventListener('change', e => { if (e.target.matches('input[type="file"][data-floor]')) { const f = e.target.files?.[0]; const lbl = e.target.closest('label')?.querySelector('small'); if (lbl && f) lbl.textContent = `${f.name} · ${(f.size / 1024).toFixed(0)} KB`; } });
    return [];
  },
};

function overTab(rec, c) {
  const devs = Object.entries(c.devices || {}), online = devs.filter(([, d]) => d.online !== false && Date.now() - new Date(d.last) < 10 * 60000).length;
  const queued = devs.reduce((n, [, d]) => n + (d.outbox || 0), 0);
  const s = c.snap || {};
  const floor = s.refresh ? `Refresh ${Object.values(s.refresh.weeks || {}).map(w => Object.keys(w).length).reduce((a, b) => a + b, 0)} marks · ${Object.values(s.issues || {}).filter(i => i.status !== 'completed').length} open issues` : 'not entitled';
  const sr = s.cages ? `${Object.values(s.cages).filter(x => x.status === 'open').length} cages open · ${Object.keys(s.backfill || {}).length} backfill locations` : 'not entitled';
  const bd = s.dock ? `${Object.keys(s.dock.pallets || s.dock || {}).length} dock records` : 'not entitled';
  return `<div class="ad-tiles">${tile(devs.length, 'devices seen', c.devices ? `${online} online in the last 10 min` : 'loading')}${tile(c.seq ?? '…', 'events in the log', 'seq of the newest event')}${tile(queued, 'queued on devices', queued ? 'waiting to sync' : 'all devices in sync', queued ? 'warn' : '')}${tile(`<span class="mono">${esc(rec.mapVersion || '—')}</span>`, 'map version', rec.mapVersion ? 'published' : 'no map published yet')}</div>` +
    `<div class="grid2 ad-two"><div class="card"><div class="ch"><h3>Areas</h3></div><div class="list">${AREAS.map(a => `<div class="li"><span class="loc">${AREA_NAME[a]}</span><span class="nm">${rec.entitlements?.[a] ? (rec.areas?.[a] === 'live' ? 'Live on Conduit' : rec.areas?.[a] === 'migrating' ? 'Migrating' : 'Entitled · still on the legacy app') + ' · ' + esc(a === 'floor' ? floor : a === 'stockroom' ? sr : bd) : 'Not entitled'}</span>${rec.entitlements?.[a] ? tst(rec.areas?.[a]) : '<span class="tst">off</span>'}</div>`).join('')}</div></div>` +
    `<div class="card"><div class="ch"><h3>Roster</h3><span class="cs-dim">shared codes per store</span></div><div class="ad-kv"><span>Store PIN</span><b>•••••• · set</b>${CODES.map(([k, l]) => `<span>${l}</span><b>${rec.codes?.includes(k) ? '•••••• · set' : '—'}</b>`).join('')}<span>Last rotated</span><b>${when(s.roster?.rotatedAt)}</b></div><p class="lbl">Rotate from the Access tab. Rotating signs that area out on every device.</p></div></div>`;
}
function eventsTab(c) {
  const pills = ['all', 'floor', 'stockroom', 'backdock', 'store'].map(a => `<button class="${st.area === a ? 'on' : ''}" data-act="area" data-area="${a}">${a === 'all' ? 'All areas' : AREA_NAME[a]}</button>`).join('');
  return `<div class="card"><div class="ch"><h3>Event tail</h3><span class="cs-dim">newest first · ${c.tail ? c.tail.length + ' of ' + (c.seq ?? '?') : 'loading'}</span><span class="pills" style="margin-left:auto">${pills}</span></div><div class="ad-filters"><div class="search">${ic('search')}<input data-field="filter" value="${esc(st.filter)}" placeholder="Filter by type, entity or device…"></div></div><div id="adTail">${tailRows(c)}</div></div>`;
}
function tailRows(c) {
  const q = st.filter.trim().toLowerCase();
  const rows = (c.tail || []).filter(e => st.area === 'all' || e.area === st.area).filter(e => !q || `${e.type} ${ent(e.entity)} ${e.actor?.device || ''}`.toLowerCase().includes(q)).slice(0, 200)
    .map(e => `<tr><td class="mono">${e.seq}</td><td class="mono">${fmtTime(e.at)}</td><td><i class="ad-dot ${esc(e.area)}"></i>${esc(e.area)}</td><td class="mono">${esc(e.type)}</td><td class="mono"><b>${esc(ent(e.entity))}</b></td><td class="mono">${actor(e.actor)}${e.actor?.role ? ' · ' + esc(e.actor.role) : ''}</td><td>${esc(short(e.payload))}</td></tr>`);
  return table(['Seq', 'Time', 'Area', 'Type', 'Entity', 'Actor', 'Payload'], rows, 'ad-ev');
}
function devicesTab(c) {
  const rows = Object.entries(c.devices || {}).sort((a, b) => (a[1].last < b[1].last ? 1 : -1)).map(([id, d]) => { const stale = Date.now() - new Date(d.last) > 10 * 60000, bad = d.online === false || (d.outbox || 0) > 0 || stale; return `<tr class="${bad ? 'bad' : ''}"><td class="mono"><b>${esc(id)}</b>${d.owner ? ' <span class="tst">owner</span>' : ''}</td><td>${esc(d.role || '')}${d.area && d.area !== d.role ? ' · ' + esc(d.area) : ''}</td><td class="mono">${esc(d.app || '')}</td><td>${status(bad ? 'warn' : 'good', d.online === false ? 'offline' : stale ? 'quiet' : 'online')}</td><td class="mono">${when(d.last)}</td><td class="mono">${d.outbox ? `<b class="c-red">${d.outbox}</b>` : '0'}</td><td>${esc(d.lastError || '')}</td></tr>`; });
  return `<div class="card"><div class="ch"><h3>Devices</h3><span class="cs-dim">heartbeat every 3 min while a device is open · ${rows.length} seen</span></div>${table(['Device', 'Role', 'App', 'State', 'Last seen', 'Outbox', 'Last error'], rows, 'ad-dev')}</div>`;
}
function accessTab(rec) {
  const areas = `<div class="ad-ent">${AREAS.map(a => { const on = !!rec.entitlements?.[a]; return `<div class="card"><div class="ch"><h3>${AREA_NAME[a]}</h3><span class="ad-tgl ${on ? 'on' : ''}" data-act="entitle" data-area="${a}" role="switch" aria-checked="${on}"><i></i></span></div><div class="ad-tools${on ? '' : ' off'}">${TOOLS[a].map(x => `<label><span class="tick ${on ? 'on' : ''}">${on ? ic('check') : ''}</span>${x}</label>`).join('')}</div>${on ? `<div class="ad-inrow" style="margin-top:10px"><span class="lbl" style="margin:0">State</span><select class="ad-in" data-act="areastate" data-area="${a}">${['legacy', 'migrating', 'live'].map(v => `<option value="${v}" ${rec.areas?.[a] === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>` : ''}</div>`; }).join('')}</div>`;
  const rotRow = (name, label, desc, on) => {
    if (st.rot === name) return `<form class="li" data-form="rotate"><span class="loc" style="min-width:120px">${label}</span><span class="ad-inrow" style="flex:1">${inp('value', st.rotValue, name === 'pin' ? '6 digits' : '', 'mono', 'required')}<button class="btn sm" type="button" data-act="gen" data-name="value" data-kind="${name}">${ic('refresh')}Generate</button><button class="btn sm primary" type="submit">Save</button><button class="btn sm" type="button" data-act="rot-cancel">Cancel</button></span></form>`;
    return `<div class="li"><span class="loc" style="min-width:120px">${label}</span><span class="nm">${desc}</span>${on ? `<span class="btn sm" data-act="rot" data-name="${name}">${ic('refresh')}${rec.codes?.includes(name) || name === 'pin' ? 'Rotate' : 'Set'}</span>` : '<span class="cs-dim">not entitled</span>'}</div>`;
  };
  const creds = `<div class="card"><div class="ch"><h3>Credentials</h3><span class="cs-dim">shared per store, no individual logins</span></div><div class="list">${rotRow('pin', 'Store PIN', 'opens the Floor on any device', true)}${CODES.map(([k, l, d]) => rotRow(k, l, d, k !== 'dock' || rec.entitlements?.backdock)).join('')}</div>${st.rotDone ? `<div class="ad-done" style="margin:12px 0 0"><span class="ck">${ic('check')}</span><div><b>${esc(st.rotDone.label)} is now <span class="mono">${esc(st.rotDone.value)}</span></b><span>Shown once. Hand it to the store; devices need it the next time they unlock.</span></div></div>` : ''}<p class="lbl">Rotating a code signs that area out on every device the next time its token refreshes. The registry keeps only a hash.</p></div>`;
  const identity = st.edit
    ? `<form class="card" data-form="edit"><div class="ch"><h3>Store</h3></div><div class="ad-grid2">${field('Name', inp('name', rec.name, 'Store name', '', 'required'))}${field('Region', inp('region', rec.region, 'e.g. WA South'))}${field('Status', `<select class="ad-in" name="status">${STATUSES.map(v => `<option value="${v}" ${rec.status === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`, 'live once any area is live on Conduit')}</div><div class="acts" style="margin-top:12px"><button class="btn primary sm" type="submit">${ic('check')}Save</button><button class="btn sm" type="button" data-act="edit-cancel">Cancel</button></div></form>`
    : `<div class="card"><div class="ch"><h3>Store</h3><span class="btn sm" data-act="edit">${ic('edit')}Edit</span></div><div class="ad-kv"><span>Number</span><b class="mono">${esc(rec.no)}</b><span>Name</span><b>${esc(rec.name)}</b><span>Region</span><b>${esc(rec.region || '—')}</b><span>Status</span><b>${tst(rec.status)}</b><span>Created</span><b>${fmtTime(rec.created)}</b><span>Updated</span><b>${fmtTime(rec.updated)}</b></div></div>`;
  return areas + `<div class="grid2 ad-two">${creds}${identity}</div>`;
}
// ── migration: import from the legacy app, review, flip the area ───────
const AREA_STATE = { legacy: ['On the legacy app', ''], migrating: ['Migrating', 'staged'], live: ['Live on Conduit', 'live'] };
function migrTab(rec, c) {
  const rows = AREAS.map(a => { const on = rec.entitlements?.[a], v = rec.areas?.[a] || 'legacy'; return `<tr><td><b>${AREA_NAME[a]}</b></td><td>${on ? `<span class="tst ${AREA_STATE[v][1]}">${AREA_STATE[v][0]}</span>` : '<span class="tst">not entitled</span>'}</td><td>${a === 'floor' ? 'ShelfSearcher · no live users' : a === 'stockroom' ? 'K2B' : 'Decant Visualiser'}</td><td>${!on ? '' : v === 'live' ? '<span class="cs-dim">done</span>' : `<span class="btn sm primary" data-act="flip" data-area="${a}" data-state="live">${ic('check')}Flip to live</span> ${v === 'legacy' ? `<span class="btn sm" data-act="flip" data-area="${a}" data-state="migrating">Mark migrating</span>` : ''}`}${on && v === 'live' ? ` <span class="btn sm" data-act="flip" data-area="${a}" data-state="legacy">Back to legacy</span>` : ''}</td></tr>`; }).join('');
  const r = st.importResult;
  const result = !r ? '' : `<div class="card"><div class="ch"><h3>${r.dry ? 'Dry run' : 'Import'} · ${esc(r.legacy?.name || r.code)}</h3><span class="cs-dim">${r.dry ? 'nothing was written' : `${r.applied} events written · ${r.duplicates} already there`}</span></div><div class="ad-kv"><span>Legacy store</span><b>${esc(r.legacy?.name || '—')} · code ${esc(r.code)}${r.legacy?.storeNumber ? ' · number ' + esc(r.legacy.storeNumber) : ''}</b><span>History</span><b>${r.counts.history} bays on record</b><span>Today's board</span><b>${r.counts.today} bays · ${r.counts.requested} requested</b><span>Negative SOH</span><b>${r.counts.negsoh} items today</b><span>Events</span><b>${r.counts.events}${r.dry ? ' would be written' : ` · ${r.applied} written · ${r.duplicates} duplicates · ${r.rejected.length} rejected`}</b></div>` +
    (r.warnings.length ? `<div class="scol-t del" style="margin-top:10px">Warnings<span class="ct">${r.warnings.length}</span></div><ul class="ad-sum" style="padding-left:18px;font-size:12.5px;color:var(--ink2)">${r.warnings.slice(0, 20).map(w => `<li>${esc(w)}</li>`).join('')}${r.warnings.length > 20 ? `<li>… ${r.warnings.length - 20} more</li>` : ''}</ul>` : '') +
    (r.rejected.length ? `<div class="scol-t del" style="margin-top:10px">Rejected<span class="ct">${r.rejected.length}</span></div><ul style="padding-left:18px;font-size:12.5px">${r.rejected.slice(0, 10).map(x => `<li><span class="mono">${esc(x.id)}</span> ${esc(x.code)}: ${esc(x.message)}</li>`).join('')}</ul>` : '') +
    (r.dry ? `<div class="acts" style="margin-top:12px"><button class="btn primary" data-act="import-accept">${ic('check')}Looks right · import now</button></div>` : `<div class="ad-done" style="margin:12px 0 0"><span class="ck">${ic('check')}</span><div><b>Imported.</b><span>Open the store's Backfill review to check the board, then flip the Stockroom to live below. K2B stays deployed; freezing it for this store is a manual step in that app.</span></div></div>`) + `</div>`;
  const form = `<form class="card" data-form="import"><div class="ch"><h3>Import from K2B</h3><span class="cs-dim">history, today's board, requested bays, negative SOH</span></div><div class="ad-grid2">${field('K2B store code', inp('code', st.importCode || '', 'e.g. BUS247', 'mono', 'required autocapitalize="characters"'), 'the join code the store’s phones use')}${field('Store PIN in K2B', `<input class="ad-in mono" name="pin" type="password" autocomplete="off" required placeholder="••••">`, 'the review PIN; only its hash is stored, and only in K2B')}</div><div class="si-err" id="impErr"></div><div class="acts" style="margin-top:12px"><button class="btn primary" type="submit" data-dry="1">${ic('search')}Dry run</button><button class="btn" type="submit" data-dry="0">${ic('arrow')}Import</button></div><p class="lbl">A dry run reads everything and counts what would be written. Importing writes events with your owner id; running it again only adds what is new. ${rec.entitlements?.stockroom ? '' : '<b>Turn the Stockroom on in Access first.</b>'}</p></form>`;
  return `<div class="card"><div class="ch"><h3>Cutover by area</h3><span class="cs-dim">a switch, not a mirror · one area at a time</span></div><div class="ad-scroll"><table class="rstbl"><tr><th>Area</th><th>Now</th><th>Legacy twin</th><th></th></tr>${rows}</table></div></div><div class="grid2 ad-two">${form}${result || `<div class="card"><div class="ch"><h3>How it works</h3></div><div class="ad-steps"><div class="on"><i>1</i><b>Dry run</b><span>Reads the legacy worker with the store's code and PIN; nothing is written.</span></div><div><i>2</i><b>Import</b><span>Each legacy record becomes the events Conduit would have logged. Re-running only adds what is new.</span></div><div><i>3</i><b>Check the board</b><span>Open Backfill review and History as the store; the day's bays and the archive should match K2B.</span></div><div><i>4</i><b>Flip to live</b><span>Devices see the area as live; K2B goes bugfix-only for this store.</span></div></div></div>`}</div>`;
}
async function runImport(ctx, form, dry) {
  const err = $('#impErr', form), btns = form.querySelectorAll('button');
  const code = form.code.value.trim().toUpperCase(), pin = form.pin.value;
  st.importCode = code; btns.forEach(b => { b.disabled = true; }); err.textContent = ''; toast(dry ? 'Reading the legacy worker…' : 'Importing…');
  try {
    st.importResult = await ctx.admin.api(`/v1/admin/stores/${st.no}/import`, { method: 'POST', body: { source: 'k2b', code, pin, dry } });
    st.importPin = dry ? pin : null;
    if (!dry) { st.actions = null; invalidate(st.no); await ctx.admin.refreshStores(); }
    ctx.rerender();
  } catch (e) { btns.forEach(b => { b.disabled = false; }); err.textContent = e.code === 'legacy_pin' ? 'K2B refused that PIN.' : e.code === 'legacy_store' ? 'K2B does not know that store code.' : e.code === 'not_entitled' ? 'Turn the Stockroom on in Access first.' : e.message; }
}
function mapTab(rec, c) {
  const m = c.map;
  const cur = m === undefined ? `<div class="ohint">Loading…</div>` : m === null ? `<p class="lbl">No map has been published for this store. Devices show a placeholder until one is.</p>` : m.error ? `<p class="lbl">Could not read the map: ${esc(m.error)}</p>` :
    `<div class="ad-kv"><span>Version</span><b class="mono">${esc(m.version)}</b><span>Published</span><b>${when(m.at)} · ${m.by?.owner ? 'owner' : esc(m.by?.device || '')}</b><span>Floors</span><b>${(m.floors || []).map(f => `${esc(f.name || f.id)} · ${f.shelves ?? '?'} shelves · ${Math.round((f.bytes || 0) / 1024)} KB`).join('<br>')}</b><span>Departments</span><b>${(m.departments || []).length || 'none in the document'}</b><span>Earlier versions</span><b>${(m.versions || []).filter(v => v.version !== m.version).map(v => `<span class="mono">${esc(v.version)}</span> ${fmtTime(v.at)}`).join(' · ') || '—'}</b></div>`;
  const next = m && m.version ? bump(m.version) : '1';
  const form = `<form class="card" data-form="publish"><div class="ch"><h3>Publish a map</h3><span class="cs-dim">rendered floor SVGs, as the shell mounts them</span></div><div class="ad-grid2">${field('Version', inp('version', st.pubVersion ?? next, 'e.g. 4.4', 'mono', 'required pattern="[\\w.\\-]{1,32}"'), 'must be new; devices switch to it on their next sync')}${field('Map name', inp('name', rec.name, 'e.g. Busselton'))}</div>` +
    `<div class="ad-grid2" style="margin-top:12px">${field('Ground floor SVG', `<label class="ad-in" style="display:block;cursor:pointer"><input type="file" accept=".svg,image/svg+xml" data-floor="ground" style="display:none"><span>${ic('file')} Choose file…</span><small class="cs-dim" style="display:block"></small></label>`, 'the svg.map.real document the store views mount (maps/1241.svg is one)')}${field('Stockroom floor SVG (optional)', `<label class="ad-in" style="display:block;cursor:pointer"><input type="file" accept=".svg,image/svg+xml" data-floor="stockroom" style="display:none"><span>${ic('file')} Choose file…</span><small class="cs-dim" style="display:block"></small></label>`, 'arrives with the Stockroom port')}</div>` +
    `<div class="si-err" id="pubErr"></div><div class="acts" style="margin-top:12px"><button class="btn primary" type="submit">${ic('check')}Publish</button></div><p class="lbl">Publishing writes the document to the store and logs a <span class="mono">map.publish</span> event with your owner id. Every signed-in device downloads the new version once and keeps it offline.</p></form>`;
  return `<div class="grid2 ad-two"><div class="card"><div class="ch"><h3>Published map</h3><span class="btn sm" data-act="refresh">${ic('refresh')}Refresh</span></div>${cur}</div>${form}</div>`;
}
const bump = v => { const m = String(v).match(/^(.*?)(\d+)$/); return m ? m[1] + (Number(m[2]) + 1) : v + '.1'; };
async function publishMap(ctx, form) {
  const err = $('#pubErr', form), btn = form.querySelector('[type="submit"]');
  const version = form.version.value.trim(), name = form.name.value.trim();
  const floors = [];
  for (const inp of form.querySelectorAll('input[type="file"][data-floor]')) {
    const f = inp.files?.[0]; if (!f) continue;
    const svg = await f.text();
    if (!/^\s*<svg[\s>]/i.test(svg)) { err.textContent = `${f.name} is not an SVG document.`; return; }
    floors.push({ id: inp.dataset.floor, name: inp.dataset.floor === 'ground' ? 'Ground' : 'Stockroom', type: inp.dataset.floor === 'ground' ? 'foh' : 'boh', svg });
  }
  if (!floors.length) { err.textContent = 'Choose at least the ground floor SVG.'; return; }
  st.pubVersion = version; btn.disabled = true; err.textContent = '';
  try {
    const r = await ctx.admin.api(`/v1/store/${st.no}/map`, { method: 'POST', body: { version, name, floors } });
    toast(`Map ${r.version} published · ${r.floors.map(f => `${f.id} ${f.shelves} shelves`).join(', ')}`);
    st.pubVersion = null; st.actions = null; invalidate(st.no); await ctx.admin.refreshStores(); ctx.rerender();
  } catch (e) { btn.disabled = false; err.textContent = e.code === 'exists' ? `Version ${version} is already published. Use a new version.` : e.message; }
}
async function patchStore(ctx, body) {
  const no = st.no;
  try { forStore(no).rec = await ctx.admin.api(`/v1/admin/stores/${no}`, { method: 'PATCH', body }); st.actions = null; await ctx.admin.refreshStores(); ctx.rerender(); return true; }
  catch (err) { fail(err); return false; }
}
async function onStoreClick(e, ctx) {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act, no = st.no, c = forStore(no);
  if (act === 'tab') { st.tab = a.dataset.tab; st.rot = null; st.rotDone = null; st.edit = false; ctx.rerender(); }
  else if (act === 'refresh') { invalidate(no); ctx.rerender(); }
  else if (act === 'area') { st.area = a.dataset.area; ctx.rerender(); }
  else if (act === 'actas') { a.disabled = true; try { await ctx.actAs(no); } catch (err) { a.disabled = false; fail(err); } }
  else if (act === 'entitle') { const area = a.dataset.area, on = !c.rec?.entitlements?.[area]; if (!on && !confirm(`Turn ${AREA_NAME[area]} off for ${no}? Devices lose the area the next time their token refreshes.`)) return; await patchStore(ctx, { entitlements: { [area]: on } }); }
  else if (act === 'rot') { st.rot = a.dataset.name; st.rotValue = gen[a.dataset.name](); st.rotDone = null; ctx.rerender(); }
  else if (act === 'rot-cancel') { st.rot = null; ctx.rerender(); }
  else if (act === 'gen') { const kind = a.dataset.kind || a.dataset.name; const el = a.closest('.ad-inrow')?.querySelector('input'); if (el && gen[kind]) el.value = gen[kind](); }
  else if (act === 'edit') { st.edit = true; ctx.rerender(); }
  else if (act === 'edit-cancel') { st.edit = false; ctx.rerender(); }
  else if (act === 'flip') { const { area, state } = a.dataset; if (state === 'live' && !confirm(`Flip ${AREA_NAME[area]} for ${no} to live? Devices treat Conduit as the system of record for it from now.`)) return; try { await ctx.admin.api(`/v1/admin/stores/${no}/flip`, { method: 'POST', body: { area, state } }); st.actions = null; invalidate(no); await ctx.admin.refreshStores(); toast(`${AREA_NAME[area]} is ${state}`); ctx.rerender(); } catch (err) { fail(err); } }
  else if (act === 'import-accept') { const r = st.importResult; if (!r || !st.importPin) return toast('Run the dry run again first', 'bad'); const form = document.querySelector('form[data-form="import"]'); if (form) { form.code.value = r.code; form.pin.value = st.importPin; runImport(ctx, form, false); } }
}
async function saveRotate(ctx, form) {
  const name = st.rot, value = form.value.value.trim();
  if (name === 'pin' && !/^\d{4,8}$/.test(value)) return toast('PIN must be 4 to 8 digits', 'bad');
  if (name !== 'pin' && value.replace(/[\s-]/g, '').length < 4) return toast('Code is too short', 'bad');
  st.rotDone = { label: name === 'pin' ? 'Store PIN' : CODES.find(x => x[0] === name)[1], value }; st.rot = null;
  if (!await patchStore(ctx, name === 'pin' ? { pin: value } : { codes: { [name]: value } })) { st.rotDone = null; st.rot = name; st.rotValue = value; }
}
async function saveEdit(ctx, form) {
  const f = new FormData(form);
  st.edit = false;
  if (!await patchStore(ctx, { name: f.get('name').trim(), region: f.get('region').trim() || null, status: f.get('status') })) st.edit = true;
}

const register = {
  id: 'adminreg', title: 'Register a store', icon: 'plus',
  desktop(ctx) {
    const back = `<a class="btn" data-view="admin">${ic('arrow')}All stores</a>`;
    if (st.regDone) {
      const d = st.regDone, on = AREAS.filter(a => d.entitlements[a]).map(a => AREA_NAME[a]).join(' + ') || 'no areas';
      return vh('Store registered', sub(`${esc(d.no)} ${esc(d.name)}`, 'created just now', 'store object ready'), back) +
        `<div class="ad-done"><span class="ck">${ic('check')}</span><div><b>${esc(d.no)} ${esc(d.name)} is on the system.</b><span>The store is in the registry, entitlements are set, and devices can sign in from now. Nothing was deployed.</span></div></div>` +
        `<div class="grid2 ad-two"><div class="card"><div class="ch"><h3>Hand these to the store</h3><span class="cs-dim">shown once · rotate any time</span></div><div class="ad-kv codes"><span>Store PIN</span><b class="mono">${esc(d.pin)}</b>${CODES.filter(([k]) => d.codes[k]).map(([k, l]) => `<span>${l}</span><b class="mono">${esc(d.codes[k])}</b>`).join('')}<span>Sign-in</span><b>store number <span class="mono">${esc(d.no)}</span> + PIN on any device</b></div><div class="acts" style="margin-top:12px"><button class="btn" data-act="copy">${ic('file')}Copy codes</button></div></div>` +
        `<div class="card"><div class="ch"><h3>Next steps</h3></div><div class="ad-steps"><div class="on"><i>1</i><b>Registered</b><span>${on} · ${esc(d.region || 'no region')} · owner: you</span></div><div><i>2</i><b>Sign a device in</b><span>Store number and PIN on the store sign-in. Crew codes unlock Stockroom and Back dock per device.</span></div><div><i>3</i><b>Publish the map</b><span>Needed before the Floor is useful. Arrives with the map route.</span></div><div><i>4</i><b>Flip areas to live</b><span>From the store's Access tab once the team has switched; the legacy app freezes for that area.</span></div></div><div class="acts" style="margin-top:12px"><a class="btn primary" data-view="adminstore" data-no="${esc(d.no)}">${ic('store')}Open the store</a><button class="btn" data-act="another">${ic('plus')}Register another</button></div></div></div>`;
    }
    const r = st.reg || (st.reg = { no: '', name: '', region: '', entitlements: { floor: true, stockroom: false, backdock: false }, pin: gen.pin(), codes: { stockroom: '', dock: '', manager: gen.manager() } });
    const identity = `<div class="card"><div class="ch"><h3>Store</h3></div><div class="ad-grid2">${field('Store number', inp('no', r.no, 'e.g. 1241', 'mono', 'required inputmode="numeric" pattern="\\d{3,5}"'), 'the single identifier every area uses')}${field('Name', inp('name', r.name, 'Store name', '', 'required'))}${field('Region', inp('region', r.region, 'e.g. WA South'))}</div></div>`;
    const areas = `<div class="card"><div class="ch"><h3>Areas</h3><span class="cs-dim">what this store is allowed to have · change any time</span></div><div class="ad-ent in">${AREAS.map(a => { const on = !!r.entitlements[a]; return `<div class="ad-entc"><div class="ch"><h3>${AREA_NAME[a]}</h3><span class="ad-tgl ${on ? 'on' : ''}" data-act="ent" data-area="${a}" role="switch" aria-checked="${on}"><i></i></span></div><div class="ad-tools${on ? '' : ' off'}">${TOOLS[a].map(x => `<label><span class="tick ${on ? 'on' : ''}">${on ? ic('check') : ''}</span>${x}</label>`).join('')}</div></div>`; }).join('')}</div><p class="lbl">Devices never see an area that is off. Turn one on later from the store's Access tab.</p></div>`;
    const creds = `<div class="card"><div class="ch"><h3>Credentials</h3><span class="cs-dim">shared per store, no individual logins</span></div><div class="ad-grid2">${field('Store PIN', genRow('pin', r.pin, '6 digits'), 'opens the store on any device')}${field('Stockroom code', genRow('stockroom', r.codes.stockroom, r.entitlements.stockroom ? '' : 'not needed · Stockroom is off', !r.entitlements.stockroom), 'unlocks the Stockroom area on a device')}${field('Dock code', genRow('dock', r.codes.dock, r.entitlements.backdock ? '' : 'not needed · Back dock is off', !r.entitlements.backdock), 'unlocks the Back dock on a device')}${field('Manager code', genRow('manager', r.codes.manager, ''), 'opens every entitled area on a device')}</div></div>`;
    const summary = `<div class="card ad-sum"><div class="ch"><h3>What happens when you register</h3></div><ul><li>The store is written to the registry on the worker. No deploy, no app update.</li><li>Entitlements are written: <b>${AREAS.filter(a => r.entitlements[a]).map(a => AREA_NAME[a]).join(', ') || 'no areas'}</b>.</li><li>The PIN and codes become valid immediately and are shown once.</li><li>The store appears on every sign-in screen straight away.</li><li>A <b>store.register</b> action is logged with your owner id.</li></ul><div class="si-err" id="regErr"></div><div class="acts" style="margin-top:12px"><button class="btn primary" type="submit">${ic('check')}Register store</button><a class="btn" data-view="admin">Cancel</a></div></div>`;
    return vh('Register a store', sub('Owner action', 'creates the store on the worker', 'no deploy'), back) + `<form class="ad-form" id="regForm" data-form="register"><div class="ad-form-main">${identity}${areas}${creds}</div><div class="ad-form-side">${summary}</div></form>`;
  },
  mount(ctx, root) {
    const read = () => { const f = $('#regForm', root); if (!f || !st.reg) return; const d = new FormData(f); st.reg.no = d.get('no') || ''; st.reg.name = d.get('name') || ''; st.reg.region = d.get('region') || ''; st.reg.pin = d.get('pin') || ''; for (const k of ['stockroom', 'dock', 'manager']) if (d.get(k) != null) st.reg.codes[k] = d.get(k); };
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'ent') { read(); const ar = a.dataset.area; st.reg.entitlements[ar] = !st.reg.entitlements[ar]; if (ar === 'stockroom' && st.reg.entitlements[ar] && !st.reg.codes.stockroom) st.reg.codes.stockroom = gen.stockroom(); if (ar === 'backdock' && st.reg.entitlements[ar] && !st.reg.codes.dock) st.reg.codes.dock = gen.dock(); ctx.rerender(); }
      else if (act === 'gen') { const el = root.querySelector(`input[name="${a.dataset.name}"]`); if (el && gen[a.dataset.name]) el.value = gen[a.dataset.name](); }
      else if (act === 'another') { st.regDone = null; st.reg = null; ctx.rerender(); }
      else if (act === 'copy') { const d = st.regDone; const text = [`Store ${d.no} ${d.name}`, `Store PIN: ${d.pin}`, ...CODES.filter(([k]) => d.codes[k]).map(([k, l]) => `${l}: ${d.codes[k]}`)].join('\n'); try { await navigator.clipboard.writeText(text); toast('Codes copied'); } catch { toast('Copy failed: select the codes and copy them', 'bad'); } }
    });
    root.addEventListener('submit', async e => {
      e.preventDefault(); read();
      const r = st.reg, err = $('#regErr', root), btn = e.target.querySelector('[type="submit"]');
      if (!/^\d{3,5}$/.test(r.no)) return err.textContent = 'Store number must be 3 to 5 digits.';
      if (!r.name.trim()) return err.textContent = 'Name is required.';
      if (!/^\d{4,8}$/.test(r.pin)) return err.textContent = 'PIN must be 4 to 8 digits.';
      if (!r.codes.manager.trim()) return err.textContent = 'A manager code is required.';
      const codes = { manager: r.codes.manager.trim() };
      if (r.entitlements.stockroom) { if (!r.codes.stockroom.trim()) return err.textContent = 'Stockroom is on, so it needs a code.'; codes.stockroom = r.codes.stockroom.trim(); }
      if (r.entitlements.backdock) { if (!r.codes.dock.trim()) return err.textContent = 'Back dock is on, so it needs a dock code.'; codes.dock = r.codes.dock.trim(); }
      btn.disabled = true; err.textContent = '';
      try {
        const rec = await ctx.admin.api('/v1/admin/stores', { method: 'POST', body: { no: r.no, name: r.name.trim(), region: r.region.trim() || null, pin: r.pin, codes, entitlements: r.entitlements } });
        st.regDone = { ...rec, pin: r.pin, codes }; st.reg = null; st.actions = null; invalidate(rec.no);
        await ctx.admin.refreshStores(); ctx.rerender();
      } catch (ex) { btn.disabled = false; err.textContent = ex.code === 'exists' ? `Store ${r.no} is already registered.` : ex.message; }
    });
    return [];
  },
};

const actions = {
  id: 'adminactions', title: 'Owner actions', icon: 'history',
  desktop(ctx) {
    const rows = (st.actions || []).map(a => `<tr><td class="mono">${a.seq}</td><td class="mono">${fmtTime(a.at)}</td><td class="mono">${esc(a.type)}</td><td class="mono">${a.store ? `<a class="go" data-view="adminstore" data-no="${esc(a.store)}">${esc(a.store)}</a>` : '—'}</td><td>${esc(short(a.detail))}</td></tr>`);
    return vh('Owner actions', sub('the registry log', 'newest first', `${rows.length} kept`), `<a class="btn" data-view="admin">${ic('arrow')}All stores</a><button class="btn" data-act="refresh">${ic('refresh')}Refresh</button>`) +
      `<div class="card">${table(['Seq', 'When', 'Action', 'Store', 'Detail'], rows, 'ad-ev')}</div>`;
  },
  mount(ctx, root) {
    if (!st.actions) ctx.admin.api('/v1/admin/actions').then(r => { st.actions = r.actions || []; ctx.rerender(); }).catch(fail);
    root.addEventListener('click', e => { if (e.target.closest('[data-act="refresh"]')) { st.actions = null; ctx.rerender(); } });
    return [];
  },
};
function actionText(a) {
  const s = a.store ? `<b>${esc(a.store)}</b> · ` : '', d = a.detail || {};
  switch (a.type) {
    case 'store.register': return `${s}registered ${esc(d.name || '')}`;
    case 'store.status': return `${s}status set to ${esc(d.status)}`;
    case 'store.entitle': return `${s}entitlements: ${AREAS.filter(x => d[x]).map(x => AREA_NAME[x]).join(', ') || 'none'}`;
    case 'area.flip': return `${s}areas: ${AREAS.map(x => `${AREA_NAME[x]} ${esc(d[x] || '')}`).join(' · ')}`;
    case 'roster.rotate': return `${s}rotated ${d.pin ? 'the store PIN' : (d.codes || []).join(', ') + ' code'}`;
    case 'store.import': return `${s}imported from K2B ${esc(d.code || '')}: ${d.applied} events written, ${d.duplicates} already there${d.rejected ? `, ${d.rejected} rejected` : ''}`;
    default: return `${s}${esc(a.type)} ${esc(short(d))}`;
  }
}

export const ADMIN_VIEWS = [overview, storeView, register, actions];
export function adminSelected() { return st.no; }
export function resetAdmin() { st.no = null; st.tab = 'over'; st.reg = null; st.regDone = null; st.actions = null; st.health = null; invalidate(); }
