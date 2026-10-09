// Barcode list and Quick Scan (K2B's barcode-list tool and general scan
// list): turn any report into scannable barcodes for the PDT, or collect
// codes on the phone. Paste a report (clearance, markdowns, anything with
// keycodes), read one off the screen, or scan and type codes; then work the
// list as a grid or one by one (Space or Enter: done and next; ← →: move;
// Backspace: remove). The list is this device's scratch pad: it never
// touches backfill and is not shared, so it stays in local storage.

import { $, ic, esc, vh, sub, toast, mhead, camButton } from '../../ui.js';
import { ensureNames, nameHtml, copyText } from './common.js';
import { extractCodes } from '../../../shared/screenscan.js';
import { barcodeSvg } from '../../../shared/barcode.js';
import { openScreenScan } from '../../screenscan.js';

// Per store (a device signed in to two stores keeps two lists); a list kept
// under the old shared key moves to the first store that opens it.
let storeNo = '';
const KEY = () => `codelist:${storeNo}`;
function useStore(no) {
  storeNo = String(no || '');
  try { const old = localStorage.getItem('codelist'); if (old != null) { if (localStorage.getItem(KEY()) == null) localStorage.setItem(KEY(), old); localStorage.removeItem('codelist'); } } catch {}
}
const st = { view: 'grid', at: 0, paste: false, text: '' };
function load() { try { const v = JSON.parse(localStorage.getItem(KEY()) || 'null'); return Array.isArray(v?.codes) ? v.codes.filter(x => x && /^\d{6,13}$/.test(x.c)) : []; } catch { return []; } }
function save(list) { try { localStorage.setItem(KEY(), JSON.stringify({ codes: list, at: new Date().toISOString() })); } catch { toast('This device would not keep the list (storage is blocked)', 'bad'); } }
function add(codes, replace = false) {
  const list = replace ? [] : load(), have = new Set(list.map(x => x.c)); let n = 0;
  for (const c of codes) if (/^\d{6,13}$/.test(c) && !have.has(c)) { list.push({ c, done: false }); have.add(c); n++; }
  save(list); return n;
}

function focusCard(list) {
  if (!list.length) return '';
  st.at = Math.max(0, Math.min(list.length - 1, st.at));
  const x = list[st.at];
  return `<div class="card cl-focus${x.done ? ' done' : ''}" tabindex="0" data-focus><div class="cl-pos">${st.at + 1} / ${list.length}${x.done ? ' · <span class="status good">done</span>' : ''}</div><div class="cl-big">${barcodeSvg(x.c, { module: 3, height: 110 })}</div><div class="cl-name">${nameHtml(x.c)}</div>` +
    `<div class="cl-nav"><button class="btn" data-act="cl-prev"${st.at ? '' : ' disabled'}>← Prev</button><button class="btn primary" data-act="cl-next">${x.done ? 'Next →' : '✓ Done & next'}</button><button class="btn" data-act="cl-rm" data-i="${st.at}">${ic('trash')}Remove</button></div><p class="lbl">Space or Enter: done and next · ← →: move · Backspace: remove</p></div>`;
}
function grid(list) {
  return list.length ? `<div class="cl-grid">${list.map((x, i) => `<div class="cl-cell${x.done ? ' done' : ''}" data-act="cl-open" data-i="${i}" title="Open one by one from here">${barcodeSvg(x.c, { module: 1.6, height: 52 })}<div class="cl-nm">${nameHtml(x.c)}</div><button class="ibtn cl-x" data-act="cl-rm" data-i="${i}" aria-label="Remove ${esc(x.c)}">${ic('x')}</button></div>`).join('')}</div>` : '';
}
const empty = `<div class="card" style="padding:24px"><b>No codes yet</b><p class="lbl">Paste a report, read one off the screen, or scan and type codes. Nothing here touches backfill: it just turns codes into barcodes to scan into the PDT.</p></div>`;

