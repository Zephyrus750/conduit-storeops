// Practice mode (approved 11 Nov 2026): a sandbox store for new starters,
// the real screens with sample data, kept out of the store's log. The
// mechanics are client/practice.js; this is the shell's side of it.
//
// A manager (or the owner acting as the store) starts it from Settings. The
// device keeps its sign-in and its roles, and nothing more: the practice
// store judges every change on those roles, as the worker does.
//
//   on the device   practice_mode (localStorage) marks it on for one store
//                   and keeps that store's own device keys (anything named
//                   …:<store>) aside, so practice starts from none of them and
//                   they come back exactly as they were. The practice store's
//                   data lives under the practice: prefix of device storage.
//   the worker      while it is on, the client's gate refuses every write and
//                   every read of the store's data (client/practice.js
//                   practiceRefusal), with one toast: Not in practice mode.
//   in memory       starting and ending reload the app, so no screen carries
//                   anything from one into the other.
//
// A reload mid-practice resumes it (the bar and a toast say so); a sign-out,
// a session the worker ended, or another store opened on the device ends it.

import { $, ic, esc, toast } from './ui.js';
import { ask } from './sheet.js';
import { tx } from './i18n.js';
import { TransportError } from '../client/transport.js';
import { openPracticeStore, practiceRefusal, practiceSeed, practiceStorage, wipePractice } from '../client/practice.js';

const MARK = 'practice_mode';
const readMark = () => { try { const m = JSON.parse(localStorage.getItem(MARK) || 'null'); return m && m.store ? m : null; } catch { return null; } };
// A store's own device keys: codelist:1241, my_bays:1241, fieldcapture:1241…
const storeKeys = no => { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k !== MARK && (k.endsWith(':' + no) || k.includes(':' + no + ':'))) out.push(k); } } catch {} return out; };

// Who may start it: a store session signed in as a manager, or the owner
// acting as the store. Never a dock screen.
export const canPractise = s => !!s?.store && !s.screen && (!!s.actas || (s.roles || []).includes('manager'));
export const inPractice = () => !!readMark();

// The Settings card (General, on the PC and the phone).
export function practiceCard(ctx) {
  if (!ctx.store) return '';
  const on = inPractice(), may = canPractise(ctx.session.current);
  const ctl = on ? `<button type="button" class="btn sm" data-practice="end">${ic('x')}${tx('End practice')}</button>`
    : `<button type="button" class="btn sm${may ? ' primary' : ''}"${may ? ' data-practice="start"' : ' disabled'}>${ic('shield')}${tx('Start practice')}</button>`;
  const what = on ? tx('End it here or from the bar at the top. Everything done in practice is wiped.') : may ? tx('Hand this device to a new starter. It keeps its sign-in and its roles, and nothing more.') : tx('A manager starts practice, from a manager sign-in.');
  return `<div class="stg-card stg-practice${on ? ' on' : ''}"><div class="stg-h">${tx('Practice mode')}</div><p class="stg-p">${tx('A sandbox store for new starters: the real screens with sample data.')}<br>${tx('Nothing done in practice is saved or sent, and it is wiped when practice ends.')}</p>` +
    `<div class="stg-item"><div><b>${on ? tx('Practice is on') : tx('Start practice')}</b><span>${what}</span></div><div class="stg-ctl">${ctl}</div></div></div>`;
}

