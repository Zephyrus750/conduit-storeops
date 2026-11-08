// Builds the review page: the audit (template.html, its images in img/) and
// the sample chapter with its What ifs, every frame inlined as a data URI.
//   node scripts/guide/page/build.mjs → out/page/visual-guide-audit.html
// It also writes out/page/check.html, the same page in a document of its own,
// for the checks (the artifact host adds the document around the page).
import fs from 'node:fs';
import { dir, OUT } from '../lib.mjs';
const HERE = new URL('.', import.meta.url).pathname, P = dir('page');
const uri = f => 'data:image/webp;base64,' + fs.readFileSync(f).toString('base64');
let html = fs.readFileSync(HERE + 'template.html', 'utf8');
html = html.replace(/@@img:([\w-]+)@@/g, (_, n) => { const f = HERE + `img/${n}.webp`; if (!fs.existsSync(f)) throw new Error('missing image ' + n); return uri(f); });
// The chapter and its What ifs, each frame named by its set.
const SETS = [['main', 'main', { title: 'Receive a truck on the phone' }],
  ['offmanifest', 'wi/offmanifest', { blurb: 'It’s held on the pallet to flag or ignore, and counted before the layout is confirmed.' }],
  ['taken', 'wi/taken', { blurb: 'It says which pallet has it, and the first pallet keeps it.' }],
  ['rollover', 'wi/rollover', { blurb: 'They stay on their bays with everything they had, and join the next truck.' }]];
const img = {}, sets = [];
for (const [id, src, extra] of SETS) {
  const file = `${OUT}/${src}/steps.json`, webp = `${OUT}/webp/${id}/`;
  if (!fs.existsSync(file)) throw new Error(`No ${src}/steps.json yet: record it first (see scripts/guide/README.md).`);
  const S = JSON.parse(fs.readFileSync(file, 'utf8')), k = f => `${id}/${f}`;
  for (const st of S.steps) for (const f of [st.from, st.to, ...st.mid]) img[k(f)] ??= uri(webp + f.replace('.png', '.webp'));
  sets.push({ id, title: extra.title || S.title, blurb: extra.blurb || '', specifics: S.specifics || [], steps: S.steps.map(({ cap, read, from, at, mid, at2, to, live }) => ({ cap, read, from: k(from), at, mid: mid.map(k), at2, to: k(to), live: !!live })) });
}
html = html.replace('@@DATA@@', JSON.stringify({ w: 390, h: 844, img, sets }));
fs.writeFileSync(P + 'visual-guide-audit.html', html);
fs.writeFileSync(P + 'check.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + html + '</body></html>');
console.log('page', P + 'visual-guide-audit.html', Math.round(html.length / 1024) + ' KB', Object.keys(img).length + ' frames');
