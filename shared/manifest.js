// The Kmart DC "Manifest Report" (a Crystal .xls export), parsed into the
// manifest document the dock works from. Ported from Vector's
// backdock-receiving parser, which ShelfSearcher and Decant Visualiser both
// used, so the same file reads the same way here.
//
// Input is the workbook as plain rows: [{ name, rows: [[cell, …], …] }],
// which the browser gets from SheetJS (sheet_to_json with header: 1,
// raw: true, defval: null) and tests build by hand. Data rows carry an
// 18–22 digit consolidation number (its LAST 9 digits are the id printed
// on the pallet label), a carton id, then keycode / description / dept /
// qty. Full-pallet lines have no carton id and arrive shifted one column
// right. Rows aggregate per consolidation: distinct cartons plus contents.

const cs = v => String(v ?? '').trim();
export const ITEM_CAP = 250, CONSOL_CAP = 500;     // lines kept per consolidation; consolidations the worker takes

export function parseManifestSheets(sheets) {
  const report = parseReport(sheets);
  if (report && report.consols.length) return report;
  if (report && report.diag) return report;
  const generic = parseGeneric(sheets);
  if (generic.consols.length) return generic;
  return { consols: [], diag: diagnose(sheets) };
}

function parseReport(sheets) {
  let diag = null;
  for (const { name, rows } of sheets) {
    let hdr = -1;
    for (let r = 0; r < Math.min(rows.length, 40); r++) if ((rows[r] || []).some(c => /consolidation/i.test(cs(c)))) { hdr = r; break; }
    if (hdr === -1) continue;
    // metadata lines above the header come as sparse label/value pairs
    let manNo = '', storeNo = '', despatch = '', dcNo = '';
    const nextVal = (mr, c) => { for (let j = c + 1; j <= c + 3 && j < mr.length; j++) if (mr[j] != null && cs(mr[j]) !== '') return mr[j]; return null; };
    for (let m = 0; m < hdr; m++) {
      const mr = rows[m] || [];
      for (let c = 0; c < mr.length; c++) {
        const lab = cs(mr[c]).toLowerCase();
        if (lab.startsWith('manifest no')) manNo = cs(nextVal(mr, c));
        else if (lab.startsWith('store')) storeNo = cs(nextVal(mr, c));
        else if (lab.startsWith('despatch')) { const v = nextVal(mr, c); despatch = typeof v === 'number' && v > 20000 && v < 60000 ? excelDate(v) : cs(v); }
        else if (lab.startsWith('dc no')) dcNo = cs(nextVal(mr, c));
      }
    }
    // A numeric cell cannot be a trustworthy consolidation number: Excel
    // stores it as a float, so the last 9 digits are already wrong.
    const consStr = x => (typeof x === 'number' ? '' : cs(x));
    const agg = {}, skipped = { numericCons: 0, badKeycode: 0, other: 0 }; let read = 0;
    for (let i = hdr + 1; i < rows.length; i++) {
      const v = rows[i] || [];
      const c0 = consStr(v[0]), c1 = consStr(v[1]);
      let cons, carton;
      if (/^\d{18,22}$/.test(c0)) { cons = c0; carton = /^\d{18,22}$/.test(c1) ? c1 : ''; }
      else if (!c0 && /^\d{18,22}$/.test(c1)) { cons = c1; carton = ''; }   // full-pallet line
      else {
        // What did not read: a rounded (numeric) consolidation, or a row that
        // looks like data but fits no layout. Headers and totals are not counted.
        if (typeof v[0] === 'number' && v[0] > 1e15 || typeof v[1] === 'number' && v[1] > 1e15) skipped.numericCons++;
        else if (v.some(x => /\d{12,}/.test(cs(x)))) skipped.other++;
        continue;
      }
      const off = 2, key = cs(v[off]);
      if (!/^\d{6,10}$/.test(key)) { skipped.badKeycode++; continue; }
      read++;
      let dept = cs(v[off + 2]).replace(/\D/g, ''); if (dept && dept.length < 3) dept = ('00' + dept).slice(-3);
      const q = parseInt(cs(v[off + 3]), 10) || 1;
      const id = cons.slice(-9);
      const a = (agg[id] ||= { id, cons, cartonIds: new Set(), loose: 0, cartonD: {}, looseD: {}, deptU: {}, items: {}, order: [], itemC: {}, itemL: {} });
      if (carton) { a.cartonIds.add(carton); if (dept) { const cd = (a.cartonD[carton] ||= {}); cd[dept] = (cd[dept] || 0) + q; } }
      else { a.loose += q; if (dept) a.looseD[dept] = (a.looseD[dept] || 0) + q; }
      if (dept) a.deptU[dept] = (a.deptU[dept] || 0) + q;
      if (!a.items[key]) { a.items[key] = { k: key, d: cs(v[off + 1]).slice(0, 40) || null, q: 0, dept: dept || null }; a.order.push(key); a.itemC[key] = new Set(); a.itemL[key] = 0; }
      a.items[key].q += q;
      if (carton) a.itemC[key].add(carton); else a.itemL[key] += q;
    }
    const consols = Object.values(agg).map(a => {
      // department mix: each carton counts toward the dept with most units
      // inside it; full-pallet loose qty counts as cartons directly
      const mixC = {};
      for (const cd of Object.values(a.cartonD)) { const top = Object.entries(cd).sort((x, y) => y[1] - x[1])[0]; if (top) mixC[top[0]] = (mixC[top[0]] || 0) + 1; }
      for (const [d, q] of Object.entries(a.looseD)) mixC[d] = (mixC[d] || 0) + q;
      const mix = [...new Set([...Object.keys(mixC), ...Object.keys(a.deptU)])].map(d => [d, mixC[d] || 0, a.deptU[d] || 0]).sort((x, y) => y[1] - x[1] || y[2] - x[2]).slice(0, 20);
      return {
        id: a.id, cons: a.cons, cartons: a.cartonIds.size + a.loose, dept: mix.slice(0, 3).map(([d]) => d).join('/') || null, mix, desc: null,
        items: a.order.map(k => { const c = (a.itemC[k]?.size || 0) + (a.itemL[k] || 0); const cc = [...(a.itemC[k] || [])]; return { ...a.items[k], ...(c > 0 ? { c } : {}), ...(cc.length ? { cc } : {}) }; }).slice(0, ITEM_CAP),
        ...(a.order.length > ITEM_CAP ? { itemsCut: a.order.length - ITEM_CAP } : {}),
      };
    });
    if (consols.length) return { sheet: name, kind: 'report', manNo, storeNo, despatch, dcNo, consols, rowsRead: read, skipped };
    if (diag == null) {
      const hc = (rows[hdr] || []).findIndex(c => /consolidation/i.test(cs(c)));
      let numeric = false, longText = false;
      for (let i = hdr + 1; i < Math.min(rows.length, hdr + 60); i++) { const x = (rows[i] || [])[hc]; if (x == null || cs(x) === '') continue; if (typeof x === 'number') numeric = true; else if (/\d{12,}/.test(cs(x))) longText = true; }
      diag = numeric && !longText
        ? 'the “Consolidation” column is formatted as a number, so Excel has rounded the long codes and dropped digits. Set that column’s format to Text (or re-export), then upload again'
        : `found a “Consolidation” header on “${name}” but could not read the codes under it. The layout may differ from a standard Manifest Report`;
    }
  }
  return diag ? { consols: [], diag } : null;
}

