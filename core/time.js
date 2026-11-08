// Giờ VN (UTC+7) tính bằng cộng 7 giờ trên getTime() rồi đọc getUTC*; không phụ thuộc TZ của máy.
const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

const shifted = (d) => new Date(new Date(d).getTime() + VN_OFFSET_MS);

export function vnHour(d) {
  return shifted(d).getUTCHours();
}

/** Giờ yên [start, end) theo giờ VN; mặc định 23:00 → 07:00. */
export function isQuietHours(d, start = 23, end = 7) {
  const h = vnHour(d);
  return start > end ? h >= start || h < end : h >= start && h < end;
}

/** 00:00 VN của ngày chứa d, dạng ISO UTC. */
export function vnDayStartUtc(d) {
  const t = new Date(d).getTime() + VN_OFFSET_MS;
  return new Date(Math.floor(t / DAY_MS) * DAY_MS - VN_OFFSET_MS).toISOString();
}

/** 'YYYY-MM-DD' theo ngày VN. */
export function vnDateKey(d) {
  return shifted(d).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD HH:mm:ss' giờ VN (UTC+7). */
export function vnStamp(d) {
  const s = shifted(d).toISOString();
  return `${s.slice(0, 10)} ${s.slice(11, 19)}`;
}

/** Mốc `hour`:00 VN kế tiếp, nghiêm ngặt sau d, dạng ISO UTC. */
export function nextMorning(d, hour = 7) {
  const t = new Date(d).getTime();
  let at = new Date(vnDayStartUtc(d)).getTime() + hour * 3_600_000;
  if (at <= t) at += DAY_MS;
  return new Date(at).toISOString();
}
