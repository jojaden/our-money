"use client";

import { useEffect, useRef } from "react";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { isPartnerJointAdd } from "@/lib/calendar";
import { eventKind } from "@/lib/ics";
import { iga, num } from "@/lib/format";
import { haptic } from "@/lib/native";
import { isNudgeForMe, isPartnerJointSpend } from "@/lib/partner";
import type { CalEvent, Nudge, Spending } from "@/lib/types";

/** 상대가 방금(2분 안) 한 것만 — 지운 것을 되돌려 다시 들어온 옛 줄은 알리지 않는다 */
const JUST_NOW = 2 * 60_000;

/** 이번에 처음 보는 줄만 — 처음 불러온 것은 알리지 않는다(그건 종 알림 모음) */
function useNew<T extends { id: string }>(rows: T[], onNew: (fresh: T[]) => void) {
  const known = useRef<Set<string> | null>(null);
  const cb = useRef(onNew);
  useEffect(() => {
    cb.current = onNew;
  });
  useEffect(() => {
    const seen = known.current;
    known.current = new Set(rows.map((r) => r.id));
    if (!seen) return;
    const fresh = rows.filter((r) => !seen.has(r.id));
    if (fresh.length > 0) cb.current(fresh);
  }, [rows]);
}

/**
 * 앱이 켜져 있을 때 상대가 한 일이 실시간으로 들어오면 토스트로 알린다 (종 알림 모음에도 남는다, components/Bell).
 * - 공동 일정·할 일·D-day 를 더했을 때
 * - 공동 지출을 적었을 때 — 한꺼번에 여러 건이면 한 번에 묶어서, 가져오기(CSV)는 빼고
 * - 나에게 콕 찌르기를 보냈을 때 (짧은 진동)
 * 앱이 꺼져 있을 때의 폰 알림(서버 푸시)은 아직 없다.
 */
export function PartnerWatch() {
  const { data, me, toast } = useData();
  const who = (p: CalEvent["created_by"]) => nameOf(data.settings, p!);

  useNew<CalEvent>(data.events, (fresh) => {
    const now = Date.now();
    for (const e of fresh) if (isPartnerJointAdd(e, me, now, JUST_NOW)) toast(`새 공동 ${eventKind(e)} · ${e.title} (${who(e.created_by)})`);
  });

  useNew<Spending>(data.spendings, (fresh) => {
    const now = Date.now();
    const list = fresh.filter((x) => isPartnerJointSpend(x, me, now, JUST_NOW));
    if (list.length === 0) return;
    const sum = list.reduce((a, x) => a + x.amount, 0);
    const name = who(list[0].created_by);
    toast(list.length === 1 ? `${name} 공동 지출 · ${list[0].memo || "기록"} ${num(sum)}원` : `${name} 공동 지출 ${list.length}건 · ${num(sum)}원`);
  });

  useNew<Nudge>(data.nudges, (fresh) => {
    const now = Date.now();
    const n = fresh.find((x) => isNudgeForMe(x, me, now, JUST_NOW));
    if (!n) return;
    haptic([10, 60, 10]);
    toast(`${iga(who(n.created_by))} 콕 찔렀어요 · ${n.title}`);
  });

  return null;
}
