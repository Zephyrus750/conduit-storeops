// Owner console › Resources: the library of files and links every store's
// managers see on their PC (js/views/resources.js). Add one with a title, a
// category and a note, a file (PDF, pictures, Word, Excel, PowerPoint, CSV,
// text) or a link, for every store or the ones picked; edit, replace its
// file, open it, remove it. The registry keeps the entries
// (shared/resources.js) and the worker the files; each change is an owner
// action. A store with Resources switched off (its Access tab) sees none.
// Requests: what stores' managers asked for that the library lacks, waiting
// ones first; Add it opens the form with the request's words and marks it
// added with the new entry; Decline asks for a word why; the store sees the
// answer on its Resources page.
// Picture for the stores: when a PDF or a picture is picked, its page is
// drawn here (js/pagepic.js) and saved with the file, so managers see the
// page itself on their Resources page. Another page, a different picture,
// or (Word, Excel and the like, which cannot be drawn here) the kind's
// cover. Files added before pictures existed get theirs from Make the pictures.

import { ic, esc, vh, sub, toast, fmtDate } from '../ui.js';
import { tx, txn } from '../i18n.js';
import { ask } from '../sheet.js';
import { fileKind, matches, sameTitle, FILE_EXTS, FILE_MAX } from '../../shared/resources.js';
import { invalidate } from './admin.js';
import { canPicture, readPdf, pictureOf } from '../pagepic.js';
import { thumbUrl } from '../resourcelib.js';

const st = { list: null, error: null, q: '', edit: null, busy: false, reqs: null, from: null, allReqs: false, pic: null, making: null };
// st.pic, the picture panel beside the form: { name, ext, label, pdf, pages, page, made: { blob, w, h, url, from, page },
// busy, error, keep, remove, changed, entry } (entry: the one being edited, when no new file is picked).
const ACCEPT = FILE_EXTS.map(x => '.' + x).join(',');
const kb = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
const fail = e => toast(e.code === 'unauthorised' ? tx('Owner session expired. Sign in again.') : e.message, 'bad');
const storesText = (e, all) => e.stores === 'all' ? tx('Every store') : e.stores.map(no => { const s = all.find(x => String(x.no) === no); return s ? `${no} ${s.name}` : no; }).join(', ');

const storeName = (no, all) => { const x = all.find(s => String(s.no) === String(no)); return x ? `${no} ${x.name}` : String(no); };
const REQ_ST = { open: [tx('Waiting'), 'warn'], added: [tx('Added'), 'good'], declined: [tx('Declined'), 'bad'] };

// Stores' requests: waiting ones first, then the latest answers.
function requests(ctx) {
  const all = ctx.admin.stores || [], reqs = st.reqs || [], open = reqs.filter(q => q.status === 'open'), done = reqs.filter(q => q.status !== 'open');
  if (!reqs.length) return '';
  const shown = [...open.sort((a, b) => a.created.localeCompare(b.created)), ...(st.allReqs ? done : done.slice(0, 5))];
  const row = q => {
    const [label, cls] = REQ_ST[q.status], res = q.resource && (st.list || []).find(e => e.id === q.resource);
    const acts = q.status === 'open'
      ? `<button class="btn sm primary" data-act="rq-add" data-id="${esc(q.id)}">${ic('plus')}${tx('Add it')}</button><button class="btn sm" data-act="rq-done" data-id="${esc(q.id)}" title="${tx('It is in the library already: mark it added')}">${ic('check')}${tx('Mark added')}</button><button class="btn sm" data-act="rq-no" data-id="${esc(q.id)}">${ic('x')}${tx('Decline')}</button>`
      : `<button class="btn sm" data-act="rq-open" data-id="${esc(q.id)}">${ic('refresh')}${tx('Reopen')}</button>`;
    return `<tr class="rq-${q.status}"><td><b>${esc(q.title)}</b>${q.note ? `<div class="cs-dim">${esc(q.note)}</div>` : ''}${q.reply ? `<div class="rq-reply">${tx('Answer: {reply}', { reply: esc(q.reply) })}</div>` : ''}${res ? `<div class="cs-dim">${tx('Added as {title}', { title: esc(res.title) })}</div>` : ''}</td><td>${esc(storeName(q.store, all))}</td><td class="mono">${esc(fmtDate(q.created))}</td><td><span class="status ${cls}">${label}</span></td><td class="rsa-acts">${acts}</td></tr>`;
  };
  return `<div class="card rq-card"><div class="ch"><h3>${tx('Requests from stores')}</h3><span class="cs-dim">${open.length ? txn(open.length, '{n} waiting', '{n} waiting') : tx('All answered')}</span>${done.length > 5 ? `<button class="btn sm" data-act="rq-more" style="margin-left:auto">${st.allReqs ? tx('Latest answers only') : txn(done.length, 'Show all {n} answered', 'Show all {n} answered')}</button>` : ''}</div>` +
    `<table class="wb-t rsa-t"><thead><tr><th>${tx('Document asked for')}</th><th>${tx('Store')}</th><th>${tx('Asked')}</th><th>${tx('State')}</th><th></th></tr></thead><tbody>${shown.map(row).join('')}</tbody></table></div>`;
}

