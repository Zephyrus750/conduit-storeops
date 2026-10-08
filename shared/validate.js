// Envelope and payload validation. Runs on the worker before apply and on
// the device before queueing, so a bad event fails fast where it was made.
//
// Returns null when the event is valid, otherwise { code, message }.

import { isUlid } from './ulid.js';
import { CATALOGUE } from './catalogue.js';

const STORE_RE = /^\d{3,5}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function validateEvent(ev) {
  if (!ev || typeof ev !== 'object') return bad('envelope must be an object');
  if (!isUlid(ev.id)) return bad('id must be a ULID');
  if (!STORE_RE.test(String(ev.store || ''))) return bad('store must be a store number');
  if (typeof ev.type !== 'string') return bad('type is required');
  const info = CATALOGUE[ev.type];
  if (!info) return { code: 'invalid_event', message: `unknown type ${ev.type}` };
  if (ev.area !== info.area) return bad(`area must be ${info.area} for ${ev.type}`);
  if (typeof ev.at !== 'string' || !ISO_RE.test(ev.at)) return bad('at must be an ISO 8601 timestamp with offset');
  if ((ev.v ?? 1) !== info.v) return { code: 'invalid_event', message: `${ev.type} is at schema v${info.v}` };

  const entity = ev.entity || {};
  if (typeof entity !== 'object' || Array.isArray(entity)) return bad('entity must be an object');
  for (const k of info.entity) {
    if (entity[k] === undefined || entity[k] === null || entity[k] === '') return bad(`entity.${k} is required`);
  }
  // Entity values become map keys in the reducers (weeks, bays, trucks,
  // cycles…): plain short strings or numbers, never a prototype name.
  for (const [k, v] of Object.entries(entity)) {
    if (RESERVED.has(k)) return bad(`entity key ${k} is not allowed`);
    if (typeof v === 'number' ? !Number.isFinite(v) : typeof v !== 'string') return bad(`entity.${k} must be a string or number`);
    if (String(v).length > ENTITY_MAX) return bad(`entity.${k} is over ${ENTITY_MAX} characters`);
    if (RESERVED.has(String(v).trim())) return bad(`entity.${k} is not allowed`);
  }

  const payload = ev.payload ?? {};
  if (typeof payload !== 'object' || Array.isArray(payload)) return bad('payload must be an object');
  const where = reservedIn(payload, 'payload');
  if (where) return bad(`${where} is not allowed`);
  for (const [k, t] of Object.entries(info.payload)) {
    const v = payload[k];
    if (v === undefined) return bad(`payload.${k} is required`);
    if (!isType(v, t)) return bad(`payload.${k} must be ${t}`);
  }
  return null;
}

// Names that reach an object's prototype when used as a key. Payload maps
// (codes, departments…) are keyed by what devices send, so no key or string
// anywhere in a payload may be one of these.
const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);
const ENTITY_MAX = 100;
function reservedIn(v, path, depth = 0) {
  if (depth > 12) return `${path} (nested too deep)`;
  if (typeof v === 'string') return RESERVED.has(v.trim()) ? path : null;
  if (!v || typeof v !== 'object') return null;
  for (const k of Object.keys(v)) {
    if (RESERVED.has(k)) return `${path}.${k}`;
    const hit = reservedIn(v[k], Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`, depth + 1);
    if (hit) return hit;
  }
  return null;
}

function isType(v, t) {
  switch (t) {
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'boolean': return typeof v === 'boolean';
    case 'array': return Array.isArray(v);
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
    default: return true;
  }
}

function bad(message) {
  return { code: 'invalid_event', message };
}
