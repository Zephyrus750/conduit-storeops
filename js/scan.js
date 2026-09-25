// Camera scanning. One overlay for every scan on the floor, in the stockroom
// and on the dock: the phone's rear camera reads barcodes with the built-in
// BarcodeDetector (Android Chrome, the store phones) and falls back to the
// self-hosted ZXing (vendor/zxing, loaded on first use) where there is none.
// A typed or wedge-scanned code works in the same overlay, so a PDT trigger,
// a keyboard and the camera all feed one path.
//
//   openScanner({ title, hint, continuous, onCode }) → close()
//     onCode(code) is called once per new code (a repeat within 2.5 s is
//     ignored); a single scan closes the overlay, continuous keeps it open
//     with a tally. The camera is released when the overlay closes or the
//     page is hidden.
//
// Any button with data-camera="<field>" opens it for that input: each code
// is written into [data-field="<field>"] and Enter is pressed there, so the
// view's own Enter handler does the work (bfreview, cages, adjust, dock…).

import { ic, esc, toast } from './ui.js';
import { prefs } from './prefs.js';

const FORMATS = ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39', 'itf', 'qr_code', 'data_matrix'];
const REPEAT_MS = 2500, TICK_MS = 180;
let current = null;

export function openScanner({ title = 'Scan', hint = '', continuous = false, onCode } = {}) {
  current?.close();
  const el = document.createElement('div'); el.id = 'scanner'; el.className = 'scanner';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title);
  el.innerHTML = `<div class="sc-top"><b>${esc(title)}</b><button type="button" class="sc-btn" data-sc="torch" hidden aria-label="Torch">${ic('bolt')}</button><button type="button" class="sc-btn" data-sc="close" aria-label="Close the scanner">${ic('x')}</button></div>` +
    `<div class="sc-view"><video playsinline muted></video><div class="sc-frame"></div><div class="sc-msg" role="status">${esc(hint || 'Point the camera at the barcode')}</div></div>` +
    `<form class="sc-type"><input inputmode="text" autocomplete="off" autocapitalize="characters" placeholder="Or type the code" aria-label="Type the code"><button type="submit" class="sc-btn">${ic('arrow')}</button></form>` +
    (continuous ? `<div class="sc-tally" aria-live="polite"></div>` : '');
  document.body.appendChild(el);
  const video = el.querySelector('video'), msg = el.querySelector('.sc-msg'), tally = el.querySelector('.sc-tally'), torchBtn = el.querySelector('[data-sc="torch"]');
  let stream = null, timer = null, closed = false, detector = null, zx = null, busy = false, last = { code: '', at: 0 }, count = 0, torch = false;
  const say = t => { msg.textContent = t; };

  const found = code => {
    code = String(code || '').trim(); if (!code) return;
    const now = Date.now(); if (code === last.code && now - last.at < REPEAT_MS) return;
    last = { code, at: now }; count += 1;
    feedback(); el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
    if (tally) tally.innerHTML = `<b>${count}</b> scanned · last <span class="mono">${esc(code)}</span>`;
    try { onCode?.(code); } catch (e) { toast(e.message, 'bad'); }
    if (!continuous) close();
  };

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) { say('No camera here: type the code, or use the PDT trigger.'); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (closed) return stop();
      video.srcObject = stream; await video.play().catch(() => {});
      const track = stream.getVideoTracks()[0], caps = track?.getCapabilities?.() || {};
      torchBtn.hidden = !caps.torch;
      if ('BarcodeDetector' in window) {
        const supported = await window.BarcodeDetector.getSupportedFormats?.().catch(() => FORMATS) || FORMATS;
        detector = new window.BarcodeDetector({ formats: FORMATS.filter(f => supported.includes(f)) });
      } else zx = await zxing();
      loop();
    } catch (e) {
      say(e?.name === 'NotAllowedError' ? 'Camera access was refused. Allow it in the browser settings, or type the code.' : 'The camera did not start. Type the code, or use the PDT trigger.');
    }
  }
  function loop() {
    clearTimeout(timer); if (closed || !stream) return;
    timer = setTimeout(async () => {
      if (busy || video.readyState < 2) return loop();
      busy = true;
      try {
        if (detector) { const codes = await detector.detect(video); if (codes[0]?.rawValue) found(codes[0].rawValue); }
        else if (zx) { const c = zx(video); if (c) found(c); }
      } catch { /* a frame that fails to decode is normal */ }
      busy = false; loop();
    }, TICK_MS);
  }
  function stop() { clearTimeout(timer); timer = null; for (const t of stream?.getTracks() || []) t.stop(); stream = null; }
  function close() {
    if (closed) return; closed = true; stop(); el.remove(); document.removeEventListener('visibilitychange', onVis);
    if (current?.close === close) current = null;
  }
  // The camera is released while the page is hidden and taken back after.
  const onVis = () => { if (document.hidden) stop(); else if (!closed && !stream) start(); };
  document.addEventListener('visibilitychange', onVis);

  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-sc]'); if (!b) return;
    if (b.dataset.sc === 'close') close();
    if (b.dataset.sc === 'torch') { const t = stream?.getVideoTracks()[0]; torch = !torch; try { await t.applyConstraints({ advanced: [{ torch }] }); b.classList.toggle('on', torch); } catch { torch = false; } }
  });
  el.querySelector('.sc-type').addEventListener('submit', e => { e.preventDefault(); const i = e.target.querySelector('input'); found(i.value); i.value = ''; });
  el.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  start();
  current = { close };
  return close;
}

// Beep and buzz on a good read, following Settings (both on by default).
let audio = null;
function feedback() {
  const p = prefs();
  if (p.scanVibrate !== false) try { navigator.vibrate?.(60); } catch {}
  if (p.scanSound !== false) try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 1800; g.gain.value = 0.08;
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.08);
  } catch {}
}

// ZXing fallback: loads vendor/zxing once, then decodes a video frame drawn
// onto a canvas. Returns (video) → code | null.
let zxLoading = null;
function zxing() {
  zxLoading ||= new Promise((resolve, reject) => {
    if (window.ZXing) return resolve(window.ZXing);
    const s = document.createElement('script'); s.src = 'vendor/zxing/zxing.min.js';
    s.onload = () => resolve(window.ZXing); s.onerror = () => { zxLoading = null; reject(new Error('the barcode reader did not load')); };
    document.head.appendChild(s);
  }).then(Z => {
    const reader = new Z.MultiFormatReader(), hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.ITF, Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.DATA_MATRIX]);
    reader.setHints(hints);
    const canvas = document.createElement('canvas'), c2d = canvas.getContext('2d', { willReadFrequently: true });
    return video => {
      const w = video.videoWidth, h = video.videoHeight; if (!w || !h) return null;
      canvas.width = w; canvas.height = h; c2d.drawImage(video, 0, 0, w, h);
      try { return reader.decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)))).getText(); }
      catch { return null; } finally { reader.reset(); }
    };
  });
  return zxLoading;
}

// Camera buttons (ui.js camButton) open the scanner for their input.
export function installCameraButtons(root = document) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-camera]'); if (!b) return;
    e.preventDefault();
    const scope = b.closest('#content') || document, field = b.dataset.camera;
    openScanner({
      title: b.getAttribute('title') || 'Scan', continuous: b.hasAttribute('data-camera-continuous'),
      onCode: code => {
        const input = scope.querySelector(`[data-field="${CSS.escape(field)}"]`); if (!input) return;
        input.value = code; input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      },
    });
  });
}