// ── the picture for the stores ─────────────────────────────────────────
const isPdf = name => fileKind(name)?.ext === 'pdf';
const FROM = m => m.from === 'page' ? tx('Made from page {n}', { n: m.page }) : m.from === 'file' ? tx('Made from the picture') : tx('Your own picture');
function dropPic() { if (st.pic?.made?.url) URL.revokeObjectURL(st.pic.made.url); st.pic?.pdf?.close(); st.pic = null; }
function setMade(m) { if (st.pic.made?.url) URL.revokeObjectURL(st.pic.made.url); st.pic.made = m; st.pic.changed = true; st.pic.keep = false; st.pic.remove = false; st.pic.error = ''; }
function picCard(ctx) {
  const p = st.pic, head = `<h4>${tx('Picture for the stores')}</h4>`;
  if (!p) return `<div class="card rsa-pic" id="rsaPic"><div class="rsa-pic-pg"><span class="rs-blank"></span></div><div class="rsa-pic-t">${head}<p class="cs-dim">${tx('Pick a PDF or a picture: its page shows here, and on every store’s Resources page.')}</p></div></div>`;
  const k = fileKind(p.name), other = !canPicture(p.name), e = p.entry, cur = !p.changed && !p.remove && e?.thumb ? thumbUrl(ctx.admin.api, e, () => paintPic(ctx), '/v1/admin/resources') : null;
  const btn = (act, label, cls = '') => `<button type="button" class="btn${cls}" data-act="${act}"${p.busy ? ' disabled' : ''}>${label}</button>`;
  const other1 = `<label class="btn${p.busy ? ' disabled' : ''}">${ic('image')}${tx('Use a different picture')}<input type="file" accept="image/*" data-pic="own" hidden></label>`;
  let pg, t;
  if (p.busy) { pg = `<span class="rs-blank rsa-busy"></span>`; t = `<p class="cs-dim">${tx('Making the picture…')}</p>`; }
  else if (p.made) {
    pg = `<img src="${p.made.url}" alt="">`;
    t = `<p class="rsa-ok">${ic('check')}${FROM(p.made)}</p><p class="cs-dim">${tx('Managers see this page large before they open, print or download.')}</p>` +
      `<div class="rsa-pic-acts">${p.pdf && p.pages > 1 ? `<div class="rsa-step"><button type="button" class="btn sm" data-act="pic-page" data-d="-1" aria-label="${tx('Previous page')}"${p.page <= 1 && p.made.from === 'page' ? ' disabled' : ''}>‹</button><span>${tx('Page {n} of {total}', { n: p.page, total: p.pages })}</span><button type="button" class="btn sm" data-act="pic-page" data-d="1" aria-label="${tx('Next page')}"${p.page >= p.pages && p.made.from === 'page' ? ' disabled' : ''}>›</button></div>` : ''}${other1}</div>`;
  } else if (cur || (e?.thumb && !p.changed && !p.remove)) {
    pg = cur ? `<img src="${cur}" alt="">` : `<span class="rs-blank"></span>`;
    t = `<p class="rsa-ok">${ic('check')}${FROM(e.thumb)}</p><p class="cs-dim">${tx('Managers see this page large before they open, print or download.')}</p><div class="rsa-pic-acts">${isPdf(p.name) ? btn('pic-load', tx('Choose another page')) : ''}${other1}${btn('pic-remove', tx('Remove the picture'))}</div>`;
  } else if (other || p.keep || p.remove) {
    pg = `<span class="rs-cover ${esc(k?.ext || '')}"><i>${esc(({ Word: 'W', Excel: 'X', PowerPoint: 'P', CSV: 'CSV', Text: 'TXT', PDF: 'PDF' })[k?.label] || '')}${k?.label === 'Picture' ? ic('image') : ''}</i><b>${esc(p.name.replace(/\.[^.]+$/, ''))}</b><small>${esc(k?.label || '')}</small></span>`;
    t = (p.remove ? `<p class="cs-dim">${tx('Removed when you save: the stores see this cover.')}</p>` : other ? `<p class="cs-dim">${tx('A {kind} file can’t show its page here, so the stores see this cover. Add a picture of it, or save it as a PDF, and they see the real page.', { kind: esc(k?.label || '') })}</p>` : `<p class="cs-dim">${tx('No picture yet: the stores see the cover.')}</p>`) +
      `<div class="rsa-pic-acts">${other ? `<label class="btn primary${p.busy ? ' disabled' : ''}">${ic('image')}${tx('Add a picture of it')}<input type="file" accept="image/*" data-pic="own" hidden></label>${p.keep ? '' : btn('pic-keep', tx('Keep the cover'))}` : `${btn('pic-load', isPdf(p.name) ? tx('Make it from page 1') : tx('Make it from the picture'), ' primary')}${other1}`}</div>`;
  } else {
    pg = `<span class="rs-blank"></span>`;
    t = `<p class="cs-dim">${tx('No picture yet: the stores see the cover.')}</p><div class="rsa-pic-acts">${btn('pic-load', isPdf(p.name) ? tx('Make it from page 1') : tx('Make it from the picture'), ' primary')}${other1}</div>`;
  }
  return `<div class="card rsa-pic" id="rsaPic"><div class="rsa-pic-pg">${pg}</div><div class="rsa-pic-t">${head}${p.error ? `<p class="rsa-err">${esc(p.error)}</p>` : ''}${t}</div></div>`;
}
// The panel redraws on its own: a full redraw would lose what is typed in the form and the picked file.
function paintPic(ctx) { const el = document.getElementById('rsaPic'); if (el) el.outerHTML = picCard(ctx); }
async function makeFrom(ctx, run) {
  st.pic.busy = true; st.pic.error = ''; paintPic(ctx);
  try { await run(); } catch (err) { st.pic.error = tx('The picture could not be made: {error}', { error: err.message || String(err) }); }
  if (st.pic) { st.pic.busy = false; paintPic(ctx); }
}
async function pdfPage(ctx, n) { const p = st.pic; await makeFrom(ctx, async () => { const m = await p.pdf.page(n); if (st.pic !== p) return URL.revokeObjectURL(m.url); p.page = Math.min(Math.max(1, n), p.pages); setMade({ ...m, from: 'page', page: p.page }); }); }
// A file picked in the form: a PDF's page 1, a picture scaled, anything else its cover.
async function pickFile(ctx, file, entry = null) {
  dropPic();
  const p = st.pic = { name: file?.name || entry?.file?.name || '', pdf: null, pages: entry?.file?.pages || 0, page: entry?.thumb?.page || 1, made: null, busy: false, error: '', keep: false, remove: false, changed: false, entry: file ? null : entry };
  if (!file) { paintPic(ctx); return; }
  if (isPdf(file.name)) await makeFrom(ctx, async () => { const d = await readPdf(file); if (st.pic !== p) return d.close(); p.pdf = d; p.pages = d.pages; p.page = 1; const m = await d.page(1); setMade({ ...m, from: 'page', page: 1 }); });
  else if (canPicture(file.name)) await makeFrom(ctx, async () => { const m = await pictureOf(file); if (st.pic !== p) return URL.revokeObjectURL(m.url); setMade({ ...m, from: 'file', page: null }); });
  else paintPic(ctx);
}
// The entry's own file, from the worker: for a page of a PDF already in the library.
const fileOf = async (ctx, e) => new Blob([await ctx.admin.api(`/v1/admin/resources/${encodeURIComponent(e.id)}/file?download=1`, { blob: true, timeoutMs: 120_000 })], { type: e.file.type });
const sendPic = (ctx, id, m, pages) => ctx.admin.api(`/v1/admin/resources/${encodeURIComponent(id)}/thumb?from=${m.from}&w=${m.w}&h=${m.h}${m.page ? `&page=${m.page}` : ''}${pages ? `&pages=${pages}` : ''}`, { method: 'POST', raw: m.blob, rawType: 'image/jpeg', timeoutMs: 60_000 });
// A file with no picture: its page 1 (a PDF) or itself scaled (a picture); null for the rest.
async function autoPic(blob, name) {
  if (isPdf(name)) { const d = await readPdf(blob); try { return { ...(await d.page(1)), from: 'page', page: 1, pages: d.pages }; } finally { d.close(); } }
  if (canPicture(name)) return { ...(await pictureOf(blob)), from: 'file', page: null };
  return null;
}
const noPic = list => list.filter(e => e.file && !e.thumb && canPicture(e.file.name));

