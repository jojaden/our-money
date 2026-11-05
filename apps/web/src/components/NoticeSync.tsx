"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Data, Person, ReviewField, Spending } from "@/lib/types";
import { useData } from "@/lib/store";
import { addMonths, currentMonth, periodOf } from "@/lib/calc";
import { eul, parseYmd, ro, ymd } from "@/lib/format";
import { guessFromMemo } from "@/lib/categories";
import { appCan, onApp, toApp, type AppExpect, type AppSpend } from "@/lib/native";
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

/** 결제 알림으로 적는 카드 지출 — 아는 칸은 채우고 모르는 칸은 "확인 필요"(review, supabase/migrations/010)로 */
function spendOf(data: Data, me: Person, n: AppSpend): Spending {
  const card = n.last4 ? data.accounts.find((a) => a.kind === "card" && !a.archived && a.last4 === n.last4) : undefined;
  const memo = n.merchant ?? "";
  // 같은 가게의 지난 기록이 있으면 분류·누구 돈을 그대로 따른다
  const g = guessFromMemo(data, memo);
  const date = ymd(new Date(n.at));
  const dup = data.spendings.some((s) => s.date === date && s.amount === n.amount && s.pay_kind === "card" && (!card || s.account_id === card.id));
  const review: ReviewField[] = [];
  if (!card) review.push("card");
  if (!g.category_id) review.push("category");
  if (!g.from) review.push("owner");
  if (n.months === null) review.push("installment");
  if (!memo) review.push("merchant");
  if (dup) review.push("duplicate");
  return {
    id: n.id,
    date,
    amount: n.amount,
    category_id: g.category_id,
    pay_kind: "card",
    account_id: card?.id ?? null,
    owner: g.from?.owner ?? card?.owner ?? me,
    paid_by: card && card.owner !== "joint" ? card.owner : me,
    memo,
    created_at: new Date().toISOString(),
    source: "notification",
    installment_months: n.months ?? 1,
    review,
  };
}

/** 취소 알림이 가리키는 원래 기록 — 같은 금액의 카드 기록 중 60일 안에서 가장 최근 (카드·가게 이름을 알면 그것도 같아야) */
function canceledOf(data: Data, n: AppSpend): Spending | undefined {
  const card = n.last4 ? data.accounts.find((a) => a.kind === "card" && a.last4 === n.last4) : undefined;
  const to = ymd(new Date(n.at));
  const from = ymd(new Date(parseYmd(to).getTime() - 60 * 86_400_000));
  return data.spendings
    .filter((s) => s.pay_kind === "card" && s.amount === n.amount && s.date >= from && s.date <= to && (!card || s.account_id === card.id) && (!n.merchant || s.memo.trim() === n.merchant))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/**
 * 안드로이드 앱 안에서만: 결제 알림 맞추기의 웹 쪽 (폰 쪽은 apps/mobile notice/Matching.kt).
 * - 이번 달·지난달의 남은 할 일(고정비·저축 납부, 카드값, 옮길 돈, 정산, 낼 돈이 있는 할 일)을 앱에 넘긴다 — 바뀔 때만.
 * - 열 때와 앱으로 돌아올 때 맞춘 것을 받아 체크하고, "결제 알림으로 체크했어요 · 되돌리기"를 보인다 (디자인 README "알려 주는 법").
 *   그 사이 다른 폰에서 이미 체크했으면 건너뛴다. 받은 것은 체크 여부와 상관없이 앱에서 지운다.
 * - 할 일과 맞지 않은 카드 결제는 가계부에 "확인 필요"로 적고(아는 칸은 채움), 취소 알림은 원래 기록에 "승인 취소 알림"을 단다.
 */
export function NoticeSync() {
  const { data, today, me, toast, toggleCheck, upsert, remove } = useData();
  const month = currentMonth(data.settings.cycle_start, today);
  const cur = useTasks(month).tasks;
  const prev = useTasks(addMonths(month, -1)).tasks;
  const all = useMemo(() => {
    const p = periodOf(month, data.settings.cycle_start);
    return [...cur, ...prev, ...eventTasks(data, p.start, p.last, toggleCheck)];
  }, [cur, prev, data, month, toggleCheck]);
  const latest = useRef(all);
  const latestData = useRef(data);
  useEffect(() => {
    latest.current = all;
    latestData.current = data;
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
    const off = onApp(({ items, spends }) => {
      const done: { key: string; title: string }[] = [];
      for (const m of items) {
        const t = latest.current.find((x) => x.key === m.key);
        if (t && !t.done) {
          t.toggle();
          done.push({ key: m.key, title: m.title });
        }
      }
      const d = latestData.current;
      // 이미 적은 것(앱이 지우기 전에 다시 보낸 것)은 건너뛴다
      const rows = spends.filter((n) => !n.cancel && !d.spendings.some((s) => s.id === n.id)).map((n) => spendOf(d, me, n));
      const canceled = spends.filter((n) => n.cancel).map((n) => canceledOf(d, n)).filter((s): s is Spending => Boolean(s));
      toApp({ type: "applied", ids: [...items.map((m) => m.id), ...spends.map((n) => n.id)] });
      if (done.length > 0) {
        const what = done.length > 1 ? `${done[0].title} 외 ${done.length - 1}건을` : eul(done[0].title);
        toast(`${what} 결제 알림으로 체크했어요`, () => {
          for (const x of done) latest.current.find((t) => t.key === x.key && t.done)?.toggle();
        });
      }
      if (rows.length > 0) {
        const check = rows.filter((r) => r.review!.length > 0).length;
        void upsert("spendings", rows).then((ok) => {
          if (ok) toast(`결제 알림으로 지출 ${rows.length}건을 적었어요${check > 0 ? ` · 확인 필요 ${check}건` : ""}`, () => void remove("spendings", rows.map((r) => r.id)));
        });
      }
      if (canceled.length > 0) {
        // 지우지 않고 "승인 취소 알림"만 단다 — 사람이 보고 지운다 (되돌리기는 원래 줄로)
        void upsert("spendings", canceled.map((s) => ({ ...s, review: [...new Set([...(s.review ?? []), "canceled" as const])] }))).then((ok) => {
          if (ok) toast(`카드 취소 알림이 와서 ${canceled.length}건에 확인 표시를 달았어요`, () => void upsert("spendings", canceled.map((s) => ({ ...s, review: s.review ?? [] }))));
        });
      }
    });
    const ask = () => toApp({ type: "matches" });
    ask();
    window.addEventListener("ourmoney-resume", ask);
    return () => {
      off();
      window.removeEventListener("ourmoney-resume", ask);
    };
  }, [toast, me, upsert, remove]);

  return null;
}
