// The Decant Visualiser importer: reads a store's DV site (one Netlify
// site per store, Netlify Blobs behind two functions) and turns what it
// holds into Conduit events, so the Back dock can flip without losing
// the archive, the truck on the dock or the week's plan.
//
//   importDV(env, { no, url, dry, apply }) → summary
//     no    Conduit store number     url   the DV site, e.g. https://busselton-dock.netlify.app
//     dry   read and count, apply nothing
//
// DV surface (decant/netlify/functions/state.mjs; GET, no credential):
//   /api/state            { schemaVersion, trucks: [ids], configRev }      the open trucks
//   /api/state?config     { storeName, grid, people: [{ pid, dnum, name, active }], settings: { storeNo } }
//   /api/state?truck=ID   the truck document: status planning|live|closed, landedAt, decantStartAt,
//                         goalAt, manifest { manNo, dcNo, despatch, consols }, team, pallets { Pn: { ref,
//                         ptype, cartons, expectedMins, expectedBasis, consolIds, scanId(s), segments, status, doneAt, note } },
//                         halts [{ start, end, kind, reason }]
//   /api/state?history    { rows: [ { id, date, landedAt, manifest, cartons, pallets, palletsLanded, clearedAt,
//                         clearMins, haltMins, haltCount, downtime, teamRate, perPerson, perDept, audit, carriedIn } ] }
//   /api/state?planner    { days: { YYYY-MM-DD: { slots: { n: { eta, note, team, manifest } } } } }
//   /api/state?rollover   leftover pallets held for the next truck, or null
// Names are withheld without the names code; Conduit keeps devices, not
// people, so team members import by D-number.
//
// Closed trucks arrive as truck.import rows (the record DV computed, kept
// as-is). Open trucks replay as the events that built them. Event ids are
// derived from the record, so a second run acknowledges duplicates.

import { HttpError } from './http.js';
import { importId } from './import.js';
import { PTYPES, HALT_REASONS } from '../shared/reducers/backdock.js';

const TRUCK_RE = /^\d{4}-\d{2}-\d{2}-T\d+$/;
const iso = ms => new Date(Number(ms) || Date.now()).toISOString().replace(/\.\d{3}Z$/, '+00:00');
const ms = v => { const t = Date.parse(v); return isNaN(t) ? null : t; };
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;

function consolOf(c, warnings, where) {
  const cons = String(c?.cons || c?.id || '').replace(/\D/g, '');
  if (!/^\d{9,22}$/.test(cons)) { warnings.push(`${where}: consolidation ${c?.id || '?'} skipped (not 9 to 22 digits)`); return null; }
  return { id: cons.slice(-9), cons, cartons: num(c.cartons), dept: String(c.dept || '').split('/')[0], mix: Array.isArray(c.mix) ? c.mix.slice(0, 8) : [], desc: c.desc || '', items: Array.isArray(c.items) ? c.items.slice(0, 250) : [] };
}
function manifestOf(m, warnings, where) {
  if (!m || !Array.isArray(m.consols) || !m.consols.length) return null;
  const consols = m.consols.map(c => consolOf(c, warnings, where)).filter(Boolean);
  if (!consols.length) return null;
  return { manNo: String(m.manNo || `dv-${where.replace(/[^\w-]/g, '')}`).slice(0, 20), dcNo: String(m.dcNo || ''), despatch: String(m.despatch || ''), consols };
}

