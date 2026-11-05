"use client";

import { useMemo, useState } from "react";
import type { Owner, PayKind, Spending } from "@/lib/types";
import { PAY_KIND_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { addMonths, allowanceStatus, categoryUse, dayIndexOf, groupTotals, itemsOf, livingStatus, nameOf, periodOf, settlementOf, spendingsIn, spentToDay, sum, type MonthSpending } from "@/lib/calc";
import { dayLabel, iga, num } from "@/lib/format";
import { MonthHeader } from "@/components/MonthHeader";
import { CategoryIcon, Money, Who } from "@/components/ui";
import { DailyBars } from "@/components/DailyBars";
import { RainbowGauge } from "@/components/RainbowGauge";
import { StatTiles } from "@/components/StatTiles";
import { categoryVisual, spendingVisual } from "@/lib/categories";
import { isFresh } from "@/lib/fresh";
import { useSheets } from "@/components/Shell";
import { BudgetCard } from "@/components/BudgetCard";
import { useRevealOnce } from "@/components/reveal";

type KindFilter = "all" | PayKind;
type OwnerFilter = "all" | Owner;

export default function LedgerPage() {
  const { data, month, today, me } = useData();
  const s = data.settings;
  const { openSpending } = useSheets();
  const [kind, setKind] = useState<KindFilter>("all");
  const [owner, setOwner] = useState<OwnerFilter>("all");
  const catsGrown = useRevealOnce("cats");

  const all = spendingsIn(data, month);
  const rows = all.filter((r) => (kind === "all" || r.pay_kind === kind) && (owner === "all" || r.owner === owner));
  const total = sum(rows, (r) => r.amount);
  const living = livingStatus(data, month, today);
  const prevSame = spentToDay(data, addMonths(month, -1), "joint", dayIndexOf(month, s.cycle_start, today));
  const allowance = allowanceStatus(data, month, me, today);
  const allowA = allowanceStatus(data, month, "a", today);
  const allowB = allowanceStatus(data, month, "b", today);
  const cats = categoryUse(data, month);
  const maxCat = Math.max(1, ...cats.map((c) => Math.max(c.budget, c.spent)));
  const st = settlementOf(data, month);
  const catName = (id: string | null, owner: Spending["owner"] = "joint") =>
    data.categories.find((c) => c.id === id)?.name ?? (owner === "joint" ? "미분류" : `${nameOf(s, owner)} 용돈`);
  const accName = (id: string | null) => (id ? data.accounts.find((a) => a.id === id)?.name : undefined);

  const days = useMemo(() => {
    const map = new Map<string, MonthSpending[]>();
    for (const r of rows) map.set(r.date, [...(map.get(r.date) ?? []), r]);
    return [...map.entries()];
  }, [rows]);

  const count = (k: KindFilter, o: OwnerFilter) => all.filter((r) => (k === "all" || r.pay_kind === k) && (o === "all" || r.owner === o)).length;

  const methodText = (r: Spending) => {
    if (r.pay_kind === "card") return accName(r.account_id) ?? "카드";
    if (r.pay_kind === "cash") return r.account_id ? "현금 (공동)" : `현금 (${nameOf(s, r.paid_by)})`;
    return `이체 · ${accName(r.account_id) ?? ""}`;
  };

  return (
    <>
      <MonthHeader title={(l) => `${l} 가계부`} />
      <div className="grid">
        <div className="col span-7">
        <RainbowGauge
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
          prev={prevSame > 0 ? { now: living.spent, then: prevSame } : null}
        />
        <section className="group o1" aria-labelledby="daily-h">
          <div className="group-head">
            <h2 id="daily-h">하루별 지출</h2>
            <span className="aside">{kind === "all" && owner === "all" ? "모든 기록" : "필터 적용"}</span>
          </div>
          <div className="card">
            <DailyBars rows={rows} month={month} cycleStart={s.cycle_start} today={today} />
          </div>
        </section>
        <section className="group o6" aria-labelledby="list-h">
          <div className="group-head">
            <h2 id="list-h">모든 기록</h2>
            <span className="aside">
              {rows.length}건 · <Money value={total} />
            </span>
          </div>
          <div className="card">
          <div className="chips scroll" role="group" aria-label="필터" style={{ marginBottom: 6 }}>
            {(["all", "card", "cash", "transfer"] as KindFilter[]).map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k === "all" ? "전체" : PAY_KIND_LABEL[k]} <span className="count">{count(k, owner)}</span>
              </button>
            ))}
            <span className="chip-sep" aria-hidden="true" />
            {(["all", "joint", "a", "b"] as OwnerFilter[]).map((o) => (
              <button key={o} type="button" className="chip" aria-pressed={owner === o} onClick={() => setOwner(o)}>
                {o === "all" ? "모두" : o === "joint" ? "공동" : nameOf(s, o)}
              </button>
            ))}
          </div>
          {rows.length === 0 ? (
            <p className="empty" style={{ marginTop: 12 }}>
              {all.length === 0 ? "이번 달 기록이 아직 없어요." : "이 조건에 맞는 기록이 없어요."}
            </p>
          ) : (
            days.map(([date, list]) => (
              <div className="daygroup" key={date}>
                <div className="dayhead">
                  <span>{dayLabel(date, today)}</span>
                  <Money value={sum(list, (r) => r.amount)} />
                </div>
                <div className="rows">
                  {list.map((r) => (
                    <button type="button" className={`row ${isFresh(r) ? "fresh" : ""}`} key={r.id} onClick={() => openSpending(r)}>
                      <CategoryIcon visual={spendingVisual(data, r)} />
                      <div style={{ minWidth: 0 }}>
                        <div className="t">{r.memo || catName(r.category_id, r.owner)}</div>
                        <div className="s">
                          {catName(r.category_id, r.owner)} · {methodText(r)}
                        </div>
                      </div>
                      <div className="r">
                        <Money value={r.amount} />
                        <div className="s">{r.inst ? `할부 ${r.inst.no}/${r.inst.of}` : PAY_KIND_LABEL[r.pay_kind]}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
          </div>
        </section>
        </div>

        <div className="col span-5">
          <BudgetCard
            id="allow-h"
            className="o2"
            bucket="allowance"
            compact
            title={`${nameOf(s, me)} 용돈`}
            status={allowance}
            empty={<>플랜에 {nameOf(s, me)} 용돈 항목이 없어요. 플랜 → 용돈 추가에서 금액을 정하면 내 지출이 여기서 빠져요.</>}
          />
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

          <section className="group o5" aria-labelledby="settle-h">
            <div className="group-head">
              <h2 id="settle-h">두 사람 정산</h2>
            </div>
            <div className="card">
            {!st ? (
              <p className="empty">이번 달은 공동 지출을 개인 돈으로 낸 기록이 없어요.</p>
            ) : (
              <>
                <div className="rows">
                  {(["a", "b"] as const).map((p) => (
                    <div className="row" key={p}>
                      <Who owner={p} s={s} size="sm" />
                      <div>
                        <div className="t">{iga(nameOf(s, p))} 먼저 낸 공동비용</div>
                      </div>
                      <div className="r">
                        <Money value={st.advanced[p]} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="kpi-sub" style={{ marginTop: 12 }}>
                  {st.amount === 0 ? (
                    "서로 낸 만큼 같아서 정산할 돈이 없어요."
                  ) : (
                    <>
                      <strong>{nameOf(s, st.from)}</strong> → <strong>{nameOf(s, st.to)}</strong>{" "}
                      <strong>
                        <Money value={st.amount} />
                      </strong>{" "}
                      보내면 맞아요. 체크 탭에서 완료 표시를 할 수 있어요.
                    </>
                  )}
                </p>
              </>
            )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
