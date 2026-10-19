// What the outbox is doing, in words a person can act on: why a change is
// waiting, why one was refused, and the line the sync pill shows.

const AREA_NAME = { stockroom: 'Stockroom', backdock: 'Back dock', store: 'Floor' };
const CODE_NAME = { stockroom: 'the Stockroom code', backdock: 'the Dock code', store: 'the manager code' };
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// Why one change is waiting, short enough for a list row.
export function holdReason(h) {
  const area = h.event?.area || 'store';
  switch (h.code) {
    case 'unauthorised': return /another store/.test(h.message || '') ? 'Waits for this store to be signed in again' : `Waits for ${CODE_NAME[area]}`;
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
    case 'unauthorised': return /another store/.test(first.message || '') ? `${what} for this store will send when it is signed in again.` : `${what} will send once ${CODE_NAME[first.event?.area || 'store']} is entered again.`;
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
  if (s.state === 'connecting') return { tone: 'busy', text: 'Connecting' };
  return null;
}