export default {
  id: 'codelist', title: 'Barcode list', icon: 'barcode', area: 'stockroom',
  desktop(ctx) {
    useStore(ctx.storeNo);
    const list = load(), done = list.filter(x => x.done).length;
    ensureNames(ctx, list.map(x => x.c), () => ctx.rerender());
    const head = vh('Barcode list', sub('Scratch list on this device', `${list.length} code${list.length === 1 ? '' : 's'}`, done ? `${done} done` : ''),
      `<div class="seg"><button class="${st.view === 'grid' ? 'on' : ''}" data-act="cl-view" data-v="grid">Grid</button><button class="${st.view === 'one' ? 'on' : ''}" data-act="cl-view" data-v="one">One by one</button></div><button class="btn" data-act="cl-paste">${ic('clip')}Paste a report</button><button class="btn" data-act="cl-screen">${ic('expand')}Screen scan</button>${list.length ? `<button class="btn" data-act="cl-copy">${ic('checks')}Copy all</button><button class="btn" data-act="cl-clear">${ic('trash')}Clear</button>` : ''}`, 'barcode');
    const typeRow = `<div class="cl-add"><input class="ad-in mono" data-field="cl-code" inputmode="numeric" placeholder="Scan or type a keycode" autocomplete="off">${camButton('cl-code', true)}<button class="btn sm" data-act="cl-add">${ic('plus')}Add</button></div>`;
    const paste = st.paste ? (() => { const r = extractCodes(st.text); return `<div class="card"><div class="ch"><h3>Paste any report</h3><span class="go" data-act="cl-paste">Close</span></div><textarea class="sri-ta" data-field="cl-text" placeholder="Paste the report text: keycodes are picked out, prices, quantities and APNs are left out">${esc(st.text)}</textarea><div class="sri-acts"><b>${r.codes.length}</b> code${r.codes.length === 1 ? '' : 's'} detected${r.dups ? ` · ${r.dups} duplicate${r.dups === 1 ? '' : 's'} removed` : ''}<button class="btn primary sm" data-act="cl-make"${r.codes.length ? '' : ' disabled'}>Make the list</button>${list.length ? `<button class="btn sm" data-act="cl-append"${r.codes.length ? '' : ' disabled'}>Add to the list</button>` : ''}</div></div>`; })() : '';
    return head + paste + typeRow + (list.length ? (st.view === 'one' ? focusCard(list) : grid(list)) : empty);
  },
  mobile(ctx) { useStore(ctx.storeNo); return `<div id="clmob">${mobile(ctx)}</div>`; },
  mount(ctx, root) {
    const repaint = () => { if (ctx.isMobile) { const h = $('#clmob', root); if (h) h.innerHTML = mobile(ctx); } else ctx.rerender(); };
    const addTyped = () => { const i = root.querySelector('[data-field="cl-code"]'), v = (i?.value || '').replace(/\D/g, ''); if (!/^\d{6,13}$/.test(v)) { toast('A keycode is 6 to 8 digits (an APN 13)', 'bad'); return; } const n = add([v]); toast(n ? `${v} added` : `${v} is already on the list`); repaint(); setTimeout(() => document.querySelector('#content [data-field="cl-code"]')?.focus(), 0); };
    const step = d => { const list = load(); st.at = Math.max(0, Math.min(list.length - 1, st.at + d)); repaint(); setTimeout(() => document.querySelector('#content [data-focus]')?.focus(), 0); };
    const doneNext = () => { const list = load(); if (!list.length) return; list[st.at].done = true; save(list); if (st.at < list.length - 1) st.at++; else toast('That was the last code'); repaint(); setTimeout(() => document.querySelector('#content [data-focus]')?.focus(), 0); };
    const remove = i => { const list = load(); list.splice(i, 1); save(list); st.at = Math.min(st.at, Math.max(0, list.length - 1)); repaint(); setTimeout(() => document.querySelector('#content [data-focus]')?.focus(), 0); };
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'cl-view') { st.view = a.dataset.v; repaint(); }
      else if (act === 'cl-paste') { st.paste = !st.paste; repaint(); }
      else if (act === 'cl-make' || act === 'cl-append') { const r = extractCodes(st.text); const n = add(r.codes, act === 'cl-make'); toast(`${n} code${n === 1 ? '' : 's'} on the list`); st.paste = false; st.text = ''; st.at = 0; repaint(); }
      else if (act === 'cl-screen') openScreenScan(ctx, { mode: 'list', onUse: ({ codes }) => { const n = add(codes); toast(`${n} code${n === 1 ? '' : 's'} added from the screen`); repaint(); } });
      else if (act === 'cl-add') addTyped();
      else if (act === 'cl-copy') copyText(load().map(x => x.c).join('\n'), `${load().length} codes`);
      else if (act === 'cl-clear') { if (confirm('Clear the whole list on this device?')) { save([]); st.at = 0; repaint(); } }
      else if (act === 'cl-rm') { e.stopPropagation(); remove(Number(a.dataset.i)); }
      else if (act === 'cl-open') { st.at = Number(a.dataset.i); st.view = 'one'; repaint(); setTimeout(() => document.querySelector('#content [data-focus]')?.focus(), 0); }
      else if (act === 'cl-prev') step(-1);
      else if (act === 'cl-next') doneNext();
      else if (act === 'cl-toggle') { const list = load(), i = Number(a.dataset.i); list[i].done = !list[i].done; save(list); repaint(); }
    });
    root.addEventListener('keydown', e => {
      if (e.target.matches('[data-field="cl-code"]')) { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } return; }
      if (st.view !== 'one' || ctx.isMobile || e.target.closest('input, textarea, select')) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); doneNext(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'Backspace') { e.preventDefault(); remove(st.at); }
    });
    root.addEventListener('input', e => { if (e.target.matches('[data-field="cl-text"]')) { st.text = e.target.value; const r = extractCodes(st.text), c = root.querySelector('.sri-acts'); if (c) { c.querySelector('b').textContent = r.codes.length; c.querySelectorAll('button').forEach(b => { b.disabled = !r.codes.length; }); } } });
    return [];
  },
};

