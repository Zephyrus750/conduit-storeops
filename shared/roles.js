// The role an event is credited to: the first of its type's roles that the
// session holds, else manager when held, else the session's first role. An
// act-as or system token names its own actor. The worker stamps this on
// every event; the device uses the same answer for its own check and its
// own fold, so a manager's device judges a manager-only change as the
// worker does (it used to take the first role, always Floor).
export function primaryRole({ roles = [], actor = null } = {}, typeRoles = []) {
  if (actor) return actor;
  for (const r of typeRoles) if (roles.includes(r)) return r;
  return roles.includes('manager') ? 'manager' : roles[0] ?? null;
}