// The shell's side: installPractice({ client, frame, closeStore }) once, at boot.
//   on          practice is on for this device
//   storage     the practice view of device storage (ctx.storage), while on
//   open(s)     the practice store for session s, or null (the real store opens)
//   finish()    practice ends: its data goes, the store's own keys come back
//   paint(st)   the sync pill and the footer say Practice (true when they did)
export function installPractice({ client, frame, closeStore }) {
  let mark = readMark();
  const storage = practiceStorage(client.storage);
  // A refused call says so once, even when the screen also shows the error.
  let said = 0;
  const say = msg => { if (Date.now() - said < 1500) return; said = Date.now(); setTimeout(() => { if (![...document.querySelectorAll('#toasts .toast.show')].some(t => t.textContent.startsWith(msg))) toast(msg, 'warn', null, 'practice'); }, 120); };
  const gate = (path, opts) => {
    const kind = practiceRefusal(path, opts); if (!kind) return null;
    const msg = tx('Not in practice mode');
    if (kind === 'write') say(msg);
    return new TransportError(423, 'practice', msg, { practice: kind, path });
  };
  if (mark) client.setGate(gate);

  async function finish() {
    const m = readMark();
    try { await wipePractice(client.storage); } catch (e) { console.warn('practice wipe', e?.message || e); }
    if (m) {
      for (const k of storeKeys(m.store)) try { localStorage.removeItem(k); } catch {}
      for (const [k, v] of Object.entries(m.keep || {})) if (typeof v === 'string') try { localStorage.setItem(k, v); } catch {}
    }
    try { localStorage.removeItem(MARK); } catch {}
    mark = null; client.setGate(null);
    $('#practiceBar')?.remove(); frame.classList.remove('practice');
  }

  async function start() {
    const s = client.session.current;
    if (!canPractise(s)) { toast(tx('A manager starts practice, from a manager sign-in.'), 'bad'); return; }
    if (inPractice()) return;
    const ok = await ask({ title: tx('Start practice?'), text: [tx('This device opens a practice copy of the store with sample data, for a new starter to try anything.'), tx('Nothing done in practice is saved or sent, and it is wiped when practice ends.'), tx('The device stays signed in as it is now, and the store comes back as it was when practice ends.')], ok: tx('Start practice'), cancel: tx('Not now'), danger: false });
    if (!ok) return;
    // What this store has queued goes first, as before a sign-out (it waits on the device otherwise).
    const real = client.stores.get(String(s.store));
    try { await Promise.race([real?.flush(), new Promise(r => setTimeout(r, 3000))]); } catch {}
    const keep = {}; for (const k of storeKeys(s.store)) keep[k] = localStorage.getItem(k);
    try { localStorage.setItem(MARK, JSON.stringify({ store: String(s.store), since: Date.now(), keep })); }
    catch { toast(tx('Practice could not start: this device’s storage is full.'), 'bad'); return; }
    for (const k of Object.keys(keep)) try { localStorage.removeItem(k); } catch {}
    try { await wipePractice(client.storage); } catch {}   // a fresh practice store every time
    location.reload();
  }
  async function end() {
    if (!inPractice()) return;
    const ok = await ask({ title: tx('End practice?'), text: tx('Everything done in practice is wiped from this device, and the store opens as it was.'), ok: tx('End practice'), cancel: tx('Keep practising'), danger: false });
    if (!ok) return;
    closeStore(); await finish(); location.reload();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-practice]'); if (!b) return;
    e.preventDefault();
    if (b.dataset.practice === 'start') start(); else if (b.dataset.practice === 'end') end();
  });

  // The bar on every screen, PC and phone: above the app, never over it.
  function bar() {
    frame.classList.add('practice');
    if ($('#practiceBar')) return;
    const el = document.createElement('div'); el.id = 'practiceBar'; el.className = 'practice-bar'; el.setAttribute('role', 'status');
    el.innerHTML = `${ic('shield')}<span class="pb-t">${tx('<b>Practice</b> · nothing here is saved or sent')}</span><button type="button" class="pb-end" data-practice="end">${tx('End practice')}</button>`;
    frame.prepend(el);
  }

  async function open(s) {
    mark = readMark();
    if (!mark) return null;
    // Practice belongs to the store it was started in, on a store sign-in:
    // anything else ends it, and the real store opens untouched.
    if (!s?.store || s.screen || mark.store !== String(s.store)) { await finish(); return null; }
    client.setGate(gate);
    const no = String(s.store);
    const seed = async () => practiceSeed({ storeNo: no, now: Date.now(), areas: s.caps || ['floor'], real: (await client.storage.get(`snap:${no}`))?.state || null, map: await client.maps.peek(no).catch(() => null) });
    let opened;
    try { opened = await openPracticeStore({ storeNo: no, session: client.session, storage: client.storage, seed }); }
    catch (e) {
      // It could not open (device storage refused): it ends, and the store opens as usual, saying so.
      console.error('practice', e); await finish();
      setTimeout(() => toast(tx('Practice could not open ({error}). The store opened as usual.', { error: e.message || e }), 'bad'), 400);
      return null;
    }
    const { store, fresh } = opened;
    client.stores.get(no)?.close?.();
    client.stores.set(no, store);   // closeAll() closes it with the rest
    bar();
    if (!fresh) setTimeout(() => toast(tx('Practice resumed. Nothing here is saved or sent.'), 'warn', null, 'practice'), 400);
    return store;
  }

  function paint(st) {
    if (!mark || st?.state === 'owner') return false;
    const pill = $('#msync');
    if (pill) { pill.hidden = false; pill.className = 'msync practice'; pill.removeAttribute('data-shell-act'); pill.innerHTML = `<span class="dot"></span>${esc(tx('Practice'))}`; pill.setAttribute('aria-label', tx('Nothing done in practice is saved or sent, and it is wiped when practice ends.')); }
    const el = $('#footSync');
    if (el) { el.innerHTML = `<span class="dot practice"></span>${esc(tx('Practice'))}`; el.title = tx('Nothing done in practice is saved or sent, and it is wiped when practice ends.'); el.removeAttribute('data-shell-act'); el.removeAttribute('role'); el.removeAttribute('tabindex'); }
    return true;
  }

  return { get on() { return !!mark; }, get storage() { return mark ? storage : null; }, open, finish, paint };
}
