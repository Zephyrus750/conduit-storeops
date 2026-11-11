// The Visual Guide's chapters (Help): each task played on the device it is
// done on. A chapter is its devices, drawn in HTML with Conduit's own light
// look (html), and its steps. A step has:
//   cap   one line, under the device as it plays
//   read  the Handbook's explanation
//   dev   the developer note (English, like the map editor)
//   ev    the event log: E() an event as the store dispatches it, R() a
//         request to the worker (English: event types, payloads and routes)
//   run   what happens on the device, through the player's helpers c.*
// test/unit/guide.test.js keeps the developer notes and the event log true
// to the code: every event type in the catalogue, every route in the
// worker, every file and every <b>function()</b> named still there.
//
// Every word a person reads goes through tx(), one sentence a key; data
// (shelves, bays, keycodes, product, store and department names, D-numbers,
// manifest numbers) stays as the store writes it.

import { tx } from '../i18n.js';
// The chapters, each drawn at the app's real sizes (js/guide/chapters/) on
// js/guide/frames.js's 390×844 phone and js/guide/pc.js's 1920×1080 PC.
import { signin } from './chapters/signin.js';
import { around } from './chapters/around.js';
import { offline } from './chapters/offline.js';
import { settings } from './chapters/settings.js';
import { find } from './chapters/find.js';
import { refresh } from './chapters/refresh.js';
import { labels } from './chapters/labels.js';
import { fault } from './chapters/fault.js';
import { equip } from './chapters/equip.js';
import { bfscan } from './chapters/bfscan.js';
import { bfreview } from './chapters/bfreview.js';
import { livepull } from './chapters/livepull.js';
import { cages } from './chapters/cages.js';
import { manifests } from './chapters/manifests.js';
import { receive as receivePhone } from './chapters/receive.js';
import { decant } from './chapters/decant.js';
import { receivepc } from './chapters/receivepc.js';

export const GROUPS = [['start', tx('Start here')], ['floor', tx('Floor')], ['stockroom', tx('Stockroom')], ['dock', tx('Back dock')]];
// Who a chapter is for: the For picker's people.
export const PEOPLE = [['all', tx('Everyone')], ['floor', tx('Floor team')], ['stockroom', tx('Stockroom team')], ['dock', tx('Back dock team')], ['manager', tx('Managers')]];
export const DEVICE = { phone: tx('Phone'), pc: tx('PC'), duo: tx('2 phones') };

// ── the chapters, in Help's order ─────────────────────────────────────
export const SCENES = [
  // Start here
  signin, around, offline, settings,
  // Floor
  find, refresh, labels, fault, equip,
  // Stockroom
  bfscan, bfreview, livepull, cages,
  // Back dock
  manifests, receivePhone, decant, receivepc,
];

// The Help screen a store screen opens at: js/registry.js maps view ids to these.
export const CHAPTER_IDS = SCENES.map(s => s.id);