// Pure: DV documents in, Conduit events (seed, ms, type, entity, payload) out.
export function mapDV({ active, config, history, trucks = {}, planner, rollover }, { no } = {}) {
  const warnings = [], events = [], counts = { history: 0, trucks: 0, pallets: 0, planner: 0, events: 0 };
  const people = new Map((config?.people || []).map(p => [String(p.pid), p]));
  const who = pid => { const p = people.get(String(pid)); return p?.dnum || String(pid); };
  const member = pid => { const p = people.get(String(pid)) || {}; return { pid: who(pid), name: p.name || '', dnum: p.dnum || null }; };
  const push = (seed, at, type, entity, payload = {}) => { events.push({ seed, ms: at, type, area: 'backdock', entity, payload }); };

  // 1. the archive
  for (const r of history?.rows || []) {
    const id = String(r.id || '');
    if (!TRUCK_RE.test(id)) { warnings.push(`history row ${id || '?'} skipped: not a truck id`); continue; }
    const cleared = ms(r.clearedAt) || ms(r.landedAt) || ms(r.date + 'T12:00:00Z');
    push(`hist:${id}`, cleared, 'truck.import', { truck: id }, {
      source: 'dv', landedAt: r.landedAt || null, clearedAt: r.clearedAt || null,
      cartons: r.cartons, pallets: r.pallets, palletsLanded: r.palletsLanded, clearMins: r.clearMins, haltMins: r.haltMins, haltCount: r.haltCount,
      downtime: (r.downtime || []).map(d => ({ reason: d.reason, mins: d.mins, count: d.count })), teamRate: Math.round(num(r.teamRate)),
      audit: r.audit || null, carriedIn: r.carriedIn ? { pallets: r.carriedIn.pallets, cartons: r.carriedIn.cartons } : null,
      perPerson: (r.perPerson || []).map(x => ({ pid: who(x.pid), cartons: x.cartons, pallets: Math.round(num(x.pallets)), bays: [], mins: x.workedMins, rate: Math.round(num(x.rate)) })),
      byDept: (r.perDept || []).map(d => ({ dept: d.dept, cartons: d.cartons, pallets: Math.round(num(d.pallets)) })),
      manifest: r.manifest?.manNo ? { manNo: r.manifest.manNo, despatch: r.manifest.despatch || '', dcNo: r.manifest.dcNo || '' } : null,
      pauses: { huddle: r.huddleMins || 0, transition: r.transitionMins || 0, break: r.teamBreakMins || 0 },
    });
    counts.history += 1;
  }

  // 2. the trucks on the dock, replayed
  for (const id of active?.trucks || []) {
    const d = trucks[id];
    if (!d) { warnings.push(`${id}: on the active index but its document could not be read`); continue; }
    if (!TRUCK_RE.test(id)) { warnings.push(`${id} skipped: not a truck id`); continue; }
    if (d.status === 'closed') { warnings.push(`${id}: closed in DV; its history row was imported instead`); continue; }
    const t0 = Math.min(ms(d.landedAt) || Infinity, ms(d.decantStartAt) || Infinity, ...Object.values(d.pallets || {}).flatMap(p => (p.segments || []).map(s => ms(s.start) || Infinity)));
    const base = Number.isFinite(t0) ? t0 - 60000 : Date.now();
    const T = { truck: id };
    push(`${id}:create`, base, 'truck.create', T, { landedAt: d.landedAt || iso(base) });
    if (d.status === 'live') push(`${id}:live`, base + 1000, 'truck.setLive', T, {});
    const man = manifestOf(d.manifest, warnings, id);
    if (man) push(`${id}:manifest`, base + 2000, 'manifest.attach', T, man);
    else if (d.manifest) warnings.push(`${id}: its manifest had no usable consolidations and was not attached`);
    // The team is the truck's team plus anyone who worked a pallet on it, so
    // every imported segment passes the reducer's team check.
    const crew = [...new Set([...(d.team || []).map(m => String(m.pid)), ...Object.values(d.pallets || {}).flatMap(p => (p.segments || []).map(s => String(s.pid)))].filter(x => x && x !== 'undefined'))];
    if (crew.length) push(`${id}:team`, base + 3000, 'truck.team.set', T, { team: crew.map(member) });
    if (d.goalAt) push(`${id}:goal`, base + 4000, 'truck.setGoal', T, { goal: d.goalAt });
    const pallets = Object.values(d.pallets || {}).sort((a, b) => num(a.n) - num(b.n));
    let landAt = base + 10000, untyped = 0;
    for (const p of pallets) {
      const ref = String(p.ref || '').toUpperCase();
      if (!/^[A-Z]\d{1,2}$/.test(ref)) { warnings.push(`${id}: pallet P${p.n} on ${p.ref} skipped (not a bay)`); continue; }
      const B = { truck: id, bay: ref };
      if (!PTYPES.includes(p.ptype)) untyped += 1;
      const segs = (p.segments || []).filter(s => ms(s.start)).sort((a, b) => ms(a.start) - ms(b.start));
      const first = segs[0] ? ms(segs[0].start) - 1000 : null;
      landAt = first && first < landAt ? first : landAt;
      const scanIds = [...new Set([...(Array.isArray(p.scanIds) ? p.scanIds : []), p.scanId].filter(Boolean).map(s => String(s).replace(/\D/g, '').slice(-9)))];
      push(`${id}:land:${ref}`, landAt, 'pallet.land', B, { ptype: PTYPES.includes(p.ptype) ? p.ptype : 'chep', cartons: p.cartons == null || !(num(p.cartons) >= 1) ? null : Math.min(500, num(p.cartons)), ...(p.expectedBasis === 'manual' && p.expectedMins != null ? { expectedMins: num(p.expectedMins) } : {}), consolIds: (p.consolIds?.length ? p.consolIds : p.consolId ? [p.consolId] : []).map(String), scanIds, note: p.note || '', carryover: !!p.carriedFrom, excluded: !!p.excluded });
      landAt += 1000; counts.pallets += 1;
      segs.forEach((s, i) => {
        push(`${id}:seg:${ref}:${i}:start`, ms(s.start), 'pallet.start', B, { pid: who(s.pid) });
        const end = ms(s.end);
        if (end && (i < segs.length - 1 || p.status !== 'done')) push(`${id}:seg:${ref}:${i}:pause`, end, 'pallet.pause', B, {});
      });
      if (p.status === 'done') push(`${id}:done:${ref}`, ms(p.doneAt) || (segs.length ? ms(segs[segs.length - 1].end) || Date.now() : landAt), 'pallet.done', B, {});
    }
    if (untyped) warnings.push(`${id}: ${untyped} pallet${untyped === 1 ? '' : 's'} had no type in DV and imported as Chep`);
    let pauses = 0;
    (d.halts || []).forEach((h, i) => {
      const start = ms(h.start); if (!start) return;
      const halt = !h.kind || h.kind === 'halt';
      if (!halt) pauses += 1;
      push(`${id}:halt:${i}:start`, start, 'halt.start', T, { reason: halt && HALT_REASONS.includes(h.reason) ? h.reason : 'other' });
      if (ms(h.end)) push(`${id}:halt:${i}:end`, ms(h.end), 'halt.end', T, {});
    });
    if (pauses) warnings.push(`${id}: ${pauses} planned pause${pauses === 1 ? '' : 's'} (huddle, transition or team break) imported as "Other" halts`);
    counts.trucks += 1;
  }

  // 3. the week plan: slots without a truck yet (a created truck consumed its slot in DV too)
  for (const [date, day] of Object.entries(planner?.days || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    for (const [n, sl] of Object.entries(day?.slots || {})) {
      const slot = Number(n); if (!(slot >= 1 && slot <= 4) || !sl) continue;
      const eta = sl.eta && /^\d{1,2}:\d{2}/.test(String(sl.eta)) ? String(sl.eta).slice(0, 5).padStart(5, '0') : null;
      const man = manifestOf(sl.manifest, warnings, `${date}-T${slot}`);
      push(`plan:${date}:${slot}`, (ms(date + 'T00:00:00Z') || Date.now()), 'plan.set', { date, slot }, { eta, note: String(sl.note || ''), team: (sl.team || []).map(x => ({ ...member(typeof x === 'string' ? x : x.pid), ...(x && x.start ? { start: x.start } : {}), ...(x && x.finish ? { finish: x.finish } : {}) })), manifest: man ? { ...man, attachedAt: iso(Date.now()) } : null });
      counts.planner += 1;
    }
  }

  if (rollover && (rollover.pallets || []).length) warnings.push(`${rollover.pallets.length} pallet${rollover.pallets.length === 1 ? '' : 's'} held over from ${rollover.fromId || 'the last truck'} ${rollover.pallets.length === 1 ? 'was' : 'were'} not imported: land ${rollover.pallets.length === 1 ? 'it' : 'them'} on the next truck as a carry-over`);
  const g = config?.grid; if (g && (num(g.rows) !== 4 || num(g.cols) !== 7)) warnings.push(`DV used a ${g.rows} × ${g.cols} dock grid; Conduit's is 4 × 7`);
  counts.events = events.length;
  return { events, warnings, counts, store: { name: config?.storeName || null, storeNumber: config?.settings?.storeNo || null } };
}

export async function importDV(env, { no, url, dry = false, apply, fetchImpl = fetch }) {
  const base = String(url || '').trim().replace(/\/+$/, '').replace(/\/api\/state$/, '');
  if (!/^https?:\/\/[\w.-]+(:\d+)?$/.test(base)) throw new HttpError(400, 'invalid_request', 'url must be the Decant Visualiser site, like https://busselton-dock.netlify.app');
  // The worker fetches this address, so outside dev it must be a public https
  // site: no plain http, no bare IP address, no localhost.
  const host = new URL(base).hostname, local = ['dev', 'test'].includes(env.ENVIRONMENT);
  if (!local && (!base.startsWith('https://') || /^[\d.]+$/.test(host) || host === 'localhost' || !host.includes('.'))) throw new HttpError(400, 'invalid_request', 'url must be a public https site, like https://busselton-dock.netlify.app');
  if (base.startsWith('http://') && env.ENVIRONMENT !== 'dev' && env.ENVIRONMENT !== 'test') throw new HttpError(400, 'invalid_request', 'the DV site must be https');
  const get = async (q, optional = false) => {
    let r;
    try { r = await fetchImpl(`${base}/api/state${q}`, { headers: { accept: 'application/json' } }); }
    catch (e) { throw new HttpError(502, 'dv_unreachable', `could not reach ${base}: ${e.message}`); }
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch { j = null; }
    if (r.status === 404 && optional) return null;
    if (r.status === 429) throw new HttpError(429, 'dv_throttled', 'the DV site is throttling: wait a minute and try again');
    if (!r.ok || j === null) throw new HttpError(r.ok ? 404 : 502, r.ok ? 'dv_site' : 'dv_error', `${base} answered ${r.status} for /api/state${q}: ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'no body'}`);
    return j;
  };
  const active = await get('');
  if (!active || !Array.isArray(active.trucks)) throw new HttpError(404, 'dv_site', `${base} is not a Decant Visualiser site (no active index)`);
  const [config, history, planner, rollover] = await Promise.all([get('?config'), get('?history'), get('?planner'), get('?rollover')]);
  const trucks = {};
  for (let i = 0; i < active.trucks.length; i += 4) await Promise.all(active.trucks.slice(i, i + 4).map(async id => { if (/^[\w-]{1,40}$/.test(id)) trucks[id] = await get(`?truck=${encodeURIComponent(id)}`, true); }));
  const m = mapDV({ active, config, history, trucks, planner, rollover }, { no });
  if (m.store.storeNumber && String(m.store.storeNumber) !== String(no)) m.warnings.unshift(`the DV site says it is store ${m.store.storeNumber}, not ${no}`);
  const events = [];
  for (const e of m.events) events.push({ id: await importId(e.seed, e.ms, 'dv'), store: String(no), area: e.area, type: e.type, entity: e.entity, payload: e.payload, at: iso(e.ms), v: 1 });
  const summary = { source: 'dv', url: base, legacy: { name: m.store.name, storeNumber: m.store.storeNumber }, counts: m.counts, warnings: m.warnings, dry, applied: 0, duplicates: 0, rejected: [] };
  if (dry || !apply) return summary;
  for (let i = 0; i < events.length; i += 400) {
    const results = await apply(events.slice(i, i + 400));
    for (const r of results) { if (r.ok && r.duplicate) summary.duplicates += 1; else if (r.ok) summary.applied += 1; else summary.rejected.push({ id: r.id, code: r.code, message: r.message }); }
  }
  return summary;
}
