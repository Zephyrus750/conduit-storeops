// Voice search: what a spoken shelf code becomes. Pure, so the phone and the
// tests share it; js/voice.js does the listening.
//
// ShelfSearcher's recipe, which staff found accurate, is kept as the first
// reading: the recogniser set to US English (the most training data, and
// shelf codes are letters and digits in any accent), its top guess, spaces
// removed and number words made digits ("A ten" → A10). Two of its slips are
// fixed in that reading: it replaced words inside one another, so "twenty
// two" became 202 and "eighteen" 8EEN; and "side two" / "end one" name the
// shelf (S2, E1).
//
// What is new is checking against the store's own shelves. The recogniser
// offers a few guesses; a guess is used only when it names a real shelf, run
// or bay on the published map. The top guess, read ShelfSearcher's way, still
// wins whenever it is real, so nothing that worked before changes. When it is
// not, the other guesses are tried, then each guess with the usual mishearings
// of letter names and numbers ("be 22" → B22, "queue 15" → Q15, "for" → 4,
// "find shelf …"), again only if the result is on the map. If nothing is,
// the top guess goes to search as ShelfSearcher sent it.
//
//   spokenToCode(text)              → "A16S2", ShelfSearcher's reading (fixed)
//   misheard(text)                  → [code…] the same with mishearings undone
//   resolveSpoken(guesses, lookup)  → { code, heard, query, how }
//   spokenCodes(text)               → [code…] every code in one utterance (pick list)
//   STOP_WORDS                      → "done", "stop", … end a dictation

const ONES = { ZERO: 0, ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9 };
const TEENS = { TEN: 10, ELEVEN: 11, TWELVE: 12, THIRTEEN: 13, FOURTEEN: 14, FIFTEEN: 15, SIXTEEN: 16, SEVENTEEN: 17, EIGHTEEN: 18, NINETEEN: 19 };
const TENS = { TWENTY: 20, THIRTY: 30, FORTY: 40, FOURTY: 40, FIFTY: 50, SIXTY: 60, SEVENTY: 70, EIGHTY: 80, NINETY: 90 };
const SCALE = { HUNDRED: 100, THOUSAND: 1000 };
const isNum = w => w in ONES || w in TEENS || w in TENS || w in SCALE;
// "side two" is S2 and "end one" E1, as the shelves are labelled.
const SECTION = { SIDE: 'S', SECTION: 'S', END: 'E' };

