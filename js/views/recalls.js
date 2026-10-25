// Recalls and withdrawals: products that must come off sale. Managers add
// each one from the notice (its keycodes pasted in, any item barcodes, what
// to do with the stock) and move it Open → Removing → All removed → Closed;
// anyone records stock they found and moved to the recall bay. Every device
// flags a listed product wherever it is scanned (js/recallflag.js). Reads
// store.get('recalls') (shared/reducers/recall.js); where the morning report
// puts the stock comes from Live pull's lookup, one keycode at a time.
//
// Beside Equipment under Safety & upkeep on a desk; on a phone, managers
// only, as Maintenance is.

import { $, ic, esc, vh, sub, fmtDate, toast, mgr } from '../ui.js';
import { RECALL_STATUSES, liveRecalls } from '../../shared/reducers/recall.js';
import { parseKeycodes } from '../../shared/backfill.js';
import { gs1Parse } from '../../shared/gs1.js';
import { recallTag, recallWord } from '../recallflag.js';
import { tx, txn } from '../i18n.js';

const isManager = s => (s?.roles || []).includes('manager') || !!s?.owner;
const STATUS = { open: tx('issue status::Open'), removing: tx('Removing'), removed: tx('All removed'), closed: tx('Closed') };
const TONE = { open: 'bad', removing: 'warn', removed: 'good', closed: 'info' };
const pill = st => `<span class="status ${TONE[st]}">${STATUS[st]}</span>`;
const st = { sel: null, closed: false, draft: null, bay: null, where: {}, names: {} };

function model(ctx) {
  const rc = ctx.store.get('recalls') || { items: {}, bay: '' }, all = Object.values(rc.items || {});
  const live = liveRecalls(rc), closed = all.filter(r => r.status === 'closed').sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)));
  return { rc, live, closed, bay: rc.bay || '', open: live.filter(r => r.status === 'open').length, removing: live.filter(r => r.status === 'removing').length };
}
// In force: what still needs someone (open or removing). The rail and Today count these.
export function recallsNeeding(store) {
  const live = liveRecalls(store.get('recalls'));
  return { live: live.length, need: live.filter(r => r.status === 'open' || r.status === 'removing').length, recalls: live.filter(r => r.kind === 'recall').length };
}
const headParts = m => [m.live.length ? txn(m.live.length, '{n} in force', '{n} in force') : tx('None in force'), m.open ? tx('{n} open', { n: m.open }) : '', m.removing ? tx('{n} being removed', { n: m.removing }) : ''].filter(Boolean);

function row(r) {
  return `<div class="mfl-row rc-row${r.id === st.sel ? ' on' : ''}" data-act="sel" data-id="${esc(r.id)}"><span class="mfl-main"><span class="mfl-top">${recallTag(r)}<b>${esc(r.title)}</b></span>` +
    `<small>${[r.ref ? esc(r.ref) : '', txn(r.kcs.length, '{n} keycode', '{n} keycodes'), r.units ? tx('{n} moved', { n: r.units }) : '', tx('added {date}', { date: fmtDate(r.added) })].filter(Boolean).join(' · ')}</small></span>${pill(r.status)}${ic('chev')}</div>`;
}
function listCard(m, manager) {
  const groups = st.closed ? [[tx('Closed'), m.closed]] : RECALL_STATUSES.filter(s => s !== 'closed').map(s => [STATUS[s], m.live.filter(r => r.status === s)]);
  const body = groups.filter(([, xs]) => xs.length).map(([t, xs]) => `<div class="pt3">${esc(t)}<span class="cs-dim">${xs.length}</span></div>` + xs.map(row).join('')).join('');
  return `<div class="card mfl rc-list"><div class="pills"><button class="${st.closed ? '' : 'on'}" data-act="tab" data-closed="0">${tx('In force')} ${m.live.length}</button><button class="${st.closed ? 'on' : ''}" data-act="tab" data-closed="1">${tx('Closed')} ${m.closed.length}</button></div>` +
    (body || `<div class="ohint">${st.closed ? tx('Nothing closed in the last 180 days.') : manager ? tx('No recalls or withdrawals in force. Add one from the notice: its keycodes are flagged on every device straight away.') : tx('No recalls or withdrawals in force.')}</div>`) +
    bayLine(m, manager) + `</div>`;
}
function bayLine(m, manager) {
  if (st.bay !== null && manager) return `<div class="rc-bay"><label class="lbl" for="rcBay">${tx('Recall bay')}</label><input class="ad-in" id="rcBay" maxlength="40" value="${esc(st.bay)}" placeholder="${tx('Where recalled stock goes, like Returns cage')}"><button class="btn primary sm" data-act="bay-save">${tx('Save')}</button><button class="btn sm" data-act="bay-cancel">${tx('Cancel')}</button></div>`;
  return `<div class="rc-bay">${ic('pin')}<span>${m.bay ? tx('Recall bay: {bay}', { bay: `<b>${esc(m.bay)}</b>` }) : tx('No recall bay set yet')}</span>${manager ? `<button class="btn sm" data-act="bay">${m.bay ? tx('Change') : tx('Set it')}</button>` : ''}</div>`;
}

