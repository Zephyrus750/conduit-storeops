// A view's listeners and lookups (scopeListeners): with the title bar on, the
// view's header sits in the top bar, outside the view's element, and its
// buttons used to do nothing (Paste whole report, Screen scan, Print…).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeListeners } from '../../js/ui.js';

// An element stand-in: an EventTarget that finds its own named children.
function el(kids = {}) {
  const t = new EventTarget();
  t.querySelector = sel => kids[sel] ?? null;
  t.querySelectorAll = sel => (kids[sel] ? [kids[sel]] : []);
  return t;
}

test('a lifted header is part of the view: its clicks reach the view, its fields are found, and both end with the view', () => {
  const field = { id: 'day' }, view = el({ '.list': { id: 'list' } }), header = el({ '[data-field="day"]': field });
  const off = new AbortController();
  scopeListeners(view, off.signal, [header]);
  const seen = [];
  view.addEventListener('click', e => seen.push(e.type + (e.currentTarget === header ? '@header' : '@view')));
  header.dispatchEvent(new Event('click'));
  view.dispatchEvent(new Event('click'));
  assert.deepEqual(seen, ['click@header', 'click@view'], 'once each: a click in the view does not reach the header');
  assert.equal(view.querySelector('[data-field="day"]'), field, 'found in the header');
  assert.equal(view.querySelector('.list').id, 'list', 'the view’s own first');
  assert.equal(view.querySelector('.none'), null);
  assert.deepEqual(view.querySelectorAll('[data-field="day"]'), [field]);
  off.abort();
  header.dispatchEvent(new Event('click'));
  assert.equal(seen.length, 2, 'gone with the view');
});

test('with nothing lifted, the view keeps its own lookups', () => {
  const view = el(), q = view.querySelector;
  scopeListeners(view, new AbortController().signal);
  assert.equal(view.querySelector, q);
});
