// Reports & files (the Version A rail, under Today): everything the store
// brings in, in one place. One box takes a paste or a file and says what it
// found before anything is saved; the list below says what is due today,
// what each one feeds and where it comes from. Each kind is saved by the
// screen it feeds, through that screen's own code:
//   the SIM inventory report   Backfill review's paste (pasteReport): the
//                              morning one is required, the midday optional
//   the SOH report             Stock intelligence, opened with the paste read
//   a DC manifest              the publish preview Manifests uses
//   the off-site master list   Off-site pallets' import
//   any other sheet of pallets a load in Manifests, with the column mapper

import { ic, esc, vh, toast, fmtDate, today } from '../ui.js';
import { hasArea } from '../unlock.js';
import { toolOff, toolForView } from '../../shared/tools.js';
import { settingsOf } from '../../shared/reducers/store.js';
import { parseReportByLocation } from '../../shared/backfill.js';
import { parseReport as parseSoh } from '../../shared/stockintel.js';
import { pasteReport } from './stockroom/bfreview.js';
import { previewManifest } from './backdock/mpreview.js';
import { manifestIndex, fmtHM } from './backdock/common.js';
import { stageFile, stagePanel, saveStage, stageChange } from './backdock/loads.js';
import { tx, txn } from '../i18n.js';

// drop: what the box read, { text, bays, codes, soh } for a SIM paste.
// stage: a sheet waiting for a look (the off-site list, or another load).
const st = { drop: null, stage: null, saved: null };

const entitled = (ctx, area) => (ctx.session.current?.caps || []).includes(area);
const readable = (ctx, area) => entitled(ctx, area) && hasArea(ctx.session, area);
const toolOn = (ctx, view) => !toolOff(ctx.store.get('tools')?.off, toolForView(view));
const hm = at => fmtHM(new Date(at).toISOString());

