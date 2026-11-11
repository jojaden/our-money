"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/store";
import { widgetCalendar } from "@/lib/calendar";
import { toApp } from "@/lib/native";

/**
 * 안드로이드 앱 안에서만: 홈 화면 달력 위젯의 웹 쪽 (폰 쪽은 apps/mobile androidApp widget/CalendarWidget.kt).
 * - 이번 달·다음 달 달력 요약을 앱에 넘긴다 — 바뀔 때와 앱으로 돌아올 때. 위젯은 로그인이 없어 이것만 그린다.
 * - 위젯을 눌러 이미 열린 앱으로 오면 앱이 "ourmoney-open"(detail "calendar")을 알린다 → 달력 화면으로.
 */
export function CalendarSync() {
  const { data, today } = useData();
  const router = useRouter();
  const cal = useMemo(() => widgetCalendar(data, today), [data, today]);
  const latest = useRef(cal);
  const sent = useRef("");
  useEffect(() => {
    latest.current = cal;
    const s = JSON.stringify(cal);
    if (s === sent.current) return;
    sent.current = s;
    toApp({ type: "calendar", ...cal });
  }, [cal]);

  useEffect(() => {
    // 자정을 넘겨 다시 열었거나 앱이 요약을 잃었어도 다시 그리게
    const resend = () => toApp({ type: "calendar", ...latest.current });
    const open = (e: Event) => {
      if ((e as CustomEvent).detail === "calendar") router.push("/calendar/");
    };
    window.addEventListener("ourmoney-resume", resend);
    window.addEventListener("ourmoney-open", open);
    return () => {
      window.removeEventListener("ourmoney-resume", resend);
      window.removeEventListener("ourmoney-open", open);
    };
  }, [router]);

  return null;
}
