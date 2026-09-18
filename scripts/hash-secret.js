#!/usr/bin/env node
// Prints the PBKDF2 hash of a secret for `wrangler secret put OWNER_KEY_HASH`.
//   npm run hash-secret -- "<owner key>"
// or pipe it in:  echo -n "<owner key>" | npm run hash-secret
import { hashSecret } from '../worker/auth.js';

let secret = process.argv.slice(2).join(' ');
if (!secret) {
  secret = await new Promise(resolve => {
    let s = ''; process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => { s += d; }); process.stdin.on('end', () => resolve(s.trim()));
  });
}
if (!secret) { console.error('usage: hash-secret <secret>'); process.exit(1); }
console.log(await hashSecret(secret));
