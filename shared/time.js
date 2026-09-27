// Store time. A store's day, week and cycle follow its own clock, not the
// device's and never UTC: in WA a UTC date reads yesterday until 08:00.
// K2B pinned AWST on both sides; this is that one definition, shared by the
// shell, the reducers' callers and the worker's end-of-day rollover.

export const DEFAULT_TZ = 'Australia/Perth';

const fmts = new Map();
function fmt(tz) {
  let f = fmts.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); fmts.set(tz, f); }
  return f;
}
// { y, m, d, hh, mm } of an instant on the store's clock.
export function storeParts(when = new Date(), tz = DEFAULT_TZ) {
  const p = Object.fromEntries(fmt(tz).formatToParts(when instanceof Date ? when : new Date(when)).map(x => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), hh: Number(p.hour), mm: Number(p.minute) };
}
// YYYY-MM-DD on the store's clock.
export function storeDay(when = new Date(), tz = DEFAULT_TZ) {
  const { y, m, d } = storeParts(when, tz);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
// A store day shifted by n days (calendar arithmetic, no clock involved).
export function addDays(day, n) {
  const x = new Date(`${day}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
// Milliseconds from `when` to the next store midnight.
export function msToStoreMidnight(when = new Date(), tz = DEFAULT_TZ) {
  const t = when instanceof Date ? when.getTime() : new Date(when).getTime();
  const { hh, mm } = storeParts(t, tz);
  const s = new Date(t).getUTCSeconds(), ms = new Date(t).getUTCMilliseconds();
  return ((24 * 60 - (hh * 60 + mm)) * 60 - s) * 1000 - ms;
}
// ISO 8601 with the store's own offset ("2026-09-24T00:01:00+08:00"), the
// form devices write. Reducers compare `at` strings, so events the worker
// writes on the store's behalf must use the same offset as the store's devices.
export function storeIso(when = new Date(), tz = DEFAULT_TZ) {
  const t = when instanceof Date ? when.getTime() : new Date(when).getTime();
  const p = storeParts(t, tz), s = new Date(t).getUTCSeconds();
  const off = Math.round((Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, s) - Math.floor(t / 1000) * 1000) / 60000);
  const pad = n => String(Math.abs(n)).padStart(2, '0');
  return `${storeDay(t, tz)}T${pad(p.hh)}:${pad(p.mm)}:${pad(s)}${off >= 0 ? '+' : '-'}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}