// One recall: where it stands, what to do, its keycodes and where the stock is, what was found.
function detail(ctx, r, manager) {
  if (!r) return `<div class="card rc-det"><div class="ohint">${tx('Pick a recall to see its keycodes, where the stock is and what has been moved.')}</div></div>`;
  const i = RECALL_STATUSES.indexOf(r.status);
  const steps = `<div class="rc-steps">${RECALL_STATUSES.map((s, k) => `<span class="${k < i ? 'done' : k === i ? 'cur' : ''}">${k < i ? ic('check') : ''}${STATUS[s]}</span>`).join('')}</div>`;
  const next = { open: 'removing', removing: 'removed', removed: 'closed' }[r.status];
  const acts = manager ? `<div class="acts">${next ? `<button class="btn primary" data-act="status" data-st="${next}">${ic('check')}${{ removing: tx('Mark as removing'), removed: tx('Mark all removed'), closed: tx('Close it') }[next]}</button>` : `<button class="btn" data-act="status" data-st="open">${tx('Reopen')}</button>`}` +
    `${r.status !== 'open' && r.status !== 'closed' ? `<button class="btn" data-act="status" data-st="${RECALL_STATUSES[i - 1]}">${tx('Back a step')}</button>` : ''}<button class="btn" data-act="edit">${ic('edit')}${tx('Edit')}</button></div>` : '';
  const codes = r.kcs.map(kc => {
    const w = st.where[kc], name = st.names[kc];
    const where = !w ? `<span class="cs-dim">${tx('Looking…')}</span>` : w.none ? `<span class="cs-dim">${tx('Not in the latest report')}</span>` : w.bays.length ? `${tx('Stockroom: {bays}', { bays: w.bays.map(b => `<b class="mono">${esc(b)}</b>`).join(', ') })}${w.soh != null ? ` · ${tx('SOH {n}', { n: w.soh })}` : ''}` : tx('No stockroom bay in the report');
    return `<div class="rc-kc"><b class="mono" data-kccard="${esc(kc)}">${esc(kc)}</b><span>${name ? esc(name) : ''}</span><span class="rc-where">${where}</span></div>`;
  }).join('');
  const found = r.found.length ? `<div class="rc-found">${[...r.found].reverse().slice(0, 40).map(f => `<div><b>${f.n}</b><span class="mono">${esc(f.kc)}</span><span>${f.where ? esc(f.where) : ''}</span><span class="cs-dim">${fmtDate(f.t)}</span></div>`).join('')}</div>` : `<p class="lbl">${tx('Nothing recorded yet. Anyone who moves stock to the recall bay records it here or from the red flag when they scan it.')}</p>`;
  return `<div class="card rc-det"><div class="rc-h">${recallTag(r)}<h3>${esc(r.title)}</h3>${r.ref ? `<span class="cs-dim">${esc(r.ref)}</span>` : ''}</div>` +
    `<p class="lbl">${tx('Added {date}', { date: fmtDate(r.added) })}${r.closedAt ? ' · ' + tx('closed {date}', { date: fmtDate(r.closedAt) }) : ''}</p>${steps}${acts}` +
    (r.action ? `<div class="rc-do"><b>${tx('What to do with the stock')}</b><span>${esc(r.action)}</span></div>` : '') +
    (r.reason ? `<div class="rc-why"><b>${tx('Why')}</b><span>${esc(r.reason)}</span></div>` : '') +
    `<div class="pt3">${tx('Keycodes')}<span class="cs-dim">${txn(r.kcs.length, '{n} keycode', '{n} keycodes')}${r.apns?.length ? ' · ' + txn(r.apns.length, '{n} barcode', '{n} barcodes') : ''}</span></div><div class="rc-kcs">${codes}</div>` +
    `<div class="pt3">${tx('Moved to the recall bay')}<span class="cs-dim">${txn(r.units, '{n} unit', '{n} units')}</span></div>${found}` +
    (r.status !== 'closed' ? `<div class="acts"><button class="btn" data-shell-act="recall-found" data-recall="${esc(r.id)}" data-kc="${esc(r.kcs[0])}">${ic('check')}${tx('I moved some')}</button></div>` : '') + `</div>`;
}

