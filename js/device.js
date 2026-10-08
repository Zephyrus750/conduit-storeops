// Phone behaviour: haptic feedback and the portrait lock (ShelfSearcher's
// haptic() and applyOrientationPolicy).
//
//   haptic(name)        a short buzz on a touch device, when vibration is on
//   applyOrientation()  lock a phone to portrait unless rotation is allowed
//
// Both are per-device preferences (Settings › General) and do nothing on a
// desk: a mouse has no motor and a monitor does not rotate.

import { prefs } from './prefs.js';

// The legacy patterns, in milliseconds.
const PATTERN = { tap: 10, select: 15, navigate: 12, success: [10, 40, 20], warning: [20, 40, 20, 40, 20], error: [50, 30, 50] };
const touch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export function haptic(name) {
  if (prefs().haptics === false || !touch()) return;
  try { navigator.vibrate?.(PATTERN[name] ?? 10); } catch { /* no motor, or the page is hidden */ }
}

// A phone (the short side under 600px) locks to portrait: the floor views
// are laid out for it, and a pocket turn should not reflow a scan. Tablets
// and the dock screen keep rotating. The browser only honours the lock in an
// installed app or fullscreen, so a refusal is expected and quiet.
export const isPhone = () => typeof screen !== 'undefined' && touch() && Math.min(screen.width, screen.height) < 600;
export async function applyOrientation() {
  const o = typeof screen !== 'undefined' ? screen.orientation : null;
  if (!o || !isPhone()) return 'n/a';
  try {
    if (prefs().allowLandscape) { o.unlock?.(); return 'free'; }
    await o.lock('portrait-primary'); return 'locked';
  } catch { return 'refused'; }
}
