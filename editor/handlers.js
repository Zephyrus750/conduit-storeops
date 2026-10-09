// The editor page's event handlers. They were inline on*="…" attributes;
// Conduit's CSP runs no inline code, so each element now names its handler
// (data-onclick="h12") and one delegated listener per event type calls it
// with `this` the element and `event` the event, as the inline code ran.
// Generated once from editor.html; edit the functions here.
/* eslint-disable */
window.EDITOR_HANDLERS = {
  h1: function (event) { toggleStoreDropdown(); },   // click
  h2: function (event) { addLevel(); },   // click
  h3: function (event) { cycleGhostLevel(); },   // click
  h4: function (event) { undo(); },   // click
  h5: function (event) { redo(); },   // click
  h6: function (event) { toggleGrid(); },   // click
  h7: function (event) { toggleSnap(); },   // click
  h8: function (event) { cyclePathVisibility(); },   // click
  h9: function (event) { cycleSosVisibility(); },   // click
  h10: function (event) { cycleToryVisibility(); },   // click
  h11: function (event) { openAuditModal(); },   // click
  h12: function (event) { document.getElementById('fieldMergeFile').click(); },   // click
  h13: function (event) { mergeFieldCaptures(event); },   // change
  h14: function (event) { importMap(); },   // click
  h15: function (event) { togglePreview(); },   // click
  h16: function (event) { showExportModal(); },   // click
  h17: function (event) { showPrintModal(); },   // click
  h18: function (event) { showShortcuts(); },   // click
  h19: function (event) { setTool('select'); },   // click
  h20: function (event) { setTool('shelf'); },   // click
  h21: function (event) { setTool('custom'); },   // click
  h22: function (event) { setTool('sixway'); },   // click
  h23: function (event) { setTool('landmark'); },   // click
  h24: function (event) { setTool('wall'); },   // click
  h25: function (event) { setTool('toryline'); },   // click
  h26: function (event) { setTool('paths'); },   // click
  h27: function (event) { setTool('boundary'); },   // click
  h28: function (event) { setTool('zoombox'); },   // click
  h29: function (event) { setTool('emergency'); },   // click
  h30: function (event) { setTool('pricecheck'); },   // click
  h31: function (event) { setTool('torydock'); },   // click
  h32: function (event) { setTool('pan'); },   // click
  h33: function (event) { setTool('ruler'); },   // click
  h34: function (event) { zoomIn(); },   // click
  h35: function (event) { zoomOut(); },   // click
  h36: function (event) { fitView(); },   // click
  h37: function (event) { rotateSelected(); },   // click
  h38: function (event) { duplicateSelected(); },   // click
  h39: function (event) { deleteSelected(); },   // click
  h40: function (event) { toggleEmergencyInventory(); },   // click
  h41: function (event) { emergencyInventoryRefresh(); },   // click
  h42: function (event) { emergencyInventoryExport(); },   // click
  h43: function (event) { switchPanelTab('shelves'); },   // click
  h44: function (event) { switchPanelTab('list'); },   // click
  h45: function (event) { switchPanelTab('settings'); },   // click
  h46: function (event) { setPathMode('connect'); },   // click
  h47: function (event) { setPathMode('select'); },   // click
  h48: function (event) { setPathNodeType(this.value); },   // change
  h49: function (event) { linkPortalToCandidate(this.value); this.value=''; },   // change
  h50: function (event) { deletePathNode(state.selectedPathNodeId); },   // click
  h51: function (event) { deletePathEdge(state.selectedPathEdge); },   // click
  h52: function (event) { deletePathNodes(state.selectedPathNodeIds); },   // click
  h53: function (event) { clearFloorPaths(); },   // click
  h54: function (event) { updateProp('name', this.value.toUpperCase()); },   // input
  h55: function (event) { updateProp('subname', this.value.toUpperCase()); },   // input
  h56: function (event) { updateProp('sharedName', this.checked); },   // change
  h57: function (event) { toggleDeptPicker('propDeptPicker'); },   // click
  h58: function (event) { updateFixture(this.value); },   // change
  h59: function (event) { setOrientation('H'); },   // click
  h60: function (event) { setOrientation('V'); },   // click
  h61: function (event) { setOrientation('A'); },   // click
  h62: function (event) { updateAngle(+this.value); },   // input
  h63: function (event) { adjustModules(-1); },   // click
  h64: function (event) { adjustModules(1); },   // click
  h65: function (event) { if(event.key==='Enter'){setShelfModulesFit(+this.value);event.preventDefault()} },   // keydown
  h66: function (event) { setShelfModulesFit(+document.getElementById('propModulesFit').value); },   // click
  h67: function (event) { updateCustomDim('customW', Math.max(10,+this.value)); },   // input
  h68: function (event) { updateCustomDim('customH', Math.max(10,+this.value)); },   // input
  h69: function (event) { swapCustomDims(); },   // click
  h70: function (event) { updateCustomAngle(+this.value); },   // input
  h71: function (event) { updateSixwayRadius(Math.max(10,+this.value)); },   // input
  h72: function (event) { updateProp('bayW', Math.max(10,+this.value)); },   // input
  h73: function (event) { updateProp('depth', Math.max(10,+this.value)); },   // input
  h74: function (event) { document.getElementById('locationsInput').focus(); },   // click
  h75: function (event) { if(event.key==='Enter'){addLocations();event.preventDefault()} },   // keydown
  h76: function (event) { addLocations(); },   // click
  h77: function (event) { clearLocations(); },   // click
  h78: function (event) { updateProp('x', +this.value); },   // input
  h79: function (event) { updateProp('y', +this.value); },   // input
  h80: function (event) { splitSelectedSides(); },   // click
  h81: function (event) { splitSelectedHalve(); },   // click
  h82: function (event) { setTool(state.tool==="split"?"select":"split"); },   // click
  h83: function (event) { if(event.key==='Enter'){splitSelectedIntoN();event.preventDefault()} },   // keydown
  h84: function (event) { splitSelectedIntoN(); },   // click
  h85: function (event) { setShelfModulesFit(+document.getElementById('splitNInput').value); },   // click
  h86: function (event) { armCombine(); },   // click
  h87: function (event) { updateProp('inactive', false); },   // click
  h88: function (event) { updateProp('inactive', true); },   // click
  h89: function (event) { updateProp('locked', false); },   // click
  h90: function (event) { updateProp('locked', true); },   // click
  h91: function (event) { if(event.key==='Enter'){batchSetName();event.preventDefault()} },   // keydown
  h92: function (event) { batchSetName(); },   // click
  h93: function (event) { toggleDeptPicker('multiDeptPicker'); },   // click
  h94: function (event) { batchAdjustModules(-1); },   // click
  h95: function (event) { batchAdjustModules(1); },   // click
  h96: function (event) { if(event.key==='Enter'){batchSetModules(+this.value);event.preventDefault()} },   // keydown
  h97: function (event) { batchSetModules(+document.getElementById('multiModulesSet').value); },   // click
  h98: function (event) { copySelected(); },   // click
  h99: function (event) { batchToggleInactive(); },   // click
  h100: function (event) { batchToggleLock(); },   // click
  h101: function (event) { batchSwapSubnames('S'); },   // click
  h102: function (event) { batchSwapSubnames('E'); },   // click
  h103: function (event) { applyTemplate(this.value); },   // change
  h104: function (event) { saveAsTemplate(); },   // click
  h105: function (event) { deleteTemplate(); },   // click
  h106: function (event) { updateLandmarkProp('label', this.value.toUpperCase()); },   // input
  h107: function (event) { updateLandmarkProp('icon', this.value); },   // change
  h108: function (event) { updateLandmarkProp('x', +this.value); },   // input
  h109: function (event) { updateLandmarkProp('y', +this.value); },   // input
  h110: function (event) { updateLandmarkProp('w', Math.max(10,+this.value)); },   // input
  h111: function (event) { updateLandmarkProp('h', Math.max(10,+this.value)); },   // input
  h112: function (event) { updateLandmarkAngle(+this.value); },   // input
  h113: function (event) { updateWallProp('kind', this.value === 'window' ? 'window' : undefined); },   // change
  h114: function (event) { updateWallProp('x', +this.value); },   // input
  h115: function (event) { updateWallProp('y', +this.value); },   // input
  h116: function (event) { updateWallProp('w', Math.max(4,+this.value)); },   // input
  h117: function (event) { updateWallProp('h', Math.max(4,+this.value)); },   // input
  h118: function (event) { updateWallAngle(+this.value); },   // input
  h119: function (event) { duplicateWall(); },   // click
  h120: function (event) { duplicateToryLine(); },   // click
  h121: function (event) { toggleDeptPicker('zoomboxDeptPicker'); },   // click
  h122: function (event) { updateZoomboxProp('label', this.value); },   // input
  h123: function (event) { updateZoomboxProp('x', +this.value); },   // input
  h124: function (event) { updateZoomboxProp('y', +this.value); },   // input
  h125: function (event) { updateZoomboxProp('w', Math.max(20,+this.value)); },   // input
  h126: function (event) { updateZoomboxProp('h', Math.max(20,+this.value)); },   // input
  h127: function (event) { autoFitZoombox(); },   // click
  h128: function (event) { deleteSelectedZoombox(); },   // click
  h129: function (event) { updateEmergencyProp('type', this.value); },   // change
  h130: function (event) { updateEmergencyProp('extClass', this.value); },   // change
  h131: function (event) { updateEmergencyProp('label', this.value); },   // input
  h132: function (event) { updateEmergencyProp('location', this.value); },   // input
  h133: function (event) { updateEmergencyProp('x', +this.value); },   // input
  h134: function (event) { updateEmergencyProp('y', +this.value); },   // input
  h135: function (event) { updateEmergencyProp('method', this.value); },   // input
  h136: function (event) { updateEmergencyProp('operation', this.value); },   // input
  h137: function (event) { updateEmergencyProp('detail', this.value); },   // input
  h138: function (event) { duplicateEmergency(); },   // click
  h139: function (event) { deleteSelectedEmergency(); },   // click
  h140: function (event) { updatePriceCheckProp('variant', this.value); },   // change
  h141: function (event) { updatePriceCheckProp('label', this.value); },   // input
  h142: function (event) { updatePriceCheckProp('location', this.value); },   // input
  h143: function (event) { updatePriceCheckProp('x', +this.value); },   // input
  h144: function (event) { updatePriceCheckProp('y', +this.value); },   // input
  h145: function (event) { updatePriceCheckProp('detail', this.value); },   // input
  h146: function (event) { duplicatePriceCheck(); },   // click
  h147: function (event) { deleteSelectedPriceCheck(); },   // click
  h148: function (event) { onShelfSearch(this.value); },   // input
  h149: function (event) { renderShelfList(); },   // change
  h150: function (event) { updateStoreInfo('zone', this.value); },   // input
  h151: function (event) { updateStoreInfo('brand', this.value); },   // input
  h152: function (event) { updateStoreInfo('orientation', this.value); },   // change
  h153: function (event) { updateStoreInfo('storeType', this.value); },   // input
  h154: function (event) { updateStoreInfo('storeStyle', this.value.toUpperCase()); },   // input
  h155: function (event) { updateStoreInfo('storeSize', this.value); },   // input
  h156: function (event) { updateStoreAddrLine(0, this.value); },   // input
  h157: function (event) { updateStoreAddrLine(1, this.value); },   // input
  h158: function (event) { updateStoreAddrLine(2, this.value); },   // input
  h159: function (event) { addStoreHoliday(); },   // click
  h160: function (event) { updateStoreInfo('lat', this.value); },   // input
  h161: function (event) { updateStoreInfo('lng', this.value); },   // input
  h162: function (event) { updateStoreInfo('directionsGoogle', this.value); },   // input
  h163: function (event) { updateStoreInfo('directionsApple', this.value); },   // input
  h164: function (event) { updateStoreInfo('parkingTip', this.value); },   // input
  h165: function (event) { updateStoreInfo('parkingLat', this.value); },   // input
  h166: function (event) { updateStoreInfo('parkingLng', this.value); },   // input
  h167: function (event) { updateStoreInfo('assemblyNotes', this.value); },   // input
  h168: function (event) { updateStoreInfo('assemblyLat', this.value); },   // input
  h169: function (event) { updateStoreInfo('assemblyLng', this.value); },   // input
  h170: function (event) { updateStoreInfo('completion', this.value); },   // input
  h171: function (event) { updateStoreInfo('lastUpdated', this.value); },   // input
  h172: function (event) { updateGridSize(+this.value); },   // change
  h173: function (event) { updateModuleSettings(); },   // change
  h174: function (event) { addDepartment(); },   // click
  h175: function (event) { clearBoundary(); },   // click
  h176: function (event) { document.getElementById('underlayFile').click(); },   // click
  h177: function (event) { loadUnderlay(event); },   // change
  h178: function (event) { pdfPrevPage(); },   // click
  h179: function (event) { pdfNextPage(); },   // click
  h180: function (event) { startSetScale(); },   // click
  h181: function (event) { applyScaleCalibration(); },   // click
  h182: function (event) { cancelSetScale(); },   // click
  h183: function (event) { setUnderlayOpacity(this.value); },   // input
  h184: function (event) { setUnderlayScale(this.value); },   // input
  h185: function (event) { setUnderlayScale(100); },   // click
  h186: function (event) { setUnderlayScale(187); },   // click
  h187: function (event) { setUnderlayScale(200); },   // click
  h188: function (event) { setUnderlayScale(300); },   // click
  h189: function (event) { setUnderlayPos(+this.value, state.underlayY); },   // input
  h190: function (event) { setUnderlayPos(state.underlayX, +this.value); },   // input
  h191: function (event) { nudgeUnderlay(-state.gridSize, 0); },   // click
  h192: function (event) { nudgeUnderlay(0, -state.gridSize); },   // click
  h193: function (event) { nudgeUnderlay(0, state.gridSize); },   // click
  h194: function (event) { nudgeUnderlay(state.gridSize, 0); },   // click
  h195: function (event) { setUnderlayPos(0,0); },   // click
  h196: function (event) { toggleUnderlayAdjust(); },   // click
  h197: function (event) { removeUnderlay(); },   // click
  h198: function (event) { runShelfDetection(); },   // click
  h199: function (event) { document.getElementById('detectThresholdVal').textContent=this.value; },   // input
  h200: function (event) { if(_detect)runShelfDetection(); },   // change
  h201: function (event) { document.getElementById('detectMinSideVal').textContent=this.value; },   // input
  h202: function (event) { document.getElementById('detectMaxSideVal').textContent=this.value; },   // input
  h203: function (event) { detectSetAll(true); },   // click
  h204: function (event) { detectSetAll(false); },   // click
  h205: function (event) { applyDetectedShelves(); },   // click
  h206: function (event) { cancelDetect(); },   // click
  h207: function (event) { if(confirm('Load demo map? This will replace your current work.')) loadDemo(); },   // click
  h208: function (event) { pasteClipboard(); },   // click
  h209: function (event) { rotateBy45(); },   // click
  h210: function (event) { bringToFront(); },   // click
  h211: function (event) { sendToBack(); },   // click
  h212: function (event) { highlightRelated(); },   // click
  h213: function (event) { deleteBoundaryPoint(); },   // click
  h214: function (event) { clearBoundary(); hideBoundaryContextMenu(); },   // click
  h215: function (event) { closeDeptModal(); },   // click
  h216: function (event) { saveDepartment(); },   // click
  h217: function (event) { handleImport(event); },   // change
  h218: function (event) { if(event.target===this)this.classList.remove('visible'); },   // click
  h219: function (event) { closePrintModal(); },   // click
  h220: function (event) { exportSVG(); },   // click
  h221: function (event) { exportPNG(); },   // click
  h222: function (event) { exportModalChooseJS(); },   // click
  h223: function (event) { exportModalChooseJSON(); },   // click
  h224: function (event) { closeExportModal(); },   // click
  h225: function (event) { closeAuditModal(); },   // click
  h226: function (event) { document.getElementById('auditPdfFile').click(); },   // click
  h227: function (event) { viewAuditPdf(); },   // click
  h228: function (event) { attachAuditPdf(event); },   // change
  h229: function (event) { resetAudit(); },   // click
  h230: function (event) { printAudit(); },   // click
  h231: function (event) { printShelfChecklist(); },   // click
};

