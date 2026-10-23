// Store details, from the store chip (ShelfSearcher's store popup): the
// address, hours and coming public holidays, directions, staff parking and
// the assembly point, what the published map covers, and the stores this
// device is signed in to, with switching. Details come from the map
// editor's Store Info, published with the map (cleanStoreInfo).

import { ic, esc, vh, sub, status, toast, fmtTime, mhead } from '../ui.js';
import { mapInfo, mapStats, mapSymbols, symbolsHtml } from '../map.js';
import { tx, txn, locale } from '../i18n.js';

const gmaps = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
const dirGoogle = si => si.directionsGoogle || (si.lat != null && si.lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${si.lat},${si.lng}` : '');
const dirApple = (si, name) => si.directionsApple || (si.lat != null && si.lng != null ? `https://maps.apple.com/?daddr=${si.lat},${si.lng}&q=${encodeURIComponent(name)}` : '');
const link = (href, label, icon = 'arrow') => href ? `<a class="btn sm" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${ic(icon)}${label}</a>` : '';
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayLabel = iso => new Date(iso + 'T00:00:00').toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

let parked = [], adding = false;

function details(ctx, si, phone = false) {
  const addr = si.addressLines?.length ? si.addressLines.map(esc).join('<br>') : '';
  const hours = si.hoursDays?.length ? `<table class="si-hours">${si.hoursDays.map(([d, t]) => `<tr${/^sat/i.test(d) ? ' class="wk"' : ''}><th>${esc(d)}</th><td>${esc(t)}</td></tr>`).join('')}</table>` : '';
  const today = isoDay(new Date());
  const hols = (si.publicHolidays || []).filter(h => h.date && h.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  const holsHtml = hols.length ? `<div class="si-hols">${hols.map(h => `<div class="${/closed/i.test(h.hours) ? 'closed' : ''}"><b>${esc(h.name || tx('Public holiday'))}</b>${h.date === today ? `<span class="si-today">${tx('today')}</span>` : ''}<span>${esc(dayLabel(h.date))}</span><span class="h">${esc(h.hours || '')}</span></div>`).join('')}</div>` : '';
  const dirs = [link(dirGoogle(si), 'Google Maps', 'map'), link(dirApple(si, ctx.storeName), 'Apple Maps', 'map')].join('');
  return `<div class="card"><div class="ch"><h3>${tx('Details')}</h3></div>` +
    (addr ? `<div class="si-sec"><div class="si-k">${tx('Address')}</div><div>${addr}</div></div>` : '') +
    (dirs ? `<div class="si-acts">${dirs}</div>` : '') +
    (hours ? `<div class="si-sec"><div class="si-k">${tx('Opening hours')}</div>${hours}</div>` : '') +
    (holsHtml ? `<div class="si-sec"><div class="si-k">${tx('Public holidays')}</div>${holsHtml}</div>` : '') +
    (!addr && !hours && !holsHtml ? `<p class="lbl">${phone ? tx('No address or hours yet.') : tx('No address or hours yet. The owner adds them in the map editor’s Store Info and republishes the map.')}</p>` : '') + `</div>`;
}
function logistics(si) {
  const fmt = [si.brand, si.storeType, si.storeStyle, si.storeSize ? tx('{size} m² store', { size: esc(si.storeSize) }) : ''].filter(Boolean);
  const park = si.parkingTip || si.parkingLat != null ? `<div class="si-sec"><div class="si-k">${tx('Staff parking')}</div>${si.parkingTip ? `<div>${esc(si.parkingTip)}</div>` : ''}${si.parkingLat != null && si.parkingLng != null ? `<div class="si-acts">${link(gmaps(si.parkingLat, si.parkingLng), tx('Open in Maps'), 'map')}</div>` : ''}</div>` : '';
  const asm = si.assemblyNotes || si.assemblyLat != null ? `<div class="si-sec"><div class="si-k">${tx('Assembly point')}</div>${si.assemblyNotes ? `<div>${esc(si.assemblyNotes)}</div>` : ''}${si.assemblyLat != null && si.assemblyLng != null ? `<div class="si-acts">${link(gmaps(si.assemblyLat, si.assemblyLng), tx('Open in Maps'), 'map')}</div>` : ''}</div>` : '';
  return `<div class="card"><div class="ch"><h3>${tx('Logistics')}</h3></div>` + (fmt.length ? `<div class="si-sec"><div class="si-k">${tx('Store format')}</div><div>${fmt.map(esc).join(' · ')}</div></div>` : '') +
    (park || asm ? park + asm : `<p class="lbl">${tx('No parking or assembly details for this store.')}</p>`) + `</div>`;
}
function mapStatus() {
  const info = mapInfo(), st = mapStats();
  if (!info || !st) return `<div class="card"><div class="ch"><h3>${tx('Map')}</h3>${status('warn', tx('Not published'))}</div><p class="lbl">${tx('No map is published for this store yet. The owner publishes one from the console.')}</p></div>`;
  const foh = st.floors.filter(f => f.type === 'foh').reduce((n, f) => n + f.shelves, 0), boh = st.floors.filter(f => f.type === 'boh').reduce((n, f) => n + f.shelves, 0), em = st.floors.reduce((n, f) => n + f.emergency, 0);
  // ShelfSearcher's mapped areas: a sales floor counts from 20 named
  // shelves, the back of house from 10.
  const area = (on, label) => `<span class="si-area${on ? ' on' : ''}">${ic(on ? 'check' : 'minus')}${label}</span>`;
  return `<div class="card"><div class="ch"><h3>${tx('Map')}</h3>${status(foh >= 20 ? 'good' : 'warn', foh >= 20 ? tx('Ready') : tx('In development'))}</div>` +
    `<div class="si-areas">${area(foh >= 20, txn(foh, 'Front of house · {n} shelf', 'Front of house · {n} shelves'))}${area(boh >= 10, txn(boh, 'Back of house · {n} shelf', 'Back of house · {n} shelves'))}${area(em > 0, txn(em, 'Emergency · {n} marker', 'Emergency · {n} markers'))}</div>` +
    `<div class="list">${st.floors.map(f => `<div class="li"><span class="loc">${esc(f.name)}</span><span class="nm">${f.type === 'boh' ? tx('Back of house') : tx('Front of house')} · ${txn(f.shelves, '{n} shelf in {runs} runs', '{n} shelves in {runs} runs', { runs: f.runs })} · ${f.paths ? txn(f.paths, '{n} walk-path point', '{n} walk-path points') : tx('no walk paths')}</span></div>`).join('')}</div>` +
    `<p class="lbl" style="margin-top:10px">${[tx('Version {v}', { v: esc(String(info.version)) }), info.at ? tx('published {time}', { time: esc(fmtTime(info.at)) }) : '', info.storeInfo?.lastUpdated ? tx('details updated {date}', { date: esc(info.storeInfo.lastUpdated) }) : '', info.metresPerUnit ? tx('scale set (1 unit = {cm} cm)', { cm: +(info.metresPerUnit * 100).toFixed(1) }) : tx('scale not set: distances and shelf sizes need the editor’s Set Scale')].filter(Boolean).join(' · ')}</p></div>`;
}
// The symbols drawn on this store's map, with how many of each.
function symbols() {
  const list = mapSymbols(); if (!list.length) return '';
  return `<div class="card"><div class="ch"><h3>${tx('Map symbols')}</h3></div>${symbolsHtml(list)}</div>`;
}
function stores(ctx) {
  const cur = ctx.session.current;
  if (cur?.actas) return `<div class="card"><div class="ch"><h3>${tx('Stores on this device')}</h3></div><p class="lbl">${tx('Acting as this store from the owner console. Return to the console to open another.')}</p></div>`;
  return `<div class="card"><div class="ch"><h3>${tx('Stores on this device')}</h3></div><div class="list"><div class="li"><span class="loc">${esc(ctx.storeNo)}</span><span class="nm">${esc(ctx.storeName)}</span>${status('good', tx('store hours::Open'))}</div>` +
    parked.map(p => `<div class="li"><span class="loc">${esc(p.store)}</span><span class="nm">${esc(p.name || '')}</span><button class="btn sm primary" data-act="switch" data-store="${esc(p.store)}">${tx('Switch')}</button><button class="ibtn" data-act="forget" data-store="${esc(p.store)}" title="${tx('Sign out of {store}', { store: esc(p.store) })}" aria-label="${tx('Sign out of {store}', { store: esc(p.store) })}">${ic('x')}</button></div>`).join('') + `</div>` +
    (adding ? `<form class="si-add" data-form="add"><input class="inp" name="store" inputmode="numeric" autocomplete="off" placeholder="${tx('Store number')}" aria-label="${tx('Store number')}" required><input class="inp" name="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="${tx('Store PIN')}" aria-label="${tx('Store PIN')}" required><button class="btn primary sm">${tx('Sign in')}</button><button type="button" class="btn sm" data-act="add-cancel">${tx('Cancel')}</button></form>`
      : `<div class="si-acts"><button class="btn sm" data-act="add">${ic('plus')}${tx('Add another store')}</button></div>`) +
    `<p class="lbl" style="margin-top:8px">${tx('Switching keeps each store signed in on this device; crew and manager codes are dropped when you switch away. Sign out signs out of every store here.')}</p></div>`;
}

export default {
  id: 'storeinfo', title: tx('Store details'), icon: 'm-map',
  desktop(ctx) {
    const si = mapInfo()?.storeInfo || {};
    return vh(tx('Store details'), sub(`${esc(ctx.storeNo)} ${esc(ctx.storeName)}`, si.zone ? esc(si.zone) : ''), '', 'm-map') +
      `<div class="si-grid"><div class="sidecol">${details(ctx, si)}${logistics(si)}</div><div class="sidecol">${mapStatus()}${symbols()}<div id="sistores">${stores(ctx)}</div></div></div>`;
  },
  mobile(ctx) {
    const si = mapInfo()?.storeInfo || {};
    // The phone keeps the address, hours and logistics; what the map covers
    // and its symbols stay on a store PC.
    return mhead(tx('Store details'), `${esc(ctx.storeNo)} ${esc(ctx.storeName)}`) + `<div class="si-mob">${details(ctx, si, true)}${logistics(si)}<div id="sistores">${stores(ctx)}</div></div>`;
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
          // Send what can go first: switching drops the area codes.
          try { await ctx.store.flush(); } catch {}
          const n = ctx.store.status?.queued || 0, area = ctx.store.pending.some(e => e.area !== 'store');
          if (n && !confirm((area ? txn(n, '{n} change for {store} is still waiting to send. It sends when you switch back (Stockroom and Back dock changes once their code is entered again).', '{n} changes for {store} are still waiting to send. They send when you switch back (Stockroom and Back dock changes once their code is entered again).', { store: ctx.storeNo }) : txn(n, '{n} change for {store} is still waiting to send. It sends when you switch back.', '{n} changes for {store} are still waiting to send. They send when you switch back.', { store: ctx.storeNo })) + '\n\n' + tx('Switch to {store}?', { store: a.dataset.store }))) return;
          await ctx.session.switchTo(a.dataset.store); location.reload();
        }
        else if (act === 'forget') { if (confirm(tx('Sign this device out of store {store}?', { store: a.dataset.store }))) { await ctx.session.forget(a.dataset.store); parked = await ctx.session.parked(); repaint(); } }
      } catch (err) { toast(err.message, 'bad'); }
    });
    root.addEventListener('submit', async e => {
      if (!e.target.matches('[data-form="add"]')) return; e.preventDefault();
      const f = new FormData(e.target);
      try { await ctx.store.flush(); } catch {}
      try { await ctx.session.signInAnother({ store: String(f.get('store')).trim(), pin: String(f.get('pin')) }); adding = false; location.reload(); }
      catch (err) { toast(err.status === 403 ? tx('That PIN is not right for that store.') : err.status === 404 ? tx('No store with that number.') : err.message, 'bad'); }
    });
    return [() => { adding = false; }];
  },
};