// Fallback: any sheet with "consol" and carton-count columns.
function parseGeneric(sheets) {
  for (const { name, rows } of sheets) {
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const hdr = (rows[i] || []).map(c => cs(c).toLowerCase());
      const ci = hdr.findIndex(c => /consol/.test(c)), qi = hdr.findIndex(c => /carton|ctn\b|ctns|qty|quantity|units?/.test(c));
      if (ci < 0 || qi < 0 || ci === qi) continue;
      const di = hdr.findIndex(c => /dept|department|area/.test(c)), xi = hdr.findIndex(c => /desc|item|product/.test(c));
      // A consolidation is 9 to 22 digits once spaces and dashes go (what a
      // truck can attach); any other value in the column is skipped and counted.
      const agg = {}; let skipped = 0;
      for (let r = i + 1; r < rows.length; r++) {
        const row = rows[r] || [], raw = cs(row[ci]), id = raw.replace(/[\s-]/g, ''), q = Number(row[qi]);
        if (!raw || !isFinite(q) || q <= 0) continue;
        if (!/^\d{9,22}$/.test(id)) { skipped += 1; continue; }
        agg[id] ||= { id: id.slice(-9), cons: id, cartons: 0, dept: di >= 0 ? cs(row[di]) || null : null, mix: [], desc: xi >= 0 ? cs(row[xi]).slice(0, 60) || null : null, items: [] };
        agg[id].cartons += q;
      }
      if (Object.keys(agg).length) return { sheet: name, kind: 'generic', manNo: '', storeNo: '', despatch: '', dcNo: '', consols: Object.values(agg), skipped };
    }
  }
  return { sheet: null, consols: [] };
}

