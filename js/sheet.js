// One sheet for every pop-up (idea 1 on the ideas board, 2026-11-06).
// The same three parts every time: a header with what it is about and ×
// top right, a body that scrolls on its own, and a footer with the actions
// on the right, the main one last, each named by what it does. A short
// form is a dialog in the middle (440 px), details a side sheet from the
// right (520 px), a working surface a wide dialog; on a phone every one
// comes up from the bottom. The two camera screens stay full-screen and
// share only the close button and the keys.
//
// The keys and focus are the same everywhere (watchSheets, run once by the
// shell): Esc and a click on the dimmed page close the top sheet, unless it
// is saving (.busy); focus starts on its first field and Tab stays inside;
// closing gives focus back to what opened it. Closing is always its ×
// being pressed, so a view's own close action runs whichever way it closed.
//
//   sheetHtml({ title, sub, head, body, foot, kind, size, close, label, cls, busy }) → html
//     a pop-up a view paints with its own markup; close is the data-act its × sends.
//     kind: 'dialog' (default), 'side' or 'bottom'; size: '' or 'wide'.
//   openSheet({ ...the same, onClose, onClick, root }) → { el, body, set(parts), busy(on), close() }
//     a pop-up of its own, on the frame.
//   ask({ title, text, ok, cancel, danger }) → Promise<boolean>, in place of confirm().
//   askForm({ title, text, fields, ok, cancel }) / askText({ title, text, label, value, … })
//     → the answers (or null), in place of prompt().
//   camScreen(el) / camClose(attrs) the camera screens' marker and close button.

import { ic, esc } from './ui.js';
import { tx } from './i18n.js';

