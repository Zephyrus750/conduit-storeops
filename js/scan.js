// Camera barcode scanning for the floor flows (Refresh, Stocktake). Wraps
// BarcodeDetector + getUserMedia in a self-contained full-screen overlay:
// each decoded code is de-bounced and handed to onCode, which resolves it to
// a shelf and does the view's work. Where the API is missing (desktop
// Firefox/Safari, or a non-secure origin) it falls back to a clear toast so
// the typed/keyboard-wedge paths stay the way in. Brand-neutral throughout.

import { ic, esc, toast } from './ui.js';

// A live camera scan needs both the detector and a camera on a secure origin.
export function scanSupported() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
}

const FORMATS = ['code_39', 'code_128', 'code_93', 'ean_13', 'ean_8', 'itf', 'qr_code'];

// openScanner({ title, hint, onCode }) → a stop() function, or null when the
// device can't scan. onCode(raw) may be async and returns { ok, message,
// close? } (or a string message, or nothing); ok:false shows a red flash.
export function openScanner({ title = 'Scan', hint = 'Point the camera at a shelf label', onCode } = {}) {
  if (!('BarcodeDetector' in window)) { toast('Live scanning is not supported on this device — type the code instead', 'bad'); return null; }
  if (!navigator.mediaDevices?.getUserMedia) { toast('No camera available here', 'bad'); return null; }

  let stream = null, raf = 0, det = null, closed = false;
  const last = { c: null, t: 0 };
  const ov = document.createElement('div');
  ov.className = 'scan-ov';
  ov.tabIndex = -1;
  ov.innerHTML =
    `<video class="scan-vid" playsinline muted></video><div class="scan-dim"></div>` +
    `<div class="scan-top"><span class="scan-ttl">${ic('barcode')}${esc(title)}</span><button class="scan-x" data-scan-x aria-label="Close scanner">${ic('x')}</button></div>` +
    `<div class="scan-box"><span class="c tl"></span><span class="c tr"></span><span class="c bl"></span><span class="c br"></span><div class="scan-laser"></div></div>` +
    `<div class="scan-flash"></div>` +
    `<div class="scan-bot"><div class="scan-status"><i class="scan-pulse"></i>${esc(hint)}</div></div>`;
  document.body.appendChild(ov);
  const statusEl = ov.querySelector('.scan-status');
  const flashEl = ov.querySelector('.scan-flash');
  const vid = ov.querySelector('.scan-vid');

  const stop = () => {
    if (closed) return; closed = true;
    if (raf) cancelAnimationFrame(raf);
    if (stream) try { stream.getTracks().forEach(t => t.stop()); } catch {}
    det = null; ov.remove();
  };
  ov.querySelector('[data-scan-x]').addEventListener('click', stop);
  ov.addEventListener('keydown', e => { if (e.key === 'Escape') stop(); });
  const flash = ok => { if (!flashEl) return; flashEl.className = 'scan-flash ' + (ok ? 'ok' : 'bad'); setTimeout(() => { flashEl.className = 'scan-flash'; }, 350); };

  const handle = async raw => {
    let res; try { res = await onCode?.(raw); } catch (e) { res = { ok: false, message: e?.message || 'Could not record that scan' }; }
    const r = typeof res === 'string' ? { ok: true, message: res } : (res || { ok: true });
    if (statusEl && r.message) statusEl.innerHTML = `${r.ok === false ? '✗' : '✓'} ${esc(r.message)}`;
    flash(r.ok !== false);
    if (r.close) stop();
  };

  vid.muted = true;
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(s => { if (closed) { s.getTracks().forEach(t => t.stop()); return; } stream = s; vid.srcObject = s; return vid.play().catch(() => {}); })
    .then(() => {
      if (closed) return;
      try { det = new window.BarcodeDetector({ formats: FORMATS }); }
      catch { try { det = new window.BarcodeDetector(); } catch { det = null; } }
      if (!det) { if (statusEl) statusEl.textContent = 'This device cannot decode barcodes — type the code instead'; return; }
      const loop = () => {
        if (closed || !det) return;
        det.detect(vid).then(codes => {
          if (codes && codes.length) {
            const raw = (codes[0].rawValue || '').trim(), now = Date.now();
            if (raw && !(raw === last.c && now - last.t < 1500)) { last.c = raw; last.t = now; handle(raw); }
          }
        }).catch(() => {}).finally(() => { if (!closed) raf = requestAnimationFrame(loop); });
      };
      loop();
    })
    .catch(err => { if (statusEl) statusEl.textContent = `Could not open the camera (${err?.name || 'error'})`; });

  return stop;
}
