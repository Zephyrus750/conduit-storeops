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
import { readManifestFile, publishParsed, attachManifest, manifestIndex, microDept, truckNo, STD_MINS_PER_CARTON, todayKey } from './common.js';
import { manifestCheck } from '../../../shared/manifest.js';

const chip = d => { const dd = microDept(d); return dd ? dep(dd) : `<span class="dep" style="background:#64748B">${esc(d || '???')}</span>`; };
const hm = m => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

export async function previewManifest(ctx, file, { attachTo = null } = {}) {
  let parsed;
  try { parsed = await readManifestFile(file); }
  catch (e) { toast(`Could not read ${file.name}: ${e.message}`, 'bad'); return null; }
  const dock = ctx.store.get('dock'), index = Object.fromEntries(manifestIndex(dock).map(m => [m.manNo, m]));
  const mpc = (attachTo && dock.trucks?.[attachTo]?.minsPerCarton) || STD_MINS_PER_CARTON;
  return new Promise(resolve => {
    document.getElementById('mprev')?.remove();
    const el = document.createElement('div'); el.id = 'mprev'; el.className = 'sscan mprev'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', `Preview ${file.name}`);
    document.body.appendChild(el);
    let manNo = String(parsed.manNo || '').trim(), busy = false;
    const done = v => { document.removeEventListener('keydown', onKey); el.remove(); resolve(v); };
    const onKey = e => { if (e.key === 'Escape' && !busy) done(null); };
    document.addEventListener('keydown', onKey);
    const paint = () => {
      const chk = manifestCheck({ ...parsed, manNo }, { storeNo: ctx.storeNo, index, today: todayKey(), mpc }), s = chk.stats;
      const noNum = !/^[\w-]{1,20}$/.test(manNo), dmax = Math.max(1, ...chk.depts.map(d => d[1]));
      const fact = (k, v) => `<div><span>${k}</span><b>${v || '—'}</b></div>`;
      el.innerHTML = `<div class="ss-card mp-card"><div class="ss-top"><b>${ic('file')}Check the report before publishing</b><span class="ss-exp">${esc(file.name)}${parsed.sheet ? ` · sheet “${esc(parsed.sheet)}”` : ''}</span><button class="ibtn" data-mp="cancel" aria-label="Cancel">${ic('x')}</button></div>` +
        `<div class="mp-body"><div class="mp-main">` +
        `<div class="mp-facts">${fact('Manifest', noNum ? '' : esc(manNo))}${fact('Store', esc(parsed.storeNo || ''))}${fact('DC', esc(parsed.dcNo || ''))}${fact('Despatch', esc(parsed.despatch || ''))}</div>` +
        (noNum || parsed.kind === 'generic' || !parsed.manNo ? `<label class="mp-num">Manifest number <input class="ad-in mono" data-mp-field="manNo" value="${esc(manNo)}" maxlength="20" placeholder="e.g. 7031482" autocomplete="off"></label>` : '') +
        `<div class="ps-facts mfx-stats">${[['Consols', s.consols], ['Cartons', s.cartons.toLocaleString()], ['Keycodes', s.keycodes.toLocaleString()], ['Units', s.units.toLocaleString()], ['Est. work', hm(s.workMins)]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>` +
        `<div class="pt3">Departments<span class="cs-dim">cartons by department</span></div><div class="mp-depts">${chk.depts.slice(0, 10).map(([d, n]) => `<div class="mp-dept">${chip(d)}<i><b style="width:${Math.round(n / dmax * 100)}%"></b></i><span>${n}</span></div>`).join('')}${chk.depts.length > 10 ? `<p class="lbl">${chk.depts.length - 10} more departments</p>` : ''}</div>` +
        `<div class="pt3">First consolidations<span class="cs-dim">${s.consols} in all</span></div><table class="wb-t"><thead><tr><th>Pallet id</th><th class="n">Cartons</th><th>Departments</th><th class="n">Lines</th></tr></thead><tbody>${parsed.consols.slice(0, 8).map(c => `<tr><td class="mono">${esc(c.id)}</td><td class="n">${c.cartons}</td><td>${(c.mix || []).slice(0, 3).map(m => chip(m[0])).join('') || (c.dept ? chip(c.dept) : '')}</td><td class="n">${(c.items || []).length}${c.itemsCut ? `+${c.itemsCut}` : ''}</td></tr>`).join('')}</tbody></table></div>` +
        `<div class="mp-side"><div class="pt3">Checks</div><ul class="mp-checks">${chk.checks.map(c => `<li class="${c.level}">${c.level === 'ok' ? '✓' : c.level === 'bad' ? '⛔' : '⚠'} ${esc(c.text)}</li>`).join('')}</ul>` +
        `<div class="mp-acts"><button class="btn primary" data-mp="publish"${chk.blocking || noNum || busy ? ' disabled' : ''}>${busy ? 'Publishing…' : attachTo ? `${ic('truck')}Publish & attach to Truck ${esc(truckNo(attachTo))}` : `${ic('check')}Publish to the library`}</button><button class="btn" data-mp="cancel"${busy ? ' disabled' : ''}>Cancel</button></div>` +
        `<p class="lbl">${chk.blocking ? 'Fix what is marked ⛔ first: the worker would refuse this report.' : 'Publishing lists it on every device; a truck attaches it when it lands.'}</p></div></div></div>`;
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
      } catch (err) { busy = false; paint(); toast(`Could not publish: ${err.message}`, 'bad'); }
    });
    paint();
    setTimeout(() => el.querySelector('[data-mp-field="manNo"]')?.focus(), 30);
  });
}
