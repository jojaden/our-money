"use client";

import { useEffect, useMemo, useRef } from "react";
import { useData } from "@/lib/store";
import { addMonths, currentMonth } from "@/lib/calc";
import { reminders } from "@/lib/reminders";
import { toApp } from "@/lib/native";
import { useTasks } from "./tasks";

/**
 * 안드로이드 앱 안에서만: 폰 알림(일정 미리 알림 · 월급날 아침 · 나갈 돈 전날)의 웹 쪽.
 * 앞으로 35일의 알림을 바뀔 때와 앱으로 돌아올 때 넘긴다 (폰 쪽은 apps/mobile androidApp remind/Reminders.kt).
 */
export function ReminderSync() {
  const { data, today, me } = useData();
  const month = currentMonth(data.settings.cycle_start, today);
  const cur = useTasks(month);
  const next = useTasks(addMonths(month, 1));
  const items = useMemo(
    () => reminders(data, me, today, [{ month, ...cur }, { month: addMonths(month, 1), ...next }]),
    [data, me, today, month, cur, next],
  );
  const latest = useRef(items);
  const sent = useRef("");
  useEffect(() => {
    latest.current = items;
    const s = JSON.stringify(items);
    if (s === sent.current) return;
    sent.current = s;
    toApp({ type: "reminders", items });
  }, [items]);

  useEffect(() => {
    const resend = () => toApp({ type: "reminders", items: latest.current });
    window.addEventListener("ourmoney-resume", resend);
    return () => window.removeEventListener("ourmoney-resume", resend);
  }, []);

  return null;
}
