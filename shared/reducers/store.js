// Store-wide reducers: devices, published map version, roster rotation marker.
// Credentials themselves live in the registry object; the events here are
// the audit trail the store's projections can show.

export function storeState() {
  return {
    devices: {},                       // device → { app, last, role }
    map: { version: null, at: null, by: null },
    roster: { rotatedAt: null, rotatedBy: null },
  };
}

export const storeReducers = {
  'device.heartbeat'(s, e) {
    s.devices[e.entity.device] = { app: e.payload.app, last: e.at, role: e.actor?.role || null };
    return null;
  },
  'map.publish'(s, e) {
    s.map = { version: String(e.entity.version), at: e.at, by: e.actor?.device || null };
    return null;
  },
  'roster.rotate'(s, e) {
    s.roster = { rotatedAt: e.at, rotatedBy: e.actor?.device || null };
    return null;
  },
};
