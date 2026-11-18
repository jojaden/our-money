// 상대가 한 일을 나에게 알리는 규칙 — 종 알림 모음(Bell)과 앱이 켜져 있을 때의 토스트(PartnerWatch)가 같이 쓴다.
// - 공동 지출: 상대가 적은 공동(owner joint) 지출. 가져오기(CSV)로 한꺼번에 들어온 것은 빼고
// - 콕 찌르기: 상대가 나에게 남긴 짧은 알림 (nudges 표, supabase/migrations/019)

import type { Nudge, Person, Spending } from "./types";

/** 지출의 created_at 은 그 폰의 시계라(SpendingSheet) 두 폰의 시계가 어긋난 만큼 봐준다 */
const SKEW = 5 * 60_000;

/** 상대가 적은 공동 지출인가 — created_at 이 now 에서 within(ms) 안 (시계 차이 SKEW 까지 봐줌) */
export function isPartnerJointSpend(x: Spending, me: Person, now: number, within: number): boolean {
  if (x.owner !== "joint" || !x.created_by || x.created_by === me || x.source === "import") return false;
  const at = Date.parse(x.created_at);
  return Number.isFinite(at) && now - at >= -SKEW && now - at <= within + SKEW;
}

/** 나에게 온 콕 찌르기인가 — within(ms) 안에 상대가 보낸 것 */
export function isNudgeForMe(n: Nudge, me: Person, now: number, within: number): boolean {
  if (n.to_person !== me || !n.created_by || n.created_by === me || !n.created_at) return false;
  const at = Date.parse(n.created_at);
  return Number.isFinite(at) && now - at <= within;
}

/** 오늘 같은 일로 이미 보냈나 — 하루 한 번만 (재촉이 잦지 않게) */
export function sentRecently(nudges: Nudge[], me: Person, to: Person, month: string, now: number): boolean {
  // 막 보내 서버 답을 기다리는 줄은 created_by·created_at 이 아직 없다 → 같은 달·같은 사람이면 보낸 것으로
  return nudges.some((n) => n.to_person === to && n.month === month && (n.created_by === undefined ? true : n.created_by === me) && (!n.created_at || now - Date.parse(n.created_at) < 20 * 3_600_000));
}

export function nudgeId(): string {
  return `ng-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`;
}
