/** 방금(6초 안에) 기록한 지출인가 — 목록에서 들어오는 모션을 준다 */
export function isFresh(s: { created_at: string }): boolean {
  return Date.now() - new Date(s.created_at).getTime() < 6000;
}
