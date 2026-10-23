// French: every area's dictionary in one. Keys are the English text (js/i18n.js).
import core from './fr/core.js';
import shell from './fr/shell.js';
import guide from './fr/guide.js';
import map from './fr/map.js';
import floor from './fr/floor.js';
import floor2 from './fr/floor2.js';
import stock1 from './fr/stock1.js';
import stock2 from './fr/stock2.js';
import dock1 from './fr/dock1.js';
import dock2 from './fr/dock2.js';
import admin from './fr/admin.js';

export default Object.assign({}, core, shell, guide, map, floor, floor2, stock1, stock2, dock1, dock2, admin);
