"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Data } from "@/lib/types";
import { useData } from "@/lib/store";
import { addMonths, currentMonth, periodOf } from "@/lib/calc";
import { eul, ro } from "@/lib/format";
import { appCan, onApp, toApp, type AppExpect } from "@/lib/native";
import { eventTasks, useTasks, type Task } from "./tasks";

/** 결제 알림과 맞춰 볼 이름·카드 끝자리 — 폰 알림에 "관리비 230,000원이 나갔어요"처럼 쓰인다 */
function expectOf(t: Task, data: Data): AppExpect | null {
  if (t.done || t.amount <= 0) return null;
  const base = { key: t.key, kind: t.kind, amount: t.amount, due: t.due, method: null, last4: null };
  switch (t.kind) {
    case "pay": {
      const i = t.item!;
      if (i.method === "cash") return null;
      const card = i.method === "card_auto" ? data.accounts.find((a) => a.id === i.card_id) : undefined;
      return { ...base, title: i.name, method: i.method, last4: card?.last4 ?? null };
    }
    case "card":
      return { ...base, title: `${t.bill!.card.name} 카드값` };
    case "transfer":
      return { ...base, title: `${ro(t.to ?? "")} 옮길 돈` };
    default:
      return { ...base, title: t.title };
  }
}

/**
 * 안드로이드 앱 안에서만: 결제 알림 맞추기의 웹 쪽 (폰 쪽은 apps/mobile notice/Matching.kt).
 * - 이번 달·지난달의 남은 할 일(고정비·저축 납부, 카드값, 옮길 돈, 정산, 낼 돈이 있는 할 일)을 앱에 넘긴다 — 바뀔 때만.
 * - 열 때와 앱으로 돌아올 때 맞춘 것을 받아 체크하고, "결제 알림으로 체크했어요 · 되돌리기"를 보인다 (디자인 README "알려 주는 법").
 *   그 사이 다른 폰에서 이미 체크했으면 건너뛴다. 받은 것은 체크 여부와 상관없이 앱에서 지운다.
 */
export function NoticeSync() {
  const { data, today, toast, toggleCheck } = useData();
  const month = currentMonth(data.settings.cycle_start, today);
  const cur = useTasks(month).tasks;
  const prev = useTasks(addMonths(month, -1)).tasks;
  const all = useMemo(() => {
    const p = periodOf(month, data.settings.cycle_start);
    return [...cur, ...prev, ...eventTasks(data, p.start, p.last, toggleCheck)];
  }, [cur, prev, data, month, toggleCheck]);
  const latest = useRef(all);
  useEffect(() => {
    latest.current = all;
  });

  const expects = useMemo(() => all.map((t) => expectOf(t, data)).filter((e): e is AppExpect => e !== null), [all, data]);
  const sent = useRef("");
  useEffect(() => {
    if (!appCan("match")) return;
    const s = JSON.stringify(expects);
    if (s === sent.current) return;
    sent.current = s;
    toApp({ type: "expect", items: expects });
  }, [expects]);

  useEffect(() => {
    if (!appCan("match")) return;
    const off = onApp(({ items }) => {
      const done: { key: string; title: string }[] = [];
      for (const m of items) {
        const t = latest.current.find((x) => x.key === m.key);
        if (t && !t.done) {
          t.toggle();
          done.push({ key: m.key, title: m.title });
        }
      }
      toApp({ type: "applied", ids: items.map((m) => m.id) });
      if (done.length === 0) return;
      const what = done.length > 1 ? `${done[0].title} 외 ${done.length - 1}건을` : eul(done[0].title);
      toast(`${what} 결제 알림으로 체크했어요`, () => {
        for (const d of done) latest.current.find((x) => x.key === d.key && x.done)?.toggle();
      });
    });
    const ask = () => toApp({ type: "matches" });
    ask();
    window.addEventListener("ourmoney-resume", ask);
    return () => {
      off();
      window.removeEventListener("ourmoney-resume", ask);
    };
  }, [toast]);

  return null;
}