function form(ctx, e, pre = null) {
  const all = ctx.admin.stores || [], cats = [...new Set((st.list || []).map(x => x.category).filter(Boolean))].sort();
  // A request opens for every store, with the store that asked ticked should it be for that store only.
  const some = e && e.stores !== 'all', picked = new Set(some ? e.stores : pre ? [String(pre.store)] : []);
  return `<form class="card rsa-form" data-form="resource"><div class="ch"><h3>${e ? tx('Edit {title}', { title: esc(e.title) }) : tx('Add a resource')}</h3>${pre ? `<span class="cs-dim">${tx('Asked for by {store}', { store: esc(storeName(pre.store, all)) })}</span>` : ''}</div>` +
    `<div class="ad-grid2"><label class="ad-field"><span>${tx('Title')}</span><input class="ad-in" name="title" value="${esc(e?.title || pre?.title || '')}" maxlength="80" required placeholder="${tx('e.g. {example}', { example: tx('Daily opening checklist') })}"></label>` +
    `<label class="ad-field"><span>${tx('Category')}</span><input class="ad-in" name="category" value="${esc(e?.category || '')}" maxlength="40" list="rsaCats" placeholder="${tx('e.g. {example}', { example: tx('Forms') })}"><datalist id="rsaCats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label></div>` +
    `<label class="ad-field"><span>${tx('Note')}</span><input class="ad-in" name="note" value="${esc(e?.note || pre?.note || '')}" maxlength="200" placeholder="${tx('What it is for, or how to print it (optional)')}"></label>` +
    `<div class="ad-grid2"><label class="ad-field"><span>${e?.file ? tx('Replace the file (optional)') : tx('File')}</span><input class="ad-in" type="file" name="file" accept="${ACCEPT}"><small class="cs-dim">${e?.file ? tx('Now: {name} · {size}', { name: esc(e.file.name), size: kb(e.file.size) }) : tx('PDF, pictures, Word, Excel, PowerPoint, CSV or text, up to {mb} MB', { mb: FILE_MAX / 1e6 })}</small></label>` +
    `<label class="ad-field"><span>${tx('or a link')}</span><input class="ad-in" name="link" value="${esc(e?.link || '')}" maxlength="500" placeholder="https://"><small class="cs-dim">${tx('A web page to open instead of a file')}</small></label></div>` +
    `<fieldset class="rsa-stores"><legend>${tx('Stores')}</legend><label class="rsa-radio"><input type="radio" name="scope" value="all"${some ? '' : ' checked'}> ${tx('Every store')}</label><label class="rsa-radio"><input type="radio" name="scope" value="some"${some ? ' checked' : ''}> ${tx('Only the stores picked')}</label>` +
    `<div class="rsa-pick">${all.map(s => `<label><input type="checkbox" name="store" value="${esc(s.no)}"${picked.has(String(s.no)) ? ' checked' : ''}> <span class="mono">${esc(s.no)}</span> ${esc(s.name)}</label>`).join('') || `<span class="cs-dim">${tx('No stores yet')}</span>`}</div></fieldset>` +
    `<div class="pf-acts"><button class="btn primary" type="submit"${st.busy ? ' disabled' : ''}>${ic('check')}${st.busy ? tx('Saving…') : e ? tx('Save') : tx('Add it')}</button><button class="btn" type="button" data-act="rsa-cancel"${st.busy ? ' disabled' : ''}>${tx('Cancel')}</button></div></form>`;
}

