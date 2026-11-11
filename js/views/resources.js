// Resources (a store PC, managers): the owner's library of forms,
// procedures, posters and links for this store (shared/resources.js),
// searchable, by category, with what this PC opens most on top. The owner
// keeps it in the console (js/views/adminresources.js). The list, what
// this PC opens most and opening a file are js/resourcelib.js's, shared
// with the search palette (Ctrl K finds a resource by its title too).
// Missing something? Request a document: the owner sees the store's
// requests in the console and answers each (added, or declined with a
// word why); the answers show here.
// Each document is a card, three across on a 1080p PC: the picture of its
// page beside what it is and Open, Print, Download (the console makes the
// picture when the file is added; Word, Excel and links show their kind's
// cover). The page opens a big preview: ← → for the next one, Esc to close.

import { ic, esc, vh, sub, toast, fmtDate, empty } from '../ui.js';
import { tx, txn } from '../i18n.js';
import { sheetHtml } from '../sheet.js';
import { fileKind, matches } from '../../shared/resources.js';
import { loadResources, cachedResources, resourceError, mostUsed, useResource, thumbUrl, thumbFailed } from '../resourcelib.js';

const st = { q: '', cat: 'all', ask: null, sending: false, reqs: {}, reqErr: {}, view: null };   // view: the id in the big preview
let usedArg = null;   // a view's argument stays on re-renders: apply it once
const kb = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
const catName = c => c || tx('Other');
const kindOf = e => e.file ? fileKind(e.file.name) : null;
const KIND_LABEL = { PDF: 'PDF', Picture: tx('Picture'), Word: 'Word', Excel: 'Excel', PowerPoint: 'PowerPoint', CSV: 'CSV', Text: tx('Text') };
const badge = e => { const k = kindOf(e); return `<span class="rs-kind ${k ? k.ext : 'link'}">${k ? esc(KIND_LABEL[k.label] || k.label) : ic('ext')}</span>`; };
const REQ_ST = { open: [tx('Waiting on the owner'), 'warn'], added: [tx('Added'), 'good'], declined: [tx('Declined'), 'bad'] };

// The ask: what the document is, and where it's used (optional).
const askForm = () => `<form class="card rs-ask" data-form="rs-ask"><div class="ch"><h3>${tx('Request a document')}</h3><span class="cs-dim">${tx('The owner sees it in the console and adds it, or says why not.')}</span></div>` +
  `<label class="ad-field"><span>${tx('What is the document?')}</span><input class="ad-in" name="title" maxlength="80" required value="${esc(st.ask?.title || '')}" placeholder="${tx('e.g. {example}', { example: tx('Forklift licence form') })}"></label>` +
  `<label class="ad-field"><span>${tx('Where it’s used, or why it’s needed (optional)')}</span><input class="ad-in" name="note" maxlength="300" value="${esc(st.ask?.note || '')}"></label>` +
  `<div class="pf-acts"><button class="btn primary" type="submit"${st.sending ? ' disabled' : ''}>${ic('arrow')}${st.sending ? tx('Sending…') : tx('Send the request')}</button><button class="btn" type="button" data-act="rs-ask-x"${st.sending ? ' disabled' : ''}>${tx('Cancel')}</button></div></form>`;

