// Screen scan (K2B / Vector's stockroom screen scan): share the window that
// shows the inventory report, draw a box over its LOCATION and KEYCODE
// columns (or the whole row, for an SOH report), and scroll the report
// slowly while frames are read. Each settled frame is cropped, upscaled,
// padded and thresholded (Otsu), then read by Tesseract, self-hosted under
// vendor/tesseract and loaded on first use. Codes are counted across frames
// and APN fragments filtered (shared/screenscan.js). A box drawn for a
// screen size can be saved as the store's preset (scan.preset) and applies
// itself on every desk with that size.
//
//   openScreenScan(ctx, { mode, expected, title, onUse })
//     mode: 'compare' (a bay's codes), 'soh' (codes for SOH adjustments),
//           'rows' (the whole SOH report: location, keycode, SOH, price),
//           'list' (codes for the barcode list)
//     onUse({ codes, locs, items }) receives what was read when the person uses it.

import { ic, esc, toast } from './ui.js';
import { otsu, wordsToRows, ingest, filtered, locVerdict, matchPreset } from '../shared/screenscan.js';
import { parseReport, byLoc } from '../shared/stockintel.js';
import { csvLines } from '../shared/records.js';

const BASE = () => new URL('vendor/tesseract/', location.href).href;
let tessLoading = null, tess = null, tessMode = null;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('the OCR engine did not load: check the connection')); document.head.appendChild(s); }); }
async function ocr() {
  if (tess) return tess;
  tessLoading ||= (async () => {
    if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
    const b = BASE();
    tess = await window.Tesseract.createWorker('eng', 1, { workerPath: b + 'worker.min.js', corePath: b + 'tesseract-core-simd-lstm.wasm.js', langPath: b.replace(/\/$/, ''), gzip: true, workerBlobURL: false });
    return tess;
  })().catch(e => { tessLoading = null; throw e; });
  return tessLoading;
}
const KIND = mode => (mode === 'rows' ? 'rows' : 'codes');
const REGION_KEY = kind => `screenscan_region_${kind}`;
const remembered = kind => { try { return JSON.parse(localStorage.getItem(REGION_KEY(kind)) || 'null'); } catch { return null; } };
const remember = (kind, r) => { try { localStorage.setItem(REGION_KEY(kind), JSON.stringify(r)); } catch {} };
const TITLES = { compare: 'Screen scan · compare a bay', soh: 'Screen scan · SOH adjustments', rows: 'Screen scan · SOH report', list: 'Screen scan · barcode list' };

