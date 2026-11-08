// Turns the recorded frames the steps use into WebP (ImageMagick's convert),
// one folder per set: out/webp/main, out/webp/offmanifest, …
//   node scripts/guide/webp.mjs
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dir, OUT } from './lib.mjs';
const SETS = [['main', 'main'], ['offmanifest', 'wi/offmanifest'], ['taken', 'wi/taken'], ['rollover', 'wi/rollover']];
for (const [id, src] of SETS) {
  const file = `${OUT}/${src}/steps.json`;
  if (!fs.existsSync(file)) { console.log(id, 'not recorded yet'); continue; }
  const used = new Set(JSON.parse(fs.readFileSync(file, 'utf8')).steps.flatMap(s => [s.from, s.to, ...s.mid]));
  const to = dir('webp/' + id, { fresh: true });
  for (const f of used) {
    const r = spawnSync('convert', [`${OUT}/${src}/${f}`, '-quality', '82', '-define', 'webp:method=6', to + f.replace('.png', '.webp')]);
    if (r.status !== 0) throw new Error(`convert ${f}: ${r.stderr || r.error}`);
  }
  const kb = Math.round([...used].reduce((n, f) => n + fs.statSync(to + f.replace('.png', '.webp')).size, 0) / 1024);
  console.log(id, used.size, 'frames', kb, 'KB');
}
