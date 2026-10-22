// The crew-code sheet: a workspace that needs a role the session lacks asks
// for its code once per device (session.unlock adds the role to the token).
// Returns true when the role is held afterwards.

import { $, ic, esc } from './ui.js';
import { tx } from './i18n.js';

const ROLE_FOR = { stockroom: 'stockroom', backdock: 'dock' };
const NAME = { stockroom: tx('Stockroom'), backdock: tx('Back dock') };

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
    el.innerHTML = `<div class="si-panel si-centre"><form class="si-form" id="unlockForm"><h2>${tx('{area} code', { area: NAME[area] })}</h2><div class="si-sub">${tx('The {area} crew code opens this workspace on this device until it is signed out. A manager code here opens every area; managers can also sign in as Manager to skip this.', { area: NAME[area] })}</div>` +
      `<label>${tx('Code')}</label><input class="si-pin" name="code" autocomplete="off" autocapitalize="characters" placeholder="${area === 'backdock' ? 'DK-0000' : 'SR-0000'}" required>` +
      `<div class="si-err" id="unlockErr"></div><button class="si-cta" type="submit">${tx('Open {area}', { area: NAME[area] })}${ic('arrow')}</button>` +
      `<div class="si-foot"><a data-unlock-cancel>${tx('Not now')}</a><span>${esc(session.current?.store || '')}</span></div></form></div>`;
    frame.appendChild(el);
    const done = ok => { el.remove(); resolve(ok); };
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-unlock-cancel]')) done(false); });
    $('#unlockForm', el).addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('.si-cta'); btn.disabled = true;
      try { await session.unlock(e.target.code.value); done(hasArea(session, area)); }
      catch (err) { $('#unlockErr', el).textContent = err.code === 'locked_out' ? tx('Too many attempts. Try again later.') : err.code === 'unauthorised' ? tx('Wrong code.') : err.message; btn.disabled = false; }
    });
    setTimeout(() => { try { $('input', el).focus(); } catch {} }, 30);
  });
}