// Add or edit: the notice's keycodes pasted in, any barcodes, what to do.
function form(d) {
  const { kcs, bad } = counted(d);
  return `<div class="card rc-det rc-form"><div class="rc-h"><h3>${d.id ? tx('Edit {title}', { title: esc(d.title) }) : tx('Add a recall or withdrawal')}</h3></div>` +
    `<div class="pills">${['recall', 'withdrawal'].map(k => `<button class="${d.kind === k ? 'on' : ''}" data-act="kind" data-kind="${k}">${k === 'recall' ? tx('Recall (safety)') : tx('Withdrawal (off sale)')}</button>`).join('')}</div>` +
    `<label class="lbl" for="rcTitle">${tx('Product')}</label><input class="ad-in" id="rcTitle" data-f="title" maxlength="80" value="${esc(d.title)}" placeholder="${tx('As the notice names it, like Bath toy set 6 pack')}">` +
    `<label class="lbl" for="rcRef">${tx('Notice reference (optional)')}</label><input class="ad-in" id="rcRef" data-f="ref" maxlength="40" value="${esc(d.ref)}">` +
    `<label class="lbl" for="rcKcs">${tx('Keycodes')} <span class="cs-dim" id="rcKcsN">${kcsLine(kcs)}</span></label><textarea class="ad-in mono" id="rcKcs" data-f="kcsText" rows="3">${esc(d.kcsText)}</textarea>` +
    `<label class="lbl" for="rcApns">${tx('Item barcodes (optional)')} <span class="rc-bad" id="rcApnsBad">${badLine(bad)}</span></label><textarea class="ad-in mono" id="rcApns" data-f="apnsText" rows="2">${esc(d.apnsText)}</textarea>` +
    `<label class="lbl" for="rcAction">${tx('What to do with the stock')}</label><textarea class="ad-in" id="rcAction" data-f="action" rows="2" maxlength="300" placeholder="${tx('Like: hold in the recall bay for the DC pickup, or destroy and record')}">${esc(d.action)}</textarea>` +
    `<label class="lbl" for="rcReason">${tx('Why (optional)')}</label><textarea class="ad-in" id="rcReason" data-f="reason" rows="2" maxlength="300">${esc(d.reason)}</textarea>` +
    `<div class="acts"><button class="btn primary" data-act="save">${ic('check')}${d.id ? tx('Save changes') : tx('Add it: every device flags it')}</button><button class="btn" data-act="cancel">${tx('Cancel')}</button></div></div>`;
}
// What the pasted text holds: keycodes, and any barcode that does not read.
const counted = d => ({ kcs: [...new Set(parseKeycodes(d.kcsText).filter(k => /^\d{6,8}$/.test(k)))], bad: d.apnsText.split(/[\s,;]+/).filter(Boolean).filter(x => !gs1Parse(x)?.gtin) });
const kcsLine = kcs => (kcs.length ? txn(kcs.length, '{n} keycode found', '{n} keycodes found') : tx('paste them from the notice: any spacing or commas'));
const badLine = bad => (bad.length ? tx('{code} is not a valid barcode', { code: esc(bad[0]) }) : '');
function readForm(root) {
  if (!st.draft) return;
  for (const el of root.querySelectorAll('[data-f]')) st.draft[el.dataset.f] = el.value;
  const bay = root.querySelector('#rcBay'); if (bay && st.bay !== null) st.bay = bay.value;
}

