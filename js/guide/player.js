// The Visual Guide's player (Help): the chapters beside one stage. Watch
// plays a chapter with a finger (phone) or a pointer (PC) and a caption;
// Try it hands the taps to the reader (an amber ring waits on the right
// spot); Handbook lays the steps out as still frames; Paper is the A4 page a
// chapter prints as, with a QR code that opens it on a phone. For puts one
// person's chapters first; Developer notes add each step's note and the
// event log. Ported from the "Conduit Visual Guide" showcase.
//
//   mountGuide(host, { storeNo, storeName, arg }) → stop()
//     renders into a shadow root on host (styles/guide.css inside it, so the
//     mock screens' generic class names never meet the shell's), and stop()
//     ends any animation, the observers and the key listener.
//   arg.chapter: open at that chapter (the shell's ?, a ?guide= link); null
//     opens the first chapter for the person chosen in For.

import { SCENES, GROUPS, PEOPLE, DEVICE } from './scenes.js';
import { gi as ic } from './icons.js';
import { tx, txn, locale } from '../i18n.js';
import { esc } from '../ui.js';
import { qrSvg } from '../../shared/qr.js';
import { guideLink, shelfLink } from '../share.js';
import { printSheet } from '../print.js';

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ABORT = Symbol('abort');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const keep = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; };

// Where the reader was, kept while the app is open: Help opens again on it.
const st = { mode: 'watch', sceneIx: 0, stepIx: 0, speed: 1, dev: keep('guide_dev') === '1', who: keep('guide_for') || 'all' };
if (!PEOPLE.some(p => p[0] === st.who)) st.who = 'all';
let usedArg = null;   // the shell's argument is applied once, not on every re-render

const mine = s => st.who === 'all' || s.for.includes(st.who);
// The chapters in the index's order: the chosen person's, by group, then the rest.
const ordered = () => [...GROUPS.flatMap(([g]) => SCENES.filter(s => s.grp === g && mine(s))), ...SCENES.filter(s => !mine(s))];

