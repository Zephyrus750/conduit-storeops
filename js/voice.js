// Voice: the phone's microphone through the browser's speech recogniser
// (Chrome and Edge on Android, Safari on iOS). What a guess means is
// shared/voice.js; this only listens.
//
// Set as ShelfSearcher set it: US English, one utterance, an 8-second
// safety stop. Two additions that change no result: the recogniser is
// asked for its top five guesses (the map check picks among them), and
// the words show in the search bar while they are being heard.
// The recogniser sends the audio to the browser maker's service, so it
// needs a connection; an offline phone is told so.

const SR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = () => !!SR();

const ERRORS = {
  'not-allowed': 'The microphone is blocked for this app. Allow it in the browser’s site settings.',
  'service-not-allowed': 'Voice search is switched off in this browser.',
  'audio-capture': 'No microphone was found on this device.',
  network: 'Voice search needs a connection.',
  'no-speech': 'Didn’t hear anything. Tap the microphone and say a shelf, like “A16 S2”.',
  'language-not-supported': 'This browser cannot recognise English speech.',
};
export const voiceError = code => ERRORS[code] || 'Voice search stopped. Try again.';

function recogniser({ continuous }) {
  const r = new (SR())();
  r.lang = 'en-US'; r.continuous = continuous; r.interimResults = true; r.maxAlternatives = 5;
  return r;
}

// One utterance. onHeard(text) while speaking; onGuesses([text…]) once,
// top guess first; onError(message); onEnd() always, last.
export function listenOnce({ onHeard, onGuesses, onError, onEnd }) {
  if (!voiceSupported()) { onError?.('Voice search is not supported in this browser. Use Chrome, Edge or Safari.'); onEnd?.(); return { stop() {} }; }
  if (navigator.onLine === false) { onError?.(ERRORS.network); onEnd?.(); return { stop() {} }; }
  const r = recogniser({ continuous: false });
  let done = false, ended = false;
  const finish = () => { if (ended) return; ended = true; clearTimeout(timer); onEnd?.(); };
  const timer = setTimeout(() => { try { r.abort(); } catch {} finish(); }, 8000);
  r.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal && !done) { done = true; onGuesses?.([...res].map(a => a.transcript).filter(Boolean)); }
      else interim += res[0]?.transcript || '';
    }
    if (!done && interim) onHeard?.(interim);
  };
  r.onerror = e => { if (e.error !== 'aborted') onError?.(voiceError(e.error)); finish(); };
  r.onend = finish;
  try { r.start(); } catch { onError?.(voiceError('')); finish(); }
  return { stop() { try { r.abort(); } catch {} finish(); } };
}

// Dictation (the pick list's voice add): listens until "done", 15 seconds
// of silence or stop(); onUtterance(text) per finished phrase.
export function dictate({ onUtterance, onError, onEnd }) {
  if (!voiceSupported()) { onError?.('Voice is not supported in this browser.'); onEnd?.('error'); return { stop() {} }; }
  if (navigator.onLine === false) { onError?.(ERRORS.network); onEnd?.('error'); return { stop() {} }; }
  let r = null, active = true, silence = null;
  const end = reason => { if (!active) return; active = false; clearTimeout(silence); try { r?.abort(); } catch {} onEnd?.(reason); };
  const quiet = () => { clearTimeout(silence); silence = setTimeout(() => end('silence'), 15000); };
  const start = () => {
    r = recogniser({ continuous: true });
    r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) { quiet(); if (onUtterance?.(e.results[i][0].transcript || '') === false) return end('stopword'); } };
    r.onerror = e => { if (e.error === 'no-speech' || e.error === 'aborted') return; onError?.(voiceError(e.error)); end('error'); };
    // The recogniser ends on its own after a pause; keep listening until told.
    r.onend = () => { if (active) { try { start(); } catch { end('error'); } } };
    r.start();
  };
  try { start(); quiet(); } catch { onError?.(voiceError('')); end('error'); }
  return { stop: () => end('manual'), get active() { return active; } };
}
