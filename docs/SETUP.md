# Conduit setup

The full walkthrough lives in the "Conduit Setup Guide" doc. Short form:

1. **Cloudflare**: My Profile › API Tokens › Create Token › template "Edit Cloudflare Workers" (account scope) → `CLOUDFLARE_API_TOKEN`. Workers & Pages › Overview → `CLOUDFLARE_ACCOUNT_ID` and your workers.dev subdomain.
2. **Secrets**: `TOKEN_SECRET` = `openssl rand -base64 48`; `OWNER_KEY` = a long passphrase from your password manager.
3. **GitHub**: Settings › Secrets and variables › Actions → add the four. Actions › deploy › Run workflow, env `staging`, tick `set_secrets`.
4. **Check**: `https://conduit-staging.<sub>.workers.dev/v1/health` → `{"ok":true,...}`.
5. **Netlify**: Add new site › Import from GitHub › this repo. Build command empty, publish directory `.`. Give the site a name-neutral name. Then make the site follow the worker, so a new app never reaches devices before the worker that understands it:
   - Deploys › **Lock to stop auto publishing** (Netlify keeps building each commit but publishes only when asked).
   - User settings › Applications › **New access token** → GitHub secret `NETLIFY_AUTH_TOKEN`; Site configuration › Site details › **Site ID** → `NETLIFY_SITE_ID`.
   - On each merge the deploy workflow now deploys the worker, waits until `/v1/health` reports that commit's `build`, then publishes Netlify's build of the same commit. Without the two secrets it warns and Netlify publishes on its own, as before.
6. **Subdomain**: if it is not `zephyrus-np750`, change the URL in `js/config.js` and push.
7. **Register the store** (owner): open the Netlify site, choose "Owner sign-in", enter the owner key, then Register a store. The console generates the PIN and codes and shows them once. The same thing from a terminal:
   ```bash
   W=https://conduit-staging.<sub>.workers.dev
   TOKEN=$(curl -s -X POST $W/v1/auth/signin -H 'Content-Type: application/json' -d '{"ownerKey":"<owner key>","device":"laptop"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
   curl -s -X POST $W/v1/admin/stores -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"no":"1241","name":"Busselton","region":"WA South","pin":"<pin>","codes":{"stockroom":"<code>","dock":"<code>","manager":"<code>"},"entitlements":{"floor":true,"stockroom":true,"backdock":true}}'
   ```
8. **Publish the map** (owner): admin console › the store › Map › choose the Map Editor's export for the store (the `.js` file ShelfSearcher used, e.g. `maps/1241-busselton.js`, or the editor's `.json` save; a rendered ground-floor `.svg` also works), give it a new version, Publish. Every floor in the export is rendered and published; the label under the file says what it found before you publish. Or `OWNER_KEY=… npm run publish-map -- --store 1241 --version 4.4 --file ../vector-suite/maps/1241-busselton.js`.
9. **Sign in** on the Netlify site with 1241 and the PIN. Production: run the workflow with env `production` (tick `set_secrets` the first time).
10. **Install on devices**: open the Netlify site in Chrome on the phone and choose *Install app* (Add to Home Screen on iPhone). It works offline from then on; new releases show an *Update now* bar and apply only when tapped.
11. **Kmart lookups** (optional, recommended): product prices and photos, and the keycode behind a clearance ticket's or shelf talker's barcode, come from kmart.com.au through Cloudflare Browser Rendering. Cloudflare › My Profile › API Tokens › Create Token › Custom token, permission *Account › Browser Rendering › Edit* on your account → GitHub › Settings › Secrets and variables › Actions › new secret `BROWSER_TOKEN`. The next deploy puts it on the worker (the account id comes from `CLOUDFLARE_ACCOUNT_ID`); for production, run the workflow with env `production`. Check: the Service page (or `/v1/health`) shows Browser Rendering on. Without it, prices and photos come from the legacy details worker and barcode lookups find books by their title only.