function diagnose(sheets) {
  for (const { name, rows } of sheets) {
    let hdr = -1, hc = -1;
    for (let r = 0; r < Math.min(rows.length, 40) && hdr < 0; r++) { const c = (rows[r] || []).findIndex(x => /consol/i.test(cs(x))); if (c >= 0) { hdr = r; hc = c; } }
    if (hdr < 0) continue;
    let sawNumber = false, sawLongText = false;
    for (let i = hdr + 1; i < Math.min(rows.length, hdr + 60); i++) { const v = (rows[i] || [])[hc]; if (v == null || cs(v) === '') continue; if (typeof v === 'number') sawNumber = true; else if (/\d{12,}/.test(cs(v))) sawLongText = true; }
    if (sawNumber && !sawLongText) return 'the “Consolidation” column is formatted as a number, so Excel has rounded the long codes and dropped digits. Set that column’s format to Text (or re-export), then upload again';
    return `found a “Consolidation” header on sheet “${name}” but could not read the rows under it. The layout may differ from the standard Manifest Report`;
  }
  return 'no “Consolidation” column found. Is this a Manifest Report export? A plain sheet with Consol and Cartons columns also works';
}
function excelDate(v) { const d = new Date(Math.round((v - 25569) * 86400000)); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; }

// The document the worker stores and the library reads (the suite worker's
// ?manifest=put shape: v 1, kind report), from a parse.
export function manifestDoc(parsed, { filename = '', by = '', manNo } = {}) {
  const no = String(manNo || parsed.manNo || '').trim();
  const consols = parsed.consols.map(c => ({ id: String(c.id || String(c.cons).slice(-9)), cons: String(c.cons || c.id), cartons: Number(c.cartons) || 0, dept: c.dept || null, mix: c.mix || [], desc: c.desc || null, items: c.items || [] }));   // itemsCut stays on the preview
  return { v: 1, kind: 'report', manNo: no, storeNo: parsed.storeNo || '', despatch: parsed.despatch || '', dcNo: parsed.dcNo || '', filename: String(filename).slice(0, 80), by: String(by).slice(0, 40), sheet: parsed.sheet || null,
    consols, totalCartons: consols.reduce((n, c) => n + c.cartons, 0), keycodes: new Set(consols.flatMap(c => c.items.map(i => i.k))).size };
}
// What manifest.attach carries onto the truck: the consols without carton
// ids or names (the published document keeps those).
export function attachConsols(doc) { return doc.consols.map(c => ({ id: c.id, cons: c.cons, cartons: c.cartons, dept: c.dept, mix: (c.mix || []).slice(0, 5), items: (c.items || []).map(({ k, q, dept, c: cc }) => ({ k, q, dept, ...(cc ? { c: cc } : {}) })) })); }

