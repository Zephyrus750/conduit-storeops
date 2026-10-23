// Team communication (TODO 2, decision 20): the store's team message and
// today's briefing. On a phone, a strip above the view; on a PC, a card in
// the Dashboard's title row (teamChip) and a dot on the rail's Dashboard row
// while it is unread, so no view is pushed down (2026-10-14). Tapping either
// opens the sheet with both in full; managers and the owner write them there
// (team.message.set, team.briefing.set). A device marks a message read
// until a new one is published.
//
//   mountTeam({ store, session, host, today, storeNo, isHome, desk }) → { repaint, off }
//   teamChip({ store, session, storeNo, today }) → html for the Dashboard
//   openTeamFor({ store, session, storeNo, today, onClose }) opens the sheet and marks it read

import { ic, esc, toast, fmtTime } from './ui.js';
import { MESSAGE_MAX, BRIEFING_MAX } from '../shared/reducers/store.js';
import { tx } from './i18n.js';

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
const state = (store, day) => { const c = store.get('comms') || {}, msg = live(c.message, day) ? c.message : null, brief = c.briefings?.[day] || null; return { msg, brief, key: [msg?.at, brief?.at].filter(Boolean).join('|') }; };
const firstLine = t => esc(String(t).split('\n').find(x => x.trim()) || '').replace(/\*\*/g, '');

// The Dashboard's card: unread shows the first line and Read; read (or
// nothing yet, for a manager) a quiet way back in.
export function teamChip({ store, session, storeNo, today }) {
  const { msg, brief, key } = state(store, today()), w = canWrite(session);
  if (key && seen(storeNo) !== key) {
    const it = brief || msg, label = brief ? (msg ? tx('Today’s briefing and team message') : tx('Today’s briefing')) : tx('Team message');
    return `<button class="tm-chip" type="button" data-team="open">${ic('users')}<span class="t"><b>${label}</b><span>${firstLine(it.text)}</span></span><span class="rd">${tx('Read')}</span></button>`;
  }
  if (key || w) return `<button class="tm-chip read" type="button" data-team="open">${ic('users')}<span class="t"><b>${key ? tx('Team message and briefing') : tx('Write a team message or briefing')}</b></span></button>`;
  return '';
}
export function openTeamFor({ store, session, storeNo, today, onClose }) {
  return openTeam({ store, session, today, onClose: () => { markSeen(storeNo, state(store, today()).key); document.querySelector('.rrow[data-view="dashboard"]')?.classList.remove('tm-unread'); onClose?.(); } });
}

export function mountTeam({ store, session, host, today, storeNo, isHome = () => false, desk = () => false }) {
  if (!host) return { off() {}, repaint() {} };
  const now = () => state(store, today());
  const dot = on => document.querySelector('.rrow[data-view="dashboard"]')?.classList.toggle('tm-unread', on);
  const paint = () => {
    const { msg, brief, key } = now(), w = canWrite(session);
    // A PC: no strip; the Dashboard carries it (teamChip) and the rail's dot says it is unread.
    if (desk()) { host.hidden = true; host.innerHTML = ''; dot(!!key && seen(storeNo) !== key); return; }
    dot(false);
    // Unread: the whole strip, on every view. Read (or nothing yet): a small
    // way back in on the home screens, to read again or for a manager to write.
    if (key && seen(storeNo) !== key) {
      const first = firstLine;
      host.hidden = false; host.className = 'teambar';
      host.innerHTML = `<button class="tb-open" data-team="open">${ic('users')}<span class="tb-txt">${msg ? `<b>${tx('Team message')}</b> ${first(msg.text)}` : ''}${msg && brief ? '<i class="tb-sep"></i>' : ''}${brief ? `<b>${tx('Today’s briefing')}</b> ${first(brief.text)}` : ''}</span><span class="tb-more">${tx('Read')}</span></button><button class="tb-x" data-team="hide" aria-label="${tx('Hide until there is something new')}" title="${tx('Hide until there is something new')}">${ic('x')}</button>`;
    } else if (isHome() && (key || w)) {
      host.hidden = false; host.className = 'teambar quiet';
      host.innerHTML = `<button class="tb-open" data-team="open">${ic('users')}<span class="tb-txt">${key ? tx('Team message and today’s briefing') : tx('Write a team message or today’s briefing')}</span></button>`;
    } else { host.hidden = true; host.innerHTML = ''; }
  };
  const hide = () => { markSeen(storeNo, now().key); paint(); };
  const onClick = e => { const b = e.target.closest('[data-team]'); if (!b) return; if (b.dataset.team === 'hide') hide(); else openTeam({ store, session, today, onClose: hide }); };
  host.addEventListener('click', onClick);
  paint();
  const offs = [store.on('comms', paint), session.on('change', paint)];
  return { repaint: paint, off() { host.removeEventListener('click', onClick); for (const o of offs) o(); host.hidden = true; host.innerHTML = ''; dot(false); } };
}

