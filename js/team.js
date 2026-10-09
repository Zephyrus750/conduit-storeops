// Team communication (TODO 2, decision 20): the store's team message and
// today's briefing, in one strip above every view, desk and phone. Tapping
// it opens the sheet with both in full; managers and the owner write them
// there (team.message.set, team.briefing.set). A device hides the strip for
// a message it has read until a new one is published.
//
//   mountTeam({ store, session, host, today, storeNo, isHome }) → { repaint, off }

import { ic, esc, toast, fmtTime } from './ui.js';
import { MESSAGE_MAX, BRIEFING_MAX } from '../shared/reducers/store.js';

const SEEN = 'team_seen';
const seen = no => { try { return JSON.parse(localStorage.getItem(SEEN) || '{}')[no] || ''; } catch { return ''; } };
const markSeen = (no, at) => { try { const all = JSON.parse(localStorage.getItem(SEEN) || '{}'); all[no] = at; localStorage.setItem(SEEN, JSON.stringify(all)); } catch {} };

// Plain text from another device, escaped first; then **bold**, "- " lists
// and line breaks. Nothing else becomes markup.
export function richText(text) {
  const out = []; let list = [];
  const inline = t => esc(t).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  const flush = () => { if (list.length) { out.push(`<ul>${list.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`); list = []; } };
  for (const line of String(text || '').split('\n')) {
    const m = /^\s*[-•*]\s+(.*)$/.exec(line);
    if (m) { list.push(m[1]); continue; }
    flush(); out.push(line.trim() ? `<p>${inline(line)}</p>` : '');
  }
  flush();
  return out.join('');
}
const canWrite = session => { const c = session.current; return !!(c && (c.owner || c.actas || (c.roles || []).includes('manager'))); };
const live = (m, today) => m && (!m.until || m.until >= today);

export function mountTeam({ store, session, host, today, storeNo, isHome = () => false }) {
  if (!host) return { off() {}, repaint() {} };
  const now = () => { const c = store.get('comms') || {}, day = today(), msg = live(c.message, day) ? c.message : null, brief = c.briefings?.[day] || null; return { msg, brief, key: [msg?.at, brief?.at].filter(Boolean).join('|') }; };
  const paint = () => {
    const { msg, brief, key } = now(), w = canWrite(session);
    // Unread: the whole strip, on every view. Read (or nothing yet): a small
    // way back in on the home screens, to read again or for a manager to write.
    if (key && seen(storeNo) !== key) {
      const first = t => esc(String(t).split('\n').find(x => x.trim()) || '').replace(/\*\*/g, '');
      host.hidden = false; host.className = 'teambar';
      host.innerHTML = `<button class="tb-open" data-team="open">${ic('users')}<span class="tb-txt">${msg ? `<b>Team message</b> ${first(msg.text)}` : ''}${msg && brief ? '<i class="tb-sep"></i>' : ''}${brief ? `<b>Today’s briefing</b> ${first(brief.text)}` : ''}</span><span class="tb-more">Read</span></button><button class="tb-x" data-team="hide" aria-label="Hide until there is something new" title="Hide until there is something new">${ic('x')}</button>`;
    } else if (isHome() && (key || w)) {
      host.hidden = false; host.className = 'teambar quiet';
      host.innerHTML = `<button class="tb-open" data-team="open">${ic('users')}<span class="tb-txt">${key ? 'Team message and today’s briefing' : 'Write a team message or today’s briefing'}</span></button>`;
    } else { host.hidden = true; host.innerHTML = ''; }
  };
  const hide = () => { markSeen(storeNo, now().key); paint(); };
  const onClick = e => { const b = e.target.closest('[data-team]'); if (!b) return; if (b.dataset.team === 'hide') hide(); else openTeam({ store, session, today, onClose: hide }); };
  host.addEventListener('click', onClick);
  paint();
  const offs = [store.on('comms', paint), session.on('change', paint)];
  return { repaint: paint, off() { host.removeEventListener('click', onClick); for (const o of offs) o(); host.hidden = true; host.innerHTML = ''; } };
}

