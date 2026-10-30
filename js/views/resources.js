// Resources (a store PC, managers): the owner's library of forms,
// procedures, posters and links for this store (shared/resources.js),
// searchable, by category, with what this PC opens most on top. The owner
// keeps it in the console (js/views/adminresources.js). The list, what
// this PC opens most and opening a file are js/resourcelib.js's, shared
// with the search palette (Ctrl K finds a resource by its title too).

import { ic, esc, vh, sub, toast, fmtDate } from '../ui.js';
import { tx, txn } from '../i18n.js';
import { fileKind, matches } from '../../shared/resources.js';
import { loadResources, cachedResources, resourceError, mostUsed, useResource } from '../resourcelib.js';

const st = { q: '', cat: 'all' };
let usedArg = null;   // a view's argument stays on re-renders: apply it once
const kb = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
const catName = c => c || tx('Other');
const kindOf = e => e.file ? fileKind(e.file.name) : null;
const KIND_LABEL = { PDF: 'PDF', Picture: tx('Picture'), Word: 'Word', Excel: 'Excel', PowerPoint: 'PowerPoint', CSV: 'CSV', Text: tx('Text') };
const badge = e => { const k = kindOf(e); return `<span class="rs-kind ${k ? k.ext : 'link'}">${k ? esc(KIND_LABEL[k.label] || k.label) : ic('ext')}</span>`; };

