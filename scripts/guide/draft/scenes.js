// The guide's chapters as they will be once the redrawn ones are approved:
// Help's chapters (scenes-old.js, a copy of js/guide/scenes.js made by the
// preview build) with each redrawn chapter in its place. When they are
// approved, the redrawn chapters move into js/guide/scenes.js with their
// translations, and this file goes.
import { SCENES as OLD, GROUPS, PEOPLE, DEVICE, CHAPTER_IDS as OLD_IDS } from './scenes-old.js';
import { NEW } from './chapters/index.js';

const byId = new Map(NEW.map(s => [s.replaces || s.id, s]));
export const SCENES = [...OLD.map(s => byId.get(s.id) || s), ...NEW.filter(s => !OLD_IDS.includes(s.replaces || s.id))];
export const CHAPTER_IDS = SCENES.map(s => s.id);
export { GROUPS, PEOPLE, DEVICE };