// This store's requests and the owner's answers, waiting ones first.
function asked(ctx, list) {
  const reqs = st.reqs[ctx.storeNo]; if (!reqs?.length) return '';
  const order = { open: 0, added: 1, declined: 2 }, xs = [...reqs].sort((a, b) => order[a.status] - order[b.status] || b.updated.localeCompare(a.updated)).slice(0, 12);
  const n = reqs.filter(q => q.status === 'open').length;
  return `<div class="card rs-reqs"><div class="ch"><h3>${tx('Requested by this store')}</h3><span class="cs-dim">${n ? txn(n, '{n} waiting on the owner', '{n} waiting on the owner') : tx('All answered')}</span></div>` + xs.map(q => {
    const [label, cls] = REQ_ST[q.status] || REQ_ST.open, got = q.status === 'added' && q.resource && list.find(e => e.id === q.resource);
    return `<div class="rs-req"><span class="rs-main"><b>${esc(q.title)}</b>${q.note ? `<span class="rs-note">${esc(q.note)}</span>` : ''}<small>${tx('asked {date}', { date: esc(fmtDate(q.created)) })}${q.status !== 'open' ? ' · ' + tx('answered {date}', { date: esc(fmtDate(q.updated)) }) : ''}</small>${q.reply ? `<span class="rs-reply">${ic('m-store')}<span>${tx('Owner: {reply}', { reply: esc(q.reply) })}</span></span>` : ''}</span>` +
      `<span class="rs-acts"><span class="status ${cls}">${label}</span>${got ? `<button class="btn sm" data-act="rs-open" data-id="${esc(got.id)}">${ic('ext')}${tx('Open')}</button>` : ''}</span></div>`;
  }).join('') + `</div>`;
}

const host = link => { try { return new URL(link).host.replace(/^www\./, ''); } catch { return String(link || '').slice(0, 40); } };
const pagesOf = e => e.file?.pages ? txn(e.file.pages, '{n} page', '{n} pages') : '';
// What a document is, in one line: pages, size, when it changed (a link: its site).
const facts = e => [e.file ? pagesOf(e) : esc(host(e.link)), e.file ? kb(e.file.size) : '', tx('updated {date}', { date: esc(fmtDate(e.updated)) })].filter(Boolean).join(' · ');
// A kind with no picture of its page (Word, Excel, a link, or a PDF the
// console has not made one for yet): a cover with its letter and its title.
const COVER = { PDF: 'PDF', Word: 'W', Excel: 'X', PowerPoint: 'P', CSV: 'CSV', Text: 'TXT', Picture: '' };
function cover(e) {
  const k = kindOf(e);
  if (!e.file) return `<span class="rs-cover link"><i>${ic('ext')}</i><b>${esc(e.title)}</b><small>${esc(host(e.link))}</small></span>`;
  return `<span class="rs-cover ${esc(k?.ext || '')}"><i>${esc(COVER[k?.label] ?? '')}${k?.label === 'Picture' ? ic('image') : ''}</i><b>${esc(e.title)}</b><small>${esc(KIND_LABEL[k?.label] || k?.label || '')}${e.file.pages ? ' · ' + pagesOf(e) : ''}</small></span>`;
}
// The page: its picture when there is one (a blank sheet while it loads), else the cover.
function sheet(ctx, e) {
  if (!e.thumb) return cover(e);
  const src = thumbUrl(ctx.api, e, () => landed(ctx, e));
  return src ? `<img src="${src}" alt="" width="${e.thumb.w}" height="${e.thumb.h}" draggable="false">` : thumbFailed(e) ? cover(e) : `<span class="rs-blank" data-pic="${esc(e.id)}" aria-hidden="true"></span>`;
}
// A picture landed: it takes its blank sheet's place (no redraw of the page).
function landed(ctx, e) { for (const el of document.querySelectorAll(`.rs-blank[data-pic="${CSS.escape(e.id)}"]`)) el.outerHTML = sheet(ctx, e); }

// A PDF or a picture opens and prints here; Word, Excel and the rest download to open in their app.
function acts(e, big = false) {
  const k = kindOf(e), id = esc(e.id), sz = big ? '' : ' sm';
  if (e.file && k?.inline) return big
    ? `<button class="btn" data-act="rs-open" data-id="${id}">${ic('ext')}${tx('Open full size')}</button><button class="btn" data-act="rs-get" data-id="${id}">${ic('download')}${tx('Download')}</button><button class="btn primary" data-act="rs-print" data-id="${id}">${ic('print')}${tx('Print')}</button>`
    : `<button class="btn${sz} primary" data-act="rs-open" data-id="${id}">${tx('Open')}</button><button class="btn${sz}" data-act="rs-print" data-id="${id}">${tx('Print')}</button><button class="btn${sz}" data-act="rs-get" data-id="${id}" aria-label="${tx('Download {name}', { name: esc(e.file.name) })}">${tx('Download')}</button>`;
  if (e.file) return `<button class="btn${sz} primary" data-act="rs-get" data-id="${id}">${big ? ic('download') : ''}${tx('Download')}</button>`;
  return `<a class="btn${sz} primary" href="${esc(e.link)}" target="_blank" rel="noopener noreferrer" data-act="rs-link" data-id="${id}">${big ? ic('ext') : ''}${tx('Open link')}</a>`;
}

