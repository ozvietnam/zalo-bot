// core/engine-voice.js — điều phối tin thoại trong lượt engine (issue #125).
import { redact } from './redact.js';
import { isTatGiong, isBatGiong, REPLY_TAT_GIONG, REPLY_BAT_GIONG } from './giong-noi.js';

export function createVoiceRoute({ store, gate, giongNoi, config = {}, log = console, audit }) {
  async function lenh(turn, reply) {
    if (!turn.text) return null;
    if (isTatGiong(turn.text)) {
      store.meta.set(`voice:${turn.convId}`, 'off');
      await reply(turn, REPLY_TAT_GIONG, 0, { kind: 'notice' });
      return { handled: 'tat-giong' };
    }
    if (isBatGiong(turn.text)) {
      store.meta.set(`voice:${turn.convId}`, 'on');
      await reply(turn, REPLY_BAT_GIONG, 0, { kind: 'notice' });
      return { handled: 'bat-giong' };
    }
    return null;
  }

  async function guiThoai(turn, res, key, results) {
    if (!giongNoi || !res?.replies?.length) return;
    const phongVoice = store.meta.get(`voice:${turn.convId}`);
    const voiceOff = config.voiceReplies === 'off' || phongVoice === 'off';
    const shouldVoice = !voiceOff && (config.voiceReplies === 'summary' || config.voiceReplies === 'always' || turn.isVoice);
    if (!shouldVoice) return;

    try {
      const mainReply = res.replies[0]?.text || '';
      const amThanh = await giongNoi.taoAmThanh(mainReply);
      if (amThanh?.voiceUrl) {
        const g = await gate.send({
          idemKey: `v:${turn.convId}:${key}`,
          chatId: turn.chatId,
          convId: turn.convId,
          isGroup: turn.isGroup,
          turnId: key,
          kind: 'voice',
          text: amThanh.cauDoc,
          voiceUrl: amThanh.voiceUrl,
          inReplyToAt: turn.receivedAt,
          debt: turn.replayed === true,
        });
        results.push({ idemKey: `v:${turn.convId}:${key}`, decision: g.decision, reason: g.reason, status: g.status });
      }
    } catch (e) {
      const msg = redact(e?.message);
      log.warn?.(`[engine] tạo hoặc gửi tin thoại lỗi: ${msg}`);
      try { audit('error', turn.chatId, turn.convId, key, { stage: 'voice', message: msg.slice(0, 500) }); } catch {}
    }
  }

  return { lenh, guiThoai };
}