export function openTeam({ store, session, today, onClose }) {
  document.getElementById('teamsheet')?.remove();
  const el = document.createElement('div'); el.id = 'teamsheet'; el.className = 'tm-back'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', tx('Team message and briefing'));
  let editing = null;
  const paint = () => {
    const c = store.get('comms') || {}, day = today(), msg = live(c.message, day) ? c.message : null, brief = c.briefings?.[day] || null, w = canWrite(session);
    const block = (title, it, kind) => `<section class="tm-sec"><div class="tm-h"><h3>${title}</h3>${w && editing !== kind ? `<button class="btn sm" data-tm="edit" data-kind="${kind}">${ic('edit')}${it ? tx('Edit') : tx('Write')}</button>` : ''}</div>` +
      (editing === kind ? editor(kind, it) : it ? `<div class="tm-body">${richText(it.text)}</div><p class="tm-meta">${it.owner ? tx('From the owner') : tx('From a manager')} · ${fmtTime(it.at)}${kind === 'message' && it.until ? ` · ${tx('until {date}', { date: esc(it.until) })}` : ''}</p>` : `<p class="tm-empty">${kind === 'message' ? tx('No team message.') : tx('No briefing for today.')}</p>`) + '</section>';
    el.innerHTML = `<div class="tm-sheet"><button class="tour-x" data-tm="close" aria-label="${tx('Close')}">${ic('x')}</button>${block(tx('Team message'), msg, 'message')}${block(tx('Today’s briefing'), brief, 'briefing')}${w ? '' : `<p class="tm-meta">${tx('Managers write these.')}</p>`}</div>`;
    el.querySelector('textarea')?.focus();
  };
  const editor = (kind, it) => `<textarea class="tm-in" data-tm-field="text" maxlength="${kind === 'message' ? MESSAGE_MAX : BRIEFING_MAX}" rows="${kind === 'message' ? 4 : 7}" placeholder="${kind === 'message' ? tx('A message every device in the store sees until it is cleared') : tx('Today: deliveries, focus, who is where…')}">${esc(it?.text || '')}</textarea>` +
    `<p class="tm-hint">${tx('Plain text. **bold**, and lines starting with “- ” become a list.')}</p>` +
    (kind === 'message' ? `<label class="tm-until">${tx('Show until')} <input type="date" data-tm-field="until" value="${esc(it?.until || '')}"> <small>${tx('(blank: until cleared)')}</small></label>` : '') +
    `<div class="tm-acts"><button class="btn primary" data-tm="save" data-kind="${kind}">${tx('Publish')}</button>${it ? `<button class="btn" data-tm="clear" data-kind="${kind}">${tx('Clear')}</button>` : ''}<button class="btn" data-tm="cancel">${tx('Cancel')}</button></div>`;
  const send = async (kind, text, until) => {
    try {
      if (kind === 'message') await store.dispatch({ type: 'team.message.set', entity: {}, payload: { text, ...(until ? { until } : {}) } });
      else await store.dispatch({ type: 'team.briefing.set', entity: { date: today() }, payload: { text } });
      editing = null; toast(text ? tx('Published to every device in the store') : tx('Cleared')); paint();
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
    else if (a === 'clear') { if (confirm(kind === 'message' ? tx('Clear the team message on every device?') : tx('Clear the briefing on every device?'))) send(kind, '', null); }
    else if (a === 'save') { const text = el.querySelector('[data-tm-field="text"]')?.value || '', until = el.querySelector('[data-tm-field="until"]')?.value || ''; if (!text.trim()) return toast(tx('Write something first, or Clear'), 'bad'); send(kind, text, until); }
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el); paint();
  return close;
}
