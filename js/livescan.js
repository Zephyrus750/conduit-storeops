// Read the PDT's list (K2B's Live Scanner, in Conduit). Hold the PDT's
// backfill list in the camera's window: about once a second the frame is
// read by Tesseract (self-hosted, vendor/tesseract, the engine Screen scan
// uses) and each keycode gets a box: amber while it is checked, green once
// it is in, red when it is held as a possible misread. A product barcode in
// the same camera goes straight in.
//
// The rules are shared/livescan.js: a code on today's list for the bay goes
// in on the first read, others on two reads (three when the catalogue does
// not know them), and a code one digit from one already in or on the list is
// held for the person to decide. Torch, zoom (slider and pinch), tap to
// focus and a low-light hint are on the camera; the screen stays awake while
// it reads. The count and Done sit in a strip at the foot; the strip opens a
// panel with every code read and why it went in.
//
// A switch at the top picks what the camera reads: the PDT's list (the
// default, where a product barcode in view still goes straight in) or
// Barcode, one barcode at a time in a window shaped for it, with no text
// reading (the phone's barcode reader, or ZXing where there is none).
//
//   openLiveReader({ title, mode, expected, have, verify, add, label, held, onHeldChange, onClose }) → close()
//     mode       'pdt' (the default) or 'barcode': where the switch starts
//     expected   codes on today's list (first read is enough); [] for none
//     have()     the codes already in (a Set), asked fresh each time
//     verify(code) → 'ok' | 'unknown' | 'error'   the catalogue's word on it
//     add(code)  → true when it went in; false refuses it for this reading
//     label(code) → html: the product's name for the panel
//     held       a Map the caller keeps (code → { fix }), so held codes outlast the camera
//   warmReader()  loads the engine ahead of use (a bay opening on a phone)
//   heldRows(held, label) → html, and resolveHeld(held, code, how) → the code to add or null:
//     the held codes' Use / Keep / Remove, for the screen behind the camera too

import { ic, esc, toast } from './ui.js';
import { feedback, barcodeReader } from './scan.js';
import { codesIn, preprocess, decide, misreadFix } from '../shared/livescan.js';
import { tx, txn } from './i18n.js';

const TICK_MS = 180, OCR_MS = 900, PENDING_MS = 12000, BOX_MS = 2500;
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

// ── the engine: loaded once, kept warm between readings ──
let tessP = null;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(tx('The reader did not load: check the connection.'))); document.head.appendChild(s); }); }
function engine() {
  tessP ||= (async () => {
    if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
    const b = new URL('vendor/tesseract/', location.href).href;
    const w = await window.Tesseract.createWorker('eng', 1, { workerPath: b + 'worker.min.js', corePath: b + 'tesseract-core-simd-lstm.wasm.js', langPath: b.replace(/\/$/, ''), gzip: true, workerBlobURL: false });
    // Sparse text, digits only, as K2B: the PDT's list is columns of numbers.
    await w.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '0123456789 ' });
    return w;
  })().catch(e => { tessP = null; throw e; });
  return tessP;
}
export function warmReader() {
  if (tessP || !navigator.mediaDevices?.getUserMedia) return;
  const go = () => engine().catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 1500);
}

// ── held codes: the same three choices on the camera and behind it ──
const digitsWithMark = (code, at) => at < 0 ? esc(code) : `${esc(code.slice(0, at))}<mark>${esc(code[at])}</mark>${esc(code.slice(at + 1))}`;
export function heldRows(held, label = () => '') {
  return [...held].map(([code, h]) => {
    const fix = h.fix, why = fix ? (h.onList ? tx('One digit from {code} on today’s list.', { code: `<b class="mono">${esc(fix.use)}</b>` }) : tx('One digit from {code}, already in.', { code: `<b class="mono">${esc(fix.use)}</b>` })) : tx('Not in the catalogue.');
    return `<div class="ls-held"><div class="ls-hc"><span class="mono">${digitsWithMark(code, fix ? fix.at : -1)}</span><span class="ls-hw">${why} ${label(code)}</span></div><div class="ls-ha">` +
      (fix ? `<button type="button" class="btn sm primary" data-held="use" data-code="${esc(code)}">${tx('Use {code}', { code: esc(fix.use) })}</button>` : '') +
      `<button type="button" class="btn sm" data-held="keep" data-code="${esc(code)}">${tx('It’s right: keep it')}</button><button type="button" class="btn sm" data-held="drop" data-code="${esc(code)}">${tx('Remove it')}</button></div></div>`;
  }).join('');
}
export function resolveHeld(held, code, how) {
  const h = held.get(code); if (!h) return null;
  held.delete(code);
  return how === 'use' ? h.fix?.use || null : how === 'keep' ? code : null;
}

