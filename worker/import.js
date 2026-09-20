// The K2B importer: pulls a store's backfill history, today's board, the
// requested list and the negative-SOH list from the legacy suite worker
// and turns each record into the events Conduit would have logged had the
// store been here all along. Event ids are derived from the record (time
// part from its timestamp, the rest from a hash of its key), so running the
// import twice acknowledges duplicates instead of doubling anything.
//
//   importK2B(env, { no, code, pin, dry }) → summary
//     no    Conduit store number        code  the K2B join code (6–10 chars)
//     pin   the store's K2B PIN         dry   build and count, apply nothing
//
// Legacy surface (cloudflare-worker.js in k2b-coolwisp):
//   ?storeop=info&store=CODE                    { found, code, name, storeNumber }
//   ?sub=history&store=CODE&offset=&limit=250   { items:[{ location, date, submittedAt, readyAt, submittedDoneAt?, metrics?, codes:[…], autoSubmitted?, requestedOnly? }], total, hasMore }
//   ?sub=list&store=CODE                        { items:[{ location, date, status, … }], today, requested:[…] }
//   ?sub=get&store=CODE&location=&date=         { found, submission:{ location, date, submittedAt, updatedAt, status, codes:[{code,scanned}], incorrectCodes?, metrics?, autoSubmitted?, submittedDoneAt? } }
//   ?sub=negsohlist&store=CODE                  { items:[{ keycode, qty, name, location, confirmed, addedAt }], date }
// All but info take the PIN in X-K2B-Pin. Timestamps are epoch ms.

import { HttpError } from './http.js';
import { upstream } from './upstream.js';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PAGE = 250;
const enc = new TextEncoder();

// The id's time part is the record's timestamp; the rest hashes the seed
// under the importer's namespace, so K2B and DV imports never collide.
export async function importId(seed, ms, ns = 'k2b') {
  let time = Math.max(0, Math.floor(Number(ms) || 0)), out = '';
  for (let i = 9; i >= 0; i--) { out = ALPHABET[time % 32] + out; time = Math.floor(time / 32); }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`import:${ns}:` + seed)));
  let bits = 0, acc = 0, rand = '';
  for (const b of digest) { acc = ((acc << 8) | b) >>> 0; bits += 8; while (bits >= 5 && rand.length < 16) { bits -= 5; rand += ALPHABET[(acc >>> bits) & 31]; } if (rand.length >= 16) break; }
  return out + rand;
}
const iso = ms => new Date(Number(ms) || Date.now()).toISOString().replace(/\.\d{3}Z$/, '+00:00');
const cleanCodes = list => [...new Set((list || []).map(c => String(typeof c === 'object' ? c.code : c)).filter(c => /^\d{6,13}$/.test(c)))];

