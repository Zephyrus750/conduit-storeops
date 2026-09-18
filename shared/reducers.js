// Shared reducers: the fold from events to state, used by the store object
// on the worker and by the client for optimistic updates. Same module, same
// shape, so the two can never disagree.
//
// apply(state, event) mutates state in place and returns null on success or
// { code, message } to reject the event. A reducer validates before it
// mutates, so a rejected event leaves state untouched.
//
// Reducers live per area in shared/reducers/*.js; this module composes them
// and owns the state envelope (v, seq).

import { floorState, floorReducers } from './reducers/floor.js';
import { stockroomState, stockroomReducers } from './reducers/stockroom.js';
import { backdockState, backdockReducers } from './reducers/backdock.js';
import { storeState, storeReducers } from './reducers/store.js';
import { reject } from './reducers/util.js';

export const STATE_VERSION = 2;

export { RINGS } from './reducers/stockroom.js';

const REDUCERS = { ...floorReducers, ...stockroomReducers, ...backdockReducers, ...storeReducers };

export function initialState() {
  return { v: STATE_VERSION, seq: 0, ...storeState(), ...floorState(), ...stockroomState(), ...backdockState() };
}

export function hasReducer(type) { return typeof REDUCERS[type] === 'function'; }
export function reducerTypes() { return Object.keys(REDUCERS); }

export function apply(state, event) {
  const r = REDUCERS[event.type];
  if (!r) return reject('not_implemented', `${event.type} has no reducer yet`);
  const res = r(state, event);
  if (res) return res;
  if (typeof event.seq === 'number') state.seq = event.seq;
  return null;
}

export function replay(state, events) {
  const rejected = [];
  for (const e of events) { const r = apply(state, e); if (r) rejected.push({ id: e.id, ...r }); }
  return rejected;
}