export function openTeam({ store, session, today, onClose }) {
  document.getElementById('teamsheet')?.remove();
  const el = document.createElement('div'); el.id = 'teamsheet'; el.className = 'tm-back'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Team message and briefing');
  let editing = null;
  const paint = () => {
    const c = store.get('comms') || {}, day = today(), msg = live(c.message, day) ? c.message : null, brief = c.briefings?.[day] || null, w = canWrite(session);
    const block = (title, it, kind) => `<section class="tm-sec"><div class="tm-h"><h3>${title}</h3>${w && editing !== kind ? `<button class="btn sm" data-tm="edit" data-kind="${kind}">${ic('edit')}${it ? 'Edit' : 'Write'}</button>` : ''}</div>` +
      (editing === kind ? editor(kind, it) : it ? `<div class="tm-body">${richText(it.text)}</div><p class="tm-meta">${it.owner ? 'From the owner' : 'From a manager'} · ${fmtTime(it.at)}${kind === 'message' && it.until ? ` · until ${esc(it.until)}` : ''}</p>` : `<p class="tm-empty">${kind === 'message' ? 'No team message.' : 'No briefing for today.'}</p>`) + '</section>';
    el.innerHTML = `<div class="tm-sheet"><button class="tour-x" data-tm="close" aria-label="Close">${ic('x')}</button>${block('Team message', msg, 'message')}${block('Today’s briefing', brief, 'briefing')}${w ? '' : '<p class="tm-meta">Managers write these.</p>'}</div>`;
    el.querySelector('textarea')?.focus();
  };
  const editor = (kind, it) => `<textarea class="tm-in" data-tm-field="text" maxlength="${kind === 'message' ? MESSAGE_MAX : BRIEFING_MAX}" rows="${kind === 'message' ? 4 : 7}" placeholder="${kind === 'message' ? 'A message every device in the store sees until it is cleared' : 'Today: deliveries, focus, who is where…'}">${esc(it?.text || '')}</textarea>` +
    `<p class="tm-hint">Plain text. **bold**, and lines starting with “- ” become a list.</p>` +
    (kind === 'message' ? `<label class="tm-until">Show until <input type="date" data-tm-field="until" value="${esc(it?.until || '')}"> <small>(blank: until cleared)</small></label>` : '') +
    `<div class="tm-acts"><button class="btn primary" data-tm="save" data-kind="${kind}">Publish</button>${it ? `<button class="btn" data-tm="clear" data-kind="${kind}">Clear</button>` : ''}<button class="btn" data-tm="cancel">Cancel</button></div>`;
  const send = async (kind, text, until) => {
    try {
      if (kind === 'message') await store.dispatch({ type: 'team.message.set', entity: {}, payload: { text, ...(until ? { until } : {}) } });
      else await store.dispatch({ type: 'team.briefing.set', entity: { date: today() }, payload: { text } });
      editing = null; toast(text ? 'Published to every device in the store' : 'Cleared'); paint();
    } catch (e) { toast(e.message, 'bad'); }
  };
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', e => {
    if (e.target === el) return close();
    const b = e.target.closest('[data-tm]'); if (!b) return;
    const a = b.dataset.tm, kind = b.dataset.kind;
    if (a === 'close') close();
    else if (a === 'edit') { editing = kind; paint(); }
    else if (a === 'cancel') { editing = null; paint(); }
    else if (a === 'clear') { if (confirm(`Clear the ${kind === 'message' ? 'team message' : 'briefing'} on every device?`)) send(kind, '', null); }
    else if (a === 'save') { const text = el.querySelector('[data-tm-field="text"]')?.value || '', until = el.querySelector('[data-tm-field="until"]')?.value || ''; if (!text.trim()) return toast('Write something first, or Clear', 'bad'); send(kind, text, until); }
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el); paint();
  return close;
}
