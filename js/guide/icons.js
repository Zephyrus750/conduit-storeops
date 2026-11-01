// The guide's icons. The app's own set (icons.svg, as ic() in js/ui.js
// draws it) wherever it has the glyph; the Visual Guide showcase's paths
// only for the few it lacks (the player's controls, wifi, a book, a hand).
// No DOM here: js/guide/scenes.js imports this, and so does its unit test.

// The showcase's name → the app's icon.
const APP = {
  search: 'search', mic: 'mic', grid: 'grid', home: 'home', refresh: 'refresh', tag: 'tag', route: 'route', alert: 'alert',
  dots: 'dots', box: 'box', check: 'check', truck: 'truck', map: 'map', list: 'listcheck', ladder: 'm-equipment', share: 'qr',
  clip: 'clip', barcode: 'barcode', cal: 'cal', chart: 'chart', updown: 'm-adjust', cage: 'cage', expand: 'expand', gear: 'settings',
  clipboard: 'clip', pkg: 'packages', lock: 'lock', wrench: 'tool', camera: 'camera', shield: 'shield', arrow: 'arrow', pause: 'pause',
  print: 'print', x: 'x', plus: 'plus', star: 'star', file: 'file', stack: 'stack', bars: 'bars', users: 'users', pin: 'pin',
  // The app's area and screen icons, as its rail and tab strip draw them.
  'm-dashboard': 'm-dashboard', 'm-map': 'm-map', 'm-picklist': 'm-picklist', 'm-emergency': 'm-emergency', 'm-bfreview': 'm-bfreview',
  'm-adjust': 'm-adjust', 'm-cages': 'm-cages', 'm-receiving': 'm-receiving', 'm-planner': 'm-planner', 'm-settings': 'm-settings',
  'm-backfill': 'm-backfill', 'm-refresh': 'm-refresh', 'm-labelint': 'm-labelint', 'm-maintenance': 'm-maintenance', 'm-equipment': 'm-equipment', listcheck: 'listcheck',
};
// 24-unit stroke paths the app has no icon for.
const OWN = {
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 4M12 17h.01"/>',
  wifi: '<path d="M2.5 9a14 14 0 0119 0M5.5 12.5a9.5 9.5 0 0113 0M8.5 16a5 5 0 017 0M12 19.5h.01"/>',
  nowifi: '<path d="M3 3l18 18M8.5 16a5 5 0 017 0M12 19.5h.01M5.5 12.5a9.5 9.5 0 014.5-2.4M2.5 9a14 14 0 015-3M14 6.2a14 14 0 017.5 2.8"/>',
  book: '<path d="M5 4h9a4 4 0 014 4v12H9a4 4 0 01-4-4z"/><path d="M5 16a4 4 0 014-4h9"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  again: '<path d="M4 12a8 8 0 102.3-5.6M4 4v5h5"/>',
  hand: '<path d="M9 11V5a1.5 1.5 0 013 0v5M12 10V4a1.5 1.5 0 013 0v6M15 10V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6.5 7-2.6 0-4.3-1.3-5.6-3.5L4 13a1.5 1.5 0 012.5-1.7L9 14"/>',
};
export const gi = n => APP[n]
  ? `<svg class="i" aria-hidden="true"><use href="icons.svg#i-${APP[n]}"/></svg>`
  : `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${OWN[n] || ''}</svg>`;
export const iconNames = () => [...Object.keys(APP), ...Object.keys(OWN)];