// Quick Scan on the phone: scan or type codes onto the list, show each as a
// barcode, tick them off.
function mobile(ctx) {
  const list = load();
  ensureNames(ctx, list.map(x => x.c), () => { const h = document.querySelector('#clmob'); if (h) h.innerHTML = mobile(ctx); });
  return mhead('Quick Scan', `${list.length} code${list.length === 1 ? '' : 's'} · ${list.filter(x => x.done).length} done`) +
    `<div class="cl-add m"><input class="ad-in mono" data-field="cl-code" inputmode="numeric" placeholder="Scan or type a keycode" autocomplete="off">${camButton('cl-code', true)}<button class="btn sm" data-act="cl-add">${ic('plus')}</button></div>` +
    (list.length ? `<div class="cl-mlist">${list.map((x, i) => `<div class="cl-mrow${x.done ? ' done' : ''}"><div class="cl-mbc">${barcodeSvg(x.c, { module: 1.8, height: 56 })}</div><div class="cl-mnm">${nameHtml(x.c)}</div><div class="cl-macts"><button class="sri-tick${x.done ? ' on' : ''}" data-act="cl-toggle" data-i="${i}" aria-pressed="${x.done}" title="Done">✓</button><button class="ibtn" data-act="cl-rm" data-i="${i}" aria-label="Remove">${ic('x')}</button></div></div>`).join('')}</div><div class="cl-mfoot"><button class="btn sm" data-act="cl-copy">${ic('checks')}Copy all</button><button class="btn sm" data-act="cl-clear">${ic('trash')}Clear</button></div>`
      : `<div class="mv-note">${ic('barcode')}Scan or type codes to build a list. Each shows as a barcode the PDT can read off this screen.</div>`);
}