function card(ctx, e) {
  return `<article class="rs-card"><button class="rs-pg${e.thumb && e.thumb.w > e.thumb.h * 1.1 ? ' wide' : ''}" data-act="rs-view" data-id="${esc(e.id)}" aria-label="${tx('Preview {title}', { title: esc(e.title) })}">${sheet(ctx, e)}${badge(e)}</button>` +
    `<div class="rs-cb"><small class="rs-cat">${esc(catName(e.category))}</small><b class="rs-t">${esc(e.title)}</b>${e.note ? `<span class="rs-note">${esc(e.note)}</span>` : ''}<small class="rs-facts">${facts(e)}</small><div class="rs-acts">${acts(e)}</div></div></article>`;
}

// The big preview: the page large, what it is beside it, and Print, Open full size, Download.
function preview(ctx, e, list) {
  const k = kindOf(e), at = list.indexOf(e), rows = e.file
    ? [[tx('File'), esc(e.file.name)], e.file.pages ? [tx('Pages'), String(e.file.pages)] : null, [tx('Size'), kb(e.file.size)], [tx('Updated'), esc(fmtDate(e.updated))], e.thumb?.from === 'page' && e.thumb.page > 1 ? [tx('Shown'), tx('page {n}', { n: e.thumb.page })] : null]
    : [[tx('Link'), esc(host(e.link))], [tx('Updated'), esc(fmtDate(e.updated))]];
  return sheetHtml({
    size: 'wide', cls: 'rs-pv', title: esc(e.title), sub: `${badge(e)}<span>${esc(catName(e.category))}</span>`, close: 'rs-pv-x',
    body: `<div class="rs-pv-in"><div class="rs-pv-pg"><div class="rs-pv-sheet${e.thumb ? '' : ' cov'}">${sheet(ctx, e)}</div></div>` +
      `<aside class="rs-pv-side">${e.note ? `<p>${esc(e.note)}</p>` : ''}<dl>${rows.filter(Boolean).map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl></aside></div>`,
    foot: `<small class="sht-note">${list.length > 1 ? `${tx('← → for the next resource · Esc to close')} · ${at + 1}/${list.length}` : tx('Esc to close')}</small>${acts(e, true)}`,
  });
}

// The cards as shown: the category and search picked, in category order (as the chips), then by title.
function ordered(ctx) {
  const list = cachedResources(ctx.storeNo) || [], cats = [...new Set(list.map(e => e.category || ''))].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b));
  const cat = st.cat !== 'all' && !cats.includes(st.cat) ? 'all' : st.cat;
  const order = list.filter(e => (cat === 'all' || (e.category || '') === cat) && matches(e, st.q)).sort((a, b) => cats.indexOf(a.category || '') - cats.indexOf(b.category || '') || a.title.localeCompare(b.title));
  return { list, cats, order };
}
// The preview opens, moves and closes in place: the list behind it keeps its scroll.
function showPv(ctx, root, id) {
  root.querySelector('.rs-pv')?.remove();
  const { order } = ordered(ctx), e = id && order.find(x => x.id === id);
  st.view = e ? e.id : null; if (!e) return;
  root.insertAdjacentHTML('beforeend', preview(ctx, e, order));
}

