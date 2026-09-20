// The crew-code sheet: a workspace that needs a role the session lacks asks
// for its code once per device (session.unlock adds the role to the token).
// Returns true when the role is held afterwards.

import { $, ic, esc } from './ui.js';

const ROLE_FOR = { stockroom: 'stockroom', backdock: 'dock' };
const NAME = { stockroom: 'Stockroom', backdock: 'Back dock' };

export function hasArea(session, area) {
  const roles = session.current?.roles || [];
  return roles.includes('manager') || roles.includes('owner') || roles.includes(ROLE_FOR[area] || area);
}
export function ensureArea({ session, frame, area }) {
  if (!ROLE_FOR[area] || hasArea(session, area)) return Promise.resolve(true);
  if (!(session.current?.caps || []).includes(area)) return Promise.resolve(false);
  return new Promise(resolve => {
    $('#unlock')?.remove();
    const el = document.createElement('div'); el.id = 'unlock'; el.className = 'signin unlock';
    el.innerHTML = `<div class="si-panel si-centre"><form class="si-form" id="unlockForm"><h2>${NAME[area]} code</h2><div class="si-sub">The ${NAME[area]} crew code opens this workspace on this device until it is signed out. A manager code opens everything.</div>` +
      `<label>Code</label><input class="si-pin" name="code" autocomplete="off" autocapitalize="characters" placeholder="SR-0000" required>` +
      `<div class="si-err" id="unlockErr"></div><button class="si-cta" type="submit">Open ${NAME[area]}${ic('arrow')}</button>` +
      `<div class="si-foot"><a data-unlock-cancel>Not now</a><span>${esc(session.current?.store || '')}</span></div></form></div>`;
    frame.appendChild(el);
    const done = ok => { el.remove(); resolve(ok); };
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-unlock-cancel]')) done(false); });
    $('#unlockForm', el).addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('.si-cta'); btn.disabled = true;
      try { await session.unlock(e.target.code.value); done(hasArea(session, area)); }
      catch (err) { $('#unlockErr', el).textContent = err.code === 'locked_out' ? 'Too many attempts. Try again later.' : err.code === 'unauthorised' ? 'Wrong code.' : err.message; btn.disabled = false; }
    });
    setTimeout(() => { try { $('input', el).focus(); } catch {} }, 30);
  });
}
