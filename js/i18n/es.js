// Spanish: every area's dictionary in one. Keys are the English text (js/i18n.js).
import core from './es/core.js';
import shell from './es/shell.js';
import guide from './es/guide.js';
import map from './es/map.js';
import floor from './es/floor.js';
import floor2 from './es/floor2.js';
import stock1 from './es/stock1.js';
import stock2 from './es/stock2.js';
import dock1 from './es/dock1.js';
import dock2 from './es/dock2.js';
import admin from './es/admin.js';

export default Object.assign({}, core, shell, guide, map, floor, floor2, stock1, stock2, dock1, dock2, admin);