export function openScreenScan(ctx, { mode = 'list', expected = '', title, onUse } = {}) {
  if (!navigator.mediaDevices?.getDisplayMedia) { toast('Screen sharing is not available in this browser: paste the report instead', 'bad'); return; }
  document.getElementById('sscan')?.remove();
  const kind = KIND(mode), el = document.createElement('div'); el.id = 'sscan'; el.className = 'sscan'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title || TITLES[mode]);
  el.innerHTML = `<div class="ss-card"><div class="ss-top"><b>${esc(title || TITLES[mode])}</b>${expected ? `<span class="ss-exp">Reviewing <b class="mono">${esc(expected)}</b></span>` : ''}<span class="ss-locb" hidden></span><button class="ibtn" data-ss="close" aria-label="Close">${ic('x')}</button></div>` +
    `<div class="ss-body"><div class="ss-left"><div class="ss-stage"><video muted playsinline></video><div class="ss-box" hidden><i class="h tl"></i><i class="h br"></i></div><div class="ss-empty">${ic('expand')}<b>Share the window with the report</b><span>Then draw a box over the ${kind === 'rows' ? 'whole report rows (location to SOH)' : 'LOCATION and KEYCODE columns'}.</span><button class="btn primary" data-ss="share">Share a screen</button></div></div>` +
    `<div class="ss-ctl"><button class="btn sm" data-ss="test" disabled>Test read</button><button class="btn sm primary" data-ss="go" disabled>Start reading</button><button class="btn sm" data-ss="preset" disabled title="Every desk sharing a screen this size starts with this box">Save as store preset</button><button class="btn sm" data-ss="reshare" hidden>Share another window</button><span class="ss-peek" hidden><canvas></canvas><small>what the OCR sees</small></span></div>` +
    `<div class="ss-status" role="status">Drag across the shared screen to draw the box. Zoom the report up for bigger digits.</div></div>` +
    `<div class="ss-right"><div class="ss-count"><b>0</b><span>${kind === 'rows' ? 'rows' : 'codes'}</span></div><div class="ss-flags"></div><div class="ss-list"></div><div class="ss-acts"></div></div></div></div>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s), video = $('video'), stage = $('.ss-stage'), box = $('.ss-box'), status = t => { $('.ss-status').textContent = t; };
  let stream = null, region = null, capturing = false, busy = false, timer = null, prevSig = null, settled = false, lastRead = 0, showAll = false, closed = false;
  const tally = { codes: {}, locs: {} }, items = {};

  // The video's drawn rectangle inside the stage (object-fit: contain).
  const content = () => { const r = stage.getBoundingClientRect(), vw = video.videoWidth || 16, vh = video.videoHeight || 9, s = Math.min(r.width / vw, r.height / vh); return { x: (r.width - vw * s) / 2, y: (r.height - vh * s) / 2, w: vw * s, h: vh * s, left: r.left, top: r.top }; };
  const place = () => { if (!region) { box.hidden = true; return; } const c = content(); Object.assign(box.style, { left: `${c.x + region.x * c.w}px`, top: `${c.y + region.y * c.h}px`, width: `${region.w * c.w}px`, height: `${region.h * c.h}px` }); box.hidden = false; };
  const setRegion = (r, why) => { region = r; place(); for (const b of ['test', 'go', 'preset']) $(`[data-ss="${b}"]`).disabled = !r; if (r) remember(kind, { ...r, size: `${video.videoWidth}x${video.videoHeight}` }); if (why) status(why); };

  async function share() {
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'never', width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
      video.srcObject = stream; await video.play().catch(() => {});
      await new Promise(r => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));
      stream.getVideoTracks()[0]?.addEventListener('ended', () => { stopCapture(); status('Sharing stopped. Share the window again to carry on.'); $('.ss-empty').hidden = false; });
      $('.ss-empty').hidden = true; $('[data-ss="reshare"]').hidden = false;
      const size = `${video.videoWidth}x${video.videoHeight}`, presets = Object.fromEntries(Object.entries(ctx.store.get('scanPresets') || {}).filter(([k]) => k.startsWith(kind + ':')).map(([k, v]) => [k.slice(kind.length + 1), v]));
      const p = matchPreset(presets, video.videoWidth, video.videoHeight), mine = remembered(kind);
      if (p) setRegion({ x: p.x, y: p.y, w: p.w, h: p.h }, `The store preset for ${size} is applied. Test read, then start and scroll slowly.`);
      else if (mine && mine.size === size) setRegion({ x: mine.x, y: mine.y, w: mine.w, h: mine.h }, 'Your last box for this size is applied. Redraw it if the report moved.');
      else status(`Sharing ${size}. Drag across the report to draw the box.`);
      ocr().catch(e => status(e.message));            // warm the engine while the box is drawn
    } catch (e) { status(e?.name === 'NotAllowedError' ? 'Sharing was cancelled.' : `Could not share the screen: ${e.message}`); }
  }

  // Draw a box by dragging; drag inside it to move it; the corner handles resize.
  let drag = null;
  stage.addEventListener('pointerdown', e => {
    if (!stream || e.button !== 0 || e.target.closest('.ss-empty')) return;
    const c = content(), px = (e.clientX - c.left - c.x) / c.w, py = (e.clientY - c.top - c.y) / c.h;
    if (px < 0 || py < 0 || px > 1 || py > 1) return;
    const handle = e.target.closest('.h'), inside = region && px >= region.x && px <= region.x + region.w && py >= region.y && py <= region.y + region.h;
    drag = handle ? { kind: handle.classList.contains('tl') ? 'tl' : 'br', r: { ...region } } : inside ? { kind: 'move', px, py, r: { ...region } } : { kind: 'new', px, py };
    stage.setPointerCapture(e.pointerId); e.preventDefault();
  });
  stage.addEventListener('pointermove', e => {
    if (!drag) return;
    const c = content(), px = Math.max(0, Math.min(1, (e.clientX - c.left - c.x) / c.w)), py = Math.max(0, Math.min(1, (e.clientY - c.top - c.y) / c.h));
    let r;
    if (drag.kind === 'new') r = { x: Math.min(drag.px, px), y: Math.min(drag.py, py), w: Math.abs(px - drag.px), h: Math.abs(py - drag.py) };
    else if (drag.kind === 'move') r = { ...drag.r, x: Math.max(0, Math.min(1 - drag.r.w, drag.r.x + px - drag.px)), y: Math.max(0, Math.min(1 - drag.r.h, drag.r.y + py - drag.py)) };
    else if (drag.kind === 'br') r = { ...drag.r, w: Math.max(0.01, px - drag.r.x), h: Math.max(0.01, py - drag.r.y) };
    else { const x2 = drag.r.x + drag.r.w, y2 = drag.r.y + drag.r.h; r = { x: Math.min(px, x2 - 0.01), y: Math.min(py, y2 - 0.01), w: x2 - Math.min(px, x2 - 0.01), h: y2 - Math.min(py, y2 - 0.01) }; }
    region = r; place();
  });
  stage.addEventListener('pointerup', () => { if (!drag) return; drag = null; if (region && region.w > 0.01 && region.h > 0.01) { setRegion(region, 'Box set. Test read to check it, then start and scroll slowly.'); prevSig = null; } else setRegion(null); });
  const onKey = e => {
    if (e.key === 'Escape') { close(); return; }
    if (!region || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || e.target.closest('input,textarea')) return;
    e.preventDefault(); const st = e.shiftKey ? 0.01 : 0.002, r = { ...region };
    if (e.altKey) { if (e.key === 'ArrowRight') r.w += st; if (e.key === 'ArrowLeft') r.w = Math.max(0.01, r.w - st); if (e.key === 'ArrowDown') r.h += st; if (e.key === 'ArrowUp') r.h = Math.max(0.01, r.h - st); }
    else { if (e.key === 'ArrowRight') r.x += st; if (e.key === 'ArrowLeft') r.x -= st; if (e.key === 'ArrowDown') r.y += st; if (e.key === 'ArrowUp') r.y -= st; }
    r.x = Math.max(0, Math.min(1 - r.w, r.x)); r.y = Math.max(0, Math.min(1 - r.h, r.y)); setRegion(r);
  };
  document.addEventListener('keydown', onKey);
  const onResize = () => place(); window.addEventListener('resize', onResize);

  // One frame: crop, upscale ×3 (capped), pad 24 px white, Otsu threshold, OCR.
  const work = document.createElement('canvas');
  async function readFrame() {
    if (!region || !video.videoWidth) return [];
    const sx = region.x * video.videoWidth, sy = region.y * video.videoHeight, sw = region.w * video.videoWidth, sh = region.h * video.videoHeight;
    let ow = Math.round(sw * 3), oh = Math.round(sh * 3); const k = Math.min(1, 4000 / Math.max(ow, oh)); ow = Math.max(1, Math.round(ow * k)); oh = Math.max(1, Math.round(oh * k));
    const pad = 24; work.width = ow + pad * 2; work.height = oh + pad * 2;
    const g = work.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, work.width, work.height); g.imageSmoothingQuality = 'high'; g.drawImage(video, sx, sy, sw, sh, pad, pad, ow, oh);
    const img = g.getImageData(pad, pad, ow, oh), d = img.data, hist = new Array(256).fill(0), lum = new Uint8Array(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) { const v = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0; lum[j] = v; hist[v]++; }
    // A light-on-dark report is inverted first so the text is dark.
    const t = otsu(hist, lum.length), dark = lum.reduce((n, v) => n + (v < t ? 1 : 0), 0) > lum.length / 2;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) { const v = (lum[j] < t) !== dark ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; }
    g.putImageData(img, pad, pad);
    const peek = el.querySelector('.ss-peek canvas'), s = Math.min(130 / work.width, 300 / work.height, 1); peek.width = Math.max(1, work.width * s); peek.height = Math.max(1, work.height * s); peek.getContext('2d').drawImage(work, 0, 0, peek.width, peek.height); $('.ss-peek').hidden = false;
    const w = await ocr();
    if (tessMode !== kind) { await w.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: kind === 'rows' ? '0123456789.,-/ ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '0123456789' }); tessMode = kind; }
    const res = await w.recognize(work, {}, { blocks: true });
    const words = []; const push = x => { const b = x?.bbox; if (x?.text && b) words.push({ text: x.text, x: b.x0, y: b.y0, h: b.y1 - b.y0 }); };
    for (const b of res?.data?.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const x of l.words || []) push(x);
    return words.length >= 2 ? wordsToRows(words, kind === 'rows') : String(res?.data?.text || '').split(/[\r\n]+/);
  }
  const take = lines => { if (kind === 'rows') { const before = Object.keys(items).length; parseReport(lines.join('\n'), items); return Object.keys(items).length - before; } return ingest(tally, lines); };

  // Read only once the report stops moving (a scroll blurs a frame), and
  // again every four seconds while it rests.
  const sample = document.createElement('canvas'); sample.width = 24; sample.height = 24;
  function signature() { const g = sample.getContext('2d', { willReadFrequently: true }); g.drawImage(video, region.x * video.videoWidth, region.y * video.videoHeight, region.w * video.videoWidth, region.h * video.videoHeight, 0, 0, 24, 24); const d = g.getImageData(0, 0, 24, 24).data, out = new Uint8Array(576); for (let i = 0; i < 576; i++) out[i] = d[i * 4]; return out; }
  async function tick() {
    if (!capturing || busy || !region) return;
    const sig = signature(); let diff = 0; if (prevSig) for (let i = 0; i < 576; i++) diff += Math.abs(sig[i] - prevSig[i]); prevSig = sig;
    if (diff / 576 > 4) { settled = false; status('Moving… pause a moment on each screenful.'); return; }
    if (settled && Date.now() - lastRead < 4000) return;
    busy = true;
    try { const added = take(await readFrame()); settled = true; lastRead = Date.now(); status(added ? `Reading · +${added} this frame. Scroll on slowly.` : 'Reading · nothing new in this frame. Scroll on, or redraw the box if digits are clipped.'); render(); }
    catch (e) { status(`OCR hiccup: ${e.message}. Still reading.`); }
    busy = false;
  }
  function startCapture() { capturing = true; settled = false; prevSig = null; $('[data-ss="go"]').textContent = 'Stop reading'; status('Reading. Scroll the report slowly from top to bottom.'); timer = setInterval(tick, 500); }
  function stopCapture() { capturing = false; clearInterval(timer); timer = null; const b = $('[data-ss="go"]'); if (b) b.textContent = Object.keys(tally.codes).length || Object.keys(items).length ? 'Read more' : 'Start reading'; }

  function render() {
    const lv = locVerdict(kind === 'rows' ? Object.fromEntries(Object.values(items).map(r => [r.loc, 2])) : tally.locs, expected), lb = $('.ss-locb');
    lb.hidden = !(lv.state === 'match' || lv.state === 'mismatch'); lb.className = `ss-locb ${lv.state === 'match' ? 'ok' : 'bad'}`; lb.textContent = lv.state === 'match' ? `✓ Loc ${lv.seen}` : lv.state === 'mismatch' ? `⚠ Loc ${lv.seen} ≠ ${lv.expected}` : '';
    if (kind === 'rows') {
      const rows = Object.values(items).sort((a, b) => byLoc(a.loc, b.loc) || a.kc.localeCompare(b.kc));
      $('.ss-count b').textContent = rows.length; $('.ss-flags').textContent = rows.length ? `${new Set(rows.map(r => r.loc)).size} locations · rows merge by keycode, so overlapping frames are harmless` : '';
      $('.ss-list').innerHTML = rows.length ? `<table class="wb-t"><thead><tr><th>Loc</th><th>Keycode</th><th class="n">SOH</th><th class="n">Price</th></tr></thead><tbody>${rows.slice(0, 400).map(r => `<tr><td class="mono">${esc(r.loc)}</td><td class="mono">${esc(r.kc)}</td><td class="n">${r.soh}</td><td class="n">${r.price ?? ''}</td></tr>`).join('')}</tbody></table>` : '<p class="lbl">Rows appear here as frames are read.</p>';
    } else {
      const all = Object.keys(tally.codes), codes = filtered(tally, showAll), hidden = all.length - codes.length;
      $('.ss-count b').textContent = codes.length;
      $('.ss-flags').innerHTML = `${lv.state === 'match' ? `<span class="status good">✓ Location ${esc(lv.seen)} verified</span> ` : lv.state === 'mismatch' ? `<span class="status bad">⚠ The report reads location ${esc(lv.seen)}: you are reviewing ${esc(lv.expected)}</span> ` : ''}${showAll ? `all ${all.length} raw reads` : `${codes.length} keycodes${hidden ? ` · ${hidden} noise reads filtered` : ''}`} <button class="go" data-ss="all">${showAll ? 'Show filtered' : 'Show all reads'}</button>`;
      $('.ss-list').innerHTML = codes.map(c => `<button class="ss-chip${c.length !== 8 ? ' odd' : ''}" data-ss="rm" data-code="${esc(c)}" title="Read ${tally.codes[c].count} times · click to remove if wrong"><span class="mono">${esc(c)}</span><small>${tally.codes[c].count}×</small></button>`).join('') || '<p class="lbl">Codes appear here as frames are read.</p>';
    }
    const n = Number($('.ss-count b').textContent), use = { compare: `Use ${n} codes for ${expected || 'the bay'}`, soh: `Add ${n} to SOH adjustments`, rows: `Add ${n} rows to the SOH report`, list: `Make a barcode list of ${n}` }[mode];
    $('.ss-acts').innerHTML = `<button class="btn primary" data-ss="use"${n ? '' : ' disabled'}>${esc(use)}</button><button class="btn sm" data-ss="csv"${n ? '' : ' disabled'}>${ic('file')}CSV</button><button class="btn sm" data-ss="xls"${n ? '' : ' disabled'}>${ic('file')}Excel</button><button class="btn sm" data-ss="reset"${n ? '' : ' disabled'}>Clear</button>`;
  }
  function exportAs(fmt) {
    const rows = kind === 'rows' ? Object.values(items).map(r => [r.loc, r.kc, r.soh, r.price ?? '']) : filtered(tally, showAll).map(c => [c, tally.codes[c].loc || '', tally.codes[c].count]);
    const head = kind === 'rows' ? ['Location', 'Keycode', 'SOH', 'Price'] : ['Keycode', 'Location', 'Times seen'];
    const name = `scanned-${kind === 'rows' ? 'soh' : 'codes'}-${ctx.storeNo}-${new Date().toISOString().slice(0, 10)}`;
    let blob;
    if (fmt === 'xls') {
      // An HTML table saved as .xls: Excel opens it in columns and the text
      // format keeps keycodes whole.
      const td = (v, txt) => `<td${txt ? ` style="mso-number-format:'\\@'"` : ''}>${esc(v)}</td>`;
      blob = new Blob(['﻿<html><head><meta charset="utf-8"></head><body><table border="1"><tr>' + head.map(h => `<th>${esc(h)}</th>`).join('') + '</tr>' + rows.map(r => `<tr>${r.map((v, i) => td(v, i < 2)).join('')}</tr>`).join('') + '</table></body></html>'], { type: 'application/vnd.ms-excel;charset=utf-8' });
    } else blob = new Blob(['﻿' + csvLines(head, rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.${fmt}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`Exported ${rows.length} ${kind === 'rows' ? 'rows' : 'codes'}`);
  }
  function close() { closed = true; stopCapture(); stream?.getTracks().forEach(t => t.stop()); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); el.remove(); }

  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-ss]'); if (!b) return;
    const a = b.dataset.ss;
    if (a === 'close') close();
    else if (a === 'share' || a === 'reshare') { stopCapture(); stream?.getTracks().forEach(t => t.stop()); await share(); }
    else if (a === 'test') { if (busy) return; busy = true; status('Test read…'); try { const lines = await readFrame(), t = { codes: {}, locs: {} }; if (kind === 'rows') { const r = parseReport(lines.join('\n')); status(r.rows ? `Test read: ${r.rows} rows, e.g. ${Object.values(r.items).slice(0, 2).map(x => `${x.loc} ${x.kc} SOH ${x.soh}`).join(' · ')}` : `Test read found no full rows: widen the box to take in the SOH column. Saw: ${lines.slice(0, 2).join(' | ').slice(0, 90)}`); } else { ingest(t, lines); const c = filtered(t); status(c.length ? `Test read: ${c.length} codes, e.g. ${c.slice(0, 4).join(', ')}` : `Test read found no clean codes: zoom the report bigger, or redraw the box over the two columns. Saw: ${lines.slice(0, 2).join(' | ').slice(0, 90)}`); } } catch (err) { status(err.message); } busy = false; }
    else if (a === 'go') capturing ? stopCapture() : startCapture();
    else if (a === 'preset') { const size = `${video.videoWidth}x${video.videoHeight}`; try { await ctx.store.dispatch({ type: 'scan.preset', entity: { size }, payload: { kind, ...region } }); status(`✓ Saved as the store preset for ${size}: it applies for every desk sharing a screen this size.`); } catch (err) { status(err.message); } }
    else if (a === 'all') { showAll = !showAll; render(); }
    else if (a === 'rm') { delete tally.codes[b.dataset.code]; render(); }
    else if (a === 'reset') { if (!confirm('Clear everything read so far?')) return; for (const k of Object.keys(tally.codes)) delete tally.codes[k]; for (const k of Object.keys(tally.locs)) delete tally.locs[k]; for (const k of Object.keys(items)) delete items[k]; render(); }
    else if (a === 'csv' || a === 'xls') exportAs(a);
    else if (a === 'use') {
      const lv = locVerdict(tally.locs, expected);
      if (mode === 'compare' && lv.state === 'mismatch' && !confirm(`⚠ LOCATION MISMATCH\n\nThe captured report reads location ${lv.seen}, but you are reviewing ${lv.expected}. This usually means the wrong report is open.\n\nUse these codes anyway?`)) return;
      const codes = filtered(tally, showAll), out = kind === 'rows' ? { items: { ...items } } : { codes, locs: Object.fromEntries(codes.map(c => [c, tally.codes[c].loc || ''])) };
      close(); onUse?.(out);
    }
  });
  render();
  share();
  return { close };
}