function page(ctx) {
  const got = cachedResources(ctx.storeNo), err = resourceError(ctx.storeNo), list = got || [], cats = ordered(ctx).cats;
  const head = vh(tx('Resources'), sub(txn(list.length, '{n} resource', '{n} resources'), tx('from the owner, for managers')), `<button class="btn" data-act="rs-refresh">${ic('refresh')}${tx('reload::Refresh')}</button><button class="btn" data-act="rs-ask">${ic('plus')}${tx('Request a document')}</button>`, 'library') + (st.ask ? askForm() : '');
  if (err && !got) return head + `<div class="card"><p class="lbl">${tx('The resources did not load: {error}', { error: esc(err) })}</p><button class="btn" data-act="rs-refresh">${ic('refresh')}${tx('Try again')}</button></div>`;
  if (!got) return head + `<div class="card"><div class="ohint">${tx('Loading the resources…')}</div></div>`;
  if (!list.length) return head + `<div class="card">${empty(tx('No resources yet. The owner adds forms, procedures and links in the console, under Resources.'), { icon: 'library', act: st.ask ? '' : `<button class="btn primary" data-act="rs-ask">${ic('plus')}${tx('Request a document')}</button>` })}</div>` + asked(ctx, list);
  if (st.cat !== 'all' && !cats.includes(st.cat)) st.cat = 'all';
  const { order } = ordered(ctx);
  const search = `<div class="rs-bar"><div class="search rs-search">${ic('search')}<input data-field="rs-q" value="${esc(st.q)}" placeholder="${tx('Search titles, categories, notes and file names')}" aria-label="${tx('Search the resources')}">${st.q ? `<button class="ibtn" data-act="rs-clear" aria-label="${tx('Clear the search')}">${ic('x')}</button>` : ''}</div>` +
    `<div class="chips rs-cats"><button class="chip${st.cat === 'all' ? ' on' : ''}" data-act="rs-cat" data-cat="all">${tx('All')} <small>${list.length}</small></button>${cats.map(c => `<button class="chip${st.cat === c ? ' on' : ''}" data-act="rs-cat" data-cat="${esc(c)}">${esc(catName(c))} <small>${list.filter(e => (e.category || '') === c).length}</small></button>`).join('')}</div></div>`;
  // Opened most on this PC: a quick way back to the everyday ones.
  const top = !st.q && st.cat === 'all' ? mostUsed(list, 4) : [];
  const fav = top.length ? `<div class="card rs-top"><div class="ch"><h3>${tx('Used most on this PC')}</h3></div><div class="rs-tiles">${top.map(e => `<button class="rs-tile" data-act="rs-open" data-id="${esc(e.id)}">${badge(e)}<span><b>${esc(e.title)}</b><small>${esc(catName(e.category))}</small></span></button>`).join('')}</div></div>` : '';
  let body;
  if (!order.length) body = `<div class="card">${empty(st.q ? tx('Nothing matches “{q}”.', { q: esc(st.q) }) : tx('Nothing in this category.'), { icon: st.q ? 'search' : 'library', act: st.q && !st.ask ? `<button class="btn" data-act="rs-ask" data-title="${esc(st.q)}">${ic('plus')}${tx('Request “{q}”', { q: esc(st.q) })}</button>` : '' })}</div>`;
  else body = (st.q || st.cat !== 'all' ? `<div class="rs-gh"><h3>${st.q ? tx('Results') : esc(catName(st.cat))}</h3><span>${order.length}</span></div>` : '') + `<div class="rs-cards">${order.map(e => card(ctx, e)).join('')}</div>`;
  const open = st.view && order.find(e => e.id === st.view);
  if (st.view && !open) st.view = null;
  return head + search + fav + body + asked(ctx, list) + (open ? preview(ctx, open, order) : '');
}

