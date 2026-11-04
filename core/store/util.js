// Tiện ích dùng chung cho các bảng của store.
export const toJson = (v) => JSON.stringify(v ?? null);
export const fromJson = (s, fallback = null) => {
  if (s === null || s === undefined) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
};

/**
 * UPDATE theo patch. Tên cột lấy từ danh sách trắng `allowed` (định danh không thể là tham số),
 * giá trị luôn đi qua tham số. Cột lạ thì ném lỗi.
 */
export function patchRow(db, table, idCol, id, patch, allowed, jsonCols = []) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  for (const k of keys) if (!allowed.includes(k)) throw new Error(`unknown column ${table}.${k}`);
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const vals = keys.map((k) => (jsonCols.includes(k) ? toJson(patch[k]) : patch[k] ?? null));
  db.prepare(`UPDATE ${table} SET ${sets} WHERE ${idCol} = ?`).run(...vals, id);
}
