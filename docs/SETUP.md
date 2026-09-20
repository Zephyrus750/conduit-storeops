# Conduit setup

The full walkthrough lives in the "Conduit Setup Guide" doc. Short form:

1. **Cloudflare**: My Profile › API Tokens › Create Token › template "Edit Cloudflare Workers" (account scope) → `CLOUDFLARE_API_TOKEN`. Workers & Pages › Overview → `CLOUDFLARE_ACCOUNT_ID` and your workers.dev subdomain.
2. **Secrets**: `TOKEN_SECRET` = `openssl rand -base64 48`; `OWNER_KEY` = a long passphrase from your password manager.
3. **GitHub**: Settings › Secrets and variables › Actions → add the four. Actions › deploy › Run workflow, env `staging`, tick `set_secrets`.
4. **Check**: `https://conduit-staging.<sub>.workers.dev/v1/health` → `{"ok":true,...}`.
5. **Netlify**: Add new site › Import from GitHub › this repo. Build command empty, publish directory `.`. Give the site a name-neutral name.
6. **Subdomain**: if it is not `zephyrus-np750`, change the URL in `js/config.js` and push.
7. **Register the store** (owner): open the Netlify site, choose "Owner sign-in", enter the owner key, then Register a store. The console generates the PIN and codes and shows them once. The same thing from a terminal:
   ```bash
   W=https://conduit-staging.<sub>.workers.dev
   TOKEN=$(curl -s -X POST $W/v1/auth/signin -H 'Content-Type: application/json' -d '{"ownerKey":"<owner key>","device":"laptop"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
   curl -s -X POST $W/v1/admin/stores -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"no":"1241","name":"Busselton","region":"WA South","pin":"<pin>","codes":{"stockroom":"<code>","dock":"<code>","manager":"<code>"},"entitlements":{"floor":true,"stockroom":true,"backdock":true}}'
   ```
8. **Publish the map** (owner): admin console › the store › Map › choose `maps/1241.svg` as the ground floor, version `4.3`, Publish. Or `OWNER_KEY=… npm run publish-map -- --store 1241 --version 4.3 --name Busselton --floor ground=maps/1241.svg`.
9. **Sign in** on the Netlify site with 1241 and the PIN. Production: run the workflow with env `production` (tick `set_secrets` the first time).
