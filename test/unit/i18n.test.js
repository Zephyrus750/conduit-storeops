// Languages (js/i18n.js): every tx()/txn() key in the client has its six
// translations, each with the same {placeholders} and the same markup, and
// no translation can break the HTML attribute or template it lands in.
//
// I18N_AREA=floor npm run test:unit checks one area alone (the files listed
// in AREAS below), for working on one area at a time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const plain = s => { const i = s.indexOf('::'); return i < 0 ? s : s.slice(i + 2); };
const LANGS = ['de', 'fr', 'fil', 'vi', 'es', 'it'];
// Each area's files. A key used in two areas needs a translation in only one.
export const AREAS = {
  core: ['js/i18n.js', 'js/unlock.js'],
  shell: ['js/shell.js', 'js/ui.js', 'js/registry.js', 'js/prefs.js', 'js/sync.js', 'js/updates.js', 'js/diag.js', 'js/share.js', 'js/scan.js', 'js/voice.js', 'js/print.js', 'js/config.js', 'js/device.js', 'js/team.js', 'js/lowpoly.js', 'js/version.js', 'index.html'],
  guide: ['js/views/settings.js', 'js/tour.js', 'js/whatsnew.js', 'js/views/help.js'],
  map: ['js/map.js', 'js/search.js', 'js/views/map.js', 'js/views/picklist.js', 'js/printmap.js', 'js/views/printmap.js'],
  floor: ['js/views/refresh.js', 'js/views/labelint.js', 'js/views/emergency.js', 'js/views/stocktake.js', 'js/views/storeinfo.js', 'js/views/mapedits.js', 'js/views/fieldmode.js'],
  floor2: ['js/views/dashboard.js', 'js/views/maintenance.js', 'js/views/inputs.js', 'js/views/pastebox.js', 'js/views/livepull.js'],
  stock1: ['js/views/stockroom/bfreview.js', 'js/views/stockroom/srhome.js', 'js/views/stockroom/srloc.js', 'js/views/stockroom/common.js', 'js/views/stockroom/daylist.js', 'js/views/stockroom/codelist.js', 'js/screenscan.js'],
  stock2: ['js/views/stockroom/adjust.js', 'js/views/stockroom/cages.js', 'js/views/stockroom/intel.js', 'js/views/stockroom/srhistory.js', 'js/views/stockroom/srtrends.js', 'js/views/stockroom/depts.js'],
  dock1: ['js/views/backdock/receiving.js', 'js/views/backdock/plan.js', 'js/views/backdock/late.js', 'js/views/backdock/mpreview.js', 'js/views/backdock/phonesearch.js', 'js/views/backdock/common.js', 'js/views/backdock/bdhome.js', 'js/views/backdock/audit.js'],
  dock2: ['js/views/backdock/wallboard.js', 'js/views/backdock/screens.js', 'js/views/backdock/rhistory.js', 'js/views/backdock/danalytics.js', 'js/views/backdock/manifests.js', 'js/views/backdock/profiles.js', 'js/views/backdock/planner.js', 'js/views/backdock/offsite.js', 'js/views/backdock/loads.js', 'js/views/backdock/screenlist.js'],
  admin: ['js/views/admin.js'],
};

