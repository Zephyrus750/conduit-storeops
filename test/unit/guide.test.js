// The Visual Guide (js/guide/scenes.js and js/guide/chapters/) stays true to
// the code it shows, its What ifs too:
// every event in its event log is in the shared catalogue, in its area,
// with the catalogue's entity keys and required payload fields; every
// route it sends to is one the worker answers; every file a developer note
// names is there, and every function it names as <b>name()</b> is defined
// somewhere in js/, shared/ or worker/. When the app moves on, this fails
// and the chapter's text is corrected, not this test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SCENES, GROUPS } from '../../js/guide/scenes.js';
import { CATALOGUE } from '../../shared/catalogue.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
// A chapter's steps, then each of its What ifs' steps.
const steps = SCENES.flatMap(s => [...s.steps.map((st, i) => ({ s, st, at: `${s.id} step ${i + 1}` })),
  ...(s.stories || []).flatMap(w => w.steps.map((st, i) => ({ s, st, at: `${s.id} › ${w.id} step ${i + 1}` })))]);
const events = steps.flatMap(({ st, at }) => (st.ev || []).filter(e => e.type).map(e => ({ e, at })));
const requests = steps.flatMap(({ st, at }) => (st.ev || []).filter(e => e.route).map(e => ({ e, at })));
const notes = steps.map(({ st, at }) => ({ dev: String(st.dev || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), at }));

// Every source file the notes may name a function from.
const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? (['i18n', 'vendor'].includes(e.name) ? [] : walk(`${d}/${e.name}`)) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : []);
const SOURCES = ['js', 'shared', 'worker'].flatMap(walk).filter(f => !f.startsWith('js/guide/')).map(read).join('\n');

test('guide: chapters have unique ids, a known group and steps that can run', () => {
  const ids = SCENES.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length, 'chapter ids are unique');
  for (const s of SCENES) {
    assert.ok(GROUPS.some(g => g[0] === s.grp), `${s.id}: group ${s.grp}`);
    assert.ok(s.steps.length > 0 && s.steps.every(st => typeof st.run === 'function' && st.cap && st.read && st.dev), `${s.id}: every step has cap, read, dev and run`);
    for (const w of s.stories || []) assert.ok(w.title && w.blurb && w.know?.length && w.steps.length > 0 && w.steps.every(st => typeof st.run === 'function' && st.cap && st.read && st.dev), `${s.id} › ${w.id}: a What if has a title, a blurb, what to know and steps with cap, read, dev and run`);
    assert.ok(typeof s.html() === 'string' && s.html().includes('class="dvs'), `${s.id}: draws a device`);
  }
});

test('guide: every event in the event log is in the catalogue, in its area, with its entity keys and required payload', () => {
  assert.ok(events.length > 20);
  const problems = [];
  for (const { e, at } of events) {
    const c = CATALOGUE[e.type];
    if (!c) { problems.push(`${at}: ${e.type} is not in shared/catalogue.js`); continue; }
    if (c.area !== e.area) problems.push(`${at}: ${e.type} is a ${c.area} event, not ${e.area}`);
    const keys = Object.keys(e.entity || {}).sort().join(','), want = [...c.entity].sort().join(',');
    if (keys !== want) problems.push(`${at}: ${e.type} entity is {${want}}, the guide shows {${keys}}`);
    for (const f of Object.keys(c.payload)) if (!(f in (e.payload || {}))) problems.push(`${at}: ${e.type} needs payload.${f}`);
  }
  // An event type a note names in bold (<b>refresh.unmark</b>) is catalogued too.
  for (const { dev, at } of notes) for (const m of dev.matchAll(/<b>([a-z]+(?:\.[a-zA-Z]+)+)<\/b>/g)) if (!CATALOGUE[m[1]]) problems.push(`${at}: the note names ${m[1]}, which is not in the catalogue`);
  assert.deepEqual(problems, []);
});

test('guide: every request in the event log is a route the worker answers', () => {
  assert.ok(requests.length > 3);
  const routes = [...read('worker/index.js').matchAll(/\br\.(get|post|patch|delete)\('([^']+)'/g)].map(m => ({ method: m[1].toUpperCase(), re: new RegExp('^' + m[2].replace(/\/:(\w+)/g, '/[^/]+') + '/?$') }));
  assert.ok(routes.length > 20, 'the worker routes were found');
  const problems = [];
  for (const { e, at } of requests) {
    const [method, full] = e.route.split(' '), p = full.split('?')[0];
    if (!routes.some(r => r.method === method && r.re.test(p))) problems.push(`${at}: ${e.route} is not a route in worker/index.js`);
  }
  assert.deepEqual(problems, []);
});

test('guide: every file a developer note names is there', () => {
  const problems = [];
  for (const { dev, at } of notes) for (const m of dev.matchAll(/\b((?:js|shared|worker)\/[\w./-]*[\w/])/g)) if (!fs.existsSync(path.join(ROOT, m[1]))) problems.push(`${at}: ${m[1]} does not exist`);
  assert.deepEqual(problems, []);
});

test('guide: every function a developer note names as <b>name()</b> is defined in js/, shared/ or worker/', () => {
  const names = new Set(notes.flatMap(({ dev }) => [...dev.matchAll(/<b>([A-Za-z_$][\w$]*)\(/g)].map(m => m[1])));
  assert.ok(names.size > 10);
  const defined = n => new RegExp(`(?:\\bfunction\\s*\\*?\\s*${n}\\s*\\(|\\b(?:const|let|var)\\s+${n}\\s*=|^\\s*(?:async\\s+)?${n}\\s*\\([^)]*\\)\\s*\\{|\\b${n}\\s*:\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*=>))`, 'm').test(SOURCES);
  assert.deepEqual([...names].filter(n => !defined(n)).map(n => `${n}() is not defined anywhere`), []);
});

test('guide: the ? opens a chapter that exists for every screen GUIDE_OF names', () => {
  const src = read('js/registry.js'), block = src.slice(src.indexOf('export const GUIDE_OF'), src.indexOf('};', src.indexOf('export const GUIDE_OF')));
  const ids = [...block.matchAll(/'([a-z]+)'/g)].map(m => m[1]);
  assert.ok(ids.length > 10);
  const views = [...block.matchAll(/(\w+):/g)].map(m => m[1]), chapters = new Set(SCENES.map(s => s.id));
  for (const id of ids) assert.ok(chapters.has(id), `GUIDE_OF names chapter ${id}, which js/guide/scenes.js does not have`);
  const viewIds = new Set([...walk('js/views').map(read).join('\n').matchAll(/\bid: '([a-z]+)'/g)].map(m => m[1]));
  for (const v of views) assert.ok(viewIds.has(v), `GUIDE_OF names view ${v}, which no view in js/views has`);
});
