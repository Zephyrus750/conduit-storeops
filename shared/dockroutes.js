// Trucks not coming to the dock (plan.route): off-site storage until they
// are called back, or diverted to another store or site. Pure and shared:
// the Planner, the phone's Plan, the Dashboard, Receiving, Manifests and
// the manifest stats read the plan the same way.
//
//   routesOn(plan, day)            [[n, route]] the day's trucks marked off-site or diverted, by number
//   routeManifest(route)           the manifest number a route names: its slot's staged one, else manNo
//   routeOfManifest(plan, manNo)   { date, n, route } for the route naming that manifest (the latest), or null
//   landingOn(plan, day)           [{ date, n, route }] routed trucks expected to land on `day`, oldest first
//   broughtBy(plan, dock, from)    'YYYY-MM-DD-Tn' of the slot or truck that brings it back
//                                  (its from names { date, slot }), or null

export const routesOn = (plan, day) => Object.entries(plan?.days?.[day]?.routes || {}).map(([n, r]) => [Number(n), r]).sort((a, b) => a[0] - b[0]);

export const routeManifest = r => r?.slot?.manifest?.manNo || r?.manNo || null;

export function routeOfManifest(plan, manNo) {
  let best = null;
  if (!manNo) return null;
  for (const [date, d] of Object.entries(plan?.days || {})) for (const [n, r] of Object.entries(d.routes || {})) {
    if (routeManifest(r) === String(manNo) && (!best || date > best.date)) best = { date, n: Number(n), route: r };
  }
  return best;
}

export function landingOn(plan, day) {
  const out = [];
  for (const [date, d] of Object.entries(plan?.days || {})) for (const [n, r] of Object.entries(d.routes || {})) if (r.lands === day) out.push({ date, n: Number(n), route: r });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.n - b.n);
}

const same = (f, from) => f && f.date === from.date && Number(f.slot) === Number(from.slot);
export function broughtBy(plan, dock, from) {
  for (const [date, d] of Object.entries(plan?.days || {})) for (const [n, sl] of Object.entries(d.slots || {})) if (same(sl.from, from)) return `${date}-T${n}`;
  for (const [id, t] of Object.entries(dock?.trucks || {})) if (same(t.from, from)) return id;
  return null;
}
