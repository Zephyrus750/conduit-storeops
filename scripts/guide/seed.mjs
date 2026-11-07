// The demo store for the sample chapter (Busselton 1241, a made-up day): a published manifest, Truck 1 live with it attached, two pallets down.
import { ulid } from '../../shared/ulid.js';
import { storeDay, addDays, DEFAULT_TZ } from '../../shared/time.js';
import { API } from './lib.mjs';
export { API };
export const call = async (method, path, body, token) => { const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
export const T = storeDay(new Date(), DEFAULT_TZ), TR = `${T}-T1`;
const dmy = d => d.split('-').reverse().join('/');
// Real department codes and keycodes the store sells (the names come from the catalogue stand-in).
const KC = [['42977636', '022', 'Toys'], ['43302210', '038', 'Party'], ['43166022', '047', 'Bath'], ['43602218', '024', 'Kids wear'], ['110148905', '085', 'Trading cards'], ['43307685', '054', 'Kitchen'], ['43199310', '090', 'Gift wrap'], ['43444444', '006', 'Bedding']];
export const CONSOLS = Array.from({ length: 12 }, (_, i) => { const id = String(601930100 + i * 7), it = [0, 1, 2].slice(0, 1 + (i % 3)).map(k => { const [kc, dept] = KC[(i + k) % KC.length]; return { k: kc, q: 6 + ((i * 5 + k * 3) % 24), dept, c: 2 + ((i + k) % 3) }; }); return { id, cons: '093008012' + id, cartons: it.reduce((n, x) => n + x.c, 0), dept: it[0].dept, mix: [], items: it }; });
export const MAN = { v: 1, kind: 'report', manNo: '7040301', storeNo: '1241', despatch: dmy(addDays(T, -1)), dcNo: '4101533', filename: '7040301.xls', consols: CONSOLS };
export const ev = (area, type, entity, payload, at = Date.now()) => ({ id: ulid(), store: '1241', area, type, entity, payload, at: new Date(at).toISOString(), v: 1 });
export async function token() { return (await call('POST', '/v1/auth/signin', { store: '1241', managerCode: 'MGR-CODE', device: 'demo-seed' })).body.token; }
export async function seed() {
  const tok = await token();
  console.log('publish', (await call('POST', '/v1/store/1241/manifest', MAN, tok)).status);
  const t0 = Date.now() - 40 * 60e3;
  const evs = [
    ev('backdock', 'plan.set', { date: T, slot: 1 }, { eta: '06:00', team: [{ pid: 'D4' }, { pid: 'D7' }, { pid: 'D9' }] }, t0 - 3600e3),
    ev('backdock', 'truck.create', { truck: TR }, { landedAt: new Date(t0).toISOString() }, t0), ev('backdock', 'truck.setLive', { truck: TR }, {}, t0),
    ev('backdock', 'manifest.attach', { truck: TR }, { manNo: MAN.manNo, consols: CONSOLS }, t0 + 1000),
    ev('backdock', 'truck.team.set', { truck: TR }, { team: [{ pid: 'D4' }, { pid: 'D7' }, { pid: 'D9' }] }, t0 + 2000),
    ev('backdock', 'pallet.land', { truck: TR, bay: 'A1' }, { ptype: 'chep', cartons: CONSOLS[0].cartons, consolIds: [CONSOLS[0].id] }, t0 + 5 * 60e3),
    ev('backdock', 'pallet.land', { truck: TR, bay: 'A2' }, { ptype: 'loscam', cartons: CONSOLS[1].cartons + CONSOLS[2].cartons, consolIds: [CONSOLS[1].id, CONSOLS[2].id] }, t0 + 8 * 60e3),
  ];
  const r = (await call('POST', '/v1/store/1241/events', { events: evs }, tok)).body?.results || [];
  console.log('seed', r.map((x, i) => x.ok ? '.' : `${evs[i].type}:${x.code || x.message}`).join(' '));
  return tok;
}
// The other dock phones land the rest: A4 to A8, one with a label that is not on the manifest.
export async function landRest(tok) {
  const plan = [['A4', 'chep', [6]], ['A5', 'chep', [7, 8]], ['A6', 'loscam', [9]], ['A7', 'bulk', [10]], ['B1', 'chep', [11]]];
  const evs = plan.map(([bay, ptype, ix], i) => ev('backdock', 'pallet.land', { truck: TR, bay }, { ptype, cartons: ix.reduce((n, k) => n + CONSOLS[k].cartons, 0), consolIds: ix.map(k => CONSOLS[k].id), ...(bay === 'A6' ? { scanIds: ['601999917'] } : {}) }, Date.now() - (5 - i) * 1000));
  const r = (await call('POST', '/v1/store/1241/events', { events: evs }, tok)).body?.results || [];
  console.log('rest', r.map((x, i) => x.ok ? '.' : `${evs[i].type}:${x.code || x.message}`).join(' '));
}
