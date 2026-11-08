// The manifest upload preview: what the DC report reads as, before it goes
// to the library. The facts (manifest, store, DC, despatch), the size
// (consols, cartons, keycodes, units, estimated work, each with a note), the
// mix by group (Home, Clothing, Kids, Flex), every micro-department by number
// and name with the department it sits in, the consolidations with theirs,
// the largest products, and the checks from shared/manifest.js: rows
// left out, a report for another store, one already published, an old
// despatch date. A blocking check (wrong store, too many consolidations)
// disables Publish; the worker would refuse it anyway. From Manifests
// (dating), a report for a day already gone also takes the day and truck it
// came on (manifest.day), suggested as the batch upload does (mbatch.js).
//
//   previewManifest(ctx, file, { attachTo, dating }) → { manNo, consols, totalCartons, attached } | null (cancelled)

import { ic, esc, toast, today, dep, fmtDay } from '../../ui.js';
import { tx, txn } from '../../i18n.js';
import { openSheet } from '../../sheet.js';
import { readManifestFile, publishParsed, attachManifest, manifestIndex, microDept, microName, truckNo, STD_MINS_PER_CARTON, todayKey } from './common.js';
import { SUBS } from '../../data/micros.js';
import { settingsOf } from '../../../shared/reducers/store.js';
import { manifestCheck } from '../../../shared/manifest.js';
import { placeIndex, suggestPlace, usualGap } from '../../../shared/manifeststats.js';
import { checkText } from './mbatch.js';

