// Nạp và chọn gói (contracts/pack.md). Lõi không biết gói làm gì, chỉ lọc theo audience/công cụ rồi hỏi match theo priority.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ID_RE = /^[a-z0-9-]+$/;

/** Nạp mọi `<dir>/<id>/index.js`. Thư mục không tồn tại thì []. Ném lỗi nếu id sai dạng, thiếu handle/match hoặc trùng id. */
export async function loadPacks(dir = 'packs') {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const packs = [];
  const seen = new Set();
  for (const ent of entries.filter((x) => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.resolve(dir, ent.name, 'index.js');
    try { await fs.access(file); } catch { continue; }
    const pack = (await import(pathToFileURL(file).href)).default;
    if (!pack || typeof pack.id !== 'string' || !pack.id) throw new Error(`Gói ${ent.name}: thiếu id`);
    if (!ID_RE.test(pack.id)) throw new Error(`Gói ${ent.name}: id "${pack.id}" phải khớp ${ID_RE}`);
    if (typeof pack.handle !== 'function') throw new Error(`Gói ${pack.id}: thiếu handle`);
    if (typeof pack.match !== 'function') throw new Error(`Gói ${pack.id}: thiếu match`);
    if (seen.has(pack.id)) throw new Error(`Gói trùng id: ${pack.id}`);
    seen.add(pack.id);
    packs.push(pack);
  }
  return packs;
}

export function createRegistry(packs) {
  const sorted = [...packs].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  /** Gói dùng được cho lượt này: đúng audience, đủ công cụ (tools = null thì bỏ qua lọc công cụ). Priority lớn trước. */
  function available(tools, turn) {
    return sorted.filter((p) => {
      if (p.audience === 'staff' && !turn?.isStaff) return false;
      if (tools && !(p.requiresTools ?? []).every((t) => tools.has(t))) return false;
      return true;
    });
  }

  /** Gói đầu tiên (theo priority) có match(turn, ctx) = true, hoặc null. */
  function pick(turn, ctx) {
    return available(ctx?.tools ?? null, turn).find((p) => p.match(turn, ctx)) ?? null;
  }

  return { available, pick };
}
