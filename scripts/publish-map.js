#!/usr/bin/env node
// Publish a store map from the terminal (the admin console's Map tab does
// the same from the browser).
//   node scripts/publish-map.js --store 1241 --version 4.4 --file ../maps/1241-busselton.js
//   node scripts/publish-map.js --store 1241 --version 4.4 --name Busselton --floor ground=maps/1241.svg \
//        [--floor stockroom=maps/1241-boh.svg] [--worker https://conduit-staging.<sub>.workers.dev]
// --file is the Map Editor's .js or .json export: every floor in it is
// rendered and published. --floor publishes a rendered svg as one floor.
// The owner key comes from OWNER_KEY in the environment, or --owner-key.
import fs from 'node:fs';
import path from 'node:path';
import { parseMapFile, renderMap } from '../shared/maprender.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const floors = args.flatMap((a, i) => a === '--floor' ? [args[i + 1]] : []).map(spec => { const [id, file] = spec.split('='); return { id, file }; });
const worker = (opt('worker', process.env.WORKER_URL || 'https://conduit-staging.zephyrus-np750.workers.dev')).replace(/\/+$/, '');
const store = opt('store'), version = opt('version'), file = opt('file');
let name = opt('name', '');
const ownerKey = opt('owner-key', process.env.OWNER_KEY);
if (!store || !version || (!floors.length && !file) || !ownerKey) {
  console.error('usage: publish-map --store <no> --version <v> (--file <map.js|map.json> | --floor ground=<file.svg> [--floor stockroom=<file>]) [--name <name>] [--worker <url>]   (OWNER_KEY in env or --owner-key)');
  process.exit(1);
}
let departments;
const rendered = [];
if (file) {
  const parsed = parseMapFile(fs.readFileSync(file, 'utf8'), path.basename(file));
  if (parsed.kind === 'svg') rendered.push({ id: 'ground', name: 'Ground', type: 'foh', svg: parsed.svg });
  else {
    const doc = renderMap(parsed.data);
    for (const f of doc.floors) { if (!f.shelves && !f.markers) { console.error(`skipping empty floor ${f.name}`); continue; } rendered.push({ id: f.id, name: f.name, type: f.type, svg: f.svg, ...(f.paths ? { paths: f.paths } : {}) }); console.error(`rendered ${f.name} (${f.type}): ${f.shelves} shelves, ${f.markers} markers`); }
    departments = doc.departments; if (!name) name = doc.name;
  }
}
const call = async (path, body, token) => {
  const r = await fetch(worker + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${j.code || r.status} ${j.message || ''}`);
  return j;
};
const { token } = await call('/v1/auth/signin', { ownerKey, device: 'publish-map' });
const body = { version, name, departments, floors: [...rendered.filter(r => !floors.some(f => f.id === r.id)), ...floors.map(f => ({ id: f.id, name: f.id === 'ground' ? 'Ground' : f.id, type: f.id === 'stockroom' ? 'boh' : 'foh', svg: fs.readFileSync(f.file, 'utf8') }))] };
const r = await call(`/v1/store/${store}/map`, body, token);
console.log(`published ${store} map ${r.version} at ${r.at}: ` + r.floors.map(f => `${f.id} ${f.shelves} shelves ${(f.bytes / 1024).toFixed(0)} KB${f.paths ? ` · ${f.paths.nodes} path nodes` : ''}`).join(', '));
