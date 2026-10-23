// Filipino: every area's dictionary in one. Keys are the English text (js/i18n.js).
import core from './fil/core.js';
import shell from './fil/shell.js';
import guide from './fil/guide.js';
import map from './fil/map.js';
import floor from './fil/floor.js';
import floor2 from './fil/floor2.js';
import stock1 from './fil/stock1.js';
import stock2 from './fil/stock2.js';
import dock1 from './fil/dock1.js';
import dock2 from './fil/dock2.js';
import admin from './fil/admin.js';

export default Object.assign({}, core, shell, guide, map, floor, floor2, stock1, stock2, dock1, dock2, admin);
