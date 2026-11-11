"use client";

import Link from "next/link";
import { useData } from "@/lib/store";
import { addMonths, allowanceStatus, categoryUse, groupTotals, itemsOf, livingStatus, nameOf, periodOf, spendingsIn } from "@/lib/calc";
import { num } from "@/lib/format";
import { MonthHeader } from "@/components/MonthHeader";
import { CategoryIcon, Money } from "@/components/ui";
import { DailyBars } from "@/components/DailyBars";
import { SpendCurve } from "@/components/SpendCurve";
import { StatTiles } from "@/components/StatTiles";
import { SpendingDays } from "@/components/SpendingDays";
import { categoryVisual } from "@/lib/categories";
import { usePrimaryAction, useSheets } from "@/components/Shell";
import { useRevealOnce } from "@/components/reveal";

/** 가계부 탭은 이번 달 요약만 — 날짜별 전체 목록과 필터는 모든 기록(/ledger/all/)에 둔다. 용돈은 홈, 두 사람 정산은 체크에 있다 */
export default function LedgerPage() {
  const { data, month, today } = useData();
  const s = data.settings;
  const { openSpending } = useSheets();
  usePrimaryAction("지출 기록", "spending", () => openSpending());
  const catsGrown = useRevealOnce("cats");

  const all = spendingsIn(data, month);
  const reviewCount = all.filter((r) => r.review?.length).length;
  const living = livingStatus(data, month, today);
  const allowA = allowanceStatus(data, month, "a", today);
  const allowB = allowanceStatus(data, month, "b", today);
  const cats = categoryUse(data, month);
  const maxCat = Math.max(1, ...cats.map((c) => Math.max(c.budget, c.spent)));

  return (
    <>
      <MonthHeader name="가계부" />
      <div className="grid">
        <div className="col span-7">
        <SpendCurve
          month={month}
          prevMonth={addMonths(month, -1)}
          cycleStart={s.cycle_start}
          today={today}
          rows={all}
          prevRows={spendingsIn(data, addMonths(month, -1))}
          daily={<DailyBars rows={all} month={month} cycleStart={s.cycle_start} today={today} />}
          buckets={[
            { key: "living", name: "공동 생활비", budget: living.budget, spent: living.spent },
            {
              key: "allowance",
              name: "두 사람 용돈",
              budget: allowA.budget + allowB.budget,
              spent: allowA.spent + allowB.spent,
              note: `${nameOf(s, "a")} ${num(allowA.spent)} · ${nameOf(s, "b")} ${num(allowB.spent)}`,
            },
          ]}
        />
        <section className="group o6" aria-labelledby="list-h">
          <div className="group-head">
            <h2 id="list-h">최근 기록</h2>
            {reviewCount > 0 && (
              <Link className="aside" href="/ledger/all/?from=ledger&review=1">
                확인 필요 {reviewCount}건
              </Link>
            )}
          </div>
          <div className="card">
            {all.length === 0 ? (
              <p className="empty">이번 달 기록이 아직 없어요. 오른쪽 아래 + 버튼으로 첫 지출을 기록해 보세요.</p>
            ) : (
              <>
                <SpendingDays rows={all} limit={5} />
                <Link className="more-row" href="/ledger/all/?from=ledger">
                  모든 기록 <b>{all.length}건</b> 보기
                </Link>
              </>
            )}
          </div>
        </section>
        </div>

        <div className="col span-5">
          <section className="group o3" aria-labelledby="cat-h">
            <div className="group-head">
              <h2 id="cat-h">분류별 공동 생활비</h2>
              <span className="aside keytick">예산</span>
            </div>
            <div className="card">
            <div className={`rows ${catsGrown ? "" : "flat"}`} style={{ ["--inset" as string]: "44px" }}>
              {cats.map((c) => (
                <div className="row catrow icon" key={c.id ?? "none"} style={{ minHeight: 60 }}>
                  <CategoryIcon visual={categoryVisual(c.id ? c.name : null)} size="sm" />
                  <div style={{ minWidth: 0 }}>
                    <div className="t">{c.name}</div>
                    <div className="catbar" role="img" aria-label={`${c.name} ${num(c.spent)}원${c.budget > 0 ? ` / 예산 ${num(c.budget)}원` : ""}`}>
                      <span className={c.budget > 0 && c.spent > c.budget ? "over" : ""} style={{ width: `${Math.min(100, (c.spent / maxCat) * 100)}%` }} />
                      {c.budget > 0 && <i style={{ left: `${Math.min(100, (c.budget / maxCat) * 100)}%` }} />}
                    </div>
                  </div>
                  <div className="r">
                    <Money value={c.spent} className={c.budget > 0 && c.spent > c.budget ? "neg" : ""} />
                    <div className="s">{c.budget > 0 ? `/ ${num(c.budget)}` : "예산 없음"}</div>
                  </div>
                </div>
              ))}
            </div>
            </div>
          </section>

          <section className="group o4" aria-labelledby="stat-h">
            <div className="group-head">
              <h2 id="stat-h">이번 달 기록</h2>
            </div>
            <StatTiles rows={all} period={periodOf(month, s.cycle_start)} today={today} saving={groupTotals(itemsOf(data, month)).saving} />
          </section>
        </div>
      </div>
    </>
  );
}
