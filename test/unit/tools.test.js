import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, TOOL_IDS, toolForEvent, toolForView, toolOff } from '../../shared/tools.js';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { readFileSync, readdirSync } from 'node:fs';

// View ids as declared in the view modules (the registry needs a browser).
const VIEWS = {}; const walk = d => { for (const e of readdirSync(new URL(d, import.meta.url), { withFileTypes: true })) { if (e.isDirectory()) walk(`${d}${e.name}/`); else if (e.name.endsWith('.js')) for (const m of readFileSync(new URL(d + e.name, import.meta.url), 'utf8').matchAll(/\bid: '([a-z]+)', title:/g)) VIEWS[m[1]] = true; } }; walk('../../js/views/');

test('every tool id is unique and every view a tool names exists', () => {
  assert.equal(new Set(TOOL_IDS).size, TOOL_IDS.length);
  for (const t of TOOLS) for (const v of t.views) assert.ok(VIEWS[v], `${t.id} names view ${v}`);
});
test('every event type in an area maps to a tool of that area, or to none', () => {
  for (const [type, info] of Object.entries(CATALOGUE)) {
    const t = toolForEvent(type);
    if (t) assert.equal(t.area, info.area === 'store' ? 'floor' : info.area, `${type} → ${t.id}`);
  }
  assert.equal(toolForEvent('manifest.attach').id, 'receiving'); assert.equal(toolForEvent('manifest.publish').id, 'manifests');
  assert.equal(toolForEvent('soh.verify').id, 'intel'); assert.equal(toolForEvent('map.edit.suggest').id, 'mapedits');
  assert.equal(toolForEvent('map.edit.resolve'), null, 'the owner resolves edits whatever the store has on');
  assert.equal(toolForEvent('store.settings.set'), null); assert.equal(toolForEvent('scan.preset'), null);
});
test('store.tools.set: the owner only, known ids, and toolOff reads the list', () => {
  const s = initialState(), ev = (off, owner = true) => ({ type: 'store.tools.set', entity: {}, payload: { off }, at: '2026-10-08T00:00:00Z', actor: { device: 'x', owner } });
  assert.equal(apply(s, ev(['trends'], false))?.code, 'unauthorised', 'a store manager cannot');
  assert.equal(apply(s, ev(['nope']))?.code, 'invalid_event');
  assert.equal(apply(s, ev(['trends', 'cages', 'trends'])), null);
  assert.deepEqual(s.tools.off, ['cages', 'trends']);
  assert.equal(toolOff(s.tools.off, 'trends'), true); assert.equal(toolOff(s.tools.off, toolForView('cages')), true); assert.equal(toolOff(s.tools.off, 'daylist'), false);
  assert.equal(toolForView('map'), null, 'the store map is not a tool');
  assert.equal(apply(s, ev([])), null); assert.deepEqual(s.tools.off, []);
});