const words = text => String(text || '').toUpperCase().replace(/[‐-―-]/g, ' ').replace(/[^A-Z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);

// Number words to digits. A run of words with "hundred" or "thousand" is one
// number ("seven thousand and two" → 7002); otherwise each word is its own
// digits ("seven zero zero two" → 7002), a tens word taking the ones word
// after it ("twenty two" → 22).
function numbers(ws) {
  const out = [];
  for (let i = 0; i < ws.length;) {
    const w = ws[i];
    if (!isNum(w)) { out.push(w); i++; continue; }
    let j = i; while (j < ws.length && (isNum(ws[j]) || (ws[j] === 'AND' && j + 1 < ws.length && isNum(ws[j + 1]) && j > i))) j++;
    const run = ws.slice(i, j).filter(x => x !== 'AND');
    if (run.some(x => x in SCALE)) {
      let total = 0, cur = 0;
      for (const x of run) {
        if (x in ONES) cur += ONES[x]; else if (x in TEENS) cur += TEENS[x]; else if (x in TENS) cur += TENS[x];
        else if (x === 'HUNDRED') cur = (cur || 1) * 100; else { total += (cur || 1) * 1000; cur = 0; }
      }
      out.push(String(total + cur));
    } else {
      for (let k = 0; k < run.length; k++) {
        const x = run[k];
        if (x in TENS && run[k + 1] in ONES && ONES[run[k + 1]] > 0) { out.push(String(TENS[x] + ONES[run[k + 1]])); k++; }
        else out.push(String(x in ONES ? ONES[x] : x in TEENS ? TEENS[x] : TENS[x]));
      }
    }
    i = j;
  }
  return out;
}
const sections = ws => ws.map((w, i) => (w in SECTION && i > 0 && /^\d/.test(ws[i + 1] || '') ? SECTION[w] : w));
const join = ws => ws.join('').replace(/([A-Z])0+(?=\d)/g, '$1');

export function spokenToCode(text) { return join(sections(numbers(words(text)))); }

// Letter names and number words a recogniser writes for what was said.
const LETTERS = {
  A: ['EH', 'HEY', 'AY'], B: ['BE', 'BEE', 'BEA'], C: ['SEE', 'SEA', 'CEE', 'SI'], D: ['DEE', 'THE', 'DI'], E: ['EE'],
  F: ['EF', 'EFF', 'IF'], G: ['GEE', 'JEE', 'JI'], H: ['AITCH', 'HAITCH', 'AGE', 'EACH', 'ITCH'], I: ['EYE', 'AYE'], J: ['JAY', 'JAYE'],
  K: ['KAY', 'OKAY', 'CAY'], L: ['EL', 'ELL', 'ELLE'], M: ['EM', 'EMM', 'AM'], N: ['EN', 'IN', 'AND'], O: ['OH', 'OWE'],
  P: ['PEA', 'PEE', 'PE'], Q: ['QUEUE', 'CUE', 'KEW'], R: ['ARE', 'ARR', 'OUR', 'OR'], S: ['ES', 'ESS', 'AS', 'IS', 'YES'],
  T: ['TEA', 'TEE', 'TI'], U: ['YOU', 'EW', 'YEW'], V: ['VEE', 'VI', 'WE'], W: ['DOUBLEYOU', 'DOUBLEU'], X: ['EX', 'EKS'],
  Y: ['WHY', 'WYE'], Z: ['ZED', 'ZEE', 'ZEDD'],
};
const LETTER_OF = Object.fromEntries(Object.entries(LETTERS).flatMap(([l, ws]) => ws.map(w => [w, l])));
const NUMBER_SOUND = { FOR: '4', FORE: '4', TO: '2', TOO: '2', ATE: '8', WON: '1', FREE: '3', TREE: '3', SICKS: '6', NAIN: '9' };
const FILLER = /^(?:(?:FIND|SHOW|SEARCH|LOOK|GO|TAKE|ME|TO|FOR|THE|UP|WHERE'?S|WHERE|IS|SHELF|SHELVES|BAY|AISLE|LOCATION|RUN|NUMBER|PLEASE)\s+)+/;

// The same reading with mishearings undone, most likely first. Each is
// worth trying only because the caller checks it against the map.
export function misheard(text) {
  const raw = String(text || '').toUpperCase().replace(/DOUBLE\s+(YOU|U)\b/g, 'DOUBLEYOU');
  const base = words(raw.replace(FILLER, '')).filter(w => w !== 'PLEASE');
  const out = new Set();
  const add = ws => { const c = spokenToCode(ws.join(' ')); if (c) out.add(c); };
  add(base);
  // A letter name before a number ("be 22", "queue 15"), or a section
  // letter after one ("A16 es 2").
  const numberish = w => !!w && (/^\d/.test(w) || isNum(w) || !!NUMBER_SOUND[w]);
  const lettered = base.map((w, i) => (LETTER_OF[w] && numberish(base[i + 1]) ? LETTER_OF[w] : w));
  add(lettered);
  // Number sounds once a code has started ("A for" → A4, "B to" → B2).
  const numbered = lettered.map((w, i) => (NUMBER_SOUND[w] && i > 0 ? NUMBER_SOUND[w] : w));
  add(numbered);
  // "A16" heard as "816": a leading eight is often the letter A.
  for (const c of [...out]) if (/^8\d/.test(c)) out.add('A' + c.slice(1));
  return [...out];
}

// The guesses (top first) → the shelf they name. lookup(code) answers with
// the map's code for a real shelf, run or bay, or null.
export function resolveSpoken(guesses, lookup) {
  const gs = (guesses || []).map(g => String(g || '').trim()).filter(Boolean);
  const heard = gs[0] || '';
  const tries = [];
  for (const g of gs) tries.push([spokenToCode(g), 'heard']);
  for (const g of gs) for (const c of misheard(g)) tries.push([c, 'corrected']);
  const seen = new Set();
  for (const [c, how] of tries) {
    if (!c || seen.has(c)) continue; seen.add(c);
    const hit = lookup(c); if (hit) return { code: hit, heard, query: c, how };
  }
  return { code: null, heard, query: spokenToCode(heard), how: 'search' };
}

// Every shelf code in one utterance, for adding stops by voice: letters
// then digits with an optional S/E/P section, or a bay of three or more
// digits (ShelfSearcher's pick-list rule), read the fixed way.
export function spokenCodes(text) {
  const ws = sections(numbers(words(text)));
  const out = [];
  // Rejoin a letter, its digits and any section the recogniser spaced out.
  for (let i = 0; i < ws.length; i++) {
    let w = ws[i];
    if (/^[A-Z]{1,2}$/.test(w) && /^\d+$/.test(ws[i + 1] || '')) { w += ws[++i]; }
    if (/^[A-Z]+\d+$/.test(w) && /^[SEP]$/.test(ws[i + 1] || '') && /^\d$/.test(ws[i + 2] || '')) { w += ws[i + 1] + ws[i + 2]; i += 2; }
    else if (/^[A-Z]+\d+$/.test(w) && /^[SEP]\d$/.test(ws[i + 1] || '')) { w += ws[++i]; }
    for (const m of w.matchAll(/[A-Z]+\d+(?:[SEP]\d)?|\d{3,}/g)) { const c = m[0].replace(/([A-Z])0+(?=\d)/g, '$1'); if (!out.includes(c)) out.push(c); }
  }
  return out;
}

export const STOP_WORDS = /\b(DONE|STOP|FINISH|FINISHED|END|CANCEL|EXIT|QUIT|THAT'?S ALL)\b/;
