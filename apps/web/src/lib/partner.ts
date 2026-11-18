// 상대가 한 일을 나에게 알리는 규칙 — 종 알림 모음(Bell)과 앱이 켜져 있을 때의 토스트(PartnerWatch)가 같이 쓴다.
// - 공동 지출: 상대가 적은 공동(owner joint) 지출. 가져오기(CSV)로 한꺼번에 들어온 것은 빼고
// - 콕 찌르기: 상대가 나에게 남긴 짧은 알림 (nudges 표, supabase/migrations/019)

import type { Nudge, Person, Spending } from "./types";

/** 상대가 적은 공동 지출인가 — created_at 이 now 에서 within(ms) 안 */
export function isPartnerJointSpend(x: Spending, me: Person, now: number, within: number): boolean {
  if (x.owner !== "joint" || !x.created_by || x.created_by === me || x.source === "import") return false;
  const at = Date.parse(x.created_at);
  return Number.isFinite(at) && now - at >= -60_000 && now - at <= within;
}

/** 나에게 온 콕 찌르기인가 — within(ms) 안에 상대가 보낸 것 */
export function isNudgeForMe(n: Nudge, me: Person, now: number, within: number): boolean {
  if (n.to_person !== me || !n.created_by || n.created_by === me || !n.created_at) return false;
  const at = Date.parse(n.created_at);
  return Number.isFinite(at) && now - at <= within;
}

/** 오늘 같은 일로 이미 보냈나 — 하루 한 번만 (재촉이 잦지 않게) */
export function sentRecently(nudges: Nudge[], me: Person, to: Person, month: string, now: number): boolean {
  return nudges.some((n) => n.to_person === to && n.month === month && n.created_by === me && n.created_at && now - Date.parse(n.created_at) < 20 * 3_600_000);
}

export function nudgeId(): string {
  return `ng-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`;
}
