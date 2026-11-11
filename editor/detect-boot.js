// Hands the editor's classic scripts the shared rules they use: the
// auto-detect geometry (shared/detect.js) as window.DetectCore, and which one
// shelf a rename changes (shared/mapedits.js) as window.MapEdits.
import * as DetectCore from '../shared/detect.js';
import { oneShelf } from '../shared/mapedits.js';
window.DetectCore = DetectCore;
window.MapEdits = { oneShelf };
