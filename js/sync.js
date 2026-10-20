// What the outbox is doing, in words a person can act on: why a change is
// waiting, why one was refused, and the line the sync pill shows.

import { typeInfo } from '../shared/catalogue.js';

const AREA_NAME = { stockroom: 'Stockroom', backdock: 'Back dock', store: 'Floor' };
const ROLE_CODE = { stockroom: 'the Stockroom code', dock: 'the Dock code', manager: 'the manager code' };
// The code a refused change waits for, from its type's roles; null when the
// store PIN is enough (then it waits for the store's sign-in to come back).
const codeFor = e => { const roles = typeInfo(e?.type)?.roles || []; if (roles.includes('floor')) return null; for (const r of ['stockroom', 'dock', 'manager']) if (roles.includes(r)) return ROLE_CODE[r]; return ROLE_CODE.manager; };
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// Why one change is waiting, short enough for a list row.
export function holdReason(h) {
  const area = h.event?.area || 'store';
  switch (h.code) {
    case 'unauthorised': { const c = codeFor(h.event); return !c || /another store/.test(h.message || '') ? 'Waits for this store’s sign-in' : `Waits for ${c}`; }
    case 'not_entitled': return `${AREA_NAME[area]} is switched off for this store`;
    case 'tool_off': return (h.message || 'That tool is switched off').replace(/ for this store$/, '') + ' for this store';
    case 'clock_skew': return 'Waits for this device’s date and time to be corrected';
    case 'invalid_event': case 'not_implemented': return 'Waits for the server to update (a minute or so)';
    default: return 'The server could not save it yet';
  }
}

// One toast for a batch of changes that started waiting.
export function holdToast(list) {
  const n = list.length, first = list[0] || {};
  const what = plural(n, 'change');
  switch (first.code) {
    case 'unauthorised': { const c = codeFor(first.event); return !c || /another store/.test(first.message || '') ? `${what} will send when this store is signed in again.` : `${what} will send once ${c} is entered again.`; }
    case 'clock_skew': return `This device’s date or time is wrong, so ${what} ${n === 1 ? 'waits' : 'wait'}. Correct it in the device settings.`;
    case 'invalid_event': case 'not_implemented': return `The server is still updating. ${what} will send in a minute or so.`;
    case 'not_entitled': case 'tool_off': return `${what} ${n === 1 ? 'waits' : 'wait'}: ${holdReason(first).toLowerCase()}.`;
    default: return `The server could not save ${what}. ${n === 1 ? 'It waits' : 'They wait'} and will be tried again.`;
  }
}

// A change the worker refused for good.
export function refusalText(r) {
  const msg = String(r?.message || r?.code || 'refused');
  return `Not saved: ${msg.charAt(0).toUpperCase()}${msg.slice(1)}`;
}

// The pill: null when there is nothing to say (live, nothing waiting).
export function pillState(s) {
  if (!s || s.state === 'owner') return null;
  const queued = s.queued || 0, held = s.held || 0;
  if (held) return { tone: 'bad', text: `${held} waiting` };
  if (s.state === 'offline') return { tone: 'off', text: queued ? `Offline · ${queued}` : 'Offline' };
  if (queued) return { tone: 'busy', text: `Sending ${queued}` };
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
  const head = status.state === 'offline' ? 'Offline. Changes stay on this device and send when the connection is back.'
    : held.length ? 'Some changes are waiting for something before they can send.'
    : queued.length ? 'Sending…' : 'Everything on this device has reached the store.';
  const row = (e, sub, btn) => `<div class="sy-row"><div class="sy-t"><b>${esc(typeLabel(e.type))}${what(e) ? ` <span>${esc(what(e))}</span>` : ''}</b><small>${sub}</small></div>${btn || ''}</div>`;
  const heldHtml = held.length ? `<div class="sy-sec">Waiting · ${held.length}</div><div class="sy-list">${held.map(h => row(h.event, `${esc(holdReason(h))}${hm(h.event.at) ? ` · made ${hm(h.event.at)}` : ''}`, `<button type="button" class="btn sm" data-sync="discard" data-id="${esc(h.event.id)}">Discard</button>`)).join('')}</div>` : '';
  const shown = queued.slice(0, 20);
  const queuedHtml = queued.length ? `<div class="sy-sec">To send · ${queued.length}</div><div class="sy-list">${shown.map(e => row(e, hm(e.at) ? `made ${hm(e.at)}` : '')).join('')}${queued.length > shown.length ? `<div class="sy-more">and ${queued.length - shown.length} more</div>` : ''}</div>` : '';
  return `<p class="sy-head">${ic(held.length ? 'alert' : status.state === 'offline' ? 'clock' : 'check')}<span>${head}</span></p>${heldHtml}${queuedHtml}` +
    (held.length || (queued.length && status.state !== 'offline') ? `<div class="sy-acts"><button type="button" class="btn primary" data-sync="retry">${ic('refresh')}Try again now</button></div>` : '');
}