// Today's SIM report as the store holds it (any desk may have pasted it).
function reportToday(ctx) {
  const meta = readable(ctx, 'stockroom') ? ctx.store.get('backfill')?.report : null;
  const rep = meta?.date === today() ? meta : null;
  return { rep, morning: !!rep, midday: !!rep && new Date(rep.at).getHours() >= 12 };
}
// The list: one row per thing the store brings in, in this store's areas.
function inputs(ctx) {
  const rows = [], t = today(), need = area => tx('Needs the {area} code', { area: area === 'backdock' ? tx('Back dock') : tx('Stockroom') });
  if (entitled(ctx, 'stockroom') && toolOn(ctx, 'bfreview')) {
    const ok = readable(ctx, 'stockroom'), { rep, morning, midday } = reportToday(ctx);
    rows.push({ name: tx('Morning inventory report'), need: [tx('Required'), 'due'], when: tx('Every morning, before backfill starts'), status: !ok ? [need('stockroom'), ''] : morning ? [tx('Pasted {time} · {bays} bays · {codes} codes', { time: hm(rep.at), bays: rep.bays, codes: rep.codes }), 'ok'] : [tx('Not pasted yet'), 'bad'], feeds: tx('Backfill review, the Day list and Adjustments'), from: tx('SIM: the inventory report by location, the whole report'), act: [morning ? tx('Re-paste') : tx('Paste'), 'paste'] });
    rows.push({ name: tx('Midday report'), need: [tx('Optional'), 'opt'], when: tx('After 12:00 if there is time: it takes about 10 minutes to generate'), status: !ok ? [need('stockroom'), ''] : midday ? [tx('Pasted {time}', { time: hm(rep.at) }), 'ok'] : [tx('Not today yet'), ''], feeds: tx('Backfill review'), from: tx('The same report as the morning'), act: [tx('Paste'), 'paste'] });
  }
  if (entitled(ctx, 'backdock') && toolOn(ctx, 'manifests')) {
    const ok = readable(ctx, 'backdock'), dock = ok ? ctx.store.get('dock') : null, mans = dock ? Object.values(dock.manifests || {}) : [];
    const todayN = mans.filter(m => (m.publishedAt || '').slice(0, 10) === t).length, waiting = dock ? manifestIndex(dock).filter(m => !m.truck).length : 0;
    rows.push({ name: tx('DC manifests'), need: [tx('Per truck'), 'opt'], when: tx('Before the truck lands'), status: !ok ? [need('backdock'), ''] : todayN ? [txn(todayN, '{n} published today', '{n} published today'), 'ok'] : [waiting ? txn(waiting, 'None today · {n} in the library', 'None today · {n} in the library') : tx('None today'), ''], feeds: tx('Receiving, Plan and Carton profiles'), from: tx('The DC’s manifest file (.xls), from the email'), act: [tx('Upload'), 'file'] });
  }
  if (entitled(ctx, 'stockroom') && toolOn(ctx, 'srintel')) {
    const ok = readable(ctx, 'stockroom'), dates = Object.keys(ctx.store.get('soh')?.snaps || {}).sort(), last = dates.at(-1);
    const stale = !last || (Date.parse(t) - Date.parse(last)) / 86400000 >= 7;
    rows.push({ name: tx('SOH report'), need: [tx('Weekly'), 'opt'], when: tx('Mondays'), status: !ok ? [need('stockroom'), ''] : last ? [txn(dates.length, '{n} snapshot · last {date}', '{n} snapshots · last {date}', { date: fmtDate(last) }), stale ? 'due' : 'ok'] : [tx('None saved yet'), 'due'], feeds: tx('Stock intelligence and the Day list'), from: tx('SIM: the SOH report for the whole store'), act: [tx('Paste'), 'paste'] });
  }
  if (entitled(ctx, 'backdock') && toolOn(ctx, 'offsite')) {
    const ok = readable(ctx, 'backdock'), I = ok ? ctx.store.get('inventory') || {} : {}, loads = Object.values(I.loads || {}), last = loads.map(l => l.date || '').sort().at(-1);
    rows.push({ name: tx('Other loads'), need: [tx('When needed'), ''], when: tx('When a load is not on a DC manifest'), status: !ok ? [need('backdock'), ''] : last ? [tx('Last load {date}', { date: fmtDate(last) }), ''] : [tx('None yet'), ''], feeds: tx('Plan › Manifests, under Other loads'), from: tx('Any sheet of pallets and keycodes (.csv or .xlsx)'), act: [tx('Upload'), 'file'] });
    const n = Object.keys(I.offsite || {}).length;
    rows.push({ name: tx('Off-site master list'), need: [tx('When needed'), ''], when: tx('When the off-site list changes'), status: !ok ? [need('backdock'), ''] : I.offsiteAt ? [txn(n, 'Read {date} · {n} pallet', 'Read {date} · {n} pallets', { date: fmtDate(String(I.offsiteAt).slice(0, 10)) }), ''] : [tx('Not read yet'), ''], feeds: tx('Plan › Off-site pallets'), from: tx('The off-site master list (.xlsx)'), act: [tx('Upload'), 'file'] });
  }
  if (entitled(ctx, 'stockroom')) {
    const n = settingsOf(ctx.store.get('settings')).deptRanges.length;
    rows.push({ name: tx('Department ranges'), need: [tx('Set up once'), ''], when: tx('When stockroom bays change'), status: n ? [txn(n, 'Set · {n} range', 'Set · {n} ranges'), 'ok'] : [tx('Not set yet'), 'due'], feeds: tx('Backfill review and Adjustments'), from: tx('Settings › Departments'), act: [tx('Open'), 'view:srdepts'] });
  }
  return rows;
}

