// scripts/giam-sat/nguon-fanpage.js
// Nạp chỉ-đọc bản sao dữ liệu Fanpage (fb-inbox.db) theo US4, FR-005, FR-009 (T709).
// Lọc bỏ tin thông báo hệ thống tự động khi cua_bot = 0, chuẩn hoá về cấu trúc hội thoại chung.

import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const RE_HE_THONG = /đã trả lời về một bài viết|đã bình luận về một bài viết|đã bày tỏ cảm xúc/i;

function timBangTinNhan(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
  if (tables.includes('fanpage_messages')) return 'fanpage_messages';
  if (tables.includes('messages')) return 'messages';
  return null;
}

function xacDinhSpeaker(row) {
  if (row.cua_bot === 1 || row.cua_bot === '1' || row.cua_bot === true) return 'bot';
  const st = String(row.sender_type || row.speaker || row.sender || '').toLowerCase().trim();
  if (st === 'bot') return 'bot';
  if (st === 'khach' || st === 'user' || st === 'customer' || row.is_customer === 1 || row.from_page === 0 || row.is_page === 0) {
    return 'khach';
  }
  if (st === 'nhan-vien' || st === 'nhan_vien' || st === 'staff' || st === 'page' || st === 'agent' || st === 'admin' || row.from_page === 1 || row.is_page === 1) {
    return 'nhan-vien';
  }
  if (row.cua_bot === 0 || row.cua_bot === '0' || row.cua_bot === false) {
    return 'nhan-vien';
  }
  return 'khach';
}

function laTinHeThong(row, text) {
  if (row.is_system === 1 || row.is_system === '1' || row.is_system === true) return true;
  if (typeof text === 'string' && RE_HE_THONG.test(text)) return true;
  return false;
}

/**
 * Đọc chỉ-đọc bản sao cơ sở dữ liệu Fanpage SQLite và chuẩn hoá các tin nhắn.
 * @param {string} dbPath Đường dẫn tệp SQLite bản sao fb-inbox
 * @param {object} [khoangNgay] Khoảng thời gian { dauNgayUtc, cuoiNgayUtc }
 * @returns {{ ok: boolean, error?: string, conversations: Array, messages: Array, skippedSystemCount: number }}
 */
export function docNguonFanpage(dbPath, khoangNgay = {}) {
  const ketQuaRong = (error) => ({
    ok: false,
    error,
    conversations: [],
    messages: [],
    skippedSystemCount: 0,
  });

  if (!dbPath || typeof dbPath !== 'string' || !existsSync(dbPath)) {
    return ketQuaRong('missing_db');
  }

  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });

    const bang = timBangTinNhan(db);
    if (!bang) {
      return ketQuaRong('missing_table');
    }

    const colInfo = db.prepare(`PRAGMA table_info(${bang})`).all();
    const cols = new Set(colInfo.map(c => c.name));

    const colTs = ['created_at', 'ts', 'at', 'timestamp', 'time'].find(c => cols.has(c));

    let rows = [];
    const coKhoangNgay = khoangNgay && khoangNgay.dauNgayUtc && khoangNgay.cuoiNgayUtc && colTs;

    if (coKhoangNgay) {
      rows = db.prepare(`SELECT rowid AS _rowid, * FROM ${bang} WHERE ${colTs} BETWEEN ? AND ? ORDER BY ${colTs} ASC`)
        .all(khoangNgay.dauNgayUtc, khoangNgay.cuoiNgayUtc);
    } else {
      const sql = colTs ? `SELECT rowid AS _rowid, * FROM ${bang} ORDER BY ${colTs} ASC` : `SELECT rowid AS _rowid, * FROM ${bang}`;
      rows = db.prepare(sql).all();
    }

    let skippedSystemCount = 0;
    const messages = [];
    const convMap = new Map();

    for (const row of rows) {
      const text = String(row.content ?? row.text ?? row.message ?? row.body ?? '');
      const isBot = row.cua_bot === 1 || row.cua_bot === '1' || row.cua_bot === true ||
        String(row.sender_type || row.speaker || '').toLowerCase().trim() === 'bot';

      if (!isBot && laTinHeThong(row, text)) {
        skippedSystemCount++;
        continue;
      }

      const id = String(row.id ?? row.turn_id ?? row.message_id ?? row._rowid);
      const convId = String(row.conv_id ?? row.thread_id ?? row.conversation_id ?? row.chat_id ?? 'default');
      const ts = String(row.created_at ?? row.ts ?? row.at ?? row.timestamp ?? '');
      const speaker = xacDinhSpeaker(row);

      const msg = {
        id,
        turn_id: id,
        convId,
        chat_id: convId,
        channel: 'fanpage',
        speaker,
        text,
        ts,
        at: ts,
      };

      messages.push(msg);

      if (!convMap.has(convId)) {
        convMap.set(convId, {
          convId,
          channel: 'fanpage',
          turns: [],
          messages: [],
        });
      }
      const c = convMap.get(convId);
      c.turns.push(msg);
      c.messages.push(msg);
    }

    return {
      ok: true,
      conversations: Array.from(convMap.values()),
      messages,
      skippedSystemCount,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      conversations: [],
      messages: [],
      skippedSystemCount: 0,
    };
  } finally {
    if (db) {
      try { db.close(); } catch {}
    }
  }
}
