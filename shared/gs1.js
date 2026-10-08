// GS1 barcodes on stockroom stock and cages. An item barcode is a UPC-A,
// EAN-13 or GTIN-14 (often inside a GS1-128 or DataMatrix as AI 01);
// a pallet or cage label may carry an SSCC (AI 00, 18 digits). Pure.
//
//   gs1Parse(raw)     { gtin } | { sscc } | null   (check digits verified)
//   gtinCheck(digits) true when the last digit is the GS1 check digit
//   gtinKey(gtin)     the form pairs are kept under: 13 digits for EAN/UPC, 14 for a true GTIN-14

export function gtinCheck(d) {
  d = String(d); if (!/^\d{8,18}$/.test(d)) return false;
  let sum = 0; for (let i = d.length - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(d[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(d.at(-1));
}
export function gtinKey(g) {
  g = String(g);
  if (g.length === 14 && g[0] === '0') g = g.slice(1);
  if (g.length === 12) g = '0' + g;                     // UPC-A as EAN-13
  return g;
}
export function gs1Parse(raw) {
  let s = String(raw || '').trim().replace(/^\][A-Za-z]\d/, '').replace(/\u001d/g, '|');
  // Bracketed element strings: (01)09341234567890(10)LOT…
  const br = /\((\d{2,4})\)([^(]*)/g; let m, ais = {};
  if (s.startsWith('(')) { while ((m = br.exec(s))) ais[m[1]] = m[2].trim(); }
  else if (/^(00\d{18}|01\d{14})/.test(s)) { if (s.startsWith('00')) ais['00'] = s.slice(2, 20); else ais['01'] = s.slice(2, 16); }
  if (ais['00'] && /^\d{18}$/.test(ais['00'])) return gtinCheck(ais['00']) ? { sscc: ais['00'] } : null;
  if (ais['01'] && /^\d{14}$/.test(ais['01'])) return gtinCheck(ais['01']) ? { gtin: gtinKey(ais['01']) } : null;
  const d = s.replace(/\D/g, '');
  if (d !== s.replace(/\s/g, '')) return null;
  // Eight digits is a keycode here, never an EAN-8: one keycode in ten would
  // pass the check digit by chance.
  if ([12, 13, 14].includes(d.length) && gtinCheck(d)) return { gtin: gtinKey(d) };
  if (d.length === 18 && gtinCheck(d)) return { sscc: d };
  return null;
}
