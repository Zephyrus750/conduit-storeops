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

// The manager code again, once a manager's role has gone from this device:
// the shift ended (a code lasts 12 hours), the device locked after sitting
// idle, or another store was opened on it. A PC has no other way in (it signs
// in with the manager code), so it offers the code or signing out; a phone
// may carry on as a team member. Resolves true once the manager role is back.
let mgrOpen = null;
export function ensureManager({ session, frame, mobile, lockMins = 0, onSignOut }) {
  if (mgrOpen) return mgrOpen;
  const why = session.current?.lapsed;
  const reason = why === 'shift' ? tx('A manager sign-in lasts one shift (12 hours). Enter the manager code to carry on.')
    : why === 'idle' ? tx('Locked after {n} min idle. Enter the manager code to carry on.', { n: lockMins || '—' })
    : why === 'switch' ? tx('Another store was opened on this device, so this one kept only the Floor. Enter the manager code to carry on.')
    : tx('The manager sign-in on this PC has ended. Enter the manager code to carry on.');
  mgrOpen = new Promise(resolve => {
    $('#unlock')?.remove(); $('#mgrLock')?.remove();
    const el = document.createElement('div'); el.id = 'mgrLock'; el.className = 'signin unlock';
    el.innerHTML = `<div class="si-panel si-centre"><form class="si-form" id="mgrLockForm"><h2>${tx('Manager code')}</h2><div class="si-sub">${reason}</div>` +
      `<label for="mgrLockCode">${tx('Manager code')}</label><input class="si-pin" id="mgrLockCode" name="code" type="password" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="MG-······" required>` +
      `<div class="si-err" id="mgrLockErr"></div><button class="si-cta" type="submit">${tx('Carry on as manager')}${ic('arrow')}</button>` +
      `<div class="si-foot">${mobile ? `<a data-mgr="team">${tx('Carry on as a team member')}</a>` : ''}<a data-mgr="signout">${tx('Sign out')}</a><span>${esc(session.current?.store || '')}</span></div></form></div>`;
    frame.appendChild(el);
    const done = ok => { el.remove(); mgrOpen = null; resolve(ok); };
    el.addEventListener('click', async e => {
      const a = e.target.closest('[data-mgr]'); if (!a) return;
      if (a.dataset.mgr === 'team') { await session.dropManager(); done(false); }
      else { el.remove(); mgrOpen = null; onSignOut?.(); }   // signing out closes the store; nothing to redraw
    });
    $('#mgrLockForm', el).addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('.si-cta'); btn.disabled = true;
      try {
        const s = await session.unlock(e.target.code.value);
        if ((s?.roles || []).includes('manager')) return done(true);
        $('#mgrLockErr', el).textContent = tx('That is a crew code, not the manager code.'); e.target.code.value = '';
      } catch (err) { $('#mgrLockErr', el).textContent = err.code === 'locked_out' ? tx('Too many attempts. Try again later.') : err.code === 'unauthorised' ? tx('Wrong code.') : err.message; }
      btn.disabled = false;
    });
    setTimeout(() => { try { $('#mgrLockCode', el).focus(); } catch {} }, 30);
  });
  return mgrOpen;
}
