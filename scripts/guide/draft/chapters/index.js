// The chapters being drawn. A chapter that keeps Help's id takes that
// chapter's place; one with a new id is added. Add each draft here:
//   import { name } from './name.js';  →  export const NEW = [name];
// Batch 3: the nine chapters Help still drew the old way.
import { signin } from './signin.js';
import { offline } from './offline.js';
import { settings } from './settings.js';
import { find } from './find.js';
import { fault } from './fault.js';
import { equip } from './equip.js';
import { livepull } from './livepull.js';
import { cages } from './cages.js';
import { receivepc } from './receivepc.js';
export const NEW = [signin, offline, settings, find, fault, equip, livepull, cages, receivepc];