// A JS string literal's text: '…' or "…" with \' \" \\ \n escapes.
const lit = '(\'(?:[^\'\\\\\\n]|\\\\.)*\'|"(?:[^"\\\\\\n]|\\\\.)*")';
const unq = s => s.slice(1, -1).replace(/\\n/g, '\n').replace(/\\(.)/g, '$1');
export function keysIn(src) {
  const keys = new Set(), dynamic = [];
  for (const m of src.matchAll(new RegExp(`\\btx\\(\\s*${lit}`, 'g'))) keys.add(unq(m[1]));
  for (const m of src.matchAll(new RegExp(`\\btxn\\(\\s*[^,()]+(?:\\([^()]*\\))?[^,()]*,\\s*${lit}\\s*,\\s*${lit}`, 'g'))) { keys.add(unq(m[1])); keys.add(unq(m[2])); }
  // A key must be a plain literal (or a variable listed in test/unit/i18n-keys): never a template.
  for (const m of src.matchAll(/\btxn?\(\s*`/g)) dynamic.push(src.slice(m.index, m.index + 60));
  return { keys, dynamic };
}
// data-t elements in index.html: their own text and translatable attributes.
function htmlKeys(src) {
  const keys = new Set();
  for (const m of src.matchAll(/<(\w+)([^>]*\bdata-t\b[^>]*)>([^<]*)/g)) {
    if (m[3].trim()) keys.add(m[3].trim());
    for (const a of m[2].matchAll(/\b(?:placeholder|title|aria-label)="([^"]*)"/g)) keys.add(a[1]);
  }
  return keys;
}
const areaKeys = area => {
  const keys = new Set(), dynamic = [];
  for (const f of AREAS[area]) {
    const p = path.join(ROOT, f); if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    if (f.endsWith('.html')) { for (const k of htmlKeys(src)) keys.add(k); continue; }
    const r = keysIn(src); for (const k of r.keys) keys.add(k); dynamic.push(...r.dynamic.map(d => `${f}: ${d}`));
  }
  const extra = path.join(ROOT, 'test/unit/i18n-keys', `${area}.json`);
  if (fs.existsSync(extra)) for (const k of JSON.parse(fs.readFileSync(extra, 'utf8'))) keys.add(k);
  return { keys, dynamic };
};
const only = process.env.I18N_AREA ? process.env.I18N_AREA.split(',') : null;
const areas = only || Object.keys(AREAS);
const dicts = Object.fromEntries(await Promise.all(LANGS.map(async l => [l, (await import(path.join(ROOT, 'js/i18n', `${l}.js`))).default])));

const holes = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const tags = s => [...s.matchAll(/<\/?([a-z0-9]+)[^>]*>/gi)].map(m => m[0].startsWith('</') ? '/' + m[1].toLowerCase() : m[1].toLowerCase()).sort().join(',');

test('every client file belongs to one language area', () => {
  const listed = new Set(Object.values(AREAS).flat());
  const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? (['vendor', 'i18n', 'data'].includes(e.name) ? [] : walk(`${d}/${e.name}`)) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : []);
  const missing = walk('js').filter(f => !listed.has(f));
  assert.deepEqual(missing, [], 'add these files to an area in AREAS');
});

for (const area of areas) {
  test(`languages · ${area}: keys are literals, and each has six translations that fit`, () => {
    const { keys, dynamic } = areaKeys(area);
    assert.deepEqual(dynamic, [], 'tx() takes a plain string; put values in {placeholders}');
    const problems = [];
    for (const l of LANGS) {
      const d = dicts[l];
      for (const k of keys) {
        const v = d[k];
        if (typeof v !== 'string' || !v.trim()) { problems.push(`${l} missing: ${k}`); continue; }
        const en = plain(k);   // a context key ('issue status::Open') stands for its English
        if (holes(v) !== holes(en)) problems.push(`${l} placeholders differ: ${k} → ${v}`);
        if (tags(v) !== tags(en)) problems.push(`${l} markup differs: ${k} → ${v}`);
        if (!en.includes('"') && v.includes('"')) problems.push(`${l} has a straight double quote (breaks attributes): ${v}`);
        if (/`|\$\{/.test(v)) problems.push(`${l} has a backtick or \${: ${v}`);
      }
    }
    assert.equal(problems.length, 0, `${problems.length} problems:\n  ${problems.slice(0, 40).join('\n  ')}`);
  });
}

test('no dictionary keeps a key that no screen uses', { skip: !!only }, () => {
  const used = new Set(Object.keys(AREAS).flatMap(a => [...areaKeys(a).keys]));
  const stale = [];
  for (const l of LANGS) for (const k of Object.keys(dicts[l])) if (!used.has(k)) stale.push(`${l}: ${k}`);
  assert.equal(stale.length, 0, `${stale.length} unused:\n  ${stale.slice(0, 30).join('\n  ')}`);
});
