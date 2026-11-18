// 한 달 결산 — 그달이 끝나고 돌아볼 때 한 장으로 (components/MonthReport). 뱅크샐러드 머니리포트처럼
// 쓴 돈·지난달과 차이·나간 돈 구성·가장 많이 쓴 분류·가장 큰 지출·생활비 결과를 모은다.
// 화면에 보여 주는 묶음일 뿐이라 calc.ts(웹과 Kotlin 이 같아야 하는 계산)에 두지 않는다.

import type { Data, Spending } from "./types";
import { actualAmount, addMonths, itemsOf, livingStatus, periodOf } from "./calc";
import { summarize, type Summary } from "./calendar";

export interface MonthReport {
  period: { start: string; last: string };
  /** 그달 쓴 돈 (산 날 기준, 할부는 전액 — 달력 모아 보기와 같다) */
  spent: number;
  /** 지난달 쓴 돈 — 지난달 기록을 불러오지 않았으면 null (0 으로 보이지 않게) */
  prevSpent: number | null;
  /** 나간 돈 구성: 고정비(플랜, 낸 금액) · 공동 생활비 · 두 사람 용돈 · 저축·투자 */
  parts: { key: "fixed" | "living" | "allowance" | "saving"; label: string; amount: number }[];
  /** 가장 많이 쓴 분류 */
  topCategory: Summary["byCategory"][number] | null;
  /** 가장 큰 지출 하나 */
  biggest: Spending | null;
  /** 공동 생활비 예산 결과 (예산이 없으면 null) */
  living: { budget: number; spent: number; left: number } | null;
  count: number;
}

export function monthReport(data: Data, month: string): MonthReport {
  const s = data.settings;
  const p = periodOf(month, s.cycle_start);
  const sum = summarize(data, p.start, p.last);
  const pp = periodOf(addMonths(month, -1), s.cycle_start);
  const prev = summarize(data, pp.start, pp.last);
  const items = itemsOf(data, month);
  const group = (g: "fixed" | "saving") => items.filter((i) => i.group === g).reduce((a, i) => a + actualAmount(i), 0);
  const living = livingStatus(data, month, p.last);
  return {
    period: { start: p.start, last: p.last },
    spent: sum.spent,
    prevSpent: prev.spendings.length > 0 ? prev.spent : null,
    parts: [
      { key: "fixed" as const, label: "고정비", amount: group("fixed") },
      { key: "living" as const, label: "공동 생활비", amount: sum.byOwner.joint },
      { key: "allowance" as const, label: "용돈", amount: sum.byOwner.a + sum.byOwner.b },
      { key: "saving" as const, label: "저축·투자", amount: group("saving") },
    ].filter((x) => x.amount > 0),
    topCategory: sum.byCategory[0] ?? null,
    biggest: sum.spendings.reduce<Spending | null>((b, x) => (!b || x.amount > b.amount ? x : b), null),
    living: living.budget > 0 ? { budget: living.budget, spent: living.spent, left: living.left } : null,
    count: sum.spendings.length,
  };
}