// What the box found in a paste: a SIM report, today's inventory report or
// the SOH report (the same columns; the person says which). The likely one
// is first: the morning report until it is in, then the midday one.
function found(ctx) {
  const d = st.drop; if (!d) return '';
  const { morning } = reportToday(ctx), sr = readable(ctx, 'stockroom');
  const save = !morning ? tx('Save as the morning report') : new Date().getHours() >= 12 ? tx('Save as the midday report') : tx('Save as today’s report again');
  return `<div class="inp-found"><div class="inp-fh"><span class="chip opt">${tx('Recognised')}</span><b>${tx('A SIM report')}</b></div>` +
    `<p>${[d.bays ? txn(d.bays, '{n} bay', '{n} bays') : '', d.codes ? txn(d.codes, '{n} keycode', '{n} keycodes') : '', d.soh ? txn(d.soh, '{n} line with an SOH', '{n} lines with an SOH') : ''].filter(Boolean).join(' · ')}</p>` +
    (sr ? `<div class="inp-goes">${d.bays && toolOn(ctx, 'bfreview') ? `<div><b>${tx('Today’s inventory report')}</b><span>${tx('Goes to Backfill review, the Day list and Adjustments.')}</span><button class="btn primary sm" data-act="save-report">${ic('check')}${save}</button></div>` : ''}${d.soh && toolOn(ctx, 'srintel') ? `<div><b>${tx('The SOH report')}</b><span>${tx('Goes to Stock intelligence, where you check it before it is saved.')}</span><button class="btn sm" data-act="to-soh">${ic('arrow')}${tx('Open it in Stock intelligence')}</button></div>` : ''}</div>`
      : `<p class="lbl">${tx('Reports go to the Stockroom: enter its code on this device first.')}</p>`) +
    `<div class="acts2"><button class="btn sm" data-act="drop-clear">${tx('Cancel')}</button></div></div>`;
}

