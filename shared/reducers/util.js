// Shared reducer helpers. A reducer returns null on success or a rejection
// { code, message }; it must validate before it mutates.
export function reject(code, message) { return { code, message }; }

// A list a device sends: an array of at most `max` strings, each 1..len
// characters. Returns the message for the first breach, or null.
export function badList(v, name, max, len) {
  if (!Array.isArray(v)) return `${name} must be a list`;
  if (v.length > max) return `${name} holds at most ${max}`;
  for (const x of v) { const t = typeof x === 'number' ? String(x) : x; if (typeof t !== 'string' || !t || t.length > len) return `each of ${name} is 1 to ${len} characters`; }
  return null;
}

// Event times carry the writing device's zone offset ("+08:00", or "Z" from
// the worker and imports), so they are compared as instants, never as text.
export const earlier = (a, b) => Date.parse(a) < Date.parse(b);
