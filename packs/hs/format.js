// packs/hs/format.js — tiện ích định dạng dùng chung.

export function fmtHs(code) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length === 8) return `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6)}`;
  if (c.length === 6) return `${c.slice(0, 4)}.${c.slice(4)}`;
  return c;
}
