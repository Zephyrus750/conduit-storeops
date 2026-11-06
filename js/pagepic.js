// The picture of a document the stores see on their Resources page, made
// in the owner console when a file is added (js/views/adminresources.js):
// a PDF's page drawn by PDF.js (vendor/pdfjs, loaded on first use), or a
// picture file scaled down. JPEG, at most WIDTH pixels wide: sharp enough
// for the big preview on a 1080p store PC, small enough for a shelf of
// them on store Wi-Fi.
//
//   canPicture(name)          a PDF or a picture: the console can make its picture
//   readPdf(blob)             → { pages, page(n) → Promise<pic>, close() }
//   pictureOf(blob)           a picture file scaled down → Promise<pic>
//   pic                       { blob, w, h, url } (url: an object URL for the preview; revoke it when done)

import { fileKind } from '../shared/resources.js';

export const WIDTH = 800;
const QUALITY = 0.82;
let lib = null;

export const canPicture = name => { const k = fileKind(name); return !!k && (k.ext === 'pdf' || k.label === 'Picture'); };

function pdfjs() {
  lib ||= import(new URL('../vendor/pdfjs/pdf.min.js', import.meta.url).href).then(m => {
    m.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
    return m;
  }).catch(e => { lib = null; throw e; });
  return lib;
}

// A canvas to a JPEG on white (a PDF page or a transparent PNG has no background of its own).
function toPic(canvas) {
  return new Promise((ok, no) => canvas.toBlob(b => b ? ok({ blob: b, w: canvas.width, h: canvas.height, url: URL.createObjectURL(b) }) : no(new Error('the picture could not be made')), 'image/jpeg', QUALITY));
}
function sheet(w, h) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  return [c, g];
}

export async function readPdf(blob) {
  const m = await pdfjs();
  // No eval (the site's CSP refuses it) and no fetching of fonts or maps: a page draws with what the file carries.
  const doc = await m.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, disableFontFace: false, useSystemFonts: true }).promise;
  return {
    pages: doc.numPages,
    async page(n) {
      const p = await doc.getPage(Math.min(Math.max(1, n), doc.numPages)), base = p.getViewport({ scale: 1 });
      const vp = p.getViewport({ scale: WIDTH / base.width }), [c, g] = sheet(vp.width, vp.height);
      await p.render({ canvasContext: g, viewport: vp, background: 'rgb(255,255,255)' }).promise;
      p.cleanup();
      return toPic(c);
    },
    close() { doc.destroy(); },
  };
}

export async function pictureOf(blob) {
  const img = await createImageBitmap(blob), sc = Math.min(1, WIDTH / img.width, (WIDTH * 1.5) / img.height);
  const [c, g] = sheet(img.width * sc, img.height * sc);
  g.drawImage(img, 0, 0, c.width, c.height); img.close?.();
  return toPic(c);
}
