// The paste pop-up: today's SIM inventory report (morning or midday) or the
// SOH report, straight from the clipboard. Copy the report in SIM, press
// Paste wherever it is asked for (Today, Reports & files, Backfill review)
// and the pop-up reads the clipboard, says what it found and saves it with
// one more click. Something that is not a report says "Incorrect format";
// a browser that will not hand the clipboard over leaves Ctrl V and a box.
//
//   openPasteBox(ctx, { want, text, after })
//     want   'report'  today's inventory report, saved by Backfill review's pasteReport
//            'soh'     the SOH report, opened in Stock intelligence with its rows read
//            'any'     whichever it is (Reports & files' own Paste button)
//     text   what was already pasted (Ctrl V on the screen); else the clipboard is read
//     after  called once a report is saved
//   reportToday(ctx)  today's report as the store holds it: { rep, morning, midday }

import { ic, toast, today } from '../ui.js';
import { hasArea } from '../unlock.js';
import { toolOff, toolForView } from '../../shared/tools.js';
import { parseReportByLocation } from '../../shared/backfill.js';
import { parseReport as parseSoh } from '../../shared/stockintel.js';
import { pasteReport } from './stockroom/bfreview.js';
import { tx, txn } from '../i18n.js';

const stockroom = ctx => (ctx.session.current?.caps || []).includes('stockroom') && hasArea(ctx.session, 'stockroom');
const toolOn = (ctx, view) => !toolOff(ctx.store.get('tools')?.off, toolForView(view));
// Today's SIM report as the store holds it (any desk may have pasted it).
export function reportToday(ctx) {
  const meta = stockroom(ctx) ? ctx.store.get('backfill')?.report : null;
  const rep = meta?.date === today() ? meta : null;
  return { rep, morning: !!rep, midday: !!rep && new Date(rep.at).getHours() >= 12 };
}

const TITLE = { report: tx('Paste today’s inventory report'), soh: tx('Paste the SOH report'), any: tx('Paste a report') };
const WRONG = {
  report: tx('That is not a SIM inventory report. Copy the whole report by location in SIM, then try again.'),
  soh: tx('That is not an SOH report. Copy the whole SOH report in SIM, then try again.'),
  any: tx('That is not a report Conduit can read. Copy the whole report in SIM, then try again.'),
};
// What a paste holds: the bays and keycodes of an inventory report, and the
// rows with an SOH (the SOH report has the same columns).
function read(text) {
  const byLoc = parseReportByLocation(text), soh = Object.keys(parseSoh(text, {}).items).length;
  return { bays: Object.keys(byLoc).length, codes: Object.values(byLoc).reduce((n, l) => n + l.length, 0), soh };
}

