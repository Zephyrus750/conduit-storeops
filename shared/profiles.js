// Carton profiles: units per carton by keycode, distilled from the store's
// published manifests. Decant Visualiser built the same document
// (dv-profiles/1) from its manifest history and K2B read it to band
// stockroom stock by carton depth ("system says 0, but 40 units at 12 a
// carton just landed: it is all out the back"). Here the worker builds
// it from the manifest documents it holds, so it is never stale.
//
//   profiles[kc] = { ctn, trucks, consistency, last_arrival: { date, units, cartons, manNo },
//                    arrivals: [{ date, units, cartons, ctn, manNo }], pack_change?: { prev_ctn, since_trucks, changed } }

const isoDate = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '')); if (m) return `${m[3]}-${m[2]}-${m[1]}`; const t = Date.parse(s); return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10); };

export function buildProfiles(docs, { store = '', now = new Date() } = {}) {
  const per = {};
  const arrivalsOf = docs.map(d => ({ manNo: d.manNo, date: isoDate(d.despatch) || isoDate(d.publishedAt || d.at) || null, doc: d })).filter(a => a.date).sort((a, b) => a.date.localeCompare(b.date));
  for (const a of arrivalsOf) {
    const byKc = {};
    for (const c of a.doc.consols || []) for (const it of c.items || []) { const kc = String(it.k || '').replace(/\D/g, ''); if (!/^\d{6,13}$/.test(kc)) continue; const r = (byKc[kc] ||= { units: 0, cartons: 0 }); r.units += Number(it.q) || 0; r.cartons += Number(it.c) || 0; }
    for (const [kc, r] of Object.entries(byKc)) { if (!r.cartons || !r.units) continue; (per[kc] ||= []).push({ date: a.date, units: r.units, cartons: r.cartons, ctn: Math.max(1, Math.round(r.units / r.cartons)), manNo: a.manNo }); }
  }
  const profiles = {};
  for (const [kc, arr] of Object.entries(per)) {
    const counts = {}; for (const x of arr) counts[x.ctn] = (counts[x.ctn] || 0) + 1;
    const mode = Number(Object.entries(counts).sort((p, q) => q[1] - p[1] || Number(q[0]) - Number(p[0]))[0][0]);
    const last = arr[arr.length - 1];
    const p = { ctn: mode, trucks: arr.length, consistency: Math.round(counts[mode] / arr.length * 100) / 100, last_arrival: { date: last.date, units: last.units, cartons: last.cartons, manNo: last.manNo }, arrivals: arr.slice(-12) };
    // A pack change: the latest arrivals agree on a new value while the
    // older ones agreed on another.
    if (arr.length >= 3) {
      let k = 0; for (let i = arr.length - 1; i >= 0 && arr[i].ctn === last.ctn; i--) k++;
      const older = arr.slice(0, arr.length - k);
      if (k >= 2 && older.length && older.every(x => x.ctn !== last.ctn)) { const oc = {}; for (const x of older) oc[x.ctn] = (oc[x.ctn] || 0) + 1; const prev = Number(Object.entries(oc).sort((a, b) => b[1] - a[1])[0][0]); p.ctn = last.ctn; p.pack_change = { prev_ctn: prev, since_trucks: k, changed: arr[arr.length - k].date }; }
    }
    profiles[kc] = p;
  }
  return { schema: 'dv-profiles/1', store: String(store), generated: now.toISOString(), trucks_sampled: arrivalsOf.length, keycodes: Object.keys(profiles).length, profiles };
}

// Depth chip text and class for a keycode, as K2B read it.
export function depthOf(p, now = Date.now()) {
  if (!p || !p.ctn) return null;
  const t = p.last_arrival?.date ? Date.parse(p.last_arrival.date + 'T00:00:00') : NaN;
  const days = isNaN(t) ? null : Math.round((now - t) / 86400000);
  return { ctn: p.ctn, days, recent: days != null && days <= 21, text: `▤ ${p.ctn}/ctn${days == null ? '' : days <= 0 ? ' · today' : ` · ${days}d ago`}` };
}