export default {
  id: 'recalls', title: tx('Recalls'), rail: tx('Recalls'), icon: 'alert',
  deskOnly: s => !isManager(s),
  desktop(ctx) {
    const m = model(ctx), manager = isManager(ctx.session.current);
    if (st.sel && !m.rc.items?.[st.sel]) st.sel = null;
    if (!st.sel && !st.draft && m.live.length) st.sel = m.live[0].id;
    const r = st.sel ? m.rc.items[st.sel] : null;
    return vh(tx('Recalls and withdrawals'), sub(...headParts(m)), manager ? `<button class="btn primary" data-act="new">${ic('plus')}${tx('Add a recall')}</button>` : '', 'alert') +
      `<div class="mgrid rc-grid">${listCard(m, manager)}${st.draft ? form(st.draft) : detail(ctx, r, manager)}</div>`;
  },
  // A manager's phone: the list, or one recall with a way back.
  mobile(ctx) {
    const m = model(ctx), manager = isManager(ctx.session.current), r = st.sel ? m.rc.items?.[st.sel] : null;
    const head = `<div class="mv-head"><div><h2>${tx('Recalls')} ${mgr()}</h2><span>${headParts(m).join(' · ')}</span></div></div>`;
    if (st.draft) return `<div class="rc-m">${head}${form(st.draft)}</div>`;
    if (r) return `<div class="rc-m"><button class="btn sm rc-back" data-act="back">${ic('chev')}${tx('All recalls')}</button>${detail(ctx, r, manager)}</div>`;
    return `<div class="rc-m">${head}${manager ? `<button class="btn primary rc-add" data-act="new">${ic('plus')}${tx('Add a recall')}</button>` : ''}${listCard(m, manager)}</div>`;
  },
  mount(ctx, root) {
    const manager = isManager(ctx.session.current);
    if (ctx.arg?.recall && ctx.store.get('recalls')?.items?.[ctx.arg.recall]) { st.sel = ctx.arg.recall; st.draft = null; st.closed = ctx.store.get('recalls').items[st.sel].status === 'closed'; }
    // Names and where the stock is, for the recall on screen (Live pull's
    // lookup answers any store device whose store has a Stockroom).
    const r = st.sel ? ctx.store.get('recalls')?.items?.[st.sel] : null;
    if (r && !st.draft) {
      let changed = 0; const done = () => { if (!changed++) setTimeout(() => { changed = 0; ctx.rerender(); }, 60); };
      for (const kc of r.kcs.slice(0, 40)) {
        if (!(kc in st.names)) { st.names[kc] = ''; ctx.catalogue.lookup(kc).then(it => { if (it?.name) { st.names[kc] = it.name; done(); } }).catch(() => {}); }
        if (!st.where[kc]) { st.where[kc] = { loading: true }; ctx.api(`/v1/store/${ctx.storeNo}/pull/find?code=${kc}`).then(f => { st.where[kc] = f.report ? { bays: f.bays || [], soh: f.soh } : { none: true }; done(); }).catch(() => { st.where[kc] = { none: true }; done(); }); }
      }
    }
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      try {
        if (act === 'sel') { st.sel = a.dataset.id; st.draft = null; ctx.rerender(); }
        else if (act === 'tab') { st.closed = a.dataset.closed === '1'; st.sel = null; ctx.rerender(); }
        else if (act === 'back') { st.sel = null; st.draft = null; ctx.rerender(); }
        else if (!manager) return;
        else if (act === 'new') { st.draft = { kind: 'recall', title: '', ref: '', kcsText: '', apnsText: '', action: '', reason: '' }; ctx.rerender(); setTimeout(() => root.querySelector('#rcTitle')?.focus(), 30); }
        else if (act === 'edit') { const x = ctx.store.get('recalls').items[st.sel]; if (!x) return; st.draft = { id: x.id, kind: x.kind, title: x.title, ref: x.ref || '', kcsText: x.kcs.join('\n'), apnsText: (x.apns || []).join('\n'), action: x.action || '', reason: x.reason || '' }; ctx.rerender(); }
        else if (act === 'kind') { readForm(root); st.draft.kind = a.dataset.kind; ctx.rerender(); }
        else if (act === 'cancel') { st.draft = null; ctx.rerender(); }
        else if (act === 'save') await save(ctx, root);
        else if (act === 'status') {
          const x = ctx.store.get('recalls').items[st.sel]; if (!x) return;
          if (a.dataset.st === 'closed' && !confirm(tx('Close {title}? Its flags stop on every device.', { title: x.title }))) return;
          await ctx.store.dispatch({ type: 'recall.status', entity: { recall: x.id }, payload: { status: a.dataset.st } });
          toast(tx('{title}: {status}', { title: x.title, status: STATUS[a.dataset.st] }));
        }
        else if (act === 'bay') { st.bay = model(ctx).bay; ctx.rerender(); setTimeout(() => root.querySelector('#rcBay')?.focus(), 30); }
        else if (act === 'bay-cancel') { st.bay = null; ctx.rerender(); }
        else if (act === 'bay-save') { const v = root.querySelector('#rcBay')?.value.trim() || ''; if (v !== model(ctx).bay) await ctx.store.dispatch({ type: 'recall.bay.set', entity: {}, payload: { bay: v } }); st.bay = null; ctx.rerender(); }
      } catch (err) { toast(err.message, 'bad'); }
    });
    // Typing keeps its text; the keycode count follows the paste.
    root.addEventListener('input', e => {
      if (!e.target.matches('[data-f]') || !st.draft) return;
      st.draft[e.target.dataset.f] = e.target.value;
      const c = counted(st.draft), n = $('#rcKcsN', root), b = $('#rcApnsBad', root);
      if (n) n.textContent = kcsLine(c.kcs); if (b) b.innerHTML = badLine(c.bad);
    });
    return [ctx.store.on('recalls', () => { readForm(root); ctx.rerender(); })];
  },
};

async function save(ctx, root) {
  readForm(root);
  const d = st.draft, { kcs, bad } = counted(d), apns = d.apnsText.split(/[\s,;]+/).filter(Boolean);
  if (!d.title.trim()) return toast(tx('Name the product'), 'bad');
  if (!kcs.length) return toast(tx('Paste at least one keycode'), 'bad');
  if (bad.length) return toast(tx('Check the item barcodes: one is not valid'), 'bad');
  const payload = { kind: d.kind, title: d.title.trim(), kcs, apns, ref: d.ref.trim(), action: d.action.trim(), reason: d.reason.trim() };
  if (d.id) await ctx.store.dispatch({ type: 'recall.update', entity: { recall: d.id }, payload });
  else { const id = 'rc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await ctx.store.dispatch({ type: 'recall.add', entity: { recall: id }, payload }); st.sel = id; }
  toast(d.id ? tx('Saved') : tx('{word}: {title} is now flagged on every device', { word: recallWord(d), title: payload.title }));
  st.draft = null; st.closed = false; ctx.rerender();
}