// The groups the explorer rolls up to, and each sub-department's code and name.
const GROUPS = [['h', 'Home', '#2563EB'], ['c', 'Clothing', '#DB2777'], ['k', 'Kids', '#F59E0B'], ['flex', 'Flex', '#64748B'], ['?', tx('Unknown'), '#94A3B8']];
const SUB = Object.fromEntries(SUBS.map(x => [x[0], x]));
const groupOf = code => { const d = microDept(code); return !d ? '?' : d === 'flex' ? 'flex' : d[0]; };
// A micro-department in words: its department's badge, its number and
// name, and (sub) that department's name beneath, "Bed, Bath, Laundry".
function micro(code, sub = true) {
  const c = String(code || '???'), sd = microDept(c), d = SUB[sd], name = microName(c);
  const badge = d ? dep(sd) : `<span class="dep" style="background:#94A3B8;color:#fff">?</span>`;
  return `<span class="mp-mc">${badge}<span class="mp-mcn"><span><b class="mono">${esc(c)}</b> ${esc(name || tx('Unknown micro-department'))}</span>${sub ? `<small>${d ? esc(d[2]) : tx('Not in the department list')}</small>` : ''}</span></span>`;
}
// Every micro-department on the report: cartons as the report's mix counts
// them (a carton goes to the micro-department with most units in it, so
// they add up to the manifest's cartons), and units, keycodes, lines and
// consols from its lines.
function microRows(parsed) {
  const m = new Map(), get = d => { const k = String(d || '???'); if (!m.has(k)) m.set(k, { code: k, cartons: 0, units: 0, keys: new Set(), consols: new Set(), lines: 0 }); return m.get(k); };
  for (const c of parsed.consols || []) {
    for (const [d, ctn] of c.mix?.length ? c.mix : [[c.dept || '???', c.cartons]]) { const r = get(d); r.cartons += Number(ctn) || 0; if (Number(ctn) > 0) r.consols.add(c.id); }
    for (const it of c.items || []) { const r = get(it.dept || (!c.mix?.length && c.dept) || '???'); r.units += Number(it.q) || 0; r.keys.add(it.k); r.lines++; r.consols.add(c.id); }
  }
  return [...m.values()].sort((a, b) => b.cartons - a.cartons || b.units - a.units);
}
// The largest products by units, with the cartons they are packed in.
function topProducts(parsed, n = 8) {
  const m = new Map();
  for (const c of parsed.consols || []) for (const it of c.items || []) { const r = m.get(it.k) || { k: it.k, d: it.d || '', dept: it.dept, units: 0, cartons: 0, consols: new Set() }; r.units += Number(it.q) || 0; r.cartons += Number(it.c) || 0; r.consols.add(c.id); m.set(it.k, r); }
  return [...m.values()].sort((a, b) => b.units - a.units).slice(0, n);
}
const consolUnits = c => (c.items || []).reduce((n, i) => n + (Number(i.q) || 0), 0);
const hm = m => tx('{h}h {m}m', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
const dur = m => m >= 60 ? hm(m) : tx('{m}m', { m });

const dayText = d => fmtDay(d);

export async function previewManifest(ctx, file, { attachTo = null, dating = false } = {}) {
  let parsed;
  try { parsed = await readManifestFile(file); }
  catch (e) { toast(tx('Could not read {file}: {error}', { file: file.name, error: e.message }), 'bad'); return null; }
  const dock = ctx.store.get('dock'), index = Object.fromEntries(manifestIndex(dock).map(m => [m.manNo, m]));
  const mpc = (attachTo && dock.trucks?.[attachTo]?.minsPerCarton) || settingsOf(ctx.store.get('settings')).minsPerCarton || STD_MINS_PER_CARTON;
  return new Promise(resolve => {
    document.getElementById('mprev')?.remove();
    const sheet = openSheet({ size: 'wide', cls: 'mprev', title: `${ic('file')}${tx('Check the report before publishing')}`, label: tx('Preview {file}', { file: file.name }),
      sub: `${esc(file.name)}${parsed.sheet ? ' · ' + tx('sheet “{name}”', { name: esc(parsed.sheet) }) : ''}`, onClose: () => done(null) });
    const el = sheet.el; el.id = 'mprev';
    let manNo = String(parsed.manNo || '').trim(), busy = false, came = null;
    // Where it came: a truck or slot the dock already has it on, a day on
    // file, or a suggestion for a day already gone (today's goes on its truck).
    const place = () => {
      if (!dating || attachTo || came?.touched) return;
      const s = { dock: ctx.store.get('dock'), plan: ctx.store.get('plan') || { days: {} } }, p = /^[\w-]{1,20}$/.test(manNo) ? placeIndex(s).get(manNo) : null;
      if (p && p.via !== 'label') { came = { fixed: p }; return; }
      const g = p || suggestPlace(s, { despatch: parsed.despatch }, undefined, { today: today() });
      came = g && (p || g.day < today()) ? { day: g.day, truck: g.truck, via: p ? 'label' : g.via, gap: usualGap(s) } : { day: '', truck: null, via: '' };
    };
    const cameHtml = () => {
      if (!came) return '';
      if (came.fixed) return `<div class="pt3">${tx('Came on')}</div><p class="lbl">${came.fixed.via === 'plan' ? tx('Planned for Truck {no} · {day}', { no: came.fixed.truck, day: esc(dayText(came.fixed.day)) }) : tx('On Truck {no} · {day}', { no: came.fixed.truck, day: esc(dayText(came.fixed.day)) })}</p>`;
      const why = came.via === 'plan' ? tx('from the Planner') : came.via === 'despatch' ? txn(came.gap, 'despatch + {n} day', 'despatch + {n} days') : came.via === 'label' ? tx('set by hand') : tx('For a report from a day already gone. Today’s goes on its truck at the Planner or Receiving.');
      return `<div class="pt3">${tx('Came on')}</div><div class="mb-came"><input type="date" class="ad-in" data-mp-field="day" value="${esc(came.day || '')}" max="${esc(today())}" aria-label="${tx('Day it came')}"><select class="ad-in" data-mp-field="truck" aria-label="${tx('Truck')}"><option value="">${tx('Truck —')}</option>${[1, 2, 3, 4].map(n => `<option value="${n}"${came.truck === n ? ' selected' : ''}>${tx('Truck {no}', { no: n })}</option>`).join('')}</select></div><small class="cs-dim">${esc(why)}</small>`;
    };
    place();
    let settled = false;
    const done = v => { if (settled) return; settled = true; sheet.close(); resolve(v); };
    const paint = () => {
      const chk = manifestCheck({ ...parsed, manNo }, { storeNo: ctx.storeNo, index, today: todayKey(), mpc }), s = chk.stats;
      const noNum = !/^[\w-]{1,20}$/.test(manNo), micros = microRows(parsed), dmax = Math.max(1, ...micros.map(r => r.cartons)), tot = s.cartons || 1;
      const gc = {}; for (const r of micros) gc[groupOf(r.code)] = (gc[groupOf(r.code)] || 0) + r.cartons;
      const mixed = parsed.consols.filter(c => (c.mix || []).filter(m => m[1] > 0).length > 1).length, share = dur(Math.round(s.workMins / 4)), prods = topProducts(parsed);
      const stat = (k, v, note) => `<div><span>${k}</span><b>${v}</b>${note ? `<small>${note}</small>` : ''}</div>`;
      const fact = (k, v) => `<div><span>${k}</span><b>${v || '—'}</b></div>`;
      sheet.busy(busy);
      sheet.set({ body: 
        `<div class="mp-body"><div class="mp-main">` +
        `<div class="mp-facts">${fact(tx('Manifest'), noNum ? '' : esc(manNo))}${fact(tx('Store'), esc(parsed.storeNo || ''))}${fact(tx('DC'), esc(parsed.dcNo || ''))}${fact(tx('Despatch'), esc(parsed.despatch || ''))}</div>` +
        (noNum || parsed.kind === 'generic' || !parsed.manNo ? `<label class="mp-num">${tx('Manifest number')} <input class="ad-in mono" data-mp-field="manNo" value="${esc(manNo)}" maxlength="20" placeholder="${tx('e.g. {n}', { n: '7031482' })}" autocomplete="off"></label>` : '') +
        `<div class="ps-facts mfx-stats">${stat(tx('Consols'), s.consols, mixed ? txn(mixed, '{n} mixed', '{n} mixed') : tx('none mixed'))}${stat(tx('Cartons'), s.cartons.toLocaleString(), s.consols ? tx('about {n} a consol', { n: Math.round(s.cartons / s.consols) }) : '')}` +
        `${stat(tx('Keycodes'), s.keycodes.toLocaleString(), txn(s.lines, '{n} line', '{n} lines', { n: s.lines.toLocaleString() }))}${stat(tx('Units'), s.units.toLocaleString(), s.cartons ? tx('about {n} a carton', { n: Math.round(s.units / s.cartons) }) : '')}` +
        `${stat(tx('Est. work'), hm(s.workMins), tx('{mpc} min a carton · about {time} for four', { mpc, time: share }))}</div>` +
        `<div class="pt3">${tx('Departments')}<span class="cs-dim">${txn(micros.length, '{n} micro-department · cartons, largest first', '{n} micro-departments · cartons, largest first')}</span></div>` +
        `<div class="mp-roll">${GROUPS.filter(g => gc[g[0]] > 0).map(g => `<span style="flex:${gc[g[0]]};background:${g[2]}" title="${esc(g[1])}: ${tx('{n} cartons', { n: gc[g[0]] })}">${gc[g[0]] / tot > 0.1 ? `${esc(g[1])} ${Math.round(gc[g[0]] / tot * 100)}%` : ''}</span>`).join('')}</div>` +
        `<div class="mp-tw"><table class="wb-t mp-mt"><thead><tr><th>${tx('Micro-department')}</th><th>${tx('Cartons')}</th><th class="n">${tx('Share')}</th><th class="n">${tx('Units')}</th><th class="n">${tx('Keycodes')}</th><th class="n">${tx('Consols')}</th></tr></thead><tbody>` +
        micros.slice(0, 40).map(r => `<tr><td>${micro(r.code)}</td><td><span class="mp-bar"><i><b style="width:${Math.round(r.cartons / dmax * 100)}%;background:${(GROUPS.find(g => g[0] === groupOf(r.code)) || GROUPS[4])[2]}"></b></i><span>${r.cartons}</span></span></td><td class="n">${Math.round(r.cartons / tot * 100)}%</td><td class="n">${r.units.toLocaleString()}</td><td class="n">${r.keys.size}</td><td class="n">${r.consols.size}</td></tr>`).join('') +
        `</tbody></table></div>${micros.length > 40 ? `<p class="lbl">${tx('{n} more micro-departments', { n: micros.length - 40 })}</p>` : ''}` +
        `<div class="pt3">${tx('Consolidations')}<span class="cs-dim">${tx('{n} in all', { n: s.consols })}</span></div><div class="mp-tw"><table class="wb-t mp-ct"><thead><tr><th>${tx('Pallet id')}</th><th class="n">${tx('Cartons')}</th><th class="n">${tx('Units')}</th><th>${tx('Micro-departments')}</th><th class="n">${tx('Lines')}</th></tr></thead><tbody>` +
        parsed.consols.slice(0, 30).map(c => { const mx = (c.mix || []).filter(m => m[1] > 0 || m[2] > 0); return `<tr><td class="mono">${esc(c.id)}</td><td class="n">${c.cartons}</td><td class="n">${consolUnits(c).toLocaleString()}</td><td><div class="mp-cm">${mx.slice(0, 3).map(m => `<span>${micro(m[0], false)}<small>${tx('{n} ctn', { n: m[1] })}</small></span>`).join('') || (c.dept ? micro(c.dept, false) : '—')}${mx.length > 3 ? `<small class="cs-dim">${tx('+{n} more', { n: mx.length - 3 })}</small>` : ''}</div></td><td class="n">${(c.items || []).length}${c.itemsCut ? `+${c.itemsCut}` : ''}</td></tr>`; }).join('') +
        `</tbody></table></div>${parsed.consols.length > 30 ? `<p class="lbl">${tx('{n} more consolidations', { n: parsed.consols.length - 30 })}</p>` : ''}` +
        (prods.length ? `<div class="pt3">${tx('Largest products')}<span class="cs-dim">${tx('by units')}</span></div><div class="mp-tw"><table class="wb-t mp-pt"><thead><tr><th>${tx('Keycode')}</th><th>${tx('Product')}</th><th>${tx('Micro-department')}</th><th class="n">${tx('Units')}</th><th class="n">${tx('Cartons')}</th></tr></thead><tbody>` +
          prods.map(r => `<tr><td class="mono">${esc(r.k)}</td><td class="mp-pd">${esc(r.d || '—')}</td><td>${micro(r.dept, false)}</td><td class="n">${r.units.toLocaleString()}</td><td class="n">${r.cartons || '—'}</td></tr>`).join('') + `</tbody></table></div>` : '') + `</div>` +
        // The checks' text is shared/manifest.js's, in English: checkText() (mbatch.js) says each in this device's language.
        `<div class="mp-side">${cameHtml()}<div class="pt3">${tx('Checks')}</div><ul class="mp-checks">${chk.checks.map(c => `<li class="${c.level}">${c.level === 'ok' ? '✓' : c.level === 'bad' ? '⛔' : '⚠'} ${esc(checkText(c.text))}</li>`).join('')}</ul>` +
        `<div class="mp-acts"><button class="btn primary" data-mp="publish"${chk.blocking || noNum || busy ? ' disabled' : ''}>${busy ? tx('Publishing…') : attachTo ? `${ic('truck')}${tx('Publish & attach to Truck {n}', { n: esc(truckNo(attachTo)) })}` : `${ic('check')}${tx('Publish to the library')}`}</button><button class="btn" data-mp="cancel"${busy ? ' disabled' : ''}>${tx('Cancel')}</button></div>` +
        `<p class="lbl">${chk.blocking ? tx('Fix what is marked ⛔ first: the worker would refuse this report.') : tx('Publishing lists it on every device; a truck attaches it when it lands.')}</p></div></div>` });
    };
    el.addEventListener('change', e => {
      const f = e.target.dataset.mpField; if (!came || (f !== 'day' && f !== 'truck')) return;
      if (f === 'day') { came.day = e.target.value; if (!came.day) came.truck = null; } else came.truck = e.target.value ? Number(e.target.value) : null;
      came.via = 'label'; came.touched = true; paint();
    });
    el.addEventListener('input', e => { if (e.target.dataset.mpField === 'manNo') { manNo = e.target.value.trim(); place(); const pos = e.target.selectionStart; paint(); const i = el.querySelector('[data-mp-field="manNo"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } } });
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-mp]'); if (!b || busy) return;
      if (b.dataset.mp === 'cancel') return done(null);
      busy = true; paint();
      try {
        const r = await publishParsed(ctx, parsed, { filename: file.name, manNo });
        if (attachTo) await attachManifest(ctx, attachTo, r.manNo);
        const had = ctx.store.get('dock').manifestDays?.[r.manNo];
        if (came && !came.fixed && came.day && (had?.day !== came.day || (had?.truck ?? null) !== (came.truck ?? null))) await ctx.store.dispatch({ type: 'manifest.day', entity: { manNo: r.manNo }, payload: { day: came.day, truck: came.truck ?? null } });
        done({ ...r, attached: attachTo });
      } catch (err) { busy = false; paint(); toast(tx('Could not publish: {error}', { error: err.message }), 'bad'); }
    });
    paint();
    setTimeout(() => el.querySelector('[data-mp-field="manNo"]')?.focus(), 30);
  });
}
