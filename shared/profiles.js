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

// Decant Visualiser's rules (index.html 7726-7835): keycodes of 7 to 9
// digits; a line's cartons from the manifest, else its share of the
// consol's cartons by distinct keycodes (the carton fallback); the profile
// from the last 26 weeks of arrivals (all of them if none are that recent)
// and only kept past the gates: 3 or more trucks, 3 or more units a carton
// and 70% of trucks agreeing. A pack change is the latest three or more
// trucks agreeing on a value the earlier ones did not. Arrivals listed are
// the last 10 weeks'.
export const PROFILE_GATES = { minTrucks: 3, minConsistency: 0.7, minUnitsPerCtn: 3 };
export const CTN_WINDOW_WEEKS = 26, ARRIVAL_WINDOW_WEEKS = 10, PACK_CHANGE_MIN_TRUCKS = 3;
export function buildProfiles(docs, { store = '', now = new Date() } = {}) {
  const per = {};
  const arrivalsOf = docs.map(d => ({ manNo: d.manNo, date: isoDate(d.despatch) || isoDate(d.publishedAt || d.at) || null, doc: d })).filter(a => a.date).sort((a, b) => a.date.localeCompare(b.date));
  for (const a of arrivalsOf) {
    const byKc = {};
    for (const c of a.doc.consols || []) {
      const kcs = new Set((c.items || []).map(it => String(it.k || '').replace(/\D/g, '')).filter(k => /^\d{7,9}$/.test(k)));
      for (const it of c.items || []) {
        const kc = String(it.k || '').replace(/\D/g, ''); if (!/^\d{7,9}$/.test(kc)) continue;
        const r = (byKc[kc] ||= { units: 0, cartons: 0 }); r.units += Number(it.q) || 0;
        r.cartons += Number(it.c) > 0 ? Number(it.c) : (Number(c.cartons) || 0) / Math.max(1, kcs.size);
      }
    }
    for (const [kc, r] of Object.entries(byKc)) { if (!(r.units > 0) || !(r.cartons > 0)) continue; const ctn = Math.round(r.units / r.cartons); if (!(ctn > 0)) continue; (per[kc] ||= []).push({ date: a.date, units: r.units, cartons: Math.round(r.cartons * 10) / 10, ctn, manNo: a.manNo }); }
  }
  const nowMs = now.getTime(), since = w => new Date(nowMs - w * 7 * 86400000).toISOString().slice(0, 10);
  const profiles = {};
  for (const [kc, all] of Object.entries(per)) {
    const recent = all.filter(x => x.date >= since(CTN_WINDOW_WEEKS)), arr = recent.length ? recent : all;
    const vals = arr.map(x => x.ctn), last = all[all.length - 1];
    let suf = 0; for (let i = vals.length - 1; i >= 0 && vals[i] === vals[vals.length - 1]; i--) suf++;
    const modeOf = xs => { const c = {}; let best = null; for (const v of xs) { c[v] = (c[v] || 0) + 1; if (best === null || c[v] > c[best]) best = v; } return best === null ? null : { v: best, n: c[best] }; };
    const head = modeOf(vals.slice(0, vals.length - suf)), sufVal = vals[vals.length - 1];
    let p;
    if (head && head.v !== sufVal && suf >= PACK_CHANGE_MIN_TRUCKS) {
      const changedAt = arr[arr.length - suf];
      p = { ctn: sufVal, trucks: suf, consistency: 1, pack_change: { prev_ctn: head.v, prev_trucks: head.n, since_trucks: suf, changed: changedAt.date } };
    } else { const m = modeOf(vals); p = { ctn: m.v, trucks: vals.length, consistency: Math.round(m.n / vals.length * 100) / 100 }; }
    if (p.ctn < PROFILE_GATES.minUnitsPerCtn || p.trucks < PROFILE_GATES.minTrucks || p.consistency < PROFILE_GATES.minConsistency) continue;
    p.last_arrival = { date: last.date, units: last.units, cartons: last.cartons, manNo: last.manNo };
    p.arrivals = all.filter(x => x.date >= since(ARRIVAL_WINDOW_WEEKS));
    profiles[kc] = p;
  }
  return { schema: 'dv-profiles/1', store: String(store), generated: now.toISOString(), profile_window_weeks: ARRIVAL_WINDOW_WEEKS, trucks_sampled: arrivalsOf.length, gates: { min_trucks: PROFILE_GATES.minTrucks, min_consistency: PROFILE_GATES.minConsistency, min_units_per_ctn: PROFILE_GATES.minUnitsPerCtn }, keycodes: Object.keys(profiles).length, profiles };
}

// Depth chip text and class for a keycode, as K2B read it.
export function depthOf(p, now = Date.now()) {
  if (!p || !p.ctn) return null;
  const t = p.last_arrival?.date ? Date.parse(p.last_arrival.date + 'T00:00:00') : NaN;
  const days = isNaN(t) ? null : Math.round((now - t) / 86400000);
  return { ctn: p.ctn, days, recent: days != null && days <= 21, text: `▤ ${p.ctn}/ctn${days == null ? '' : days <= 0 ? ' · today' : ` · ${days}d ago`}` };
}