let current = null;
export function openLiveReader({ title = tx('Read the PDT'), mode: firstMode = 'pdt', expected = [], have = () => new Set(), verify = async () => 'error', add = async () => true, label = () => '', held = new Map(), onHeldChange = () => {}, onClose = () => {} } = {}) {
  current?.close();
  const exp = new Set(expected);
  const el = document.createElement('div'); el.className = 'ls'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', title);
  el.innerHTML = `<div class="ls-top"><button type="button" class="ls-ib" data-ls="close" aria-label="${tx('Close')}">${ic('x')}</button><div class="ls-tt"><b>${esc(title)}</b><span class="ls-st"><i></i><span>${tx('Starting the camera…')}</span></span></div><button type="button" class="ls-ib" data-ls="torch" hidden aria-label="${tx('Torch')}">${ic('bolt')}</button></div>` +
    `<div class="ls-view"><video playsinline muted></video><canvas class="ls-hl" aria-hidden="true"></canvas><div class="ls-win" aria-hidden="true"><i class="ls-line"></i></div><div class="ls-seg" role="group" aria-label="${tx('What the camera reads')}"><button type="button" data-ls="mode" data-mode="pdt">${ic('file')}${tx('PDT list')}</button><button type="button" data-ls="mode" data-mode="barcode">${ic('barcode')}${tx('Barcode')}</button></div><span class="ls-hint" hidden></span><i class="ls-focus" hidden></i></div>` +
    `<div class="ls-zoom" hidden><span>1×</span><input type="range" aria-label="${tx('Zoom')}"><span class="ls-zmax"></span></div>` +
    `<div class="ls-chips" aria-live="polite"></div><div class="ls-panel" hidden></div>` +
    `<div class="ls-strip"><button type="button" class="ls-up" data-ls="panel" aria-label="${tx('Show what was read')}">${ic('chev')}</button><button type="button" class="ls-g" data-ls="panel"><b></b><span></span></button><button type="button" class="btn sm ls-check" data-ls="check" hidden></button><button type="button" class="btn sm primary ls-done" data-ls="close">${tx('Done')}</button></div>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s), video = $('video'), view = $('.ls-view'), hl = $('.ls-hl'), win = $('.ls-win'), panel = $('.ls-panel'), torchBtn = $('[data-ls="torch"]');
  const say = t => { $('.ls-st span').textContent = t; };
  const work = document.createElement('canvas'), w2d = work.getContext('2d', { willReadFrequently: true });
  let mode = 'pdt', zread = null, zLoading = null, stream = null, track = null, caps = {}, closed = false, timer = null, raf = 0, detector = null, ocrBusy = false, lastOcr = 0, pass = 0, torch = false, dark = 0, lock = null, crop = null, zoom = null;
  const reads = new Map(), dismissed = new Set(), session = [];

  // ── what was read: wait, add, hold ──
  const why = r => r.src === 'barcode' ? tx('Barcode') : exp.has(r.code) ? tx('On today’s list') : r.verdict === 'ok' ? tx('Read twice · a product') : r.verdict === 'unknown' ? tx('Read 3 times · not in the catalogue') : tx('Read twice · catalogue not reached');
  function consider(code, box, src = 'text') {
    if (dismissed.has(code)) return;
    const now = Date.now();
    let r = reads.get(code);
    if (!r || (r.state === 'wait' && now - r.first > PENDING_MS)) {
      r = { code, n: 0, first: now, state: 'wait', src, verdict: src === 'barcode' || exp.has(code) ? 'ok' : 'checking' };
      reads.set(code, r);
      if (r.verdict === 'checking') Promise.resolve(verify(code)).catch(() => 'error').then(v => { r.verdict = v || 'error'; settle(r); });
    }
    r.n += src === 'barcode' ? 3 : 1; if (box) r.box = box; r.seen = now;
    settle(r);
  }
  function settle(r) {
    if (closed || r.state === 'in' || r.state === 'adding') return;
    if (held.has(r.code)) { r.look = 'held'; return; }
    const d = decide({ code: r.code, reads: r.n, verdict: r.verdict, have: have(), expected: exp });
    if (d === 'already') { r.state = 'in'; r.look = 'already'; }
    else if (d === 'add') accept(r, r.code);
    else if (d === 'hold') {
      const fix = misreadFix(r.code, { have: have(), expected: exp });
      held.set(r.code, { fix, onList: !!fix && exp.has(fix.use) && !have().has(fix.use) }); r.look = 'held';
      try { navigator.vibrate?.([40, 60, 40]); } catch {}
      onHeldChange(); paint();
    } else r.look = 'wait';
  }
  function accept(r, code, reason) {
    r.state = 'adding'; r.look = 'in';
    Promise.resolve(add(code)).then(ok => {
      if (closed) return;
      if (ok === false) { r.state = 'out'; dismissed.add(r.code); return paint(); }
      r.state = 'in'; session.unshift({ code, why: reason || why(r) }); feedback(); chip(code); paint();
    }).catch(e => { r.state = 'wait'; toast(e.message, 'bad'); });
  }
  const chip = code => { const c = $('.ls-chips'), s = document.createElement('span'); s.className = 'ls-chip mono'; s.textContent = code; c.prepend(s); while (c.children.length > 6) c.lastChild.remove(); };

  // ── the strip and its panel ──
  function paint() {
    if (closed) return;
    const n = have().size, h = held.size;
    $('.ls-g b').textContent = txn(n, '{n} code in', '{n} codes in');
    $('.ls-g span').textContent = session.length ? txn(session.length, '{n} read now', '{n} read now') + (h ? ` · ${txn(h, '{n} held', '{n} held')}` : '') : mode === 'barcode' ? tx('Point the camera at the barcode') : tx('Hold the PDT’s list in the window');
    const chk = $('.ls-check'); chk.hidden = !h; chk.textContent = tx('Check {n}', { n: h });
    if (!panel.hidden) panel.innerHTML = panelHtml();
  }
  const panelHtml = () => `<div class="ls-ph"><b>${tx('Read this time')}</b><button type="button" class="btn sm" data-ls="panel">${tx('Close')}</button></div>` +
    (held.size ? `<div class="ls-sub">${tx('Held: check each one')}</div>${heldRows(held, label)}` : '') +
    (session.length ? session.map(s => `<div class="ls-row"><span class="mono">${esc(s.code)}</span><span class="ls-nm">${label(s.code)}</span><small>${esc(s.why)}</small></div>`).join('') : `<p class="ls-none">${tx('Nothing read yet.')} ${tx('Hold the list steady in the window, about a hand away.')}</p>`);
  const togglePanel = (open = panel.hidden) => { panel.hidden = !open; el.classList.toggle('open', open); if (open) panel.innerHTML = panelHtml(); };

  // ── boxes over the codes: the frame's pixels to the screen ──
  const cover = () => { const vw = video.videoWidth, vh = video.videoHeight, r = view.getBoundingClientRect(); if (!vw || !vh) return null; const s = Math.max(r.width / vw, r.height / vh); return { s, x: (r.width - vw * s) / 2, y: (r.height - vh * s) / 2, w: r.width, h: r.height }; };
  function placeWindow() { const c = cover(); if (!c || !crop) return; Object.assign(win.style, { left: `${crop.x * c.s + c.x}px`, top: `${crop.y * c.s + c.y}px`, width: `${crop.w * c.s}px`, height: `${crop.h * c.s}px` }); }
  const COLOUR = { wait: '245,158,11', in: '34,197,94', already: '34,197,94', held: '239,68,68' };
  function draw() {
    raf = 0; if (closed) return;
    const c = cover(), dpr = window.devicePixelRatio || 1, g = hl.getContext('2d');
    if (!c) { raf = requestAnimationFrame(draw); return; }
    if (hl.width !== Math.round(c.w * dpr)) { hl.width = Math.round(c.w * dpr); hl.height = Math.round(c.h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, c.w, c.h);
    const now = Date.now();
    for (const r of reads.values()) {
      if (!r.box || !r.look || now - r.seen > BOX_MS + 500) continue;
      const a = Math.max(0, Math.min(1, 1 - (now - r.seen - BOX_MS) / 500)), rgb = COLOUR[r.look] || COLOUR.wait, dim = r.look === 'already' ? 0.5 : 1;
      const x = r.box.x0 * c.s + c.x - 5, y = r.box.y0 * c.s + c.y - 5, w = (r.box.x1 - r.box.x0) * c.s + 10, h = (r.box.y1 - r.box.y0) * c.s + 10;
      if (w * h > 0.35 * c.w * c.h) continue;   // a box stitched across half the frame is never one code
      g.fillStyle = `rgba(${rgb},${0.22 * a * dim})`; g.strokeStyle = `rgba(${rgb},${0.9 * a * dim})`; g.lineWidth = 2;
      g.setLineDash(r.look === 'wait' ? [5, 4] : []);
      g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 5) : g.rect(x, y, w, h); g.fill(); g.stroke(); g.setLineDash([]);
      const m = r.look === 'held' ? '!' : r.look === 'wait' ? `${Math.min(r.n, 3)}/${r.verdict === 'unknown' ? 3 : 2}` : '✓';
      g.fillStyle = `rgba(${rgb},${a})`; g.beginPath(); g.arc(x + w + 9, y + h / 2, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(255,255,255,${a})`; g.font = '800 10px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(m, x + w + 9, y + h / 2 + 0.5);
    }
    raf = requestAnimationFrame(draw);
  }

  // ── reading: barcodes every tick, the screen about once a second ──
  function loop() {
    clearTimeout(timer); if (closed || !stream) return;
    timer = setTimeout(async () => {
      if (video.readyState >= 2) {
        if (mode === 'barcode') { if (zread) try { for (const c of await zread(video)) barcode(c); } catch { /* a frame that fails to decode is normal */ } }
        else {
          if (detector) try { for (const b of await detector.detect(video)) barcode(b.rawValue); } catch { /* a frame that fails to decode is normal */ }
          if (!ocrBusy && Date.now() - lastOcr >= OCR_MS) readText();
        }
      }
      loop();
    }, TICK_MS);
  }
  function barcode(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    if (!(d.length === 7 || d.length === 8 || (d.length === 13 && ean13(d)))) return;
    if (mode === 'pdt') flashMode(); consider(d, null, 'barcode');
  }
  // A barcode read while on the PDT's list lights the Barcode side of the switch for a moment.
  let modeT = 0;
  const flashMode = () => { const b = $('.ls-seg [data-mode="barcode"]'); b.classList.add('ping'); clearTimeout(modeT); modeT = setTimeout(() => b.classList.remove('ping'), 1200); };
  // The switch: the PDT's list, or one barcode at a time (the reader loads on first use).
  function setMode(m) {
    mode = m === 'barcode' ? 'barcode' : 'pdt';
    el.classList.toggle('bc', mode === 'barcode');
    for (const b of el.querySelectorAll('[data-ls="mode"]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    if (mode === 'barcode') {
      if (stream) { el.classList.add('live'); say(tx('Point the camera at the barcode')); }
      if (!zread && !zLoading) zLoading = barcodeReader().then(r => { zread = r; }).catch(e => { zLoading = null; say(e.message); });
    } else if (stream) say(tessP ? tx('Reading · hold the list in the window') : tx('Loading the reader…'));
    paint();
  }
  async function readText() {
    if (mode !== 'pdt') return;
    ocrBusy = true; lastOcr = Date.now();
    try {
      const w = await engine(); if (closed || mode !== 'pdt') return;
      el.classList.add('live'); say(tx('Reading · hold the list in the window'));
      const vw = video.videoWidth, vh = video.videoHeight; if (!vw || !vh) return;
      crop = { x: Math.floor(vw * 0.05), y: Math.floor(vh * 0.13), w: Math.floor(vw * 0.9), h: Math.floor(vh * 0.57) }; placeWindow();
      // 800 px wide at most: a bigger frame downsampled thins the digits (K2B, field-tested).
      const sc = Math.min(1, 800 / crop.w); work.width = Math.floor(crop.w * sc); work.height = Math.floor(crop.h * sc);
      w2d.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, work.width, work.height);
      const img = w2d.getImageData(0, 0, work.width, work.height), mean = preprocess(img.data, work.width, work.height, (++pass & 1) === 1);
      w2d.putImageData(img, 0, 0); lowLight(mean);
      const res = await w.recognize(work, {}, { blocks: true }); if (closed || mode !== 'pdt') return;
      const words = [];
      for (const b of res?.data?.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const x of l.words || []) words.push(x);
      for (const { code, bbox } of codesIn(words, res?.data?.text || '')) consider(code, bbox && { x0: bbox.x0 / sc + crop.x, y0: bbox.y0 / sc + crop.y, x1: bbox.x1 / sc + crop.x, y1: bbox.y1 / sc + crop.y });
    } catch (e) { if (!closed) say(e.message || tx('The reader did not load: check the connection.')); }
    finally { ocrBusy = false; }
  }
  function lowLight(mean) {
    const hint = $('.ls-hint');
    if (torch) { dark = 0; hint.hidden = true; return; }
    if (mean < 60) dark++; else if (mean >= 70) dark = 0;
    if (dark >= 3) { hint.textContent = caps.torch ? tx('Low light: tap the torch') : tx('Low light: more light will help'); hint.hidden = false; } else if (!dark) hint.hidden = true;
  }

  // ── the camera: start, stop, torch, zoom, focus, wake ──
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) { say(tx('No camera here: type the codes instead.')); return; }
    try {
      // 1280 wide, not more: the read is capped at 800 px and a bigger source thins the digits.
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (closed) return stop();
      video.srcObject = stream; await video.play().catch(() => {});
      track = stream.getVideoTracks()[0]; caps = track?.getCapabilities?.() || {};
      torchBtn.hidden = !caps.torch;
      const focus = caps.focusMode || [], mode = focus.includes('continuous') ? 'continuous' : focus.includes('single-shot') ? 'single-shot' : null;
      if (mode) { const c = { focusMode: mode }; if (caps.focusDistance) c.focusDistance = Math.max(caps.focusDistance.min || 0, Math.min(0.3, caps.focusDistance.max || 1)); track.applyConstraints({ advanced: [c] }).catch(() => track.applyConstraints({ advanced: [{ focusMode: mode }] }).catch(() => {})); }
      if (caps.zoom && caps.zoom.max > caps.zoom.min) {
        zoom = { min: caps.zoom.min, max: Math.min(caps.zoom.max, 8), now: track.getSettings?.().zoom || caps.zoom.min };
        const z = $('.ls-zoom input'); Object.assign(z, { min: zoom.min, max: zoom.max, step: caps.zoom.step || 0.1, value: zoom.now }); $('.ls-zmax').textContent = `${Math.round(zoom.max)}×`; $('.ls-zoom').hidden = false;
      }
      if ('BarcodeDetector' in window) { const ok = await window.BarcodeDetector.getSupportedFormats?.().catch(() => FORMATS) || FORMATS; detector = new window.BarcodeDetector({ formats: FORMATS.filter(f => ok.includes(f)) }); }
      if (mode === 'barcode') { el.classList.add('live'); say(tx('Point the camera at the barcode')); } else say(tx('Loading the reader…'));
      wake(); loop(); if (!raf) raf = requestAnimationFrame(draw);
      video.addEventListener('loadedmetadata', placeWindow);
    } catch (e) { say(e?.name === 'NotAllowedError' ? `${tx('Camera access was refused.')} ${tx('Allow it in the browser settings, or type the codes.')}` : `${tx('The camera did not start.')} ${tx('Type the codes instead.')}`); }
  }
  function stop() { clearTimeout(timer); timer = null; for (const t of stream?.getTracks() || []) t.stop(); stream = null; track = null; el.classList.remove('live'); lock?.release?.().catch?.(() => {}); lock = null; }
  async function wake() { try { lock = await navigator.wakeLock?.request('screen'); } catch { lock = null; } }
  const setZoom = v => { if (!zoom || !track) return; zoom.now = Math.max(zoom.min, Math.min(zoom.max, v)); $('.ls-zoom input').value = zoom.now; track.applyConstraints({ advanced: [{ zoom: zoom.now }] }).catch(() => {}); };
  function close() {
    if (closed) return; closed = true; stop(); cancelAnimationFrame(raf); clearTimeout(modeT); el.remove();
    document.removeEventListener('visibilitychange', onVis); window.removeEventListener('resize', placeWindow);
    if (current?.close === close) current = null;
    onClose({ added: session.map(s => s.code), held: held.size });
  }
  const onVis = () => { if (document.hidden) stop(); else if (!closed && !stream) start(); };
  document.addEventListener('visibilitychange', onVis); window.addEventListener('resize', placeWindow);

  // Pinch to zoom; a tap focuses there.
  const ptrs = new Map(); let pinch = null, moved = false;
  view.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false; if (ptrs.size === 2 && zoom) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: zoom.now }; } });
  view.addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = true; if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; setZoom(pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) || 1) / pinch.d); } });
  const up = e => {
    const was = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
    if (!was || moved || ptrs.size || !track) return;
    const r = view.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, f = $('.ls-focus');
    Object.assign(f.style, { left: `${e.clientX - r.left}px`, top: `${e.clientY - r.top}px` }); f.hidden = false; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); setTimeout(() => { f.hidden = true; }, 700);
    track.applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }], focusMode: 'single-shot' }] }).catch(() => {});
  };
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  $('.ls-zoom input').addEventListener('input', e => setZoom(Number(e.target.value)));

  el.addEventListener('click', async e => {
    const h = e.target.closest('[data-held]');
    if (h) {
      const code = h.dataset.code, use = resolveHeld(held, code, h.dataset.held);
      dismissed.add(code); onHeldChange();
      if (use) { const r = reads.get(use) || { code: use, n: 3, verdict: 'ok', state: 'wait', src: 'held' }; reads.set(use, r); accept(r, use, h.dataset.held === 'use' ? tx('Corrected from {code}', { code }) : tx('Kept as read')); }
      return paint();
    }
    const b = e.target.closest('[data-ls]'); if (!b) return;
    const act = b.dataset.ls;
    if (act === 'close') close();
    else if (act === 'mode') setMode(b.dataset.mode);
    else if (act === 'panel') togglePanel();
    else if (act === 'check') togglePanel(true);
    else if (act === 'torch' && track) { torch = !torch; try { await track.applyConstraints({ advanced: [{ torch }] }); b.classList.toggle('on', torch); if (torch) lowLight(255); } catch { torch = false; toast(tx('The torch is not available on this camera'), 'bad'); } }
  });
  el.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  setMode(firstMode); start(); engine().catch(e => { if (mode === 'pdt') say(e.message); });
  current = { close };
  return close;
}
const ean13 = c => { let s = 0; for (let i = 0; i < 12; i++) s += Number(c[i]) * (i % 2 ? 3 : 1); return (10 - (s % 10)) % 10 === Number(c[12]); };
