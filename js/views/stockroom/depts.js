// Departments: which stockroom bays belong to which department, for the
// whole store (K2B's department builder). The departments and their colours
// are the same in every store; the store only says which bay numbers are
// whose: a from–to range, or one bay (a pin, which beats any range around
// it). Edited as a draft on this device and saved in one change
// (dept.ranges.set) with the Stockroom or manager code. Backfill review,
// History and Adjustments group by it.

import { $, ic, esc, vh, sub, toast, ago } from '../../ui.js';
import { SR_DEPTS, SR_GROUPS, deptLabel, deptColour, send } from './common.js';
import { settingsOf } from '../../../shared/reducers/store.js';
import { tx, txn } from '../../i18n.js';

const st = { store: null, draft: null, paste: false, text: '' };
const order = (a, b) => a.from - b.from || a.to - b.to || a.dept.localeCompare(b.dept);
const saved = ctx => [...(settingsOf(ctx.store.get('settings')).deptRanges || [])].sort(order);
const current = ctx => st.draft || saved(ctx);
const same = (a, b) => JSON.stringify([...a].sort(order)) === JSON.stringify([...b].sort(order));
const span = r => r.from === r.to ? String(r.from) : `${r.from}–${r.to}`;
const KNOWN = new Set(SR_DEPTS.map(d => d.id));
// The draft goes back to null once it matches what is saved, so live changes show again.
const setDraft = (ctx, list) => { st.draft = same(list, saved(ctx)) ? null : list; };

// "7001-7040 h1" or "7057 h2", one a line; the codes must be departments.
export function parseDeptLines(text) {
  const ranges = [], bad = [];
  for (const l of String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
    const m = /^(\d{1,6})(?:\s*[-–]\s*(\d{1,6}))?\s+([a-z0-9]{1,12})$/i.exec(l);
    const from = m && Number(m[1]), to = m && Number(m[2] ?? m[1]), dept = m && m[3].toLowerCase();
    if (!m || from > to || !KNOWN.has(dept)) bad.push(l); else ranges.push({ from, to, dept });
  }
  return { ranges, bad };
}
// A bay has one pin: a new pin for it replaces the old; the same range twice is kept once.
function addTo(list, r) {
  if (list.some(x => x.from === r.from && x.to === r.to && x.dept === r.dept)) return { list, note: tx('{bays} is already {dept}', { bays: span(r), dept: r.dept.toUpperCase() }) };
  const old = r.from === r.to ? list.find(x => x.from === r.from && x.to === r.to) : null;
  return { list: [...list.filter(x => x !== old), r].sort(order), note: old ? tx('{bay} moved from {from} to {to}', { bay: r.from, from: old.dept.toUpperCase(), to: r.dept.toUpperCase() }) : '' };
}

function card(d, list) {
  const mine = list.map((r, i) => ({ r, i })).filter(x => x.r.dept === d.id);
  const pins = mine.filter(x => x.r.from === x.r.to).length;
  return `<div class="dpt-card" style="--dc:${deptColour(d.id)}"><div class="dpt-h"><span class="dep" style="background:${deptColour(d.id)}">${esc(d.id.toUpperCase())}</span><b>${esc(d.name)}</b><small>${[mine.length - pins ? txn(mine.length - pins, '{n} range', '{n} ranges') : '', pins ? txn(pins, '{n} single bay', '{n} single bays') : ''].filter(Boolean).join(' · ')}</small></div>` +
    `<div class="dpt-chips">${mine.length ? mine.map(({ r, i }) => `<span class="dpt-chip${r.from === r.to ? ' pin' : ''}" title="${r.from === r.to ? tx('One bay: beats any range around it') : tx('Bays {from} to {to}', { from: r.from, to: r.to })}">${esc(span(r))}<button type="button" data-act="dpt-x" data-i="${i}" aria-label="${tx('Remove {bays} from {dept}', { bays: esc(span(r)), dept: esc(d.id.toUpperCase()) })}">${ic('x')}</button></span>`).join('') : `<span class="dpt-none">${tx('No bays yet')}</span>`}</div>` +
    `<div class="dpt-add"><input class="ad-in mono" data-field="dpt-from" data-dept="${d.id}" inputmode="numeric" autocomplete="off" placeholder="${tx('bay range::From')}" aria-label="${tx('{dept}: from bay', { dept: esc(deptLabel(d.id)) })}"><span>–</span><input class="ad-in mono" data-field="dpt-to" data-dept="${d.id}" inputmode="numeric" autocomplete="off" placeholder="${tx('bay range::To')}" title="${tx('Leave empty for one bay')}" aria-label="${tx('{dept}: to bay, empty for one bay', { dept: esc(deptLabel(d.id)) })}"><button type="button" class="btn sm" data-act="dpt-add" data-dept="${d.id}">${ic('plus')}${tx('Add')}</button></div></div>`;
}

