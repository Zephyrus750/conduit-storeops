// The Planner's week (the F.2 design, approved 12 Nov 2026): what a week
// holds, and Repeat last week. Pure and shared: the Planner sends what
// repeatWeek returns as ordinary plan.set and plan.noTrucks events, so the
// copy goes through the one write path like any slot typed by hand.
//
//   weekDays(monday)                 the seven 'YYYY-MM-DD' days from a Monday
//   dayHasPlan(plan, dock, day)      a slot, a routed truck, a truck on the dock or in
//                                    history, or a confirmed no-truck day
//   dayTrucks(plan, dock, day)       [{ n, eta, team, huddleMins, breakMins }]: each truck the
//                                    day had or has, as a slot would plan it again
//   repeatWeek(plan, dock, from, to, today) → [{ type, entity, payload }]
//     from, to: seven days each (last week, this one). Each day of `to`
//     from today on that holds nothing yet gets last week's same weekday:
//     its trucks as slots (ETA, decant team, booked huddle and break) and a
//     confirmed no-truck day confirmed again. Never manifests (they come
//     the night before), notes, callbacks or off-site marks.

import { addDays } from './time.js';

const NUMS = [1, 2, 3, 4];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const weekDays = monday => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

const onDock = (dock, day) => Object.keys(dock?.trucks || {}).some(id => id.startsWith(day + '-T')) || (dock?.history || []).some(h => String(h.id).startsWith(day + '-T'));
export function dayHasPlan(plan, dock, day) {
  const d = plan?.days?.[day];
  return !!(d && (Object.keys(d.slots || {}).length || Object.keys(d.routes || {}).length || d.noTrucks)) || onDock(dock, day);
}

// A team as a slot plans it: D-numbers with their role, and a start or a
// finish only when it is the person's own (a start equal to the ETA only
// followed it, and a new ETA should move it).
const teamFrom = (team, eta) => (team || []).filter(m => m?.pid).map(m => ({ pid: m.pid, ...(m.role ? { role: m.role } : {}), ...(m.start && m.start !== eta ? { start: m.start } : {}), ...(m.finish ? { finish: m.finish } : {}) }));
const slotFrom = (n, sl) => ({ n, eta: sl?.eta || null, team: teamFrom(sl?.team, sl?.eta), huddleMins: sl?.huddleMins || null, breakMins: sl?.breakMins || null });

export function dayTrucks(plan, dock, day) {
  const d = plan?.days?.[day] || {}, out = [];
  for (const n of NUMS) {
    const id = `${day}-T${n}`, t = dock?.trucks?.[id], h = (dock?.history || []).find(x => x.id === id);
    if (d.slots?.[n]) out.push(slotFrom(n, d.slots[n]));
    else if (d.routes?.[n]) out.push(slotFrom(n, d.routes[n].slot));
    else if (t) {
      // A truck that came: the ETA its slot had, its crew, the huddle booked at its start.
      const hud = (t.halts || []).find(x => x.kind === 'huddle' && x.planned && x.end), mins = hud ? Math.round((Date.parse(hud.end) - Date.parse(hud.start)) / 60000) : 0;
      out.push({ n, eta: t.eta || null, team: teamFrom(t.team, t.eta), huddleMins: mins > 0 && mins <= 120 ? mins : null, breakMins: t.plannedBreakMins || null });
    } else if (h) out.push({ n, eta: null, team: (h.perPerson || []).map(p => ({ pid: p.pid })), huddleMins: null, breakMins: null });
  }
  return out;
}

export function repeatWeek(plan, dock, from, to, today) {
  const out = [];
  if (from.length !== to.length) return out;
  from.forEach((src, i) => {
    const day = to[i];
    if (!DAY.test(day) || day < today || dayHasPlan(plan, dock, day)) return;
    const trucks = dayTrucks(plan, dock, src);
    for (const x of trucks) out.push({ type: 'plan.set', entity: { date: day, slot: x.n }, payload: { eta: x.eta, team: x.team, huddleMins: x.huddleMins, breakMins: x.breakMins } });
    if (!trucks.length && plan?.days?.[src]?.noTrucks) out.push({ type: 'plan.noTrucks', entity: { date: day }, payload: { on: true } });
  });
  return out;
}
