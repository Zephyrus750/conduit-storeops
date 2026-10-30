// The store's Resources (the owner's files and links: js/views/resources.js)
// for the Resources page and the search palette alike: this store's list,
// fetched once and kept a few minutes, what this PC opens most, and
// opening one: a PDF or a picture in a tab or printed, the rest
// downloaded, a link in a tab. Files come with the session's token
// (GET /v1/resources/:id/file), so each is a copy made in the browser.
//
//   loadResources(api, store, { force })  fetches the list when it is older than five minutes
//                                         (or forced) → Promise<list>; null when it is fresh
//   cachedResources(store)                the list as last fetched for that store, or null
//   resourceError(store)                  why the last fetch failed, or null
//   mostUsed(list, n)                     the ones this PC opened most, most first
//   useResource(api, e, how)              how: 'open' | 'print' | 'get' (open: a tab for a PDF or a
//                                         picture, else a download; a link opens in a tab).
//                                         Call it from the click: the tab opens before the file arrives.

import { toast } from './ui.js';
import { tx } from './i18n.js';
import { fileKind } from '../shared/resources.js';

const FRESH_MS = 5 * 60_000;
let cache = { store: null, list: null, at: 0, error: null, loading: null };

export function loadResources(api, store, { force = false } = {}) {
  if (!store) return null;
  if (cache.store !== store) cache = { store, list: null, at: 0, error: null, loading: null };
  if (cache.loading) return cache.loading;
  if (!force && cache.list && Date.now() - cache.at < FRESH_MS) return null;
  if (!force && !cache.list && cache.error && Date.now() - cache.at < 10_000) return null;
  const mine = cache;
  mine.loading = api('/v1/resources').then(r => { mine.list = r.resources || []; mine.error = null; return mine.list; })
    .catch(e => { mine.error = e.message; throw e; })
    .finally(() => { mine.at = Date.now(); mine.loading = null; });
  return mine.loading;
}
export const cachedResources = store => (cache.store === store ? cache.list : null);
export const resourceError = store => (cache.store === store ? cache.error : null);

// What this PC opens most: a per-device convenience, so it lives in the browser.
const KEY = 'resources_opened';
let opened = {}; try { opened = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
const bump = id => { opened[id] = (opened[id] || 0) + 1; try { localStorage.setItem(KEY, JSON.stringify(opened)); } catch {} };
export const mostUsed = (list, n = 4) => (list || []).filter(e => opened[e.id]).sort((a, b) => opened[b.id] - opened[a.id]).slice(0, n);

const later = url => setTimeout(() => URL.revokeObjectURL(url), 120_000);
function saveAs(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); later(url); }
function printBlob(blob) {
  const url = URL.createObjectURL(blob), f = document.createElement('iframe');
  f.className = 'rs-printframe'; f.setAttribute('aria-hidden', 'true'); f.src = url;
  f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { window.open(url, '_blank'); } setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 120_000); };
  document.body.appendChild(f);
}

export async function useResource(api, e, how = 'open') {
  bump(e.id);
  if (!e.file) { window.open(e.link, '_blank', 'noopener,noreferrer'); return; }
  const inline = fileKind(e.file.name)?.inline;
  if (how === 'open' && !inline) how = 'get';
  if (how === 'print' && !inline) how = 'get';
  // The tab opens now, while the click still counts, and gets the file when it arrives.
  const w = how === 'open' ? window.open('', '_blank') : null;
  try {
    const b = await api(`/v1/resources/${encodeURIComponent(e.id)}/file${how === 'get' ? '?download=1' : ''}`, { blob: true, timeoutMs: 120_000 }), blob = new Blob([b], { type: e.file.type });
    if (how === 'get') saveAs(blob, e.file.name);
    else if (how === 'print') printBlob(blob);
    else if (w) { const url = URL.createObjectURL(blob); w.location.href = url; later(url); }
    else saveAs(blob, e.file.name);
  } catch (err) { w?.close(); toast(tx('{name} did not open: {error}', { name: e.title, error: err.message }), 'bad'); }
}