export function openPasteBox(ctx, { want = 'any', text, after } = {}) {
  document.getElementById('pbox')?.remove();
  const el = document.createElement('div'); el.id = 'pbox'; el.className = 'sscan pbox';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', TITLE[want]);
  (document.querySelector('.frame') || document.body).appendChild(el);   // in the frame: its accent and zoom
  // phase: reading · found · empty · blocked · wrong · saving
  const s = { phase: 'reading', text: '', found: null };
  const close = () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('paste', onPaste, true); el.remove(); };
  const onKey = e => { if (e.key === 'Escape' && s.phase !== 'saving') { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);

  const take = text => {
    s.text = String(text || '');
    if (!s.text.trim()) { s.phase = 'empty'; return paint(); }
    const r = read(s.text), ok = want === 'report' ? r.bays : want === 'soh' ? r.soh : r.bays || r.soh;
    s.found = ok ? r : null; s.phase = ok ? 'found' : 'wrong'; paint();
  };
  const fromClipboard = async () => {
    s.phase = 'reading'; paint();
    try { take(await navigator.clipboard.readText()); }
    catch { s.phase = 'blocked'; paint(); el.querySelector('[data-pb="box"]')?.focus(); }
  };
  const saveLabel = () => { const { morning } = reportToday(ctx); return !morning ? tx('Save as the morning report') : new Date().getHours() >= 12 ? tx('Save as the midday report') : tx('Save as today’s report again'); };
  const paint = () => {
    const f = s.found, sr = stockroom(ctx);
    const summary = f ? [f.bays ? txn(f.bays, '{n} bay', '{n} bays') : '', f.codes ? txn(f.codes, '{n} keycode', '{n} keycodes') : '', f.soh ? txn(f.soh, '{n} line with an SOH', '{n} lines with an SOH') : ''].filter(Boolean).join(' · ') : '';
    const asReport = f && f.bays && want !== 'soh' && toolOn(ctx, 'bfreview'), asSoh = f && f.soh && want !== 'report' && toolOn(ctx, 'srintel');
    const body = s.phase === 'reading' ? `<div class="pb-state">${ic('clip')}<b>${tx('Reading your clipboard…')}</b></div>`
      : s.phase === 'saving' ? `<div class="pb-state">${ic('clock')}<b>${tx('Saving…')}</b></div>`
      : s.phase === 'found' ? `<div class="pb-state ok">${ic('check')}<div><b>${tx('Found in your clipboard: a SIM report')}</b><span>${summary}</span></div></div>` +
        (sr ? `<div class="pb-acts">${asReport ? `<button class="btn primary" data-pb="save">${ic('check')}${saveLabel()}</button>` : ''}${asSoh ? `<button class="btn${asReport ? '' : ' primary'}" data-pb="soh">${ic('arrow')}${tx('Open it in Stock intelligence')}</button>` : ''}</div>` +
          `<p class="lbl">${asReport ? tx('The inventory report goes to Backfill review, the Day list and Adjustments.') : asSoh ? tx('Stock intelligence shows the rows to check before they are saved.') : tx('This store does not use Backfill review or Stock intelligence.')}</p>`
          : `<p class="lbl">${tx('Reports go to the Stockroom: enter its code on this device first.')}</p>`)
      : s.phase === 'wrong' ? `<div class="pb-state bad">${ic('alert')}<div><b>${tx('Incorrect format')}</b><span>${WRONG[want]}</span></div></div>`
      : s.phase === 'empty' ? `<div class="pb-state">${ic('clip')}<div><b>${tx('Your clipboard is empty')}</b><span>${tx('In SIM, select the whole report (Ctrl A) and copy it (Ctrl C), then come back here.')}</span></div></div>`
      : `<div class="pb-state">${ic('lock')}<div><b>${tx('This browser kept the clipboard to itself')}</b><span>${tx('Press Ctrl V now, or paste into the box below.')}</span></div></div>`;
    el.innerHTML = `<div class="ss-card pb-card"><div class="ss-top"><b>${ic('file')}${TITLE[want]}</b><button class="ibtn" data-pb="close" aria-label="${tx('Close')}">${ic('x')}</button></div><div class="pb-body">${body}` +
      (s.phase === 'found' || s.phase === 'saving' || s.phase === 'reading' ? '' : `<div class="pb-acts"><button class="btn primary" data-pb="clip">${ic('clip')}${tx('Paste from clipboard')}</button></div>`) +
      (s.phase === 'blocked' || s.phase === 'wrong' || s.phase === 'empty' ? `<details class="pb-manual"${s.phase === 'blocked' ? ' open' : ''}><summary>${tx('Or paste it in a box')}</summary><textarea class="ad-in inp-paste" data-pb="box" rows="5" placeholder="${tx('Paste the report here (Ctrl V)')}"></textarea><button class="btn sm" data-pb="read">${ic('check')}${tx('Read it')}</button></details>` : '') +
      `</div></div>`;
  };
  el.addEventListener('click', async e => {
    if (e.target === el && s.phase !== 'saving') return close();   // a click outside the card
    const b = e.target.closest('[data-pb]'); if (!b || b.tagName === 'TEXTAREA') return;
    const act = b.dataset.pb;
    if (act === 'close') return close();
    if (act === 'clip') return fromClipboard();
    if (act === 'read') return take(el.querySelector('[data-pb="box"]')?.value);
    if (act === 'soh') { const text = s.text; close(); return ctx.go('srintel', { paste: text }); }
    if (act === 'save') {
      s.phase = 'saving'; paint();
      try {
        const r = await pasteReport(ctx, s.text);
        if (!r) { s.phase = 'wrong'; return paint(); }
        close();
        toast(txn(r.bays, 'Report pasted: {n} bay, {codes} codes', 'Report pasted: {n} bays, {codes} codes', { codes: r.codes }) + (r.sent ? ' · ' + tx('{n} at 0 or less sent to Adjustments', { n: r.sent }) : ''), '', r.sent ? { label: tx('Open'), run: () => ctx.go('adjust') } : null);
        after?.(r);
      } catch (err) { s.phase = 'found'; paint(); toast(err.message, 'bad'); }
    }
  });
  // Ctrl V while it is open is read at once (it needs no permission).
  const onPaste = e => { if (s.phase === 'saving') return; const t = e.clipboardData?.getData('text'); if (t != null) { e.preventDefault(); take(t); } };
  document.addEventListener('paste', onPaste, true);
  if (text != null) take(text); else fromClipboard();
  return close;
}
