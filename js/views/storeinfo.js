// Store details, from the store chip (ShelfSearcher's store popup): the
// address, hours and coming public holidays, directions, staff parking and
// the assembly point, what the published map covers, and the stores this
// device is signed in to, with switching. Details come from the map
// editor's Store Info, published with the map (cleanStoreInfo).

import { ic, esc, vh, sub, status, toast, fmtTime, mhead } from '../ui.js';
import { mapInfo, mapStats } from '../map.js';

const gmaps = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
const dirGoogle = si => si.directionsGoogle || (si.lat != null && si.lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${si.lat},${si.lng}` : '');
const dirApple = (si, name) => si.directionsApple || (si.lat != null && si.lng != null ? `https://maps.apple.com/?daddr=${si.lat},${si.lng}&q=${encodeURIComponent(name)}` : '');
const link = (href, label, icon = 'arrow') => href ? `<a class="btn sm" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${ic(icon)}${label}</a>` : '';
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayLabel = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

let parked = [], adding = false;

function details(ctx, si) {
  const addr = si.addressLines?.length ? si.addressLines.map(esc).join('<br>') : '';
  const hours = si.hoursDays?.length ? `<table class="si-hours">${si.hoursDays.map(([d, t]) => `<tr${/^sat/i.test(d) ? ' class="wk"' : ''}><th>${esc(d)}</th><td>${esc(t)}</td></tr>`).join('')}</table>` : '';
  const today = isoDay(new Date());
  const hols = (si.publicHolidays || []).filter(h => h.date && h.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  const holsHtml = hols.length ? `<div class="si-hols">${hols.map(h => `<div class="${/closed/i.test(h.hours) ? 'closed' : ''}"><b>${esc(h.name || 'Public holiday')}</b>${h.date === today ? '<span class="si-today">today</span>' : ''}<span>${esc(dayLabel(h.date))}</span><span class="h">${esc(h.hours || '')}</span></div>`).join('')}</div>` : '';
  const dirs = [link(dirGoogle(si), 'Google Maps', 'map'), link(dirApple(si, ctx.storeName), 'Apple Maps', 'map')].join('');
  return `<div class="card"><div class="ch"><h3>Details</h3></div>` +
    (addr ? `<div class="si-sec"><div class="si-k">Address</div><div>${addr}</div></div>` : '') +
    (dirs ? `<div class="si-acts">${dirs}</div>` : '') +
    (hours ? `<div class="si-sec"><div class="si-k">Opening hours</div>${hours}</div>` : '') +
    (holsHtml ? `<div class="si-sec"><div class="si-k">Public holidays</div>${holsHtml}</div>` : '') +
    (!addr && !hours && !holsHtml ? '<p class="lbl">No address or hours yet. The owner adds them in the map editor’s Store Info and republishes the map.</p>' : '') + `</div>`;
}
function logistics(si) {
  const fmt = [si.brand, si.storeType, si.storeStyle, si.storeSize ? `${esc(si.storeSize)} m² store` : ''].filter(Boolean);
  const park = si.parkingTip || si.parkingLat != null ? `<div class="si-sec"><div class="si-k">Staff parking</div>${si.parkingTip ? `<div>${esc(si.parkingTip)}</div>` : ''}${si.parkingLat != null && si.parkingLng != null ? `<div class="si-acts">${link(gmaps(si.parkingLat, si.parkingLng), 'Open in Maps', 'map')}</div>` : ''}</div>` : '';
  const asm = si.assemblyNotes || si.assemblyLat != null ? `<div class="si-sec"><div class="si-k">Assembly point</div>${si.assemblyNotes ? `<div>${esc(si.assemblyNotes)}</div>` : ''}${si.assemblyLat != null && si.assemblyLng != null ? `<div class="si-acts">${link(gmaps(si.assemblyLat, si.assemblyLng), 'Open in Maps', 'map')}</div>` : ''}</div>` : '';
  return `<div class="card"><div class="ch"><h3>Logistics</h3></div>` + (fmt.length ? `<div class="si-sec"><div class="si-k">Store format</div><div>${fmt.map(esc).join(' · ')}</div></div>` : '') +
    (park || asm ? park + asm : '<p class="lbl">No parking or assembly details for this store.</p>') + `</div>`;
}
function mapStatus() {
  const info = mapInfo(), st = mapStats();
  if (!info || !st) return `<div class="card"><div class="ch"><h3>Map</h3>${status('warn', 'Not published')}</div><p class="lbl">No map is published for this store yet. The owner publishes one from the console.</p></div>`;
  const foh = st.floors.filter(f => f.type === 'foh').reduce((n, f) => n + f.shelves, 0), boh = st.floors.filter(f => f.type === 'boh').reduce((n, f) => n + f.shelves, 0), em = st.floors.reduce((n, f) => n + f.emergency, 0);
  // ShelfSearcher's mapped areas: a sales floor counts from 20 named
  // shelves, the back of house from 10.
  const area = (on, label) => `<span class="si-area${on ? ' on' : ''}">${ic(on ? 'check' : 'minus')}${label}</span>`;
  return `<div class="card"><div class="ch"><h3>Map</h3>${status(foh >= 20 ? 'good' : 'warn', foh >= 20 ? 'Ready' : 'In development')}</div>` +
    `<div class="si-areas">${area(foh >= 20, `Front of house · ${foh} shelves`)}${area(boh >= 10, `Back of house · ${boh} shelves`)}${area(em > 0, `Emergency · ${em} markers`)}</div>` +
    `<div class="list">${st.floors.map(f => `<div class="li"><span class="loc">${esc(f.name)}</span><span class="nm">${f.type === 'boh' ? 'Back of house' : 'Front of house'} · ${f.shelves} shelves · ${f.paths ? `${f.paths} walk-path points` : 'no walk paths'}</span></div>`).join('')}</div>` +
    `<p class="lbl" style="margin-top:10px">Version ${esc(String(info.version))}${info.at ? ` · published ${esc(fmtTime(info.at))}` : ''}${info.storeInfo?.lastUpdated ? ` · details updated ${esc(info.storeInfo.lastUpdated)}` : ''}</p></div>`;
}
function stores(ctx) {
  const cur = ctx.session.current;
  if (cur?.actas) return `<div class="card"><div class="ch"><h3>Stores on this device</h3></div><p class="lbl">Acting as this store from the owner console. Return to the console to open another.</p></div>`;
  return `<div class="card"><div class="ch"><h3>Stores on this device</h3></div><div class="list"><div class="li"><span class="loc">${esc(ctx.storeNo)}</span><span class="nm">${esc(ctx.storeName)}</span>${status('good', 'Open')}</div>` +
    parked.map(p => `<div class="li"><span class="loc">${esc(p.store)}</span><span class="nm">${esc(p.name || '')}</span><button class="btn sm primary" data-act="switch" data-store="${esc(p.store)}">Switch</button><button class="ibtn" data-act="forget" data-store="${esc(p.store)}" title="Sign out of ${esc(p.store)}" aria-label="Sign out of ${esc(p.store)}">${ic('x')}</button></div>`).join('') + `</div>` +
    (adding ? `<form class="si-add" data-form="add"><input class="inp" name="store" inputmode="numeric" autocomplete="off" placeholder="Store number" aria-label="Store number" required><input class="inp" name="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="Store PIN" aria-label="Store PIN" required><button class="btn primary sm">Sign in</button><button type="button" class="btn sm" data-act="add-cancel">Cancel</button></form>`
      : `<div class="si-acts"><button class="btn sm" data-act="add">${ic('plus')}Add another store</button></div>`) +
    `<p class="lbl" style="margin-top:8px">Switching keeps each store signed in on this device; crew and manager codes are dropped when you switch away. Sign out signs out of every store here.</p></div>`;
}

export default {
  id: 'storeinfo', title: 'Store details', icon: 'm-map',
  desktop(ctx) {
    const si = mapInfo()?.storeInfo || {};
    return vh('Store details', sub(`${esc(ctx.storeNo)} ${esc(ctx.storeName)}`, si.zone ? esc(si.zone) : ''), '', 'm-map') +
      `<div class="si-grid"><div class="sidecol">${details(ctx, si)}${logistics(si)}</div><div class="sidecol">${mapStatus()}<div id="sistores">${stores(ctx)}</div></div></div>`;
  },
  mobile(ctx) {
    const si = mapInfo()?.storeInfo || {};
    return mhead('Store details', `${esc(ctx.storeNo)} ${esc(ctx.storeName)}`) + `<div class="si-mob">${details(ctx, si)}${logistics(si)}${mapStatus()}<div id="sistores">${stores(ctx)}</div></div>`;
  },
  mount(ctx, root) {
    const repaint = () => { const h = root.querySelector('#sistores'); if (h) h.innerHTML = stores(ctx); };
    ctx.session.parked?.().then(list => { parked = list; repaint(); }).catch(() => {});
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      try {
        if (act === 'add') { adding = true; repaint(); root.querySelector('[name="store"]')?.focus(); }
        else if (act === 'add-cancel') { adding = false; repaint(); }
        else if (act === 'switch') {
          const n = ctx.store.status?.queued || 0;
          if (n && !confirm(`${n} change${n === 1 ? '' : 's'} for ${ctx.storeNo} are still waiting to sync. They send when you switch back.\n\nSwitch to ${a.dataset.store}?`)) return;
          await ctx.session.switchTo(a.dataset.store); location.reload();
        }
        else if (act === 'forget') { if (confirm(`Sign this device out of store ${a.dataset.store}?`)) { await ctx.session.forget(a.dataset.store); parked = await ctx.session.parked(); repaint(); } }
      } catch (err) { toast(err.message, 'bad'); }
    });
    root.addEventListener('submit', async e => {
      if (!e.target.matches('[data-form="add"]')) return; e.preventDefault();
      const f = new FormData(e.target);
      try { await ctx.session.signInAnother({ store: String(f.get('store')).trim(), pin: String(f.get('pin')) }); adding = false; location.reload(); }
      catch (err) { toast(err.status === 403 ? 'That PIN is not right for that store.' : err.status === 404 ? 'No store with that number.' : err.message, 'bad'); }
    });
    return [() => { adding = false; }];
  },
};
