// Help's chapters (scenes-old.js, a copy of js/guide/scenes.js made by the
// preview build) with each chapter being drawn in its place: a draft that
// keeps a chapter's id takes that chapter's place, one with a new id is added
// at the end. When a draft is approved it moves into js/guide/chapters/ and
// js/guide/scenes.js imports it.
import { SCENES as OLD, GROUPS, PEOPLE, DEVICE, CHAPTER_IDS as OLD_IDS } from './scenes-old.js';
import { NEW } from './chapters/index.js';

const byId = new Map(NEW.map(s => [s.replaces || s.id, s]));
export const SCENES = [...OLD.map(s => byId.get(s.id) || s), ...NEW.filter(s => !OLD_IDS.includes(s.replaces || s.id))];
export const CHAPTER_IDS = SCENES.map(s => s.id);
export { GROUPS, PEOPLE, DEVICE };