// Handlers for markup the editor builds at runtime: the element names one
// of these (data-onclick="removeLocation") and carries its arguments in
// data-* attributes, so nothing from a map file is ever run as code.
Object.assign(window.EDITOR_HANDLERS, {
  removeLocation: function () { removeLocation(+this.dataset.i); },
  toggleAuditItem: function () { toggleAuditItem(this.dataset.id, this.checked); },
  setAuditNote: function () { setAuditNote(this.dataset.id, this.value); },
  pickZone: function (event) { event.stopPropagation(); activeZoneId = this.dataset.zone; renderStoreDropdown(); },
  toggleStoreSort: function (event) { event.stopPropagation(); toggleStoreSort(); },
  openFromConduit: function (event) { event.stopPropagation(); window.ConduitBridge && window.ConduitBridge.openStore(this.dataset.store); },
  switchStore: function () { switchStore(this.dataset.store); },
  storeHours: function () { updateStoreHours(+this.dataset.i, this.value); },
  storeHoliday: function () { updateStoreHoliday(+this.dataset.i, this.dataset.field, this.value); },
  removeStoreHoliday: function () { removeStoreHoliday(+this.dataset.i); },
  applyFloorSettings: function () { applyFloorSettings(this.dataset.floor); },
  closeFloorSettings: function () { document.querySelectorAll('.floor-settings-popup').forEach(function (el) { el.remove(); }); },
  refreshPreview: function () { refreshPreview(); },
  closePreview: function () { togglePreview(); },
});

// Bind each element's handler as the inline attribute did: on the element,
// in the bubbling phase, `this` the element, `return false` cancelling the
// default. Elements the editor adds later are bound as they arrive.
(function () {
  var H = window.EDITOR_HANDLERS, TYPES = ['click', 'change', 'input', 'keydown'], done = new WeakSet();
  function bind(el) {
    if (done.has(el)) return; done.add(el);
    TYPES.forEach(function (type) {
      var name = el.getAttribute('data-on' + type); if (!name) return;
      el.addEventListener(type, function (event) {
        var fn = H[name]; if (!fn) { console.error('editor: no handler ' + name); return; }
        if (fn.call(el, event) === false) event.preventDefault();
      });
    });
  }
  var SEL = TYPES.map(function (t) { return '[data-on' + t + ']'; }).join(',');
  function scan(root) { if (root.nodeType !== 1) return; if (root.matches(SEL)) bind(root); root.querySelectorAll(SEL).forEach(bind); }
  scan(document.documentElement);
  new MutationObserver(function (list) { list.forEach(function (m) { m.addedNodes.forEach(scan); }); })
    .observe(document.documentElement, { childList: true, subtree: true });
})();
