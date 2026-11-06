// Resources: the files and links the owner shares with stores' managers
// (forms to print, procedures, posters, a supplier's portal). The owner
// keeps the library in the console; the registry holds each entry and the
// worker keeps its file in R2. Pure: the registry checks entries with it,
// and the console and the store's Resources page search with it.
//
//   entry   { id, title, category, note, stores: 'all' | ['1241', …], link: '' | 'https://…',
//             file: { name, type, size, key, at, pages? } | null,
//             thumb: { key, type, size, w, h, from, page, at } | null, created, updated, by }
//   The thumb is the picture of the document the stores see (made in the
//   console when the file is added): from 'page' (a PDF's page, page n),
//   'file' (a picture file, scaled) or 'picture' (one the owner picked).
//   FILE_MAX                     the largest file the owner can upload (bytes)
//   THUMB_MAX, THUMB_TYPES       the largest picture of a document, and the kinds it can be
//   cleanThumb(params)           a picture's { from, page, w, h, pages? } from the upload's query → | { error }
//   fileKind(name)               { ext, type, label, inline } for an allowed file name, else null:
//                                inline ones (PDF, pictures) open and print in the browser
//   cleanEntry(body, { stores }) the fields a create or an edit sets, checked → { title, … } | { error }
//   visibleTo(entry, store)      the store may see it: listed for every store or for this one
//   ready(entry)                 it has a file or a link to open
//   matches(entry, q)            a search: every word of q in its title, category, note, file or link
//
// Requests: a store's managers ask the owner for a document the library
// does not have; the owner answers in the console.
//   request { id, store, title, note, status: 'open' | 'added' | 'declined', reply, resource, by, created, updated }
//   REQUEST_OPEN_MAX              how many requests a store can have open at once
//   cleanRequest(body)            { title, note } checked → | { error }
//   cleanAnswer(body)             the owner's { status, reply?, resource? } checked → | { error }
//   sameTitle(a, b)               two titles name the same document (case and spacing aside)

export const FILE_MAX = 25_000_000;
export const THUMB_MAX = 1_000_000;
export const THUMB_TYPES = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };
const THUMB_FROM = ['page', 'file', 'picture'];
// The query of a picture's upload: where it came from, its size in pixels,
// and (for a PDF) how many pages the file has.
export function cleanThumb(q) {
  const get = k => (q && typeof q.get === 'function' ? q.get(k) : q?.[k]), int = (k, lo, hi) => { const v = Number(get(k)); return Number.isInteger(v) && v >= lo && v <= hi ? v : null; };
  const from = get('from'); if (!THUMB_FROM.includes(from)) return { error: `from is one of: ${THUMB_FROM.join(', ')}` };
  const w = int('w', 16, 4000), h = int('h', 16, 4000); if (!w || !h) return { error: 'w and h are the picture’s size in pixels' };
  const page = from === 'page' ? int('page', 1, 9999) : null; if (from === 'page' && !page) return { error: 'page is the page the picture shows' };
  const pages = get('pages') == null || get('pages') === '' ? null : int('pages', 1, 9999);
  if (get('pages') != null && get('pages') !== '' && !pages) return { error: 'pages is the number of pages in the file' };
  return { from, page, w, h, ...(pages ? { pages } : {}) };
}
const KINDS = {
  pdf: ['application/pdf', 'PDF', true],
  png: ['image/png', 'Picture', true], jpg: ['image/jpeg', 'Picture', true], jpeg: ['image/jpeg', 'Picture', true], gif: ['image/gif', 'Picture', true], webp: ['image/webp', 'Picture', true],
  doc: ['application/msword', 'Word', false], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Word', false],
  xls: ['application/vnd.ms-excel', 'Excel', false], xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel', false],
  ppt: ['application/vnd.ms-powerpoint', 'PowerPoint', false], pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'PowerPoint', false],
  csv: ['text/csv', 'CSV', false], txt: ['text/plain', 'Text', false],
};
export const FILE_EXTS = Object.keys(KINDS);

export function fileKind(name) {
  const ext = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1];
  const k = ext && KINDS[ext];
  return k ? { ext, type: k[0], label: k[1], inline: k[2] } : null;
}

const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// Only fields present in body are set, so an edit can change one of them.
export function cleanEntry(body, { stores = [] } = {}) {
  const b = body && typeof body === 'object' ? body : {}, out = {};
  if ('title' in b) { out.title = text(b.title, 80); if (!out.title) return { error: 'a resource needs a title' }; }
  if ('category' in b) out.category = text(b.category, 40);
  if ('note' in b) out.note = text(b.note, 200);
  if ('link' in b) {
    out.link = text(b.link, 500);
    if (out.link) { let u = null; try { u = new URL(out.link); } catch {} if (!u || u.protocol !== 'https:') return { error: 'a link starts with https://' }; out.link = u.href; }
  }
  if ('stores' in b) {
    if (b.stores === 'all') out.stores = 'all';
    else if (Array.isArray(b.stores)) {
      const list = [...new Set(b.stores.map(x => String(x).trim()))];
      if (!list.length) return { error: 'pick at least one store, or every store' };
      const unknown = list.filter(x => !stores.includes(x));
      if (unknown.length) return { error: `not a registered store: ${unknown.join(', ')}` };
      out.stores = list.sort();
    } else return { error: "stores is 'all' or a list of store numbers" };
  }
  return out;
}

export const visibleTo = (e, store) => e.stores === 'all' || (Array.isArray(e.stores) && e.stores.includes(String(store)));
export const ready = e => !!(e.file || e.link);
export function matches(e, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return true;
  const hay = [e.title, e.category, e.note, e.file?.name, e.link, fileKind(e.file?.name)?.label].filter(Boolean).join(' ').toLowerCase();
  return words.every(w => hay.includes(w));
}

export const REQUEST_OPEN_MAX = 20;
export const REQUEST_STATUS = ['open', 'added', 'declined'];
export function cleanRequest(body) {
  const b = body && typeof body === 'object' ? body : {}, title = text(b.title, 80);
  if (!title) return { error: 'a request needs a title: what is the document?' };
  return { title, note: text(b.note, 300) };
}
export function cleanAnswer(body) {
  const b = body && typeof body === 'object' ? body : {}, out = {};
  if (!REQUEST_STATUS.includes(b.status)) return { error: `status is one of: ${REQUEST_STATUS.join(', ')}` };
  out.status = b.status;
  if ('reply' in b) out.reply = text(b.reply, 200);
  if ('resource' in b) out.resource = b.resource ? text(b.resource, 40) : '';
  return out;
}
export const sameTitle = (a, b) => text(a, 80).toLowerCase() === text(b, 80).toLowerCase();