export default {
  id: 'inputs', title: tx('Reports & files'), icon: 'file',
  deskOnly: true,   // the phone scans; reports and files come in on a PC
  desktop(ctx) {
    const rows = inputs(ctx), done = rows.filter(r => r.status[1] === 'ok').length;
    const head = vh(tx('Reports & files'), tx('Everything the store brings in, in one place: what is due, what is done, and where it comes from.'), '', 'file');
    const box = `<div class="card inp-drop" data-drop><div class="inp-dh"><span class="inp-ic">${ic('file')}</span><div><h3>${tx('Paste or drop anything here')}</h3><p>${tx('The morning or midday report, a DC manifest, a sheet of pallets, the off-site master list or the SOH report. Conduit works out which it is and shows what it found before anything is saved.')}</p></div></div>` +
      `<textarea class="ad-in inp-paste" data-field="paste" rows="4" placeholder="${tx('Paste a SIM report here, or drop a file on this box')}" aria-label="${tx('Paste a report')}"></textarea>` +
      `<div class="acts2"><button class="btn primary sm" data-act="read">${ic('check')}${tx('Read it')}</button><label class="btn sm">${ic('file')}${tx('Choose a file')}<input type="file" accept=".xls,.xlsx,.csv" data-field="file" hidden></label></div>` +
      found(ctx) + (st.saved ? `<div class="inp-saved" role="status">${ic('check')}<span>${st.saved}</span></div>` : '') + `</div>`;
    const table = rows.length ? `<div class="card inp-list"><div class="ch"><h3>${tx('What comes in')}</h3><span class="cs-dim">${tx('{done} of {total} done today', { done, total: rows.length })}</span></div><div class="mfx-scroll"><table class="wb-t inp-t"><thead><tr><th>${tx('What')}</th><th>${tx('When')}</th><th>${tx('Today')}</th><th>${tx('It feeds')}</th><th>${tx('Where it comes from')}</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${r.name}</b><span class="chip ${r.need[1]}">${r.need[0]}</span></td><td>${r.when}</td><td><span class="chip ${r.status[1]}">${esc(r.status[0])}</span></td><td class="cs-dim">${r.feeds}</td><td class="cs-dim">${r.from}</td><td>${r.act[1].startsWith('view:') ? `<button class="btn sm" data-view="${r.act[1].slice(5)}">${r.act[0]}</button>` : `<button class="btn sm" data-act="${r.act[1]}">${r.act[0]}</button>`}</td></tr>`).join('')}</tbody></table></div></div>` : '';
    return head + box + stagePanel(ctx, st.stage) + table;
  },
  mount(ctx, root) {
    const read = text => {
      st.saved = null;
      if (!String(text || '').trim()) return toast(tx('Paste a report into the box first'), 'bad');
      const byLoc = parseReportByLocation(text), soh = Object.keys(parseSoh(text, {}).items).length;
      const bays = Object.keys(byLoc).length, codes = Object.values(byLoc).reduce((n, l) => n + l.length, 0);
      if (!bays && !soh) { st.drop = null; ctx.rerender(); return toast(tx('Nothing recognised: a SIM report needs a location and a keycode on each line.'), 'bad'); }
      st.drop = { text, bays, codes, soh }; ctx.rerender();
    };
    const takeFile = async f => {
      st.saved = null; st.drop = null;
      const s = await stageFile(f); if (!s) return;
      if (s.kind === 'load') {   // a DC manifest: Manifests' own preview, then publish
        if (!toolOn(ctx, 'manifests') || !entitled(ctx, 'backdock')) return toast(tx('This store does not use Manifests'), 'bad');
        try { const r = await previewManifest(ctx, f); if (r) { st.saved = tx('Manifest {man} published · {consols} consols, {cartons} cartons', { man: r.manNo, consols: r.consols, cartons: r.totalCartons }); ctx.rerender(); } }
        catch (err) { toast(tx('Could not publish {file}: {error}', { file: f.name, error: err.message }), 'bad'); }
        return;
      }
      if (!toolOn(ctx, 'offsite') || !entitled(ctx, 'backdock')) return toast(tx('This store does not use Off-site pallets and other loads'), 'bad');
      st.stage = s; ctx.rerender();
    };
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a || a.tagName === 'INPUT') return;
      const act = a.dataset.act;
      if (act === 'read') return read(root.querySelector('[data-field="paste"]')?.value);
      if (act === 'paste') { const t = root.querySelector('[data-field="paste"]'); t?.scrollIntoView({ block: 'center' }); return t?.focus(); }
      if (act === 'file') return root.querySelector('[data-field="file"]')?.click();
      if (act === 'drop-clear') { st.drop = null; return ctx.rerender(); }
      if (act === 'to-soh') { const text = st.drop?.text; st.drop = null; return ctx.go('srintel', { paste: text }); }
      if (act === 'save-report') {
        a.disabled = true;
        try {
          const r = await pasteReport(ctx, st.drop?.text || ''); st.drop = null;
          st.saved = r ? txn(r.bays, 'Report pasted: {n} bay, {codes} codes', 'Report pasted: {n} bays, {codes} codes', { codes: r.codes }) + (r.sent ? ' · ' + tx('{n} at 0 or less sent to Adjustments', { n: r.sent }) : '') : null;
          if (!r) toast(tx('No location lines found. Each line needs a bay number and a keycode.'), 'bad');
          ctx.rerender();
        } catch (err) { a.disabled = false; toast(err.message, 'bad'); }
        return;
      }
      if (act === 'stage-cancel') { st.stage = null; return ctx.rerender(); }
      if (act === 'stage-save') {
        const s = st.stage; if (!s) return; a.disabled = true;
        try { const r = await saveStage(ctx, s); st.stage = null; st.saved = r.kind === 'offsite' ? tx('Off-site register saved') : tx('Load added to Manifests'); ctx.rerender(); }
        catch (err) { a.disabled = false; toast(tx('Couldn’t save: {error}', { error: err.message || err }), 'bad'); }
      }
    });
    root.addEventListener('change', async e => {
      if (st.stage && (e.target.closest('[data-col]') || e.target.closest('[data-stage]'))) { if (stageChange(st.stage, e.target)) ctx.rerender(); return; }
      if (e.target.matches('[data-field="file"]')) { const f = e.target.files?.[0]; e.target.value = ''; if (f) await takeFile(f); }
    });
    // A paste reads straight away; a file can be dropped anywhere on the box.
    root.addEventListener('paste', e => { if (e.target.matches('[data-field="paste"]')) setTimeout(() => read(e.target.value), 0); });
    const box = root.querySelector('[data-drop]');
    box?.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('over'); });
    box?.addEventListener('dragleave', () => box.classList.remove('over'));
    box?.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('over'); const f = e.dataTransfer?.files?.[0]; if (f) takeFile(f); });
    const re = () => { if (!st.stage && !st.drop && !root.querySelector('textarea:focus')) ctx.rerender(); };
    return ['backfill', 'dock', 'soh', 'inventory', 'settings'].map(k => ctx.store.on(k, re));
  },
};
