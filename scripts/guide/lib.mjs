// Shared by the guide tools: where the repo and the output are, the dev
// stack's addresses and the browser. Nothing in the app loads this folder.
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
// Everything the tools make goes under one folder, kept out of git.
export const OUT = path.resolve(process.env.GUIDE_OUT || path.join(ROOT, 'scripts/guide/out'));
// A folder under the output, made if missing, ending in a slash. fresh: emptied first.
export function dir(name, { fresh = false } = {}) {
  const d = path.join(OUT, name);
  if (fresh) fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  return d + '/';
}
// scripts/dev.js: the worker on :8787, the shell on :8080.
export const API = process.env.GUIDE_API || 'http://127.0.0.1:8787';
export const WEB = process.env.GUIDE_WEB || 'http://127.0.0.1:8080';

// Playwright is not one of the app's dependencies: the project's own if it
// is installed, else a global one (PLAYWRIGHT names its index.mjs).
const PW = process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.mjs';
let pw; try { pw = await import('playwright'); } catch { pw = await import(PW); }
export const { chromium } = pw;
const EXE = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
export const launch = (args = []) => chromium.launch({ executablePath: EXE, args: ['--no-sandbox', ...args] });
// Sign-in screens skip the What's new and first-run walkthrough pop-ups.
export const QUIET = () => { try { localStorage.setItem('whatsnew_seen', 'v9.9.9'); localStorage.setItem('walkthrough_seen', JSON.stringify({ floor: 1, stockroom: 1, backdock: 1 })); } catch {} };