let seq = 0;
const strip = s => String(s || '').replace(/<[^>]*>/g, '').replace(/"/g, '&quot;').trim();
const head = (o, id) => o.head || `<div class="sht-t"><h3 id="${id}">${o.title || ''}</h3>${o.sub ? `<small>${o.sub}</small>` : ''}</div>`;
const xBtn = (close, busy) => `<button type="button" class="sht-x"${close ? ` data-act="${close}"` : ''}${busy ? ' disabled' : ''} aria-label="${tx('Close')}" title="${tx('Close')} (Esc)">${ic('x')}</button>`;

export function sheetHtml(o = {}) {
  const id = `sht${++seq}`, kind = o.kind || 'dialog';
  const named = o.label ? `aria-label="${strip(o.label)}"` : o.head ? `aria-label="${strip(o.title)}"` : `aria-labelledby="${id}"`;
  return `<div class="sht-back is-sheet ${kind}${o.size ? ' ' + o.size : ''}${o.cls ? ' ' + o.cls : ''}${o.busy ? ' busy' : ''}">` +
    `<div class="sht" role="dialog" aria-modal="true" ${named} tabindex="-1">` +
    `<div class="sht-h">${head(o, id)}${xBtn(o.close, o.busy)}</div>` +
    `<div class="sht-b">${o.body || ''}</div>${o.foot ? `<div class="sht-f">${o.foot}</div>` : ''}</div></div>`;
}

export function openSheet({ onClose, onClick, root, ...o } = {}) {
  const host = root || document.querySelector('.frame') || document.body, tmp = document.createElement('div');
  tmp.innerHTML = sheetHtml(o);
  const el = tmp.firstElementChild, $ = s => el.querySelector(s);
  let closed = false;
  const close = () => { if (closed) return; closed = true; el.remove(); onClose?.(); };
  el.addEventListener('click', e => { if (e.target.closest('.sht-x')) close(); else onClick?.(e); });
  host.appendChild(el);
  return {
    el, close, get closed() { return closed; }, get body() { return $('.sht-b'); },
    // Saving: no Esc, no click outside and no ×, until it is done.
    busy(on) { el.classList.toggle('busy', !!on); const x = $('.sht-x'); if (x) x.disabled = !!on; },
    // New parts in place: the sheet, its scroll and its focus stay.
    set(p = {}) {
      if (p.title != null && $('.sht-t h3')) $('.sht-t h3').innerHTML = p.title;
      if (p.sub != null && $('.sht-t')) { let s = $('.sht-t small'); if (!s && p.sub) { s = document.createElement('small'); $('.sht-t').appendChild(s); } if (s) { if (p.sub) s.innerHTML = p.sub; else s.remove(); } }
      if (p.body != null) $('.sht-b').innerHTML = p.body;
      if (p.foot != null) { let f = $('.sht-f'); if (!f && p.foot) { f = document.createElement('div'); f.className = 'sht-f'; $('.sht').appendChild(f); } if (f) { if (p.foot) f.innerHTML = p.foot; else f.remove(); } }
    },
  };
}

// A question before something that cannot be taken back: the question, a
// sentence or two on what happens, and buttons named by what they do. A red
// action starts with focus on the safe button, so Enter never removes
// anything; Esc and a click outside are the safe answer too. Plain text:
// it is escaped here.
//   ask({ title, text, ok, cancel, danger }) → Promise<boolean>
//   text: a sentence, or a list of them (one paragraph each).
export function ask({ title, text = '', ok, cancel = tx('Keep it'), danger = true } = {}) {
  return new Promise(resolve => {
    let yes = false;
    const sheet = openSheet({
      cls: 'sht-ask', title: esc(title), label: title,
      body: [].concat(text || []).map(t => `<p>${esc(t)}</p>`).join(''),
      foot: `<button type="button" class="btn" data-ask="no">${esc(cancel)}</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-ask="yes">${esc(ok)}</button>`,
      onClose: () => resolve(yes),
      onClick: e => { const b = e.target.closest('[data-ask]'); if (!b) return; yes = b.dataset.ask === 'yes'; sheet.close(); },
    });
    try { sheet.el.querySelector(`[data-ask="${danger ? 'no' : 'yes'}"]`).focus({ preventScroll: true }); } catch {}
  });
}

// A question that needs words back, in place of prompt(): what it is about,
// a sentence on what happens, the fields, and buttons named by what they do.
// Enter in a one-line field answers; a required field keeps the answer
// button off until it has something in it. Esc, a click outside and the
// cancel button answer null. Labels and text are plain text (escaped here);
// values come back trimmed (upper: upper case), a select's as its value.
//   askForm({ title, text, fields: [{ name, label, value, placeholder, hint,
//     multiline, required, readonly, type, inputmode, upper, options: [[value, label]] }],
//     ok, cancel, danger }) → Promise<{ [name]: string } | null>
//   askText({ title, text, label, value, …the same for one field }) → Promise<string | null>
export function askForm({ title, text = '', fields = [], ok = tx('Save'), cancel = tx('Cancel'), danger = false } = {}) {
  return new Promise(resolve => {
    let out = null;
    const field = (f, i) => {
      const id = `askf${seq}-${i}`, attrs = `id="${id}" data-askf="${esc(f.name)}"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}${f.inputmode ? ` inputmode="${esc(f.inputmode)}"` : ''}${f.required ? ' required' : ''}${f.readonly ? ' readonly' : ''} autocomplete="off"`;
      const ctl = f.options ? `<select ${attrs}>${f.options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(f.value ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`
        : f.multiline ? `<textarea ${attrs} rows="3">${esc(f.value ?? '')}</textarea>`
        : `<input ${attrs} type="${f.type || 'text'}" value="${esc(f.value ?? '')}"${f.upper ? ' class="up"' : ''}>`;
      return `<label class="askf" for="${id}"><span>${esc(f.label || '')}</span>${ctl}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
    };
    const sheet = openSheet({
      cls: 'sht-ask sht-form', title: esc(title), label: title,
      body: [].concat(text || []).map(t => `<p>${esc(t)}</p>`).join('') + fields.map(field).join(''),
      foot: `<button type="button" class="btn" data-ask="no">${esc(cancel)}</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-ask="yes">${esc(ok)}</button>`,
      onClose: () => resolve(out),
      onClick: e => { const b = e.target.closest('[data-ask]'); if (!b || b.disabled) return; if (b.dataset.ask === 'yes') out = read(); sheet.close(); },
    });
    const els = () => [...sheet.el.querySelectorAll('[data-askf]')];
    const read = () => Object.fromEntries(els().map((el, i) => { const f = fields[i] || {}; let v = String(el.value ?? '').trim(); if (f.upper) v = v.toUpperCase(); return [el.dataset.askf, v]; }));
    const yes = sheet.el.querySelector('[data-ask="yes"]');
    const check = () => { yes.disabled = els().some(el => el.required && !String(el.value || '').trim()); };
    sheet.el.addEventListener('input', check); check();
    sheet.el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('input[data-askf]') && !e.isComposing) { e.preventDefault(); if (!yes.disabled) yes.click(); } });
  });
}
export async function askText({ label = '', value = '', placeholder, hint, multiline, required, readonly, type, inputmode, upper, options, ...o } = {}) {
  const r = await askForm({ ...o, fields: [{ name: 'v', label, value, placeholder, hint, multiline, required, readonly, type, inputmode, upper, options }] });
  return r ? r.v : null;
}

// The camera screens: full-screen, the same × at the top right and the same Esc.
export const camScreen = el => { el.classList.add('is-sheet', 'cam'); return el; };
export const camClose = attrs => `<button type="button" class="sht-x cam" ${attrs} aria-label="${tx('Close')}" title="${tx('Close')} (Esc)">${ic('x')}</button>`;

// ---- The one place for keys, focus and outside clicks ----
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FIELD = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])';
const shown = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
const coarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : { matches: false };
// An element by what it does, to find its twin after a view painted again.
function sig(el) {
  if (!el || el === document.body || !el.tagName) return null;
  const at = [...el.attributes].filter(a => a.name.startsWith('data-') || a.name === 'id' || a.name === 'name').map(a => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
  return at ? el.tagName.toLowerCase() + at : null;
}
const twin = (s, within = document) => { if (!s) return null; try { const el = within.querySelector(s); return el && shown(el) ? el : null; } catch { return null; } };
const focusEl = el => { try { el.focus({ preventScroll: true }); } catch {} };

let watching = false;
export function watchSheets() {
  if (watching || typeof document === 'undefined') return; watching = true;
  const all = document.getElementsByClassName('is-sheet');
  // No layout read here: this runs after every change to the page.
  const top = () => { for (let i = all.length - 1; i >= 0; i--) if (!all[i].closest('[hidden]')) return all[i]; return null; };
  const busy = s => s.classList.contains('busy');
  const dialog = s => s.querySelector('.sht') || s;
  // [{ el, opener, back }]: each open sheet, what opened it, and the opener's
  // signature for when a repaint replaced it.
  const stack = [];
  let lastOut = null, lastIn = null;
  const first = s => {
    if (s.contains(document.activeElement) && document.activeElement !== s) return;
    const f = !coarse.matches && [...s.querySelectorAll(`.sht-b ${FIELD}, .sht-b [contenteditable="true"]`)].find(shown);
    focusEl(f || dialog(s));
  };
  // Unless the closing already put focus somewhere (a scan field taking the next scan).
  const giveBack = entry => {
    const a = document.activeElement; if (a && a !== document.body && a.isConnected && !a.closest('.is-sheet')) return;
    const el = entry.opener?.isConnected && shown(entry.opener) ? entry.opener : twin(entry.back); if (el) focusEl(el);
  };
  const check = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (!stack[i].el.isConnected) {
      const gone = stack[i], t = top();
      // Painted again: the new sheet takes its place, quietly.
      if (t && i === stack.length - 1 && !stack.some(x => x.el === t)) { gone.el = t; const f = twin(lastIn, t); if (f) focusEl(f); else first(t); continue; }
      stack.splice(i, 1); if (i === stack.length) giveBack(gone);
    }
    const t = top();
    if (t && !stack.some(x => x.el === t)) {
      // What opened it: the last thing pressed or focused (for a sheet over
      // another sheet, the button inside the one below). Kept even when a
      // repaint replaced it: its twin takes the focus back.
      const a = document.activeElement, opener = lastOut && !t.contains(lastOut) ? lastOut : (a && a !== document.body && !t.contains(a) ? a : null);
      stack.push({ el: t, opener, back: sig(opener) });
      t.classList.add('enter'); t.addEventListener('animationend', () => t.classList.remove('enter'), { once: true });
      first(t);
    }
  };
  new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
  // What a sheet would give focus back to: the last thing pressed or focused.
  // Focus a sheet sets on itself as it opens is not what opened it.
  document.addEventListener('focusin', e => {
    const s = e.target.closest?.('.is-sheet'); if (s) lastIn = sig(e.target);
    if (!s || stack.some(x => x.el === s)) lastOut = e.target;
  }, true);
  let downOn = null;
  document.addEventListener('pointerdown', e => {
    downOn = e.target;
    const b = e.target.closest?.(FOCUSABLE); if (b) lastOut = b;
  }, true);
  // A click on the dimmed page: the press and the release both outside the sheet.
  document.addEventListener('click', e => {
    const b = e.target; if (!b.classList?.contains('sht-back') || downOn !== b) return;
    e.stopPropagation(); e.preventDefault();
    if (b === top() && !busy(b)) b.querySelector('.sht-x')?.click();
  }, true);
  window.addEventListener('keydown', e => {
    const t = top(); if (!t) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!busy(t)) t.querySelector('.sht-x')?.click();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = [...t.querySelectorAll(FOCUSABLE)].filter(shown);
    if (!list.length) { e.preventDefault(); focusEl(dialog(t)); return; }
    const a = document.activeElement, at = list.indexOf(a);
    if (!t.contains(a) || at < 0) { e.preventDefault(); focusEl(e.shiftKey ? list[list.length - 1] : list[0]); return; }
    if (!e.shiftKey && at === list.length - 1) { e.preventDefault(); focusEl(list[0]); }
    else if (e.shiftKey && at === 0) { e.preventDefault(); focusEl(list[list.length - 1]); }
  }, true);
  // A bottom sheet goes down when its handle is dragged down.
  let drag = null;
  document.addEventListener('pointerdown', e => {
    const h = e.target.closest?.('.sht-h'); if (!h || e.target.closest('button, a, input, select, textarea')) return;
    const back = h.closest('.sht-back'); if (!back || getComputedStyle(back).getPropertyValue('--sht-bottom').trim() !== '1') return;
    drag = { back, sheet: dialog(back), y: e.clientY, dy: 0, id: e.pointerId };
    drag.sheet.style.transition = 'none';
  });
  document.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; drag.dy = Math.max(0, e.clientY - drag.y); drag.sheet.style.transform = drag.dy ? `translateY(${drag.dy}px)` : ''; });
  const drop = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    d.sheet.style.transition = ''; d.sheet.style.transform = '';
    if (d.dy > 90 && !busy(d.back)) d.back.querySelector('.sht-x')?.click();
  };
  document.addEventListener('pointerup', drop); document.addEventListener('pointercancel', drop);
}
