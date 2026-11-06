// What a keycode is, in one place. Kmart's keycodes are 7 or 8 digits, and
// new products since late 2026 carry 9 (110148905, 110232555). 6 is still
// taken where a typed or imported code always was. A 13-digit code is an
// item barcode (APN), never a keycode. At the back dock a scan of 9 digits
// or more is a pallet label, its last nine digits the consolidation: only
// the dock reads it so, everywhere else 9 digits is a keycode.
//
//   KEYCODE            /^\d{6,9}$/
//   isKeycode(code)    6 to 9 digits
//   isScanKeycode(code)  7 to 9 digits: a code scanned on the backfill phone or the live reader
//   KEYCODE_LENGTHS    the lengths a keycode read off a screen can have (8 and 9)

export const KEYCODE = /^\d{6,9}$/;
export const isKeycode = c => KEYCODE.test(String(c ?? ''));
export const isScanKeycode = c => /^\d{7,9}$/.test(String(c ?? ''));
export const KEYCODE_LENGTHS = [8, 9];