function page(ctx) {
  const all = ctx.admin.stores || [], list = st.list || [], shown = list.filter(e => matches(e, st.q));
  const waiting = (st.reqs || []).filter(q => q.status === 'open').length;
  const head = vh(tx('Resources'), sub(tx('files and links for every store’s managers'), txn(list.length, '{n} resource', '{n} resources'), waiting ? txn(waiting, '{n} request waiting', '{n} requests waiting') : ''), `<button class="btn" data-act="rsa-reload">${ic('refresh')}${tx('reload::Refresh')}</button><button class="btn primary" data-act="rsa-new">${ic('plus')}${tx('Add a resource')}</button>`, 'library');
  const editing = st.edit ? `<div class="rsa-wrap">${st.edit === 'new' ? form(ctx, null, st.from && (st.reqs || []).find(q => q.id === st.from)) : form(ctx, list.find(e => e.id === st.edit))}${picCard(ctx)}</div>` : '';
  const missing = noPic(list), banner = missing.length && !st.edit ? `<div class="card rsa-nopic"><span>${ic('image')}${st.making ? tx('Making pictures: {done} of {n}…', { done: st.making.done, n: st.making.n }) : txn(missing.length, '{n} file has no picture for the stores yet', '{n} files have no picture for the stores yet')}</span>${st.making ? '' : `<button class="btn sm primary" data-act="rsa-pics">${tx('Make the pictures')}</button>`}</div>` : '';
  if (st.error && !st.list) return head + `<div class="card"><p class="lbl">${esc(st.error)}</p></div>`;
  if (!st.list) return head + `<div class="card"><div class="ohint">${tx('Loading…')}</div></div>`;
  const rows = shown.map(e => {
    const k = e.file && fileKind(e.file.name);
    const what = e.file ? `<span class="rs-kind ${k?.ext || ''}">${esc(k?.label || '')}</span> ${esc(e.file.name)} <small class="cs-dim">${kb(e.file.size)}${e.file.pages ? ' · ' + txn(e.file.pages, '{n} page', '{n} pages') : ''}</small>${!e.thumb && canPicture(e.file.name) ? ` <span class="status warn">${tx('no picture yet')}</span>` : ''}` : e.link ? `<span class="rs-kind link">${ic('ext')}</span> <a href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">${esc(e.link.replace(/^https:\/\//, '').slice(0, 48))}</a>` : `<span class="status warn">${tx('No file yet: stores do not see it')}</span>`;
    return `<tr><td><b>${esc(e.title)}</b>${e.note ? `<div class="cs-dim">${esc(e.note)}</div>` : ''}</td><td>${esc(e.category || '—')}</td><td class="rsa-what">${what}</td><td>${esc(storesText(e, all))}</td><td class="mono">${esc(fmtDate(e.updated))}</td>` +
      `<td class="rsa-acts">${e.file ? `<button class="btn sm" data-act="rsa-open" data-id="${esc(e.id)}" title="${k?.inline ? tx('Open') : tx('Download')}">${ic(k?.inline ? 'ext' : 'arrow')}</button>` : ''}<label class="btn sm" title="${e.file ? tx('Replace the file') : tx('Upload a file')}">${ic('file')}<input type="file" accept="${ACCEPT}" data-upload="${esc(e.id)}" hidden></label><button class="btn sm" data-act="rsa-edit" data-id="${esc(e.id)}">${ic('edit')}${tx('Edit')}</button><button class="btn sm" data-act="rsa-del" data-id="${esc(e.id)}" title="${tx('Remove')}" aria-label="${tx('Remove {title}', { title: esc(e.title) })}">${ic('trash')}</button></td></tr>`;
  }).join('');
  const table = list.length ? `<div class="card"><div class="rs-bar"><div class="search rs-search">${ic('search')}<input data-field="rsa-q" value="${esc(st.q)}" placeholder="${tx('Search the library')}" aria-label="${tx('Search the library')}"></div></div><table class="wb-t rsa-t"><thead><tr><th>${tx('Title')}</th><th>${tx('Category')}</th><th>${tx('File or link')}</th><th>${tx('Stores')}</th><th>${tx('Updated')}</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="cs-dim">${tx('Nothing matches.')}</td></tr>`}</tbody></table></div>`
    : st.edit ? '' : `<div class="card rs-empty">${ic('library')}<p>${tx('Nothing in the library yet. Add the forms, procedures and links managers reach for most: every store’s PC lists them under Resources.')}</p><button class="btn primary" data-act="rsa-new">${ic('plus')}${tx('Add a resource')}</button></div>`;
  return head + editing + banner + requests(ctx) + table + `<p class="lbl">${tx('Managers see these on a store PC under Resources, searchable and by category. Switch Resources off for a store on its Access tab.')}</p>`;
}

async function upload(ctx, id, file, pages = 0) {
  const kind = fileKind(file.name);
  if (!kind) throw new Error(tx('{name} is not a file Resources takes: PDF, pictures, Word, Excel, PowerPoint, CSV or text', { name: file.name }));
  if (file.size > FILE_MAX) throw new Error(tx('{name} is over {mb} MB', { name: file.name, mb: FILE_MAX / 1e6 }));
  return ctx.admin.api(`/v1/admin/resources/${encodeURIComponent(id)}/file?name=${encodeURIComponent(file.name)}${pages ? `&pages=${pages}` : ''}`, { method: 'POST', raw: file, rawType: kind.type, timeoutMs: 180_000 });
}

export default {
  id: 'adminresources', title: tx('Resources'), icon: 'library',
  desktop(ctx) { return page(ctx); },
  mount(ctx, root) {
    const load = () => ctx.admin.api('/v1/admin/resources').then(r => { st.list = r.resources || []; st.error = null; ctx.rerender(); }).catch(e => { st.error = e.message; fail(e); ctx.rerender(); });
    if (!st.list && !st.error) load();
    const loadReqs = () => ctx.admin.api('/v1/admin/resources/requests').then(r => { st.reqs = r.requests || []; ctx.rerender(); }).catch(() => {});
    if (!st.reqs) loadReqs();
    const answer = async (q, body, msg) => { try { const n = await ctx.admin.api(`/v1/admin/resources/requests/${encodeURIComponent(q.id)}`, { method: 'PATCH', body }); st.reqs = st.reqs.map(x => x.id === n.id ? n : x); if (msg) toast(msg); ctx.rerender(); return n; } catch (err) { fail(err); return null; } };
    root.addEventListener('click', async ev => {
      const a = ev.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act, e = a.dataset.id && (st.list || []).find(x => x.id === a.dataset.id);
      const q = a.dataset.id && (st.reqs || []).find(x => x.id === a.dataset.id);
      if (act === 'rsa-reload') { st.list = null; st.error = null; load(); loadReqs(); ctx.rerender(); }
      else if (act === 'rq-more') { st.allReqs = !st.allReqs; ctx.rerender(); }
      else if (act === 'rq-add' && q) { st.edit = 'new'; st.from = q.id; ctx.rerender(); root.querySelector('[data-form="resource"]')?.scrollIntoView({ block: 'nearest' }); root.querySelector('[name="title"]')?.focus(); }
      else if (act === 'rq-done' && q) { const have = (st.list || []).find(e => sameTitle(e.title, q.title)); await answer(q, { status: 'added', ...(have ? { resource: have.id } : {}) }, tx('{title} marked added', { title: q.title })); }
      else if (act === 'rq-no' && q) { const why = prompt(tx('Decline {title}? A word why, for the store (optional):', { title: q.title }), ''); if (why === null) return; await answer(q, { status: 'declined', reply: why }, tx('{title} declined', { title: q.title })); }
      else if (act === 'rq-open' && q) await answer(q, { status: 'open' }, tx('{title} is waiting again', { title: q.title }));
      else if (act === 'rsa-new') { dropPic(); st.edit = 'new'; st.from = null; ctx.rerender(); root.querySelector('[name="title"]')?.focus(); }
      else if (act === 'rsa-edit') { dropPic(); st.edit = a.dataset.id; if (e?.file) pickFile(ctx, null, e); ctx.rerender(); root.querySelector('[name="title"]')?.focus(); }
      else if (act === 'rsa-cancel') { dropPic(); st.edit = null; st.from = null; ctx.rerender(); }
      else if (act === 'pic-page' && st.pic?.pdf) pdfPage(ctx, st.pic.made?.from === 'page' ? st.pic.page + Number(a.dataset.d) : st.pic.page);
      else if (act === 'pic-keep' && st.pic) { if (st.pic.made?.url) URL.revokeObjectURL(st.pic.made.url); st.pic.made = null; st.pic.changed = false; st.pic.keep = true; paintPic(ctx); }
      else if (act === 'pic-remove' && st.pic) { st.pic.remove = true; st.pic.changed = false; paintPic(ctx); }
      else if (act === 'pic-load' && st.pic?.entry) {
        // A file already in the library: fetch it and draw its page (or scale the picture).
        const p = st.pic, en = p.entry;
        await makeFrom(ctx, async () => {
          const blob = await fileOf(ctx, en); if (st.pic !== p) return;
          if (isPdf(en.file.name)) { p.pdf = await readPdf(blob); p.pages = p.pdf.pages; const n = Math.min(p.page || 1, p.pages), m = await p.pdf.page(n); p.page = n; setMade({ ...m, from: 'page', page: n }); }
          else { const m = await pictureOf(blob); setMade({ ...m, from: 'file', page: null }); }
        });
      }
      else if (act === 'rsa-pics') {
        // Files added before pictures existed: page 1 of each PDF, each picture scaled; one at a time.
        const todo = noPic(st.list || []); if (!todo.length || st.making) return;
        st.making = { done: 0, n: todo.length }; ctx.rerender();
        // The banner counts in place: a redraw would lose anything typed meanwhile.
        const count = () => { const el = document.querySelector('.rsa-nopic > span'); if (el) el.innerHTML = `${ic('image')}${tx('Making pictures: {done} of {n}…', { done: st.making.done, n: st.making.n })}`; };
        let made = 0;
        for (const en of todo) {
          try { const m = await autoPic(await fileOf(ctx, en), en.file.name); if (m) { const out = await sendPic(ctx, en.id, m, m.pages); URL.revokeObjectURL(m.url); st.list = st.list.map(x => x.id === out.id ? out : x); made++; } }
          catch (err) { toast(tx('The picture could not be made: {error}', { error: `${en.title}: ${err.message || err}` }), 'bad'); }
          st.making.done++; count();
        }
        st.making = null; invalidate(); toast(txn(made, '{n} picture made', '{n} pictures made'));
        if (document.querySelector('.rsa-nopic')) ctx.rerender();   // still on this page
      }
      else if (act === 'rsa-del' && e) {
        if (!await ask({ title: tx('Remove {title} from every store?', { title: e.title }), text: tx('Its file is deleted too.'), ok: tx('Remove resource') })) return;
        try { await ctx.admin.api(`/v1/admin/resources/${encodeURIComponent(e.id)}`, { method: 'DELETE' }); st.list = st.list.filter(x => x.id !== e.id); invalidate(); toast(tx('{title} removed', { title: e.title })); ctx.rerender(); } catch (err) { fail(err); }
      }
      else if (act === 'rsa-open' && e) {
        // A PDF or a picture opens in a tab; Word, Excel and the rest download.
        const inline = fileKind(e.file.name)?.inline, w = inline ? window.open('', '_blank') : null;
        try {
          const b = await ctx.admin.api(`/v1/admin/resources/${encodeURIComponent(e.id)}/file${inline ? '' : '?download=1'}`, { blob: true, timeoutMs: 120_000 }), url = URL.createObjectURL(new Blob([b], { type: e.file.type }));
          if (w) w.location.href = url; else { const l = document.createElement('a'); l.href = url; l.download = e.file.name; document.body.appendChild(l); l.click(); l.remove(); }
          setTimeout(() => URL.revokeObjectURL(url), 120_000);
        } catch (err) { w?.close(); fail(err); }
      }
    });
    root.addEventListener('submit', async ev => {
      if (!ev.target.matches('[data-form="resource"]')) return;
      ev.preventDefault();
      const f = ev.target, v = n => f.elements[n]?.value ?? '', file = f.elements.file?.files?.[0] || null, editing = st.edit !== 'new' ? (st.list || []).find(x => x.id === st.edit) : null;
      const stores = v('scope') === 'some' ? [...f.querySelectorAll('[name="store"]:checked')].map(x => x.value) : 'all';
      if (stores !== 'all' && !stores.length) return toast(tx('Pick at least one store, or Every store'), 'bad');
      if (!editing && !file && !v('link').trim()) return toast(tx('Add a file or a link'), 'bad');
      if (file && !fileKind(file.name)) return toast(tx('{name} is not a file Resources takes: PDF, pictures, Word, Excel, PowerPoint, CSV or text', { name: file.name }), 'bad');
      st.busy = true; f.querySelector('[type="submit"]').disabled = true;
      try {
        const body = { title: v('title'), category: v('category'), note: v('note'), link: v('link').trim(), stores };
        let e = editing ? await ctx.admin.api(`/v1/admin/resources/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body }) : await ctx.admin.api('/v1/admin/resources', { method: 'POST', body });
        st.list = [e, ...(st.list || []).filter(x => x.id !== e.id)]; st.edit = e.id;   // kept open on this entry if the upload fails
        const pic = st.pic;
        if (file) { toast(tx('Uploading {name}…', { name: file.name })); e = await upload(ctx, e.id, file, pic?.pdf ? pic.pages : 0); st.list = st.list.map(x => x.id === e.id ? e : x); }
        // The picture: the new one, or none (a new file drops the old one; Remove the picture drops it too).
        if (pic?.made && pic.changed && (file || e.file)) e = await sendPic(ctx, e.id, pic.made, pic.pdf ? pic.pages : 0);
        else if (pic?.remove && !file && e.thumb) e = await ctx.admin.api(`/v1/admin/resources/${encodeURIComponent(e.id)}/thumb`, { method: 'DELETE' });
        st.list = st.list.map(x => x.id === e.id ? e : x);
        dropPic(); st.edit = null; invalidate();
        const asked = !editing && st.from && (st.reqs || []).find(x => x.id === st.from); st.from = null;
        if (asked) await answer(asked, { status: 'added', resource: e.id });
        toast(editing ? tx('{title} saved', { title: e.title }) : asked ? tx('{title} added: {store} sees it, and the answer', { title: e.title, store: asked.store }) : tx('{title} added', { title: e.title }));
      } catch (err) { fail(err); }
      st.busy = false; ctx.rerender();
    });
    root.addEventListener('change', async ev => {
      const t = ev.target;
      // The form's file: its picture is drawn beside the form.
      if (t.matches('[data-form="resource"] [name="file"]')) { const f = t.files?.[0]; if (f) pickFile(ctx, f); else pickFile(ctx, null, st.edit !== 'new' ? (st.list || []).find(x => x.id === st.edit) : null); return; }
      // A picture of the document the owner picked instead.
      if (t.dataset?.pic === 'own') {
        const f = t.files?.[0]; t.value = ''; if (!f || !st.pic) return;
        const p = st.pic; await makeFrom(ctx, async () => { const m = await pictureOf(f); if (st.pic !== p) return URL.revokeObjectURL(m.url); setMade({ ...m, from: 'picture', page: null }); });
        return;
      }
      const id = t.dataset?.upload; if (!id) return;
      const file = t.files?.[0]; t.value = ''; if (!file) return;
      try {
        // A replaced file gets its picture made here too: page 1 of a PDF, a picture scaled.
        let m = null; try { m = await autoPic(file, file.name); } catch (err) { toast(tx('The picture could not be made: {error}', { error: err.message || String(err) }), 'bad'); }
        toast(tx('Uploading {name}…', { name: file.name }));
        let e = await upload(ctx, id, file, m?.pages || 0);
        if (m) { e = await sendPic(ctx, id, m, m.pages).catch(err => { fail(err); return e; }); URL.revokeObjectURL(m.url); }
        st.list = st.list.map(x => x.id === id ? e : x); invalidate(); toast(tx('{name} uploaded', { name: file.name })); ctx.rerender();
      } catch (err) { fail(err); }
    });
    let typing = null;
    root.addEventListener('input', ev => { if (ev.target.matches('[data-field="rsa-q"]')) { st.q = ev.target.value; clearTimeout(typing); typing = setTimeout(() => ctx.rerender(), 120); } });
    return [() => clearTimeout(typing)];
  },
};
