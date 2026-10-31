// A truck's phase, worked out from what the dock already records (nothing
// extra is stored): every back-dock screen shows the same one.
//
//   planned    a planner slot today with no truck yet (or a staged truck)
//   receiving  the truck is live, pallets landing, the layout not confirmed
//   received   the layout confirmed; Take 5 and Start decant to go
//   decanting  the decant has begun (Take 5 recorded, work or a hold-up)
//   cleared    every pallet in the session done, the layout confirmed: close it
//   closed     finalised
//
//   truckPhase(t)        → one of PHASES
//   begun(t)             the decant has begun on this truck: Take 5, work
//                        since it was created (a carried pallet's earlier work
//                        is the last truck's), or a hold-up other than the
//                        booked huddle
//   phaseCounts(t)       { pallets, done, cartons, decanted, noCartons } for the session

export const PHASES = ['planned', 'receiving', 'received', 'decanting', 'cleared', 'closed'];

const inSession = t => Object.values(t?.pallets || {}).filter(p => !p.excluded);

export function begun(t) {
  if (!t) return false;
  if (t.take5) return true;
  const since = t.createdAt || '';
  if (inSession(t).some(p => (p.segments || []).some(g => String(g.start || '') >= since))) return true;
  return (t.halts || []).some(h => !(h.kind === 'huddle' && h.planned));
}

export function truckPhase(t) {
  if (!t || t.status === 'staged') return 'planned';
  if (t.status === 'closed') return 'closed';
  if (!begun(t)) return t.receivingConfirmed ? 'received' : 'receiving';
  const ps = inSession(t);
  return t.receivingConfirmed && ps.length && ps.every(p => p.status === 'done') ? 'cleared' : 'decanting';
}

export function phaseCounts(t) {
  const ps = inSession(t);
  return {
    pallets: ps.length, done: ps.filter(p => p.status === 'done').length,
    cartons: ps.reduce((n, p) => n + (p.cartons || 0), 0), decanted: ps.filter(p => p.status === 'done').reduce((n, p) => n + (p.cartons || 0), 0),
    noCartons: ps.filter(p => p.status !== 'done' && !(p.cartons > 0)).length,
  };
}
