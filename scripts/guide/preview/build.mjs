// The private preview of chapters being drawn: Help's player and chapters
// (js/guide/), with the drafts in scripts/guide/draft/ laid over them, on a
// page of its own. Help is not touched. The page is published as a private artifact (files.json lists
// what it needs) and can be served locally:
//   node scripts/guide/preview/build.mjs   → out/preview/
//   python3 -m http.server 8618 --directory scripts/guide/out/preview
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, dir } from '../lib.mjs';

const OUT = dir('preview', { fresh: true }), DRAFT = path.join(ROOT, 'scripts/guide/draft');
const put = (to, from) => { fs.mkdirSync(path.dirname(OUT + to), { recursive: true }); fs.copyFileSync(from, OUT + to); files[to] = OUT + to; };
const files = {};

// The drafts, at the paths the player's imports expect: draft/chapters/x.js is
// js/guide/chapters/x.js, draft/scenes.js is js/guide/scenes.js. Help's own
// chapters ride along as js/guide/scenes-old.js, and Help's player plays them.
put('js/guide/scenes-old.js', path.join(ROOT, 'js/guide/scenes.js'));
for (const f of fs.readdirSync(DRAFT, { recursive: true })) if (f.endsWith('.js')) put(`js/guide/${f}`, path.join(DRAFT, f));
if (!files['js/guide/player.js']) put('js/guide/player.js', path.join(ROOT, 'js/guide/player.js'));
// GUIDE_ONLY=refresh (or receive,refresh) builds the preview with only those redrawn chapters.
if (process.env.GUIDE_ONLY) {
  const names = process.env.GUIDE_ONLY.split(',').map(n => n.trim()).filter(Boolean);
  fs.writeFileSync(OUT + 'js/guide/chapters/index.js', names.map((n, i) => `import * as m${i} from './${n}.js';`).join('\n') + `\nexport const NEW = [${names.map((_, i) => `...Object.values(m${i})`).join(', ')}];\n`);
}
// Everything else the player imports, from the app as it is.
const seen = new Set(Object.keys(files)), queue = [...seen];
while (queue.length) {
  const f = queue.pop(), src = fs.readFileSync(OUT + f, 'utf8');
  for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
    const to = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
    if (seen.has(to)) continue; seen.add(to); queue.push(to);
    if (!(to in files)) put(to, path.join(ROOT, to));
  }
}
// GUIDE_LANG=1 adds the six languages' dictionaries (js/i18n.js loads the
// device's own when it starts), to check the drawn screens in each language.
if (process.env.GUIDE_LANG) for (const l of ['de', 'fr', 'fil', 'vi', 'es', 'it']) {
  put(`js/i18n/${l}.js`, path.join(ROOT, `js/i18n/${l}.js`));
  for (const f of fs.readdirSync(path.join(ROOT, 'js/i18n', l))) put(`js/i18n/${l}/${f}`, path.join(ROOT, 'js/i18n', l, f));
}
// The stylesheet: Help's, then the drafts' additions (draft/guide.css, if
// there is one, then each chapter's own draft/css/*.css). The app's Inter, and its icons.
const cssDir = path.join(DRAFT, 'css');
const extra = [path.join(DRAFT, 'guide.css'), ...(fs.existsSync(cssDir) ? fs.readdirSync(cssDir).filter(f => f.endsWith('.css')).sort().map(f => path.join(cssDir, f)) : [])]
  .filter(f => fs.existsSync(f)).map(f => `/* ${path.relative(DRAFT, f)} */\n` + fs.readFileSync(f, 'utf8')).join('\n');
fs.mkdirSync(OUT + 'styles', { recursive: true });
fs.writeFileSync(OUT + 'styles/guide.css', fs.readFileSync(path.join(ROOT, 'styles/guide.css'), 'utf8') + '\n/* ── the drafts (scripts/guide/draft/) ── */\n' + extra);
files['styles/guide.css'] = OUT + 'styles/guide.css';
const faces = fs.readFileSync(path.join(ROOT, 'styles/app.css'), 'utf8').match(/@font-face\s*{[^}]*}/g).filter(r => r.includes('inter-var'));
fs.writeFileSync(OUT + 'styles/fonts.css', faces.join('\n') + '\n'); files['styles/fonts.css'] = OUT + 'styles/fonts.css';
put('styles/fonts/inter-var.woff2', path.join(ROOT, 'styles/fonts/inter-var.woff2'));
put('icons.svg', path.join(ROOT, 'icons.svg'));
// The page: page.html is what gets published (the artifact host adds the
// document around it); index.html is the same page in a document, to serve locally.
const page = fs.readFileSync(path.join(ROOT, 'scripts/guide/preview/page.html'), 'utf8');
fs.writeFileSync(OUT + 'page.html', page);
fs.writeFileSync(OUT + 'index.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style></head><body>' + page + '</body></html>');
fs.writeFileSync(OUT + 'files.json', JSON.stringify(files, null, 1));
const kb = Object.values(files).reduce((n, f) => n + fs.statSync(f).size, 0) / 1024;
console.log('preview', OUT + 'index.html', Object.keys(files).length + ' files', Math.round(kb) + ' KB');
