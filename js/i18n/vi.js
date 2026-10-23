// Vietnamese: every area's dictionary in one. Keys are the English text (js/i18n.js).
import core from './vi/core.js';
import shell from './vi/shell.js';
import guide from './vi/guide.js';
import map from './vi/map.js';
import floor from './vi/floor.js';
import floor2 from './vi/floor2.js';
import stock1 from './vi/stock1.js';
import stock2 from './vi/stock2.js';
import dock1 from './vi/dock1.js';
import dock2 from './vi/dock2.js';
import admin from './vi/admin.js';

export default Object.assign({}, core, shell, guide, map, floor, floor2, stock1, stock2, dock1, dock2, admin);
