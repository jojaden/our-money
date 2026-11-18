"use client";

import { useEffect, useRef } from "react";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { isPartnerJointAdd } from "@/lib/calendar";
import { eventKind } from "@/lib/ics";

/** 상대가 방금(2분 안) 더한 것만 — 지운 것을 되돌려 다시 들어온 옛 일정은 알리지 않는다 */
const JUST_NOW = 2 * 60_000;

/**
 * 앱이 켜져 있을 때 상대가 공동 일정·할 일·D-day 를 더하면(실시간 동기화로 들어오면) 토스트로 알린다.
 * 처음 불러온 일정은 알리지 않고(그건 종 알림 모음의 "새 공동 일정"), 그 뒤 새로 생긴 id 만 본다.
 * 앱이 꺼져 있을 때의 폰 알림(서버 푸시)은 아직 없다.
 */
export function JointEventWatch() {
  const { data, me, toast } = useData();
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const seen = known.current;
    known.current = new Set(data.events.map((e) => e.id));
    if (!seen) return;
    const now = Date.now();
    for (const e of data.events)
      if (!seen.has(e.id) && isPartnerJointAdd(e, me, now, JUST_NOW)) toast(`새 공동 ${eventKind(e)} · ${e.title} (${nameOf(data.settings, e.created_by!)})`);
  }, [data.events, data.settings, me, toast]);
  return null;
}
