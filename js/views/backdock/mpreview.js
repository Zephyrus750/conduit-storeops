// The manifest upload preview: what the DC report reads as, before it goes
// to the library. The facts (manifest, store, DC, despatch), the size
// (consols, cartons, keycodes, units, estimated work), the department mix,
// the first consolidations, and the checks from shared/manifest.js: rows
// left out, a report for another store, one already published, an old
// despatch date. A blocking check (wrong store, too many consolidations)
// disables Publish; the worker would refuse it anyway.
//
//   previewManifest(ctx, file, { attachTo }) → { manNo, consols, totalCartons, attached } | null (cancelled)

import { ic, esc, toast, dep } from '../../ui.js';
import { tx } from '../../i18n.js';
import { readManifestFile, publishParsed, attachManifest, manifestIndex, microDept, truckNo, STD_MINS_PER_CARTON, todayKey } from './common.js';
import { manifestCheck } from '../../../shared/manifest.js';

const chip = d => { const dd = microDept(d); return dd ? dep(dd) : `<span class="dep" style="background:#64748B">${esc(d || '???')}</span>`; };
const hm = m => tx('{h}h {m}m', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });

export async function previewManifest(ctx, file, { attachTo = null } = {}) {
  let parsed;
  try { parsed = await readManifestFile(file); }
  catch (e) { toast(tx('Could not read {file}: {error}', { file: file.name, error: e.message }), 'bad'); return null; }
  const dock = ctx.store.get('dock'), index = Object.fromEntries(manifestIndex(dock).map(m => [m.manNo, m]));
  const mpc = (attachTo && dock.trucks?.[attachTo]?.minsPerCarton) || STD_MINS_PER_CARTON;
  return new Promise(resolve => {
    document.getElementById('mprev')?.remove();
    const el = document.createElement('div'); el.id = 'mprev'; el.className = 'sscan mprev'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', tx('Preview {file}', { file: file.name }));
    document.body.appendChild(el);
    let manNo = String(parsed.manNo || '').trim(), busy = false;
    const done = v => { document.removeEventListener('keydown', onKey); el.remove(); resolve(v); };
    const onKey = e => { if (e.key === 'Escape' && !busy) done(null); };
    document.addEventListener('keydown', onKey);
    const paint = () => {
      const chk = manifestCheck({ ...parsed, manNo }, { storeNo: ctx.storeNo, index, today: todayKey(), mpc }), s = chk.stats;
      const noNum = !/^[\w-]{1,20}$/.test(manNo), dmax = Math.max(1, ...chk.depts.map(d => d[1]));
      const fact = (k, v) => `<div><span>${k}</span><b>${v || '—'}</b></div>`;
      el.innerHTML = `<div class="ss-card mp-card"><div class="ss-top"><b>${ic('file')}${tx('Check the report before publishing')}</b><span class="ss-exp">${esc(file.name)}${parsed.sheet ? ' · ' + tx('sheet “{name}”', { name: esc(parsed.sheet) }) : ''}</span><button class="ibtn" data-mp="cancel" aria-label="${tx('Cancel')}">${ic('x')}</button></div>` +
        `<div class="mp-body"><div class="mp-main">` +
        `<div class="mp-facts">${fact(tx('Manifest'), noNum ? '' : esc(manNo))}${fact(tx('Store'), esc(parsed.storeNo || ''))}${fact(tx('DC'), esc(parsed.dcNo || ''))}${fact(tx('Despatch'), esc(parsed.despatch || ''))}</div>` +
        (noNum || parsed.kind === 'generic' || !parsed.manNo ? `<label class="mp-num">${tx('Manifest number')} <input class="ad-in mono" data-mp-field="manNo" value="${esc(manNo)}" maxlength="20" placeholder="${tx('e.g. {n}', { n: '7031482' })}" autocomplete="off"></label>` : '') +
        `<div class="ps-facts mfx-stats">${[[tx('Consols'), s.consols], [tx('Cartons'), s.cartons.toLocaleString()], [tx('Keycodes'), s.keycodes.toLocaleString()], [tx('Units'), s.units.toLocaleString()], [tx('Est. work'), hm(s.workMins)]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>` +
        `<div class="pt3">${tx('Departments')}<span class="cs-dim">${tx('cartons by department')}</span></div><div class="mp-depts">${chk.depts.slice(0, 10).map(([d, n]) => `<div class="mp-dept">${chip(d)}<i><b style="width:${Math.round(n / dmax * 100)}%"></b></i><span>${n}</span></div>`).join('')}${chk.depts.length > 10 ? `<p class="lbl">${tx('{n} more departments', { n: chk.depts.length - 10 })}</p>` : ''}</div>` +
        `<div class="pt3">${tx('First consolidations')}<span class="cs-dim">${tx('{n} in all', { n: s.consols })}</span></div><table class="wb-t"><thead><tr><th>${tx('Pallet id')}</th><th class="n">${tx('Cartons')}</th><th>${tx('Departments')}</th><th class="n">${tx('Lines')}</th></tr></thead><tbody>${parsed.consols.slice(0, 8).map(c => `<tr><td class="mono">${esc(c.id)}</td><td class="n">${c.cartons}</td><td>${(c.mix || []).slice(0, 3).map(m => chip(m[0])).join('') || (c.dept ? chip(c.dept) : '')}</td><td class="n">${(c.items || []).length}${c.itemsCut ? `+${c.itemsCut}` : ''}</td></tr>`).join('')}</tbody></table></div>` +
                // The checks' text is shared/manifest.js's: the fixed ones are translated (test/unit/i18n-keys/dock1.json); those carrying counts stay English.
        `<div class="mp-side"><div class="pt3">${tx('Checks')}</div><ul class="mp-checks">${chk.checks.map(c => `<li class="${c.level}">${c.level === 'ok' ? '✓' : c.level === 'bad' ? '⛔' : '⚠'} ${esc(tx(c.text))}</li>`).join('')}</ul>` +
        `<div class="mp-acts"><button class="btn primary" data-mp="publish"${chk.blocking || noNum || busy ? ' disabled' : ''}>${busy ? tx('Publishing…') : attachTo ? `${ic('truck')}${tx('Publish & attach to Truck {n}', { n: esc(truckNo(attachTo)) })}` : `${ic('check')}${tx('Publish to the library')}`}</button><button class="btn" data-mp="cancel"${busy ? ' disabled' : ''}>${tx('Cancel')}</button></div>` +
        `<p class="lbl">${chk.blocking ? tx('Fix what is marked ⛔ first: the worker would refuse this report.') : tx('Publishing lists it on every device; a truck attaches it when it lands.')}</p></div></div></div>`;
    };
    el.addEventListener('input', e => { if (e.target.dataset.mpField === 'manNo') { manNo = e.target.value.trim(); const pos = e.target.selectionStart; paint(); const i = el.querySelector('[data-mp-field="manNo"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } } });
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-mp]'); if (!b || busy) return;
      if (b.dataset.mp === 'cancel') return done(null);
      busy = true; paint();
      try {
        const r = await publishParsed(ctx, parsed, { filename: file.name, manNo });
        if (attachTo) await attachManifest(ctx, attachTo, r.manNo);
        done({ ...r, attached: attachTo });
      } catch (err) { busy = false; paint(); toast(tx('Could not publish: {error}', { error: err.message }), 'bad'); }
    });
    paint();
    setTimeout(() => el.querySelector('[data-mp-field="manNo"]')?.focus(), 30);
  });
}
