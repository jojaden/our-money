"use client";

import type { Spending } from "@/lib/types";
import { PAY_KIND_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { nameOf, sum, type MonthSpending } from "@/lib/calc";
import { dayLabel } from "@/lib/format";
import { spendingVisual } from "@/lib/categories";
import { isFresh } from "@/lib/fresh";
import { CategoryIcon, Money } from "./ui";
import { useSheets } from "./Shell";

/**
 * 지출을 날짜별로 묶은 목록 (가계부의 최근 기록, 모든 기록).
 * limit 을 주면 앞에서부터 그 줄 수만 그린다. 날짜 합계는 잘린 줄까지 포함한 그날 전체다.
 */
export function SpendingDays({ rows, limit }: { rows: MonthSpending[]; limit?: number }) {
  const { data, today } = useData();
  const { openSpending } = useSheets();
  const s = data.settings;
  const catName = (id: string | null, owner: Spending["owner"] = "joint") =>
    data.categories.find((c) => c.id === id)?.name ?? (owner === "joint" ? "미분류" : `${nameOf(s, owner)} 용돈`);
  const accName = (id: string | null) => (id ? data.accounts.find((a) => a.id === id)?.name : undefined);
  const methodText = (r: Spending) => {
    if (r.pay_kind === "card") return accName(r.account_id) ?? "카드";
    if (r.pay_kind === "cash") return r.account_id ? "현금 (공동)" : `현금 (${nameOf(s, r.paid_by)})`;
    return `이체 · ${accName(r.account_id) ?? ""}`;
  };

  const days = new Map<string, MonthSpending[]>();
  for (const r of rows) days.set(r.date, [...(days.get(r.date) ?? []), r]);
  let left = limit ?? rows.length;

  return [...days.entries()].map(([date, list]) => {
    if (left <= 0) return null;
    const shown = list.slice(0, left);
    left -= shown.length;
    return (
      <div className="daygroup" key={date}>
        <div className="dayhead">
          <span>{dayLabel(date, today)}</span>
          <Money value={sum(list, (r) => r.amount)} />
        </div>
        <div className="rows">
          {shown.map((r) => (
            <button type="button" className={`row ${isFresh(r) ? "fresh" : ""}`} key={r.id} onClick={() => openSpending(r)}>
              <CategoryIcon visual={spendingVisual(data, r)} />
              <div style={{ minWidth: 0 }}>
                <div className="t">{r.memo || catName(r.category_id, r.owner)}</div>
                <div className="s">
                  {catName(r.category_id, r.owner)} · {methodText(r)}
                </div>
              </div>
              <div className="r">
                <Money value={-r.amount} />
                {r.review?.length ? (
                  <div style={{ marginTop: 2 }}>
                    <span className="pill warning">확인 필요</span>
                  </div>
                ) : (
                  <div className="s">{r.inst ? `할부 ${r.inst.no}/${r.inst.of}` : PAY_KIND_LABEL[r.pay_kind]}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  });
}
