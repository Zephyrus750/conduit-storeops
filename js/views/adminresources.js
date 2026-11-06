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

import { ic, esc, vh, sub, toast, fmtDate } from '../ui.js';
import { tx, txn } from '../i18n.js';
import { fileKind, matches, sameTitle, FILE_EXTS, FILE_MAX } from '../../shared/resources.js';
import { invalidate } from './admin.js';

const st = { list: null, error: null, q: '', edit: null, busy: false, reqs: null, from: null, allReqs: false };
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
  const editing = st.edit === 'new' ? form(ctx, null, st.from && (st.reqs || []).find(q => q.id === st.from)) : st.edit ? form(ctx, list.find(e => e.id === st.edit)) : '';
  if (st.error && !st.list) return head + `<div class="card"><p class="lbl">${esc(st.error)}</p></div>`;
  if (!st.list) return head + `<div class="card"><div class="ohint">${tx('Loading…')}</div></div>`;
  const rows = shown.map(e => {
    const k = e.file && fileKind(e.file.name);
    const what = e.file ? `<span class="rs-kind ${k?.ext || ''}">${esc(k?.label || '')}</span> ${esc(e.file.name)} <small class="cs-dim">${kb(e.file.size)}</small>` : e.link ? `<span class="rs-kind link">${ic('ext')}</span> <a href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">${esc(e.link.replace(/^https:\/\//, '').slice(0, 48))}</a>` : `<span class="status warn">${tx('No file yet: stores do not see it')}</span>`;
    return `<tr><td><b>${esc(e.title)}</b>${e.note ? `<div class="cs-dim">${esc(e.note)}</div>` : ''}</td><td>${esc(e.category || '—')}</td><td class="rsa-what">${what}</td><td>${esc(storesText(e, all))}</td><td class="mono">${esc(fmtDate(e.updated))}</td>` +
      `<td class="rsa-acts">${e.file ? `<button class="btn sm" data-act="rsa-open" data-id="${esc(e.id)}" title="${k?.inline ? tx('Open') : tx('Download')}">${ic(k?.inline ? 'ext' : 'arrow')}</button>` : ''}<label class="btn sm" title="${e.file ? tx('Replace the file') : tx('Upload a file')}">${ic('file')}<input type="file" accept="${ACCEPT}" data-upload="${esc(e.id)}" hidden></label><button class="btn sm" data-act="rsa-edit" data-id="${esc(e.id)}">${ic('edit')}${tx('Edit')}</button><button class="btn sm" data-act="rsa-del" data-id="${esc(e.id)}" title="${tx('Remove')}" aria-label="${tx('Remove {title}', { title: esc(e.title) })}">${ic('trash')}</button></td></tr>`;
  }).join('');
  const table = list.length ? `<div class="card"><div class="rs-bar"><div class="search rs-search">${ic('search')}<input data-field="rsa-q" value="${esc(st.q)}" placeholder="${tx('Search the library')}" aria-label="${tx('Search the library')}"></div></div><table class="wb-t rsa-t"><thead><tr><th>${tx('Title')}</th><th>${tx('Category')}</th><th>${tx('File or link')}</th><th>${tx('Stores')}</th><th>${tx('Updated')}</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="cs-dim">${tx('Nothing matches.')}</td></tr>`}</tbody></table></div>`
    : st.edit ? '' : `<div class="card rs-empty">${ic('library')}<p>${tx('Nothing in the library yet. Add the forms, procedures and links managers reach for most: every store’s PC lists them under Resources.')}</p><button class="btn primary" data-act="rsa-new">${ic('plus')}${tx('Add a resource')}</button></div>`;
  return head + editing + requests(ctx) + table + `<p class="lbl">${tx('Managers see these on a store PC under Resources, searchable and by category. Switch Resources off for a store on its Access tab.')}</p>`;
}

async function upload(ctx, id, file) {
  const kind = fileKind(file.name);
  if (!kind) throw new Error(tx('{name} is not a file Resources takes: PDF, pictures, Word, Excel, PowerPoint, CSV or text', { name: file.name }));
  if (file.size > FILE_MAX) throw new Error(tx('{name} is over {mb} MB', { name: file.name, mb: FILE_MAX / 1e6 }));
  return ctx.admin.api(`/v1/admin/resources/${encodeURIComponent(id)}/file?name=${encodeURIComponent(file.name)}`, { method: 'POST', raw: file, rawType: kind.type, timeoutMs: 180_000 });
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
      else if (act === 'rsa-new') { st.edit = 'new'; st.from = null; ctx.rerender(); root.querySelector('[name="title"]')?.focus(); }
      else if (act === 'rsa-edit') { st.edit = a.dataset.id; ctx.rerender(); root.querySelector('[name="title"]')?.focus(); }
      else if (act === 'rsa-cancel') { st.edit = null; st.from = null; ctx.rerender(); }
      else if (act === 'rsa-del' && e) {
        if (!confirm(tx('Remove {title} from every store? Its file is deleted too.', { title: e.title }))) return;
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
        if (file) { toast(tx('Uploading {name}…', { name: file.name })); e = await upload(ctx, e.id, file); st.list = st.list.map(x => x.id === e.id ? e : x); }
        st.edit = null; invalidate();
        const asked = !editing && st.from && (st.reqs || []).find(x => x.id === st.from); st.from = null;
        if (asked) await answer(asked, { status: 'added', resource: e.id });
        toast(editing ? tx('{title} saved', { title: e.title }) : asked ? tx('{title} added: {store} sees it, and the answer', { title: e.title, store: asked.store }) : tx('{title} added', { title: e.title }));
      } catch (err) { fail(err); }
      st.busy = false; ctx.rerender();
    });
    root.addEventListener('change', async ev => {
      const id = ev.target.dataset?.upload; if (!id) return;
      const file = ev.target.files?.[0]; ev.target.value = ''; if (!file) return;
      try { toast(tx('Uploading {name}…', { name: file.name })); const e = await upload(ctx, id, file); st.list = st.list.map(x => x.id === id ? e : x); invalidate(); toast(tx('{name} uploaded', { name: file.name })); ctx.rerender(); } catch (err) { fail(err); }
    });
    let typing = null;
    root.addEventListener('input', ev => { if (ev.target.matches('[data-field="rsa-q"]')) { st.q = ev.target.value; clearTimeout(typing); typing = setTimeout(() => ctx.rerender(), 120); } });
    return [() => clearTimeout(typing)];
  },
};