function body(ctx) {
  if (st.store !== ctx.storeNo) Object.assign(st, { store: ctx.storeNo, draft: null, paste: false, text: '' });
  const list = current(ctx), raw = ctx.store.get('settings'), dirty = !!st.draft;
  const pins = list.filter(r => r.from === r.to).length, odd = list.map((r, i) => ({ r, i })).filter(x => !KNOWN.has(x.r.dept));
  const head = vh(tx('Departments'), sub(tx('Stockroom bays by department'), list.length ? `${txn(list.length - pins, '{n} range', '{n} ranges')} · ${txn(pins, '{n} single bay', '{n} single bays')}` : tx('none set yet'), !dirty && raw?.at ? tx('saved {ago}', { ago: esc(ago(raw.at)) }) : ''),
    `<button class="btn" data-act="dpt-paste">${ic('clip')}${tx('Paste a list')}</button>` + (dirty ? `<span class="dpt-state dirty">${tx('Not saved yet')}</span>` : `<span class="dpt-state">${ic('check')}${tx('Saved')}</span>`), 'tag');
  const help = `<p class="dpt-help">${tx('Departments and their colours are the same in every store: add the stockroom bay numbers that belong to each one, a <b>from–to</b> range, or one bay with <b>To</b> left empty. One bay beats any range around it, so an odd bay in another department’s run is one entry. You can set a department before the team reaches it. Saved for the whole store; Backfill review, History and Adjustments group by it.')}</p>`;
  const paste = st.paste ? `<div class="card dpt-pastecard"><div class="ch"><h3>${tx('Paste a list')}</h3><span class="go" data-act="dpt-paste">${tx('Close')}</span></div><textarea class="sri-ta mono" data-field="dpt-text" rows="6" placeholder="${tx('One a line:\n7001-7040 h1\n7057 h2')}">${esc(st.text)}</textarea><div class="sri-acts">${pasteActs()}</div></div>` : '';
  const groups = SR_GROUPS.map(([g, gl]) => { const ds = SR_DEPTS.filter(d => d.group === g); return `<section class="dpt-group"><h3 class="dpt-gh">${esc(gl)}</h3><div class="dpt-grid">${ds.map(d => card(d, list)).join('')}</div></section>`; }).join('');
  const oddCard = odd.length ? `<section class="dpt-group"><h3 class="dpt-gh">${tx('Not a department here')}</h3><p class="dpt-help">${tx('These codes came from another app and match no department. Remove them, then add the bays under the right one.')}</p><div class="dpt-chips">${odd.map(({ r, i }) => `<span class="dpt-chip">${esc(span(r))} ${esc(r.dept.toUpperCase())}<button type="button" data-act="dpt-x" data-i="${i}" aria-label="${tx('Remove {bays}', { bays: esc(span(r)) })}">${ic('x')}</button></span>`).join('')}</div></section>` : '';
  const bar = dirty ? `<div class="dpt-bar"><span>${ic('alert')}${tx('Changes not saved yet: the rest of the store still sees the saved departments.')}</span><button class="btn" data-act="dpt-discard">${tx('Discard')}</button><button class="btn primary" data-act="dpt-save">${ic('check')}${tx('Save for the store')}</button></div>` : '';
  return head + help + paste + bar + groups + oddCard;
}

function pasteActs() {
  const { ranges, bad } = parseDeptLines(st.text), off = ranges.length ? '' : ' disabled';
  return `<span>${txn(ranges.length, '<b>{n}</b> line read', '<b>{n}</b> lines read')}${bad.length ? ` · <span class="warn">${txn(bad.length, '{n} line not read: {list}', '{n} lines not read: {list}', { list: esc(bad.slice(0, 3).join(', ')) + (bad.length > 3 ? '…' : '') })}</span>` : ''}</span><button class="btn primary sm" data-act="dpt-paste-add"${off}>${tx('Add these')}</button><button class="btn sm" data-act="dpt-paste-replace"${off}>${tx('Replace all with these')}</button>`;
}

