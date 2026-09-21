// Store-wide reducers: the published map version and the roster rotation
// marker. Credentials live in the registry object; these events are the
// audit trail the store's projections can show. (Device presence is a
// projection too — state.devices — but it is written directly from the WS
// 'hb' frame / POST /hb, never logged: see StoreObject.recordHb.)

export function storeState() {
  return {
    devices: {},                       // device → { app, last, role, … } — presence side channel, not from the log
    map: { version: null, at: null, by: null },
    roster: { rotatedAt: null, rotatedBy: null },
  };
}

export const storeReducers = {
  'map.publish'(s, e) {
    s.map = { version: String(e.entity.version), at: e.at, by: e.actor?.device || null };
    return null;
  },
  'roster.rotate'(s, e) {
    s.roster = { rotatedAt: e.at, rotatedBy: e.actor?.device || null };
    return null;
  },
};