export async function importK2B(env, { no, code, pin, dry = false, apply, fetchImpl = fetch, now = Date.now }) {
  const base = String(env.LEGACY_URL || env.LOOKUP_URL || '').replace(/\/+$/, '');
  if (!base) throw new HttpError(503, 'not_configured', 'LEGACY_URL is not set');
  const storeCode = String(code || '').trim().toUpperCase();
  if (!/^[A-Z2-9]{6,10}$/.test(storeCode)) throw new HttpError(400, 'invalid_request', 'code must be the 6 to 10 character K2B store code');
  const doFetch = upstream(env, 'LEGACY', fetchImpl);
  const call = async (q, withPin = true) => {
    const url = `${base}/?${q}&store=${storeCode}`;
    let r;
    try { r = await doFetch(url, { headers: withPin ? { 'X-K2B-Pin': String(pin || '') } : {} }); }
    catch (e) { throw new HttpError(502, 'legacy_unreachable', `could not reach the legacy worker at ${base}: ${e.message}`); }
    const text = await r.text();
    let j = {}; try { j = JSON.parse(text); } catch { j = {}; }
    const said = j.error ? String(j.error) : text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (r.status === 403 && withPin) throw new HttpError(403, 'legacy_pin', `the legacy worker refused the store PIN: ${said}`);
    if (r.status === 404 && (j.found === false || /unknown store/i.test(said))) throw new HttpError(404, 'legacy_store', `store code ${storeCode} is not known to the legacy worker: ${said}`);
    if (!r.ok) throw new HttpError(502, 'legacy_error', `legacy worker answered ${r.status} for ?${q}: ${said || 'no body'}`);
    return j;
  };

  const info = await call('storeop=info', false);
  const warnings = [], events = [];
  const push = async (seed, ms, type, area, entity, payload = {}) => { events.push({ id: await importId(seed, ms), store: String(no), area, type, entity, payload, at: iso(ms), v: 1 }); };

  // 1. history: every bay ever marked ready, oldest first so the log reads in order
  const history = [];
  for (let offset = 0, more = true; more && offset < 100000; offset += PAGE) {
    const page = await call(`sub=history&offset=${offset}&limit=${PAGE}&sort=time`);
    history.push(...(page.items || [])); more = !!page.hasMore && (page.items || []).length > 0;
  }
  history.sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.readyAt || 0) - (b.readyAt || 0));
  const seen = new Set();
  for (const h of history) {
    const bay = String(h.location || '').toUpperCase(), date = String(h.date || '').slice(0, 10);
    if (!bay || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { warnings.push(`history record skipped: bad location or date (${h.location} ${h.date})`); continue; }
    const key = `${bay}:${date}`;
    if (seen.has(key)) { warnings.push(`duplicate history record for ${key}`); continue; }
    seen.add(key);
    const k = { bay, date }, t0 = h.submittedAt || h.readyAt || Date.parse(date + 'T08:00:00+08:00');
    if (h.requestedOnly) { await push(`req:${key}`, t0, 'submission.request', 'stockroom', k); continue; }
    const codes = cleanCodes(h.codes);
    if (codes.length !== (h.codes || []).length) warnings.push(`${key}: ${(h.codes || []).length - codes.length} codes were not keycodes`);
    await push(`open:${key}`, t0, 'submission.open', 'stockroom', k);
    if (codes.length) await push(`codes:${key}`, t0 + 1, 'submission.update', 'stockroom', k, { codes: Object.fromEntries(codes.map(c => [c, true])) });
    await push(`ready:${key}`, h.readyAt || t0 + 2, 'submission.ready', 'stockroom', k, h.metrics ? { metrics: h.metrics } : {});
    if (h.submittedDoneAt || h.autoSubmitted) await push(`submit:${key}`, h.submittedDoneAt || h.readyAt + 1 || t0 + 3, 'submission.submit', 'stockroom', k, { auto: !!h.autoSubmitted });
  }

  // 2. today's board with per-code detail, and the requested list
  const list = await call('sub=list');
  const today = String(list.today || '').slice(0, 10);
  const dayMs = Date.parse(today + 'T00:00:00+08:00') || now();
  let todayN = 0;
  // Per-bay detail, eight at a time: a busy board has 30 bays and each is a read.
  const board = (list.items || []).map(it => ({ bay: String(it.location || '').toUpperCase(), date: String(it.date || today).slice(0, 10) }));
  const details = new Map();
  for (let i = 0; i < board.length; i += 8) await Promise.all(board.slice(i, i + 8).map(async b => { const got = await call(`sub=get&location=${encodeURIComponent(b.bay)}&date=${b.date}`); details.set(`${b.bay}:${b.date}`, got.found ? got.submission : null); }));
  for (const { bay, date } of board) {
    const key = `${bay}:${date}`;
    const s = details.get(key); if (!s) { warnings.push(`${key}: on the board but its record could not be read`); continue; }
    const k = { bay, date }, t0 = s.submittedAt || dayMs;
    const codes = {}; for (const c of s.codes || []) { const kc = String(c.code || c); if (/^\d{6,13}$/.test(kc)) codes[kc] = typeof c === 'object' ? !!c.scanned : true; }
    await push(`open:${key}`, t0, 'submission.open', 'stockroom', k);
    if (Object.keys(codes).length || (s.incorrectCodes || []).length) await push(`today:${key}:${s.updatedAt || t0}`, (s.updatedAt || t0) + 1, 'submission.update', 'stockroom', k, { codes, incorrect: cleanCodes(s.incorrectCodes) });
    if (s.status === 'corrected' || s.status === 'submitted') await push(`ready:${key}`, s.updatedAt || t0 + 2, 'submission.ready', 'stockroom', k, s.metrics ? { metrics: s.metrics } : {});
    if (s.status === 'submitted') await push(`submit:${key}`, s.submittedDoneAt || s.updatedAt || t0 + 3, 'submission.submit', 'stockroom', k, { auto: !!s.autoSubmitted });
    todayN += 1;
  }
  for (const loc of list.requested || []) { const bay = String(loc).toUpperCase(); await push(`req:${bay}:${today}`, dayMs, 'submission.request', 'stockroom', { bay, date: today }); }

  // 3. today's negative-SOH list
  const neg = await call('sub=negsohlist');
  for (const it of neg.items || []) {
    const kc = String(it.keycode || '').replace(/\D/g, ''); if (!/^\d{6,13}$/.test(kc)) { warnings.push(`negative SOH item skipped: ${it.keycode}`); continue; }
    await push(`neg:${kc}:${neg.date || today}`, it.addedAt || dayMs, 'adjustment.set', 'stockroom', { keycode: kc, date: String(neg.date || today).slice(0, 10) }, { qty: Math.abs(Number(it.qty) || 0), name: String(it.name || '').slice(0, 120), location: it.location || '', confirmed: !!it.confirmed });
  }

  const summary = { source: 'k2b', code: storeCode, legacy: { name: info.name || null, storeNumber: info.storeNumber || null }, counts: { history: history.length, today: todayN, requested: (list.requested || []).length, negsoh: (neg.items || []).length, events: events.length }, warnings, dry, applied: 0, duplicates: 0, rejected: [] };
  if (dry || !apply) return summary;
  for (let i = 0; i < events.length; i += 400) {
    const results = await apply(events.slice(i, i + 400));
    for (const r of results) { if (r.ok && r.duplicate) summary.duplicates += 1; else if (r.ok) summary.applied += 1; else summary.rejected.push({ id: r.id, code: r.code, message: r.message }); }
  }
  return summary;
}