export default {
  id: 'resources', title: tx('Resources'), icon: 'library',
  deskOnly: true,   // not on the phone: no menu row, no search result; a link goes home
  managers: true,   // a store's managers only (the shell asks a team session for the manager code)
  desktop(ctx) {
    // From the search palette: open with that search.
    if (ctx.arg?.q != null && ctx.arg !== usedArg) { usedArg = ctx.arg; st.q = String(ctx.arg.q); st.cat = 'all'; st.view = null; }
    return page(ctx);
  },
  mount(ctx, root) {
    const load = force => loadResources(ctx.api, ctx.storeNo, { force })?.then(() => ctx.rerender(), e => { if (cachedResources(ctx.storeNo)) toast(tx('The resources did not load: {error}', { error: e.message }), 'bad'); else ctx.rerender(); });
    load(false);
    const loadReqs = () => ctx.api('/v1/resources/requests').then(r => { st.reqs[ctx.storeNo] = r.requests || []; ctx.rerender(); }, () => {});
    if (!st.reqs[ctx.storeNo]) loadReqs();
    const find = id => (cachedResources(ctx.storeNo) || []).find(e => e.id === id);
    root.addEventListener('click', async ev => {
      const a = ev.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act, e = a.dataset.id && find(a.dataset.id);
      if (act === 'rs-pv-x') { showPv(ctx, root, null); return; }
      if (act === 'rs-view') { showPv(ctx, root, a.dataset.id); return; }
      if (act === 'rs-refresh') { load(true); loadReqs(); }
      else if (act === 'rs-ask') { st.ask = { title: a.dataset.title || '', note: '' }; ctx.rerender(); root.querySelector('[data-form="rs-ask"] [name="title"]')?.focus(); }
      else if (act === 'rs-ask-x') { st.ask = null; ctx.rerender(); }
      else if (act === 'rs-cat') { st.cat = a.dataset.cat; ctx.rerender(); }
      else if (act === 'rs-clear') { st.q = ''; ctx.rerender(); }
      else if (act === 'rs-link') { if (e) { ev.preventDefault(); useResource(ctx.api, e); } }
      else if (e && (act === 'rs-open' || act === 'rs-print' || act === 'rs-get')) {
        a.disabled = true;
        await useResource(ctx.api, e, act === 'rs-print' ? 'print' : act === 'rs-get' ? 'get' : 'open');
        a.disabled = false;
      }
    });
    root.addEventListener('submit', async ev => {
      if (!ev.target.matches('[data-form="rs-ask"]')) return;
      ev.preventDefault();
      const f = ev.target, title = f.elements.title.value.trim(), note = f.elements.note.value.trim();
      if (!title) return toast(tx('Say what the document is'), 'bad');
      st.ask = { title, note }; st.sending = true; ctx.rerender();
      try {
        const r = await ctx.api('/v1/resources/requests', { method: 'POST', body: { title, note } });
        const cur = st.reqs[ctx.storeNo] || [];
        st.reqs[ctx.storeNo] = [r.request, ...cur.filter(q => q.id !== r.request.id)];
        st.ask = null;
        toast(r.existing ? tx('{title} is already waiting on the owner', { title: r.request.title }) : tx('Request sent: the owner sees it in the console'));
      } catch (e) { toast(e.code === 'too_many_open' ? tx('This store already has 20 requests waiting. Ask again once the owner has answered some.') : tx('The request did not send: {error}', { error: e.message }), 'bad'); }
      st.sending = false; ctx.rerender();
    });
    // What was typed in the request stays while the page redraws.
    root.addEventListener('input', ev => { const f = ev.target.closest('[data-form="rs-ask"]'); if (f) st.ask = { title: f.elements.title.value, note: f.elements.note.value }; });
    let typing = null;
    root.addEventListener('input', ev => { if (ev.target.matches('[data-field="rs-q"]')) { st.q = ev.target.value; clearTimeout(typing); typing = setTimeout(() => ctx.rerender(), 120); } });
    // The preview: Esc closes, ← → the next card as shown.
    const keys = ev => {
      if (!st.view || !root.querySelector('.rs-pv') || ev.target.matches?.('input, textarea')) return;
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      const ids = ordered(ctx).order.map(e => e.id), at = ids.indexOf(st.view); if (at < 0 || ids.length < 2) return;
      ev.preventDefault(); showPv(ctx, root, ids[(at + (ev.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length]);
    };
    document.addEventListener('keydown', keys);
    return [() => clearTimeout(typing), () => document.removeEventListener('keydown', keys)];
  },
};
