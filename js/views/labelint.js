// Label integrity: one check per numbered micro-department per cycle, with
// shelf assignment and variance capture. Reads store.get('labels').

import { $, $$, ic, esc, vh, sub, prog, dep, DEPT_COLOUR, DEPT_GROUPS, cycleId, daysLeftInCycle, fmtDate, toast, mhead, mbig, mghost, mfoot } from '../ui.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome } from '../map.js';
import { SUBS, MICRO, microId, microCode, microName, microCount } from '../data/micros.js';

let selected = null, openSub = null, varianceFor = null;

function model(ctx) {
  const L = ctx.store.get('labels');
  const cycle = cycleId(L.cycleLen);
  const checks = L.checks[cycle] || {}, variances = L.variances[cycle] || [];
  const total = microCount(), done = Object.keys(checks).length;
  return { L, cycle, checks, variances, total, done, daysLeft: daysLeftInCycle(L.cycleLen) };
}
function marksFor(m) {
  const out = {};
  const wrong = new Set(m.variances.map(v => v.micro));
  for (const [micro, shelves] of Object.entries(m.L.assign)) for (const s of shelves) { if (wrong.has(micro)) out[s] = 'wrong'; else if (m.checks[micro]) out[s] = 'checked'; }
  if (selected) for (const s of m.L.assign[selected] || []) if (!out[s]) out[s] = 'focus';
  return out;
}
const cycleLabel = c => c.endsWith('M') ? new Date(c.slice(0, 4), Number(c.slice(5, 7)) - 1, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' }) : c;

export default {
  id: 'labelint', title: 'Label integrity', icon: 'm-labelint',
  desktop(ctx) {
    const m = model(ctx);
    return vh('Label integrity', sub(cycleLabel(m.cycle), `${m.L.cycleLen[0].toUpperCase() + m.L.cycleLen.slice(1)} cycle · ${m.daysLeft} days left`, `${m.total} numbered micro-departments`), `<button class="btn" data-act="print" data-scope="all">${ic('print')}Print sheets</button><button class="btn primary" data-act="check-selected">${ic('barcode')}Check a micro-dept</button>`, 'm-labelint') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx('Label integrity', ctx.storeNo)}<span><i style="background:#2563EB"></i>Checked this cycle</span><span><i style="background:#DC2626"></i>Wrong label found</span><span><i style="background:transparent;border:2px solid #D24E0E"></i>Selected micro-dept</span><span><i style="background:#CBD0D8"></i>Not yet checked</span></div></div>` +
      `<div class="sidecol" id="liside"></div></div>`;
  },
  mobile(ctx) {
    const m = model(ctx);
    return mvMap({ badge: `<b>${m.done}</b> of ${m.total} · ${cycleLabel(m.cycle)}` }) + `<div class="mv-sel mode" id="limob"></div>`;
  },
  mount(ctx, root) {
    const map = mountMap($('#mapstage', root), { cls: 'li', onSelect: info => {
      if (info.kind !== 'shelf' || !selected) return;
      const m = model(ctx); const cur = m.L.assign[selected] || [];
      const next = cur.includes(info.id) ? cur.filter(x => x !== info.id) : [...cur, info.id];
      ctx.store.dispatch({ type: 'label.assign', entity: { micro: selected }, payload: { shelves: next } }).catch(e => toast(e.message, 'bad'));
    } });
    bindMapChrome(root, map);
    const paint = () => {
      const m = model(ctx);
      map.setMarks(marksFor(m));
      const side = $('#liside', root); if (side) side.innerHTML = sidebar(m);
      const mob = $('#limob', root); if (mob) mob.innerHTML = mobileBar(m);
      const badge = $('#mvbadge', root); if (badge) badge.innerHTML = `<b>${m.done}</b> of ${m.total} · ${cycleLabel(m.cycle)}`;
    };
    paint();
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act'), m = model(ctx);
      try {
        if (act === 'select') { selected = a.getAttribute('data-micro'); openSub = selected.split('-')[0]; paint(); }
        else if (act === 'toggle-sub') { const s = a.getAttribute('data-sub'); openSub = openSub === s ? null : s; paint(); }
        else if (act === 'check' || act === 'check-selected') { const micro = a.getAttribute('data-micro') || selected; if (!micro) return toast('Pick a micro-department first'); await ctx.store.dispatch({ type: m.checks[micro] ? 'label.uncheck' : 'label.check', entity: { micro, cycle: m.cycle } }); }
        else if (act === 'cycle') await ctx.store.dispatch({ type: 'label.cycle.set', entity: {}, payload: { cycleLen: a.getAttribute('data-len') } });
        else if (act === 'variance') { varianceFor = a.getAttribute('data-micro') || selected; paint(); }
        else if (act === 'variance-cancel') { varianceFor = null; paint(); }
        else if (act === 'variance-save') {
          const kc = $('[data-field="keycode"]', root)?.value.trim(), note = $('[data-field="note"]', root)?.value.trim();
          if (!/^\d{6,13}$/.test(kc || '')) return toast('Keycode must be 6 to 13 digits', 'bad');
          await ctx.store.dispatch({ type: 'label.variance', entity: { micro: varianceFor, cycle: m.cycle }, payload: { keycode: kc, note } });
          varianceFor = null; toast('Variance logged'); paint();
        }
        else if (act === 'zoom-dept') map.filterDept(a.getAttribute('data-dept'));
        else if (act === 'print') printSheets(ctx, a.getAttribute('data-scope'));
      } catch (err) { toast(err.message, 'bad'); }
    });
    return [ctx.store.on('labels', paint)];
  },
};

function varianceForm(m) {
  return `<div class="pcard"><div class="pt3">Wrong label · ${esc(varianceFor)}</div><label class="fld"><span>Keycode</span><input data-field="keycode" inputmode="numeric" placeholder="42977636"></label><label class="fld"><span>What is wrong</span><input data-field="note" placeholder="ticket $4, shelf edge $3.50"></label><div class="acts2" style="display:flex;gap:8px;margin-top:10px"><span class="btn primary sm" data-act="variance-save">${ic('check')}Log variance</span><span class="btn sm" data-act="variance-cancel">Cancel</span></div></div>`;
}
function sidebar(m) {
  const cyc = `<div class="pcard licycle${m.done === m.total ? ' done' : ''}"><div class="top"><b>${cycleLabel(m.cycle)}</b><span class="dl">${m.done === m.total ? 'Cycle complete' : m.daysLeft + 'd left'}</span></div>${prog(m.done / m.total * 100)}<div class="sub">${m.done} / ${m.total} micro-departments checked · ${m.variances.length} labels wrong</div>` +
    `<div class="seg3">${['weekly', 'fortnightly', 'monthly'].map(l => `<span class="${m.L.cycleLen === l ? 'on' : ''}" data-act="cycle" data-len="${l}">${l[0].toUpperCase() + l.slice(1)}</span>`).join('')}</div></div>`;
  let sel = '';
  if (selected) {
    const [subId, code] = selected.split('-'); const entry = (MICRO[subId] || []).find(x => microCode(x) === code) || code;
    const c = m.checks[selected], vs = m.variances.filter(v => v.micro === selected), shelves = m.L.assign[selected] || [];
    sel = `<div class="pcard lisel"><div class="pt3">Selected micro-department<span class="cs-dim">tap a shelf on the map to assign it</span></div><div class="lisel-h"><span class="lisel-code">${esc(code)}</span><div><b>${esc(microName(entry))}</b><small>${subId.toUpperCase()} · ${shelves.length} shelves assigned${shelves.length ? ' · ' + shelves.join(', ') : ''}</small></div></div>` +
      `<div class="lisel-facts"><span><b>This cycle</b>${c ? 'Checked ' + fmtDate(c.at) : 'Not checked yet'}</span><span><b>Wrong labels</b>${vs.length ? vs.map(v => esc(v.keycode) + (v.note ? ' · ' + esc(v.note) : '')).join('<br>') : 'none logged'}</span></div>` +
      `<div class="acts2" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><span class="btn primary sm" data-act="check" data-micro="${selected}">${ic(c ? 'x' : 'check')}${c ? 'Uncheck' : 'Mark checked'}</span><span class="btn sm" data-act="variance" data-micro="${selected}">${ic('alert')}Wrong label</span>${subId ? `<span class="btn sm" data-act="zoom-dept" data-dept="${subId}">${ic('pin')}Show ${subId.toUpperCase()}</span>` : ''}<span class="btn sm" data-act="print" data-scope="${selected}">${ic('print')}Print sheet</span></div></div>`;
  }
  const acc = `<div class="subacc">${SUBS.map(sd => {
    const micros = MICRO[sd[0]] || []; const n = micros.filter(x => m.checks[microId(sd[0], x)]).length; const open = openSub === sd[0];
    const rows = micros.map(x => { const id = microId(sd[0], x), on = !!m.checks[id], wrong = m.variances.some(v => v.micro === id); return `<div class="micro${selected === id ? ' sel' : ''}" data-act="select" data-micro="${id}"><span class="tk${on ? ' on' : ''}" data-act="check" data-micro="${id}">${ic('check')}</span><span class="mc">${microCode(x)}</span><span class="mn">${esc(microName(x))}</span>${on ? `<span class="md">${fmtDate(m.checks[id].at)}</span>` : ''}${wrong ? '<span class="md" style="color:var(--red)">wrong</span>' : ''}<span class="sc">${(m.L.assign[id] || []).length} ▦</span></div>`; }).join('');
    return `<div class="subrow"><div class="sh" data-act="toggle-sub" data-sub="${sd[0]}"><span class="pt" style="background:${DEPT_COLOUR[sd[0]]}"></span><span class="code">${sd[1]}</span><span class="nm">${sd[2]}</span><span class="ct${n === micros.length ? ' full' : ''}">${n}/${micros.length}</span><span class="ib" data-act="print" data-scope="${sd[0]}" title="Print ${sd[1]} sheets">${ic('print')}</span><span class="ib">${ic(open ? 'minus' : 'plus')}</span></div><div class="micros"${open ? '' : ' hidden'}>${rows}</div></div>`;
  }).join('')}</div>`;
  return cyc + (varianceFor ? varianceForm(m) : sel) + acc;
}
function mobileBar(m) {
  if (varianceFor) return `<div class="mv-mh">${ic('m-labelint')}<b>Wrong label · ${esc(varianceFor)}</b></div><label class="fld"><span>Keycode</span><input data-field="keycode" inputmode="numeric"></label><label class="fld"><span>What is wrong</span><input data-field="note"></label><div class="mv-two">${mbig('Log variance', '', 'check', ' data-act="variance-save"')}${mghost('Cancel', ' data-act="variance-cancel"')}</div>`;
  if (!selected) return `<div class="mv-mh">${ic('m-labelint')}<b>Label integrity</b><span>${m.done} / ${m.total}</span></div><div class="mv-hint">${cycleLabel(m.cycle)} · <b>${m.daysLeft}d left</b>. Pick a micro-department below, then mark it checked.</div><div class="chips" style="padding:0 12px 12px">${SUBS.map(sd => `<span class="chip" data-act="toggle-sub" data-sub="${sd[0]}"><span class="sw" style="background:${DEPT_COLOUR[sd[0]]}"></span>${sd[1]}</span>`).join('')}</div>` +
    (openSub ? `<div class="mv-rows">${(MICRO[openSub] || []).map(x => { const id = microId(openSub, x); return `<div class="mv-row" data-act="select" data-micro="${id}"><span class="a">${microCode(x)}</span><span class="b">${esc(microName(x))}</span><span class="c">${m.checks[id] ? '✓' : ''}</span></div>`; }).join('')}</div>` : '');
  const [subId, code] = selected.split('-'); const entry = (MICRO[subId] || []).find(x => microCode(x) === code) || code; const c = m.checks[selected];
  return `<div class="mv-mh">${ic('m-labelint')}<b>${esc(code)} ${esc(microName(entry))}</b><span>${m.done} / ${m.total}</span></div><div class="mv-hint">${cycleLabel(m.cycle)} · <b>${m.daysLeft}d left</b> · ${subId.toUpperCase()} · ${c ? 'checked ' + fmtDate(c.at) : 'not checked yet'}</div><div class="mv-two">${mbig(c ? 'Uncheck' : 'Checked', c ? 'sec' : '', 'check', ` data-act="check" data-micro="${selected}"`)}${mbig('Price is wrong', 'warn', 'alert', ` data-act="variance" data-micro="${selected}"`)}</div><div class="mv-hint"><a data-act="toggle-sub" data-sub="${subId}">Choose another</a></div>`;
}

// Printable marking sheets — ShelfSearcher's Correction & Marking Sheet, ported
// faithfully: title, the department / sub (accent badge) / micro up top-left
// with the sub's accent colour, a 100-box tally grid, and a table for incorrect
// labels and their true cost. Pure print HTML in a throwaway window so it never
// touches the app's layout. Scope is 'all', a sub id ('h1'), or a micro id.
function printSheets(ctx, scope) {
  const m = model(ctx);
  const storeLabel = (ctx.storeName || '') + (ctx.storeNo ? ' · ' + ctx.storeNo : '');
  const cyc = cycleLabel(m.cycle);
  const all = [];
  for (const sd of SUBS) {
    const group = (DEPT_GROUPS.find(g => g[0] !== 'Other' && g[2].includes(sd[0])) || [])[0] || sd[2];
    for (const entry of (MICRO[sd[0]] || [])) all.push({ subId: sd[0], group, sub: sd[1], subName: sd[2], color: DEPT_COLOUR[sd[0]] || '#5B21B6', micro: entry, id: microId(sd[0], entry) });
  }
  let list = all;
  if (scope && scope !== 'all') list = scope.includes('-') ? all.filter(x => x.id === scope) : all.filter(x => x.subId === scope);
  if (!list.length) return toast('Nothing to print for that scope', 'bad');
  const sheet = sh => {
    let boxes = ''; for (let i = 0; i < 100; i++) boxes += '<i></i>';
    let rows = ''; for (let r = 0; r < 16; r++) rows += '<tr><td></td><td></td><td class="c"></td></tr>';
    return `<section class="sheet" style="--ac:${esc(sh.color)}">` +
      `<header class="sh-top"><div class="sh-ttl"><b>Label Integrity</b><span>Correction &amp; Marking Sheet</span></div><div class="sh-store"><b>${esc(storeLabel)}</b><span>${esc(cyc)}</span></div></header>` +
      `<div class="sh-meta"><div class="sh-info"><div class="sh-ln"><label>Department</label><b>${esc(sh.group)}</b></div><div class="sh-ln"><label>Sub-department</label><b><i class="bdg">${esc(sh.sub)}</i>${esc(sh.subName)}</b></div><div class="sh-ln"><label>Micro-department</label><b class="mic">${esc(sh.micro)}</b></div></div>` +
        `<div class="sh-who"><div class="sh-ln"><label>Checked by</label><u></u></div><div class="sh-ln"><label>Date</label><u></u></div><div class="sh-ln"><label>Time</label><u></u></div></div></div>` +
      `<div class="sh-sec">Labels checked <span>— tick each as you go (100)</span></div><div class="sh-grid">${boxes}</div>` +
      `<div class="sh-sec">Incorrect labels found</div><table class="sh-tbl"><thead><tr><th class="loc">Location / keycode</th><th>Incorrect label description</th><th class="c">True cost</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<footer class="sh-foot">${esc(sh.sub)} · ${esc(sh.micro)}</footer></section>`;
  };
  const css = `*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}` +
    `.sheet{width:190mm;min-height:277mm;padding:12mm 10mm;margin:0 auto;page-break-after:always;position:relative}.sheet:last-child{page-break-after:auto}` +
    `.sh-top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid var(--ac);padding-bottom:7px;margin-bottom:12px}` +
    `.sh-ttl b{display:block;font-size:23px;font-weight:800;letter-spacing:-.01em}.sh-ttl span{font-size:12px;color:#555;letter-spacing:.03em;text-transform:uppercase}` +
    `.sh-store{text-align:right}.sh-store b{display:block;font-size:14px}.sh-store span{font-size:11px;color:#555}` +
    `.sh-meta{display:flex;justify-content:space-between;gap:20px;margin-bottom:16px}.sh-ln{margin-bottom:7px}` +
    `.sh-ln label{display:block;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#777}` +
    `.sh-ln b{font-size:14px;font-weight:700;display:flex;align-items:center;gap:7px}.sh-ln b.mic{font-size:16px}` +
    `.bdg{font-style:normal;background:var(--ac);color:#fff;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:800}` +
    `.sh-who{min-width:150px}.sh-who u{display:block;border-bottom:1px solid #999;height:16px;text-decoration:none}` +
    `.sh-sec{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ac);border-bottom:1px solid #ddd;padding-bottom:3px;margin:14px 0 8px}.sh-sec span{color:#999;font-weight:600;letter-spacing:0}` +
    `.sh-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:4px;margin-bottom:6px}.sh-grid i{display:block;aspect-ratio:1/1;border:1.2px solid #888;border-radius:3px}` +
    `.sh-tbl{width:100%;border-collapse:collapse;table-layout:fixed}.sh-tbl th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#555;text-align:left;border-bottom:2px solid var(--ac);padding:5px 6px}` +
    `.sh-tbl td{border:1px solid #bbb;height:26px;padding:2px 6px}.sh-tbl .loc{width:30%}.sh-tbl .c{width:20%}` +
    `.sh-foot{position:absolute;bottom:8mm;left:10mm;right:10mm;font-size:8.5px;color:#aaa;border-top:1px solid #eee;padding-top:4px}` +
    `@media screen{body{background:#e9edf0;padding:16px}.sheet{background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.15);margin-bottom:16px}}@page{size:A4;margin:0}`;
  const title = scope === 'all' || !scope ? 'all' : esc(list[0].sub + (scope.includes('-') ? ' ' + list[0].micro : ''));
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups to print the marking sheets', 'bad');
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Marking sheets — ${title}</title><style>${css}</style></head><body>${list.map(sheet).join('')}<scr` + `ipt>window.focus();setTimeout(function(){try{window.print();}catch(e){}},350);</scr` + `ipt></body></html>`);
  w.document.close();
}