// ── the event log (developer notes: English, like the map editor) ────
const TO = { floor: 'Every device in the store', stockroom: 'Stockroom devices and managers', backdock: 'Back dock devices and managers', store: 'Every device in the store' };
const j = o => typeof o === 'string' ? o : JSON.stringify(o).replace(/"([a-zA-Z_]\w*)":/g, '$1: ').replace(/,(?=[a-zA-Z"{[])/g, ', ');
function evCard(e, fresh) {
  if (e.route) return `<div class="evc route${fresh ? ' fresh' : ''}"><div class="t"><b>${esc(e.route)}</b><span class="x">to the worker</span></div>${e.body ? `<code>${esc(j(e.body))}</code>` : ''}<div class="to">${esc(e.note)}</div></div>`;
  return `<div class="evc${e.wait ? ' wait' : ''}${fresh ? ' fresh' : ''}"><div class="t"><b>${esc(e.type)}</b><span class="ar">${esc(e.area)}</span>${e.n ? `<span class="x">×${e.n}</span>` : ''}</div><code>entity ${esc(j(e.entity))}${Object.keys(e.payload || {}).length ? `\npayload ${esc(j(e.payload))}` : ''}</code><div class="to">${e.wait ? `Waiting on this phone${e.why ? ` · ${esc(e.why)}` : ''}` : `→ ${TO[e.area]}`}</div></div>`;
}

// Scales a device to the width it has, keeping its height in the flow.
function fitIn(box, maxScale = 1) {
  const fit = box?.querySelector(':scope > .fit'), inner = fit?.firstElementChild; if (!inner) return;
  const w = inner.offsetWidth, h = inner.offsetHeight; if (!w || !box.clientWidth) return;
  const k = Math.min(maxScale, box.clientWidth / w);
  fit.style.transform = `translateX(-50%) scale(${k})`; box.style.height = (h * k) + 'px';
}
// Toasts and the scanner belong to one step only.
const clearTransient = root => { root.querySelectorAll('.dv-toast, .scanov').forEach(e => { e.hidden = true; }); root.querySelectorAll('.fg').forEach(f => f.classList.remove('try')); };

export function mountGuide(host, { storeNo = '', storeName = '', arg = null } = {}) {
  const sr = host.shadowRoot || host.attachShadow({ mode: 'open' });
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'styles/guide.css';
  const vg = document.createElement('div'); vg.className = 'vg loading';
  sr.replaceChildren(css, vg);
  let dead = false, playing = false, token = { dead: false, cancels: [] };
  const newToken = () => { token.dead = true; token.cancels.forEach(f => f()); return (token = { dead: false, cancels: [] }); };
  const ro = new ResizeObserver(entries => { for (const en of entries) fitIn(en.target, Number(en.target.dataset.max) || 1); });
  const $ = s => sr.querySelector(s);

  // The shell's ? and ?guide= links name a chapter (or none: the first for this person).
  if (arg && arg !== usedArg && 'chapter' in arg) {
    usedArg = arg;
    const i = SCENES.findIndex(s => s.id === arg.chapter);
    st.sceneIx = i >= 0 ? i : SCENES.indexOf(ordered()[0]); st.stepIx = 0;
    if (st.mode !== 'try') st.mode = 'watch';
  }

  // ── the helpers a step's run() uses ─────────────────────────────────
  // mode: 'instant' (a still frame, or the steps before the one in hand),
  // 'watch' (plays itself) or 'try' (waits for the reader's taps).
  function helpers(root, mode, tk) {
    const q = s => root.querySelector(s), qa = s => [...root.querySelectorAll(s)];
    const live = () => { if (tk.dead || dead) throw ABORT; };
    const quick = mode === 'instant' || reduce();
    const scr = el => el.closest('.dvs');
    const wait = async ms => { if (mode === 'instant') return; if (reduce()) { live(); return; } await sleep(ms / st.speed); live(); };
    const point = (el, show = true) => {
      const s = scr(el), fg = s?.querySelector(':scope > .fg'); if (!fg) return null;
      const k = s.getBoundingClientRect().width / s.offsetWidth || 1, a = el.getBoundingClientRect(), b = s.getBoundingClientRect();
      const x = (a.left - b.left + a.width / 2) / k, y = (a.top - b.top + a.height / 2) / k;
      if (quick) { fg.style.transition = 'none'; fg.style.transform = `translate(${x}px,${y}px)`; void fg.offsetWidth; fg.style.transition = ''; }
      else fg.style.transform = `translate(${x}px,${y}px)`;
      fg.classList.toggle('show', show); return { s, x, y, fg };
    };
    // Try it: wait for the reader to tap el (or anything inside it).
    const waitClick = (el, say) => new Promise((res, rej) => {
      const p = point(el); if (p) { p.fg.classList.add('try'); p.fg.dataset.say = say; }
      const done = () => { el.removeEventListener('click', on); if (p) p.fg.classList.remove('try'); };
      const on = e => { e.stopPropagation(); done(); res(); };
      el.addEventListener('click', on); tk.cancels.push(() => { done(); rej(ABORT); });
    });
    const ripple = p => { if (!p || quick) return; const r = document.createElement('i'); r.className = 'rp'; r.style.left = p.x + 'px'; r.style.top = p.y + 'px'; p.s.appendChild(r); setTimeout(() => r.remove(), 700); };
    return {
      wait,
      async tap(sel) {
        const el = q(sel); if (!el) return;
        if (mode === 'try') { await waitClick(el, tx('Tap here')); live(); ripple(point(el)); el.classList.add('pressed'); await sleep(150); el.classList.remove('pressed'); return; }
        const p = point(el); if (quick || !p) return;
        await wait(560); ripple(p);
        el.classList.add('pressed'); await wait(180); el.classList.remove('pressed'); await wait(160);
      },
      async type(sel, text) { const el = q(sel); if (!el) return; if (quick) { el.textContent = text; return; } el.textContent = ''; for (const ch of text) { el.textContent += ch; await wait(mode === 'try' ? 60 : 95); } await wait(250); },
      async scan(code, fast = false, within = '') {
        const s = (within && q(`${within} .dvs`)) || q('.dvs'), ov = s.querySelector(':scope > .scanov'), card = ov.querySelector('.scan-card'), hint = ov.querySelector('.hint');
        ov.querySelector('.scan-code').textContent = code; card.classList.remove('read'); ov.hidden = false; hint.textContent = tx('Point the camera at the label');
        if (mode === 'instant') { card.classList.add('read'); return; }
        if (mode === 'try') { hint.textContent = tx('Tap the label to scan it'); await waitClick(card, tx('Scan')); live(); card.classList.add('read'); await sleep(260); ov.hidden = true; s.querySelector(':scope > .fg')?.classList.remove('show'); return; }
        await wait(fast ? 500 : 1100); card.classList.add('read'); await wait(fast ? 220 : 420); ov.hidden = true;
      },
      buzz(sel) { const el = q(sel); if (!el || quick) return; el.classList.remove('buzz'); void el.offsetWidth; el.classList.add('buzz'); },
      show(sel) { qa(sel).forEach(e => { e.hidden = false; }); },
      hide(sel) { qa(sel).forEach(e => { e.hidden = true; }); },
      cls(sel, name, on) { qa(sel).forEach(e => e.classList.toggle(name, on)); },
      text(sel, t) { qa(sel).forEach(e => { e.textContent = t; }); },
      html(sel, h) { qa(sel).forEach(e => { e.innerHTML = h; }); },
      add(sel, h) { q(sel)?.insertAdjacentHTML('beforeend', h); },
      remove(sel) { q(sel)?.remove(); },
      style(sel, k, v) { qa(sel).forEach(e => { e.style[k] = v; }); },
      view(id) { qa('.v').forEach(e => { e.hidden = e.id !== id; }); },
      rail(name) { qa('.pc-row').forEach(e => e.classList.toggle('on', e.dataset.r === name)); },
      tab(name) { qa('.ph-tabs span').forEach(e => e.classList.toggle('on', e.dataset.tab === name)); },
      zoom(sel) { const t = q(sel), svg = t?.ownerSVGElement; if (!svg) return; const bx = t.getBBox(), vb = svg.viewBox.baseVal; svg.style.transformOrigin = `${(bx.x + bx.width / 2) / vb.width * 100}% ${(bx.y + bx.height / 2) / vb.height * 100}%`; svg.classList.add('zoom'); },
      toast(t, tone = '') { const el = q('.dvs')?.querySelector(':scope > .dv-toast'); if (!el) return; el.textContent = t; el.className = `dv-toast ${tone}`; el.hidden = false; },
      pill(tone, t) { const el = q('.msync'); if (!el) return; el.hidden = tone === null; if (tone === null) return; el.className = `msync ${tone}`; el.querySelector('.mst').textContent = t; },
      // A real share code for this store (shared/qr.js), as the shelf card's Share draws it.
      qr(sel, kind, value) { const el = q(sel); if (el) el.innerHTML = qrSvg(kind === 'shelf' ? shelfLink(storeNo, value) : guideLink(storeNo, value), { cell: 3 }); },
    };
  }
  // Builds a chapter's devices and plays steps 0..upto instantly.
  async function build(box, scene, upto, tk) {
    box.innerHTML = scene.html();
    const c = helpers(box, 'instant', tk);
    for (let k = 0; k <= upto; k++) { clearTransient(box); await scene.steps[k].run(c); }
  }
  const scene = () => SCENES[st.sceneIx];

  // ── the page ────────────────────────────────────────────────────────
  vg.innerHTML = `<header class="top"><div class="brand"><h1>${tx('Conduit Visual Guide')}</h1><p>${tx('Each task played on the device it’s done on.')} ${tx('Watch it, try it yourself, read it as a handbook, or print it.')}</p></div>` +
    `<div class="opts"><div class="modes" role="group" aria-label="${tx('View')}">${[['watch', tx('Watch')], ['try', tx('Try it')], ['read', tx('Handbook')], ['paper', tx('Paper')]].map(([m, l]) => `<button type="button" data-mode="${m}" aria-pressed="false">${l}</button>`).join('')}</div>` +
    `<label class="forsel">${tx('For')} <select data-f="who">${PEOPLE.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>` +
    `<label class="devsw"><input type="checkbox" data-f="dev"> ${tx('Developer notes')}</label></div></header>` +
    `<div class="layout"><nav class="chapters" aria-label="${tx('Chapters')}"></nav><main class="stage"><div class="stagebox" aria-live="polite" style="display:flex;flex-direction:column;gap:14px"></div></main></div><div class="offscreen" aria-hidden="true"></div>`;
  const stage = $('.stagebox'), chapters = $('.chapters');
  $('[data-f="who"]').value = st.who; $('[data-f="dev"]').checked = st.dev;

  function paintChapters() {
    const row = s => `<button type="button" class="chap${mine(s) ? '' : ' other'}" data-i="${SCENES.indexOf(s)}"><span class="ci">${ic(s.icon)}</span><b>${s.title}</b><small>${txn(s.steps.length, '{device} · {n} step', '{device} · {n} steps', { device: DEVICE[s.device] })}</small></button>`;
    let h = '';
    for (const [g, label] of GROUPS) { const list = SCENES.filter(s => s.grp === g && mine(s)); if (list.length) h += `<span class="cgrp">${label}</span>` + list.map(row).join(''); }
    const rest = SCENES.filter(s => !mine(s));
    if (rest.length) h += `<span class="cgrp">${tx('Other chapters')}</span>` + rest.map(row).join('');
    chapters.innerHTML = h; markChapter();
  }
  const markChapter = () => chapters.querySelectorAll('.chap').forEach(b => { const on = Number(b.dataset.i) === st.sceneIx; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'step' : 'false'); });

  const headHtml = s => `<div class="sc-head"><h2>${s.title}</h2><span class="where">${s.where}</span></div><p class="sc-intro">${s.intro}</p>`;
  const whatifHtml = s => `<section class="whatif"><h3>${tx('What if…')}</h3><div class="wi">${s.whatif.map(([q, a]) => `<div><b>${q}</b><span>${a}</span></div>`).join('')}</div></section>`;
  const observe = box => { ro.observe(box); };

  function renderWatch() {
    const s = scene(), tryIt = st.mode === 'try';
    stage.innerHTML = headHtml(s) + `<div class="watch"><div class="theatre${tryIt ? ' trying' : ''}"><div class="fitbox" data-max="1"><div class="fit dev-host"></div></div></div>` +
      `<aside class="evlog" ${st.dev ? '' : 'hidden'}><h3><i></i>Event log</h3><p class="evp">What each step sends, newest first, and which devices receive it.</p><div class="evlist"></div></aside></div>` +
      `<div class="cap"><div class="cap-row"><span class="cap-n"></span><div style="min-width:0;flex:1"><p class="cap-t"></p></div></div><div class="dev capd" ${st.dev ? '' : 'hidden'}></div>` +
      (tryIt ? `<div class="trynote">${tx('Your turn: tap where the amber ring is, or tap the label when the scanner opens.')} ${tx('The next step starts by itself.')}</div><div class="donecard" hidden>${ic('check')}${tx('Chapter done.')} ${tx('Try another, or check the What if… below.')}</div>` : '') +
      `<div class="ctl"><button type="button" data-c="prev" aria-label="${tx('Previous step')}">${ic('prev')}</button>${tryIt ? '' : `<button type="button" class="play" data-c="play">${ic('play')}${tx('Play')}</button>`}<button type="button" data-c="next" aria-label="${tryIt ? tx('Skip this step') : tx('Next step')}">${ic('next')}</button>` +
      `<div class="dots">${s.steps.map((_, i) => `<button type="button" data-step="${i}" aria-label="${tx('Step {n}', { n: i + 1 })}"></button>`).join('')}</div>` +
      `<button type="button" data-c="again" aria-label="${tx('Start again')}">${ic('again')}</button>${tryIt ? '' : `<select data-f="speed" aria-label="${tx('Speed')}"><option value="0.6">${tx('Slow')}</option><option value="1">${tx('Normal')}</option><option value="1.6">${tx('Fast')}</option></select>`}</div></div>` + whatifHtml(s);
    if (!tryIt) $('[data-f="speed"]').value = String(st.speed);
    observe(stage.querySelector('.fitbox'));
    if (tryIt) tryFrom(0); else showStep(st.stepIx, null);
  }
  function paintLog(upto, freshStep) {
    const list = stage.querySelector('.evlist'); if (!list) return;
    const s = scene(), out = [];
    for (let k = 0; k <= upto; k++) for (const e of s.steps[k].ev || []) out.unshift(evCard(e, k === freshStep));
    list.innerHTML = out.join('') || '<p class="evp">Nothing sent yet. Looking, searching and opening screens send nothing.</p>';
  }
  function caption() {
    // Replay parks the step at -1 until step 1 shows: caption step 1 meanwhile.
    const s = scene(), ix = Math.max(0, st.stepIx), step = s.steps[ix], n = $('.cap-n'); if (!n || !step) return;
    n.textContent = `${ix + 1} / ${s.steps.length}`;
    $('.cap-t').innerHTML = (st.mode === 'try' ? `<span class="yt">${tx('Your turn')}</span>` : '') + step.cap; $('.capd').innerHTML = step.dev;
    stage.querySelectorAll('.dots button').forEach((b, i) => { b.classList.toggle('on', i === ix); b.classList.toggle('done', i < ix); });
    const bp = $('[data-c="play"]'); if (bp) bp.innerHTML = playing ? `${ic('pause')}${tx('Pause')}` : st.stepIx === s.steps.length - 1 ? `${ic('again')}${tx('Replay')}` : `${ic('play')}${tx('Play')}`;
  }
  // Shows step i: the steps before it instantly, step i itself in the mode given.
  async function showStep(i, how) {
    const tk = newToken(), s = scene(), box = $('.dev-host'); if (!box) return false;
    st.stepIx = i;
    try {
      await build(box, s, i - 1, tk);
      fitIn(box.closest('.fitbox'), 1);
      caption(); paintLog(i - 1, -1);
      clearTransient(box);
      await s.steps[i].run(helpers(box, how || 'instant', tk));
      paintLog(i, how ? i : -1);
      return true;
    } catch (e) { if (e !== ABORT) throw e; return false; }
  }
  async function play() {
    const s = scene();
    if (st.stepIx >= s.steps.length - 1) st.stepIx = -1;
    playing = true; caption();
    while (playing && !dead && st.stepIx < s.steps.length - 1) {
      const ok = await showStep(st.stepIx + 1, 'watch');
      if (!ok || !playing) break;
      const tk = token; await sleep(1400 / st.speed); if (tk.dead) break;
    }
    playing = false; if (!dead && $('[data-c="play"]')) caption();
  }
  // Try it: each step waits for the reader, then the next one starts.
  async function tryFrom(i) {
    const s = scene(), done = $('.donecard'), note = $('.trynote'); if (done) done.hidden = true; if (note) note.hidden = false;
    for (let k = i; k < s.steps.length; k++) {
      const ok = await showStep(k, 'try'); if (!ok) return;
      if (k < s.steps.length - 1) { const tk = token; await sleep(reduce() ? 200 : 900); if (tk.dead) return; }
    }
    if ($('.donecard')) $('.donecard').hidden = false; if ($('.trynote')) $('.trynote').hidden = true;
  }
  const stop = () => { playing = false; newToken(); };

  async function renderBook() {
    const s = scene();
    stage.innerHTML = headHtml(s) + `<p class="book-note">${tx('Every step of this chapter as a still frame.')} ${tx('The ring shows where to tap.')}</p><div class="book"></div>` + whatifHtml(s);
    const book = $('.book'), tk = newToken();
    try {
      for (let i = 0; i < s.steps.length; i++) {
        const step = s.steps[i];
        book.insertAdjacentHTML('beforeend', `<article class="frame${s.device === 'pc' ? ' wide' : ''}"><div class="shot"><div class="fitbox" data-max="0.9"><div class="fit" data-fr="${i}"></div></div></div><div class="txt"><h3><span>${i + 1}</span>${step.cap}</h3><p>${step.read}</p><div class="dev" ${st.dev ? '' : 'hidden'}>${step.dev}${(step.ev || []).length ? `<br>Sends: ${step.ev.map(e => `<b>${esc(e.type || e.route)}</b>`).join(', ')}` : ''}</div></div></article>`);
        const box = book.querySelector(`[data-fr="${i}"]`);
        await build(box, s, i, tk);
        const fb = box.closest('.fitbox'); observe(fb); fitIn(fb, 0.9);
      }
    } catch (e) { if (e !== ABORT) throw e; }
  }

  // Paper: a chapter as the A4 page it prints as.
  const printedOn = () => tx('Printed {when}', { when: esc(new Date().toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })) });
  async function paperPage(s, into, tk) {
    const phoneish = s.device === 'phone', cols = phoneish ? 4 : s.device === 'pc' ? 2 : s.device === 'duo' || s.steps.length > 4 ? 3 : 2, max = phoneish ? 0.5 : 1;
    const qr = qrSvg(guideLink(storeNo, s.id), { cell: 3 });
    into.insertAdjacentHTML('beforeend', `<div class="a4"><div class="a4-h"><span class="mk"></span><div><small>Conduit · ${GROUPS.find(g => g[0] === s.grp)[1]} · ${DEVICE[s.device]}</small><h2>${s.title}</h2></div><span class="pg">${esc(storeName)} ${esc(storeNo)}</span></div>` +
      `<p class="a4-i">${s.intro}</p><div class="a4-g" style="--cols:${cols}"></div>` +
      `<div class="a4-w"><h4>${tx('What if…')}</h4>${s.whatif.map(([q, a]) => `<div><b>${q}</b> ${a}</div>`).join('')}</div>` +
      `<div class="a4-f">${qr ? `<span class="qrbox">${qr}</span>` : ''}<div><b>${tx('Scan to watch it on a phone')}</b>${tx('The QR code opens this chapter in the guide.')}</div><span class="sp"></span><span>${printedOn()}</span></div></div>`);
    const page = into.lastElementChild, g = page.querySelector('.a4-g');
    for (let i = 0; i < s.steps.length; i++) {
      const step = s.steps[i];
      g.insertAdjacentHTML('beforeend', `<div class="a4-s"><div class="shot"><div class="fitbox" data-max="${max}"><div class="fit"></div></div></div><b><i>${i + 1}</i>${step.cap}</b><span>${step.read}</span></div>`);
      const box = g.lastElementChild.querySelector('.fit');
      await build(box, s, i, tk);
      box.querySelectorAll('.fg').forEach(f => f.classList.remove('show'));
      fitIn(box.closest('.fitbox'), max);
    }
    return page;
  }
  async function renderPaper() {
    const s = scene(), n = ordered().filter(mine).length;
    stage.innerHTML = headHtml(s) + `<div class="paperwrap"><p class="book-note" style="text-align:center">${tx('The printed page for this chapter, one A4 sheet.')}</p>` +
      `<div class="paperacts"><button type="button" class="pri" data-c="print">${ic('print')}${tx('Print this page')}</button><button type="button" data-c="print-all">${ic('print')}${st.who === 'all' ? txn(n, 'Print {n} chapter', 'Print all {n} chapters') : txn(n, 'Print {n} chapter for {who}', 'Print {n} chapters for {who}', { who: PEOPLE.find(p => p[0] === st.who)[1] })}</button></div>` +
      `<div class="fitbox" data-max="1"><div class="fit"></div></div></div>`;
    const fit = stage.querySelector('.paperwrap .fit'), tk = newToken();
    try { await paperPage(s, fit, tk); } catch (e) { if (e !== ABORT) throw e; return; }
    const outer = stage.querySelector('.paperwrap > .fitbox'); observe(outer); fitIn(outer, 1);
  }
  // Printing goes through the app's print path (js/print.js): the pages,
  // laid out here, are copied into a shadow root of their own in the print
  // root, with this stylesheet, one A4 sheet a chapter.
  async function printPages(list, btn) {
    if (btn) btn.disabled = true;
    const off = $('.offscreen'), tk = newToken(), pages = [];
    try {
      if (list.length === 1 && st.mode === 'paper' && list[0] === scene() && stage.querySelector('.paperwrap .a4')) pages.push(stage.querySelector('.paperwrap .a4').cloneNode(true));
      else for (const s of list) { const p = await paperPage(s, off, tk); pages.push(p.cloneNode(true)); }
    } catch (e) { if (e !== ABORT) throw e; return; }
    finally { off.innerHTML = ''; if (btn) btn.disabled = false; }
    if (dead) return;
    printSheet({ title: tx('Conduit Visual Guide'), body: '<div class="vg-print"></div>', bare: true, page: 'A4 portrait', mount: root => new Promise(res => {
      const ps = root.querySelector('.vg-print').attachShadow({ mode: 'open' }), link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = 'styles/guide.css';
      link.addEventListener('load', res); link.addEventListener('error', res); setTimeout(res, 4000);
      ps.append(link, ...pages);
    }) });
  }

  function render() {
    stop(); ro.disconnect(); markChapter();
    vg.querySelectorAll('.modes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)));
    if (st.mode === 'watch' || st.mode === 'try') renderWatch(); else if (st.mode === 'read') renderBook(); else renderPaper();
  }

  // ── listeners: on the shadow root, and one on the document for the arrow keys ──
  const onClick = e => {
    const chap = e.target.closest('.chap');
    if (chap) { st.sceneIx = Number(chap.dataset.i); st.stepIx = 0; render(); if (vg.clientWidth < 908) stage.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth' }); return; }
    const m = e.target.closest('.modes button[data-mode]');
    if (m) { if (m.dataset.mode !== st.mode) { st.mode = m.dataset.mode; st.stepIx = 0; render(); } return; }
    const t = e.target.closest('button'); if (!t || t.closest('.dv') || !stage.contains(t)) return;
    const n = scene().steps.length, c = t.dataset.c;
    if (c === 'print') return printPages([scene()], t);
    if (c === 'print-all') return printPages(ordered().filter(mine), t);
    if (st.mode === 'try') {
      if (c === 'next') { const k = Math.min(n - 1, st.stepIx + 1); stop(); tryFrom(k); }
      else if (c === 'prev') { const k = Math.max(0, st.stepIx - 1); stop(); tryFrom(k); }
      else if (c === 'again') { stop(); tryFrom(0); }
      else if (t.dataset.step) { stop(); tryFrom(Number(t.dataset.step)); }
      return;
    }
    if (c === 'play') { if (playing) { stop(); caption(); } else play(); }
    else if (c === 'next') { stop(); showStep(Math.min(n - 1, st.stepIx + 1), 'watch'); }
    else if (c === 'prev') { stop(); showStep(Math.max(0, st.stepIx - 1), null); }
    else if (c === 'again') { stop(); showStep(0, 'watch'); }
    else if (t.dataset.step) { stop(); showStep(Number(t.dataset.step), 'watch'); }
  };
  const onChange = e => {
    const f = e.target.dataset?.f;
    if (f === 'speed') st.speed = Number(e.target.value) || 1;
    else if (f === 'who') { st.who = e.target.value; keep('guide_for', st.who); paintChapters(); if (st.mode === 'paper') render(); }
    else if (f === 'dev') { st.dev = e.target.checked; keep('guide_dev', st.dev ? '1' : '0'); if (st.mode !== 'paper') sr.querySelectorAll('.dev, .evlog').forEach(d => { d.hidden = !st.dev; }); }
  };
  // ← and → step through a chapter in Watch, wherever the focus is (but not in a field).
  const onKey = e => {
    if (dead || st.mode !== 'watch' || !host.isConnected || e.altKey || e.ctrlKey || e.metaKey) return;
    const at = e.composedPath()[0];
    if (at instanceof Element && at.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (document.querySelector('#msheet.open, .sharesheet, #pbox')) return;
    const n = scene().steps.length;
    if (e.key === 'ArrowRight') { e.preventDefault(); stop(); showStep(Math.min(n - 1, st.stepIx + 1), 'watch'); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stop(); showStep(Math.max(0, st.stepIx - 1), null); }
  };
  sr.addEventListener('click', onClick);
  sr.addEventListener('change', onChange);
  document.addEventListener('keydown', onKey);

  // The stylesheet is in before the first frame is measured.
  const start = () => { if (dead || !vg.classList.contains('loading')) return; vg.classList.remove('loading'); paintChapters(); render(); };
  css.addEventListener('load', start); css.addEventListener('error', start); setTimeout(start, 3000);

  return () => {
    dead = true; playing = false; newToken(); ro.disconnect();
    sr.removeEventListener('click', onClick); sr.removeEventListener('change', onChange); document.removeEventListener('keydown', onKey);
  };
}