function row(e) {
  const k = kindOf(e), facts = e.file ? [esc(e.file.name), kb(e.file.size)] : [esc(e.link.replace(/^https:\/\//, '').slice(0, 60))];
  facts.push(tx('updated {date}', { date: esc(fmtDate(e.updated)) }));
  // A PDF or a picture opens and prints here; Word, Excel and the rest download to open in their app.
  const acts = e.file && k?.inline
    ? `<button class="btn sm primary" data-act="rs-open" data-id="${esc(e.id)}">${ic('ext')}${tx('Open')}</button><button class="btn sm" data-act="rs-print" data-id="${esc(e.id)}">${ic('print')}${tx('Print')}</button><button class="btn sm rs-dl" data-act="rs-get" data-id="${esc(e.id)}" title="${tx('Download')}" aria-label="${tx('Download {name}', { name: esc(e.file.name) })}">${ic('arrow')}</button>`
    : e.file ? `<button class="btn sm primary rs-dl" data-act="rs-get" data-id="${esc(e.id)}">${ic('arrow')}${tx('Download')}</button>`
    : `<a class="btn sm primary" href="${esc(e.link)}" target="_blank" rel="noopener noreferrer" data-act="rs-link" data-id="${esc(e.id)}">${ic('ext')}${tx('Open link')}</a>`;
  return `<div class="rs-row">${badge(e)}<span class="rs-main"><b>${esc(e.title)}</b>${e.note ? `<span class="rs-note">${esc(e.note)}</span>` : ''}<small>${facts.join(' · ')}</small></span><span class="rs-acts">${acts}</span></div>`;
}

function page(ctx) {
  const got = cachedResources(ctx.storeNo), err = resourceError(ctx.storeNo), list = got || [], cats = [...new Set(list.map(e => e.category || ''))].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b));
  const head = vh(tx('Resources'), sub(txn(list.length, '{n} resource', '{n} resources'), tx('from the owner, for managers')), `<button class="btn" data-act="rs-refresh">${ic('refresh')}${tx('reload::Refresh')}</button>`, 'stack');
  if (err && !got) return head + `<div class="card"><p class="lbl">${tx('The resources did not load: {error}', { error: esc(err) })}</p><button class="btn" data-act="rs-refresh">${ic('refresh')}${tx('Try again')}</button></div>`;
  if (!got) return head + `<div class="card"><div class="ohint">${tx('Loading the resources…')}</div></div>`;
  if (!list.length) return head + `<div class="card rs-empty">${ic('stack')}<p>${tx('No resources yet. The owner adds forms, procedures and links in the console, under Resources.')}</p></div>`;
  if (st.cat !== 'all' && !cats.includes(st.cat)) st.cat = 'all';
  const shown = list.filter(e => (st.cat === 'all' || (e.category || '') === st.cat) && matches(e, st.q));
  const search = `<div class="rs-bar"><div class="search rs-search">${ic('search')}<input data-field="rs-q" value="${esc(st.q)}" placeholder="${tx('Search titles, categories, notes and file names')}" aria-label="${tx('Search the resources')}">${st.q ? `<button class="ibtn" data-act="rs-clear" aria-label="${tx('Clear the search')}">${ic('x')}</button>` : ''}</div>` +
    `<div class="chips rs-cats"><button class="chip${st.cat === 'all' ? ' on' : ''}" data-act="rs-cat" data-cat="all">${tx('All')} <small>${list.length}</small></button>${cats.map(c => `<button class="chip${st.cat === c ? ' on' : ''}" data-act="rs-cat" data-cat="${esc(c)}">${esc(catName(c))} <small>${list.filter(e => (e.category || '') === c).length}</small></button>`).join('')}</div></div>`;
  // Opened most on this PC: a quick way back to the everyday ones.
  const top = !st.q && st.cat === 'all' ? mostUsed(list, 4) : [];
  const fav = top.length ? `<div class="card rs-top"><div class="ch"><h3>${tx('Used most on this PC')}</h3></div><div class="rs-tiles">${top.map(e => `<button class="rs-tile" data-act="rs-open" data-id="${esc(e.id)}">${badge(e)}<span><b>${esc(e.title)}</b><small>${esc(catName(e.category))}</small></span></button>`).join('')}</div></div>` : '';
  let body;
  if (!shown.length) body = `<div class="card"><p class="lbl">${st.q ? tx('Nothing matches “{q}”.', { q: esc(st.q) }) : tx('Nothing in this category.')}</p></div>`;
  else if (st.cat === 'all' && !st.q) body = cats.map(c => { const xs = shown.filter(e => (e.category || '') === c); return xs.length ? `<div class="card rs-group"><div class="ch"><h3>${esc(catName(c))}</h3><span class="cs-dim">${xs.length}</span></div>${xs.map(row).join('')}</div>` : ''; }).join('');
  else body = `<div class="card rs-group"><div class="ch"><h3>${st.q ? tx('Results') : esc(catName(st.cat))}</h3><span class="cs-dim">${shown.length}</span></div>${shown.map(row).join('')}</div>`;
  return head + search + fav + body;
}

export default {
  id: 'resources', title: tx('Resources'), icon: 'stack',
  deskOnly: true,   // not on the phone: no menu row, no search result; a link goes home
  managers: true,   // a store's managers only (the shell asks a team session for the manager code)
  desktop(ctx) {
    // From the search palette: open with that search.
    if (ctx.arg?.q != null && ctx.arg !== usedArg) { usedArg = ctx.arg; st.q = String(ctx.arg.q); st.cat = 'all'; }
    return page(ctx);
  },
  mount(ctx, root) {
    const load = force => loadResources(ctx.api, ctx.storeNo, { force })?.then(() => ctx.rerender(), e => { if (cachedResources(ctx.storeNo)) toast(tx('The resources did not load: {error}', { error: e.message }), 'bad'); else ctx.rerender(); });
    load(false);
    const find = id => (cachedResources(ctx.storeNo) || []).find(e => e.id === id);
    root.addEventListener('click', async ev => {
      const a = ev.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act, e = a.dataset.id && find(a.dataset.id);
      if (act === 'rs-refresh') load(true);
      else if (act === 'rs-cat') { st.cat = a.dataset.cat; ctx.rerender(); }
      else if (act === 'rs-clear') { st.q = ''; ctx.rerender(); }
      else if (act === 'rs-link') { if (e) { ev.preventDefault(); useResource(ctx.api, e); } }
      else if (e && (act === 'rs-open' || act === 'rs-print' || act === 'rs-get')) {
        a.disabled = true;
        await useResource(ctx.api, e, act === 'rs-print' ? 'print' : act === 'rs-get' ? 'get' : 'open');
        a.disabled = false;
      }
    });
    let typing = null;
    root.addEventListener('input', ev => { if (ev.target.matches('[data-field="rs-q"]')) { st.q = ev.target.value; clearTimeout(typing); typing = setTimeout(() => ctx.rerender(), 120); } });
    return [() => clearTimeout(typing)];
  },
};
