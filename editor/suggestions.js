/* Map editor — suggested edits from the store.

   Staff suggest edits in Conduit (Suggest map edits): rename a shelf or
   flag something wrong with it. They wait in the store's event log until
   the owner accepts or declines each one; this panel lists the open ones for
   the store being edited (#storeNumber), through the owner session
   (editor/conduit.js):

     · RENAME → [Accept] renames that one shelf ("A16 S2") when the new name
       is a shelf code ("A17 S2"); a free-text name ("Kitchen gadgets") is
       shown so the owner can make the change by hand. Either way Conduit
       marks the suggestion accepted.
     · FLAG   → [Resolve] marks it accepted once handled; [Decline] declines.
     · Clicking a row highlights the shelf on the canvas.
*/
(function () {
  'use strict';

  var edits = [];
  var status = '';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function sn() {
    var el = $('storeNumber');
    return el ? el.value.trim() : '';
  }
  function fmt(t) {
    try {
      var d = new Date(t);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }
  function setStatus(s) { status = s || ''; render(); }

  /* ── Conduit ── */
  function subscribe() {
    var n = sn(), B = window.ConduitBridge;
    if (!B) { setStatus('Connecting to Conduit…'); return; }
    if (!B.owner) { edits = []; setStatus('Sign in as the owner (top bar) to see the store\'s suggestions.'); return; }
    if (!n) { edits = []; setStatus(''); return; }
    setStatus('Loading…');
    B.suggestions(n).then(function (list) { edits = list; setStatus(''); })
      .catch(function (e) { edits = []; setStatus('Couldn\'t load suggestions: ' + ((e && e.message) || 'error')); });
  }
  function resolveRemote(id, status) {
    var B = window.ConduitBridge;
    return B.resolve(sn(), id, status).then(function () {
      edits = edits.filter(function (p) { return p.id !== id; }); render();
    }).catch(function (e) { alert('Conduit didn\'t take that: ' + ((e && e.message) || 'error')); });
  }

  /* ── applying a rename to the editor's data model ── */
  // The suggestion names one shelf ("A16 S2", or "A16" for a shelf with no
  // suffix). A new name that reads as a shelf code ("A17 S2", "A17") renames
  // that shelf; anything else returns -1 so the owner makes the change.
  var CODE = /^([A-Z]{1,3}\d{1,4})(?:[\s-]?([SEP]\d{1,2}))?$/;
  function fullOf(s) { return ((s.name || '') + (s.subname ? ' ' + s.subname : '')).toUpperCase(); }
  function applyRename(p) {
    var to = String(p.to || '').trim().toUpperCase(), m = CODE.exec(to);
    if (!m) return -1;
    if (typeof saveState === 'function') saveState();          // undo-able
    if (typeof syncCurrentFloor === 'function') { try { syncCurrentFloor(); } catch (e) {} }
    var count = 0, want = String(p.shelf || '').toUpperCase();
    function renameIn(arr) {
      (arr || []).forEach(function (s) {
        if (s && fullOf(s) === want) { s.name = m[1]; if (m[2]) s.subname = m[2]; count++; }
      });
    }
    try {
      if (typeof state !== 'undefined') {
        renameIn(state.shelves);
        (state.floors || []).forEach(function (f) {
          if (f.id === state.currentFloorId) return;   // current floor lives in state.shelves
          renameIn(f.data && f.data.shelves);
        });
      }
    } catch (e) {}
    if (count && typeof renderAll === 'function') { try { renderAll(); } catch (e) {} }
    return count;
  }

  /* ── UI ── */
  function ensureUI() {
    if ($('tabSuggest')) return;
    var tabs = document.querySelector('.panel-tabs');
    var settingsTab = $('tabSettings');
    if (!tabs || !settingsTab || !settingsTab.parentNode) return;
    var btn = document.createElement('button');
    btn.className = 'panel-tab';
    btn.id = 'suggestTabBtn';
    btn.textContent = 'Suggestions';
    btn.addEventListener('click', function () { switchPanelTab('suggest'); subscribe(); });
    tabs.appendChild(btn);
    var div = document.createElement('div');
    div.className = 'panel-tab-content';
    div.id = 'tabSuggest';
    div.innerHTML = '<div class="sq-head">Suggested edits <span class="sq-count" id="sqCount">0</span>' +
                    '<button class="sq-refresh" id="sqRefresh" title="Load the store\'s suggestions again">↻</button></div>' +
                    '<div class="sq-status" id="sqStatus"></div>' +
                    '<div id="sqList"></div>';
    settingsTab.parentNode.appendChild(div);
    $('sqRefresh').addEventListener('click', function () { subscribe(); });
    $('sqList').addEventListener('click', onListClick);
  }
  function render() {
    ensureUI();
    var list = $('sqList'), count = $('sqCount'), stat = $('sqStatus'), tabBtn = $('suggestTabBtn');
    if (!list) return;
    if (count) count.textContent = edits.length;
    if (tabBtn) tabBtn.textContent = edits.length ? 'Suggestions (' + edits.length + ')' : 'Suggestions';
    if (stat) { stat.textContent = status; stat.style.display = status ? 'block' : 'none'; }
    if (!edits.length) {
      list.innerHTML = '<div class="sq-empty">' +
        (sn() ? 'No pending suggestions for store ' + esc(sn()) + '.'
              : 'Set the store number (Settings tab) to load its suggestions.') + '</div>';
      return;
    }
    list.innerHTML = edits.map(function (p) {
      var isRename = p.kind === 'rename';
      var head = esc(p.shelf) + (isRename ? ' → ' + esc(p.to) : '');
      var sub = (isRename ? 'Rename' + (p.note ? ': ' + esc(p.note) : '') : esc(p.note || 'Flagged for review')) + (p.floor ? ' · ' + esc(p.floor) : '');
      return '<div class="sq-row" data-sid="' + esc(p.id) + '" data-shelf="' + esc(p.shelf) + '">' +
        '<span class="sq-ic">' + (isRename ? '✎' : '⚑') + '</span>' +
        '<span class="sq-tx">' +
          '<b>' + head + '</b>' +
          '<em>' + sub + ' · ' + fmt(p.at) + '</em>' +
        '</span>' +
        '<button class="sq-btn accept" data-act="accept">' + (isRename ? 'Accept' : 'Resolve') + '</button>' +
        '<button class="sq-btn" data-act="dismiss">Decline</button>' +
        '</div>';
    }).join('');
  }
  function onListClick(e) {
    var row = e.target.closest('.sq-row');
    if (!row) return;
    var id = row.getAttribute('data-sid');
    var p = edits.find(function (x) { return x.id === id; });
    var act = e.target.closest('[data-act]');
    if (!act) {
      // row click: highlight the shelf's run on the canvas
      try {
        if (typeof state !== 'undefined') {
          var name = String(row.getAttribute('data-shelf') || '').split(' ')[0];
          state.highlightedName = state.highlightedName === name ? null : name;
          if (typeof renderAll === 'function') renderAll();
        }
      } catch (e2) {}
      return;
    }
    if (!p) return;
    if (act.getAttribute('data-act') === 'accept') {
      if (p.kind === 'rename') {
        var n = applyRename(p);
        if (n === -1 && !confirm('"' + p.to + '" isn\'t a shelf code, so it can\'t be applied for you.\n\nMake the change on the map, then press OK to mark it accepted in Conduit.')) return;
        if (n === 0 && !confirm('No shelf "' + p.shelf + '" on the loaded map.\n\nOpen the store from Conduit first, or mark it accepted anyway?')) return;
      }
      resolveRemote(p.id, 'accepted');
      return;
    }
    if (act.getAttribute('data-act') === 'dismiss') resolveRemote(p.id, 'declined');
  }

  function boot() {
    ensureUI();
    render();
    subscribe();
    window.addEventListener('conduit-ready', subscribe);
    window.addEventListener('map-opened', subscribe);   // a store opened from Conduit or a file
    var snEl = $('storeNumber');
    if (snEl) snEl.addEventListener('change', subscribe);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SuggestQueue = {
    refresh: subscribe,
    // test hook: lets the verification harness inject a queue without Firestore
    _inject: function (list) { edits = list || []; render(); }
  };
})();
