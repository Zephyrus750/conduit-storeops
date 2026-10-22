// What the outbox is doing, in words a person can act on: why a change is
// waiting, why one was refused, and the line the sync pill shows.

import { typeInfo } from '../shared/catalogue.js';
import { toolForEvent } from '../shared/tools.js';
import { tx, txn } from './i18n.js';

const AREA_NAME = { stockroom: tx('Stockroom'), backdock: tx('Back dock'), store: tx('Floor') };
// The code a refused change waits for, from its type's roles; null when the
// store PIN is enough (then it waits for the store's sign-in to come back).
const codeFor = e => { const roles = typeInfo(e?.type)?.roles || []; if (roles.includes('floor')) return null; for (const r of ['stockroom', 'dock', 'manager']) if (roles.includes(r)) return r; return 'manager'; };
// One sentence per code, so each language words it whole.
const WAITS_FOR = { stockroom: tx('Waits for the Stockroom code'), dock: tx('Waits for the Dock code'), manager: tx('Waits for the manager code') };
const SEND_ONCE = {
  stockroom: n => txn(n, '{n} change will send once the Stockroom code is entered again.', '{n} changes will send once the Stockroom code is entered again.'),
  dock: n => txn(n, '{n} change will send once the Dock code is entered again.', '{n} changes will send once the Dock code is entered again.'),
  manager: n => txn(n, '{n} change will send once the manager code is entered again.', '{n} changes will send once the manager code is entered again.'),
};
const switchedOff = name => tx('{name} is switched off for this store', { name });

// Why one change is waiting, short enough for a list row.
export function holdReason(h) {
  const area = h.event?.area || 'store';
  switch (h.code) {
    case 'unauthorised': { const c = codeFor(h.event); return !c || /another store/.test(h.message || '') ? tx('Waits for this store’s sign-in') : WAITS_FOR[c]; }
    case 'not_entitled': return switchedOff(AREA_NAME[area]);
    case 'tool_off': { const t = toolForEvent(String(h.event?.type || '')); return t ? switchedOff(tx(t.name)) : tx('That tool is switched off for this store'); }
    case 'clock_skew': return tx('Waits for this device’s date and time to be corrected');
    case 'invalid_event': case 'not_implemented': return tx('Waits for the server to update (a minute or so)');
    default: return tx('The server could not save it yet');
  }
}

// One toast for a batch of changes that started waiting.
export function holdToast(list) {
  const n = list.length, first = list[0] || {};
  switch (first.code) {
    case 'unauthorised': { const c = codeFor(first.event); return !c || /another store/.test(first.message || '') ? txn(n, '{n} change will send when this store is signed in again.', '{n} changes will send when this store is signed in again.') : SEND_ONCE[c](n); }
    case 'clock_skew': return txn(n, 'This device’s date or time is wrong, so {n} change waits. Correct it in the device settings.', 'This device’s date or time is wrong, so {n} changes wait. Correct it in the device settings.');
    case 'invalid_event': case 'not_implemented': return txn(n, 'The server is still updating. {n} change will send in a minute or so.', 'The server is still updating. {n} changes will send in a minute or so.');
    case 'not_entitled': case 'tool_off': return txn(n, '{n} change waits: {reason}.', '{n} changes wait: {reason}.', { reason: holdReason(first) });
    default: return txn(n, 'The server could not save {n} change. It waits and will be tried again.', 'The server could not save {n} changes. They wait and will be tried again.');
  }
}

// A change the worker refused for good. The reason is the worker's own words.
export function refusalText(r) {
  const msg = String(r?.message || r?.code || tx('refused'));
  return tx('Not saved: {reason}', { reason: `${msg.charAt(0).toUpperCase()}${msg.slice(1)}` });
}

// The pill: null when there is nothing to say (live, nothing waiting).
export function pillState(s) {
  if (!s || s.state === 'owner') return null;
  const queued = s.queued || 0, held = s.held || 0;
  if (held) return { tone: 'bad', text: tx('{n} waiting', { n: held }) };
  if (s.state === 'offline') return { tone: 'off', text: queued ? tx('Offline · {n}', { n: queued }) : tx('Offline') };
  if (queued) return { tone: 'busy', text: tx('Sending {n}', { n: queued }) };
  return null;   // live, polling or reconnecting with nothing to send: nothing to say
}

// The list behind the pill (a phone sheet, or the desk's popover from the
// footer): what is waiting and why, with Retry and Discard. esc and ic come
// from the shell so this file stays free of the DOM.
const typeLabel = t => { const w = String(t || '').replace(/\./g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(); return w.charAt(0).toUpperCase() + w.slice(1); };
const what = e => { const v = Object.values(e?.entity || {}).filter(x => x !== '' && x != null).join(' · '); return v; };
const hm = at => { const m = /T(\d{2}:\d{2})/.exec(String(at || '')); return m ? m[1] : ''; };

export function syncPanel({ status = {}, held = [], pending = [] }, { esc, ic }) {
  const heldIds = new Set(held.map(h => h.event.id)), queued = pending.filter(e => !heldIds.has(e.id));
  const head = status.state === 'offline' ? tx('Offline. Changes stay on this device and send when the connection is back.')
    : held.length ? tx('Some changes are waiting for something before they can send.')
    : queued.length ? tx('Sending…') : tx('Everything on this device has reached the store.');
  const row = (e, sub, btn) => `<div class="sy-row"><div class="sy-t"><b>${esc(typeLabel(e.type))}${what(e) ? ` <span>${esc(what(e))}</span>` : ''}</b><small>${sub}</small></div>${btn || ''}</div>`;
  const heldHtml = held.length ? `<div class="sy-sec">${tx('Waiting · {n}', { n: held.length })}</div><div class="sy-list">${held.map(h => row(h.event, `${esc(holdReason(h))}${hm(h.event.at) ? ` · ${tx('made {time}', { time: hm(h.event.at) })}` : ''}`, `<button type="button" class="btn sm" data-sync="discard" data-id="${esc(h.event.id)}">${tx('Discard')}</button>`)).join('')}</div>` : '';
  const shown = queued.slice(0, 20);
  const queuedHtml = queued.length ? `<div class="sy-sec">${tx('To send · {n}', { n: queued.length })}</div><div class="sy-list">${shown.map(e => row(e, hm(e.at) ? tx('made {time}', { time: hm(e.at) }) : '')).join('')}${queued.length > shown.length ? `<div class="sy-more">${tx('and {n} more', { n: queued.length - shown.length })}</div>` : ''}</div>` : '';
  return `<p class="sy-head">${ic(held.length ? 'alert' : status.state === 'offline' ? 'clock' : 'check')}<span>${head}</span></p>${heldHtml}${queuedHtml}` +
    (held.length || (queued.length && status.state !== 'offline') ? `<div class="sy-acts"><button type="button" class="btn primary" data-sync="retry">${ic('refresh')}${tx('Try again now')}</button></div>` : '');
}