// The upload preview's checks: what was read and anything to look at before
// it is published. Pure, so the preview and tests agree.
//   ctx: { storeNo, index: dock.manifests, today: 'YYYY-MM-DD', mpc }
// → { stats, depts: [[dept, cartons]], checks: [{ level: ok | warn | bad, text }], blocking }
export function manifestCheck(parsed, { storeNo = '', index = {}, today = '', mpc = 0.5 } = {}) {
  const cons = parsed.consols || [], checks = [], add = (level, text) => checks.push({ level, text });
  const cartons = cons.reduce((n, c) => n + (Number(c.cartons) || 0), 0), items = cons.flatMap(c => c.items || []);
  const units = items.reduce((n, i) => n + (Number(i.q) || 0), 0), keycodes = new Set(items.map(i => i.k)).size;
  const dc = {}; for (const c of cons) for (const [d, ctn] of (c.mix?.length ? c.mix.map(m => [m[0], m[1]]) : [[c.dept || '???', c.cartons]])) dc[d || '???'] = (dc[d || '???'] || 0) + (Number(ctn) || 0);
  const stats = { consols: cons.length, cartons, keycodes, units, lines: items.length, workMins: Math.round(cartons * mpc), rowsRead: parsed.rowsRead ?? null };
  // Blocking: what the worker would refuse.
  const sNo = String(parsed.storeNo || '').replace(/\D/g, '');
  if (sNo && storeNo && sNo !== String(storeNo)) add('bad', `This report is for store ${parsed.storeNo}, not ${storeNo}. Check you saved the right email attachment.`);
  if (cons.length > CONSOL_CAP) add('bad', `${cons.length} consolidations: a manifest takes up to ${CONSOL_CAP}. Split the report.`);
  if (!cons.length) add('bad', 'No consolidations were read.');
  // Warnings: publishable, but worth a look.
  const sk = parsed.skipped || {};
  if (sk.numericCons) add('warn', `${sk.numericCons} row${sk.numericCons === 1 ? ' had its consolidation stored as a number (Excel rounds those) and was' : 's had the consolidation stored as a number (Excel rounds those) and were'} left out. Format the column as Text and re-export to keep them.`);
  if (sk.badKeycode) add('warn', `${sk.badKeycode} row${sk.badKeycode === 1 ? ' had no readable keycode and was' : 's had no readable keycode and were'} left out.`);
  if (sk.other) add('warn', `${sk.other} row${sk.other === 1 ? ' looked like data but matched no layout, and was' : 's looked like data but matched no layout, and were'} left out.`);
  const cut = cons.filter(c => c.itemsCut); if (cut.length) add('warn', `${cut.length} consolidation${cut.length === 1 ? ' has' : 's have'} more than ${ITEM_CAP} lines; the first ${ITEM_CAP} of each are kept.`);
  const zero = cons.filter(c => !(Number(c.cartons) > 0)); if (zero.length) add('warn', `${zero.length} consolidation${zero.length === 1 ? '' : 's'} with no cartons (${zero.slice(0, 3).map(c => c.id).join(', ')}${zero.length > 3 ? '…' : ''}).`);
  const ids = {}; for (const c of cons) ids[c.id] = (ids[c.id] || 0) + 1; const twin = Object.keys(ids).filter(k => ids[k] > 1);
  if (twin.length) add('warn', `${twin.length} pallet label id${twin.length === 1 ? ' is' : 's are'} shared by two consolidations (${twin.slice(0, 3).join(', ')}): a scan of ${twin.length === 1 ? 'it' : 'them'} matches the first.`);
  const noDept = items.filter(i => !i.dept).length; if (noDept) add('warn', `${noDept} line${noDept === 1 ? '' : 's'} without a department.`);
  if (parsed.kind === 'generic' && parsed.skipped) add('warn', `${parsed.skipped} row${parsed.skipped === 1 ? ' was' : 's were'} skipped: the consolidation is not a 9 to 22 digit number.`);
  if (parsed.kind === 'generic') add('warn', 'Read as a plain sheet of consolidations and cartons: there are no keycodes, so the explorer’s products and the carton profiles stay empty.');
  const no = String(parsed.manNo || '').trim();
  if (!/^[\w-]{1,20}$/.test(no)) add('warn', 'The report has no manifest number: enter one below.');
  else if (index[no]) add('warn', `Manifest ${no} is already published (${String(index[no].publishedAt || '').slice(0, 10)})${index[no].truck ? ` and attached to Truck ${String(index[no].truck).replace(/^.*-T/, '')}` : ''}: publishing replaces the library copy${index[no].truck ? '; the truck keeps the copy it has' : ''}.`);
  const dd = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(parsed.despatch || ''), iso = dd ? `${dd[3]}-${dd[2]}-${dd[1]}` : '';
  if (iso && today) { const days = Math.round((Date.parse(today) - Date.parse(iso)) / 86400000); if (days > 14) add('warn', `Despatched ${parsed.despatch}, ${days} days ago: is this an old report?`); else if (days < -3) add('warn', `Despatch date ${parsed.despatch} is ${-days} days ahead.`); }
  if (!checks.some(c => c.level !== 'ok')) add('ok', `Every row read${parsed.rowsRead ? ` (${parsed.rowsRead} lines)` : ''}.`);
  return { stats, depts: Object.entries(dc).sort((a, b) => b[1] - a[1]), checks, blocking: checks.some(c => c.level === 'bad') };
}