function addOne(ctx, root, dept) {
  const f = $(`[data-field="dpt-from"][data-dept="${dept}"]`, root), t = $(`[data-field="dpt-to"][data-dept="${dept}"]`, root);
  const a = String(f?.value || '').trim(), b = String(t?.value || '').trim();
  if (!/^\d{1,6}$/.test(a)) { toast(tx('Type a bay number, like 7001 (add “To” only for a range)'), 'bad'); f?.focus(); return; }
  if (b && !/^\d{1,6}$/.test(b)) { toast(tx('“To” is a bay number too; leave it empty for one bay'), 'bad'); t?.focus(); return; }
  let from = Number(a), to = b ? Number(b) : from; if (from > to) [from, to] = [to, from];
  const cur = current(ctx), { list, note } = addTo(cur, { from, to, dept });
  if (list === cur) { toast(note); return; }
  setDraft(ctx, list); if (note) toast(note);
  ctx.rerender();
  requestAnimationFrame(() => $(`[data-field="dpt-from"][data-dept="${dept}"]`, document)?.focus());
}

async function save(ctx) {
  const ranges = st.draft; if (!ranges) return;
  if (ranges.length > 200) return toast(tx('At most 200 ranges: merge some neighbouring bays into one range'), 'bad');
  const ok = await send(ctx, 'dept.ranges.set', {}, { ranges });
  if (!ok) return;
  st.draft = null; toast(txn(ranges.length, 'Departments saved for the store: {n} entry', 'Departments saved for the store: {n} entries')); ctx.rerender();
}

export default {
  id: 'srdepts', title: tx('Departments'), icon: 'tag', area: 'stockroom', deskOnly: true,
  desktop(ctx) { return `<div class="dpt">${body(ctx)}</div>`; },
  mobile() { return ''; },
  mount(ctx, root) {
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'dpt-add') addOne(ctx, root, a.dataset.dept);
      else if (act === 'dpt-x') { const list = [...current(ctx)]; list.splice(Number(a.dataset.i), 1); setDraft(ctx, list); ctx.rerender(); }
      else if (act === 'dpt-discard') { st.draft = null; ctx.rerender(); }
      else if (act === 'dpt-save') await save(ctx);
      else if (act === 'dpt-paste') { st.paste = !st.paste; ctx.rerender(); if (st.paste) requestAnimationFrame(() => $('[data-field="dpt-text"]', document)?.focus()); }
      else if (act === 'dpt-paste-add' || act === 'dpt-paste-replace') {
        const { ranges, bad } = parseDeptLines(st.text);
        if (!ranges.length) return;
        if (act === 'dpt-paste-replace' && current(ctx).length && !confirm(tx('Replace all {n} entries with these {m}? Nothing is saved until you press Save.', { n: current(ctx).length, m: ranges.length }))) return;
        let list = act === 'dpt-paste-replace' ? [] : current(ctx);
        for (const r of ranges) list = addTo(list, r).list;
        setDraft(ctx, list); st.paste = false; st.text = '';
        toast(bad.length ? txn(ranges.length, '{n} line added; {bad} not read. Save to share them with the store.', '{n} lines added; {bad} not read. Save to share them with the store.', { bad: bad.length }) : txn(ranges.length, '{n} line added. Save to share them with the store.', '{n} lines added. Save to share them with the store.')); ctx.rerender();
      }
    });
    root.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !e.target.matches('[data-field="dpt-from"], [data-field="dpt-to"]')) return;
      e.preventDefault(); addOne(ctx, root, e.target.dataset.dept);
    });
    root.addEventListener('input', e => {
      if (!e.target.matches('[data-field="dpt-text"]')) return;
      st.text = e.target.value;
      const acts = $('.dpt-pastecard .sri-acts', root); if (acts) acts.innerHTML = pasteActs();
    });
    return [ctx.store.on('settings', () => { if (!st.draft) ctx.rerender(); })];
  },
};
