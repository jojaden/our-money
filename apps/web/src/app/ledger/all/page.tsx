"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { Owner, PayKind } from "@/lib/types";
import { PAY_KIND_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { nameOf, spendingsIn, sum } from "@/lib/calc";
import { leaveDetail } from "@/lib/navigationMotion";
import { MonthHeader } from "@/components/MonthHeader";
import { EmptyState, Money } from "@/components/ui";
import { SpendingDays } from "@/components/SpendingDays";
import { Morph } from "@/components/Morph";
import { usePrimaryAction, useSheets } from "@/components/Shell";

type KindFilter = "all" | PayKind;
type OwnerFilter = "all" | Owner;

// 들어온 화면(?from=)으로 돌아간다. 알림처럼 표시 없이 들어왔거나 주소로 바로 열었으면 그 화면으로 바꿔 놓는다
const ORIGIN = { home: { label: "홈", href: "/" }, ledger: { label: "가계부", href: "/ledger/" } } as const;

/** 모든 기록 — 가계부 탭의 "모든 기록 보기", 홈의 "전체 보기", 알림의 "확인할 지출"(?review=1)에서 들어온다 */
export default function AllSpendingsPage() {
  const { data, month } = useData();
  const s = data.settings;
  const router = useRouter();
  const q = useSearchParams();
  const from = q.get("from") === "home" ? "home" : q.get("from") === "ledger" ? "ledger" : null;
  const origin = ORIGIN[from ?? "ledger"];
  const { openSpending } = useSheets();
  usePrimaryAction("지출 기록", "spending", () => openSpending());
  const [kind, setKind] = useState<KindFilter>("all");
  const [owner, setOwner] = useState<OwnerFilter>("all");
  // 카드 알림 자동 기록 중 확인이 필요한 것만
  const [needsReview, setNeedsReview] = useState(q.get("review") === "1");

  const all = spendingsIn(data, month);
  const reviewCount = all.filter((r) => r.review?.length).length;
  const rows = all.filter(
    (r) => (kind === "all" || r.pay_kind === kind) && (owner === "all" || r.owner === owner) && (!needsReview || Boolean(r.review?.length)),
  );
  const count = (k: KindFilter, o: OwnerFilter) => all.filter((r) => (k === "all" || r.pay_kind === k) && (o === "all" || r.owner === o)).length;

  return (
    <>
      <MonthHeader
        name="모든 기록"
        back={
          <button type="button" className="back-btn" onClick={() => leaveDetail(router, origin.href, from !== null)}>
            <ChevronLeft aria-hidden="true" />
            {origin.label}
          </button>
        }
      />
      <section className="group" aria-labelledby="list-h">
        <div className="group-head">
          <h2 id="list-h">모든 기록</h2>
          <span className="aside">
            {rows.length}건 · <Money value={sum(rows, (r) => r.amount)} />
          </span>
        </div>
        <div className="card">
          <div className="chips scroll" role="group" aria-label="필터" style={{ marginBottom: 6 }}>
            {reviewCount > 0 && (
              <>
                <button type="button" className="chip" aria-pressed={needsReview} onClick={() => setNeedsReview((v) => !v)}>
                  확인 필요 <span className="count">{reviewCount}</span>
                </button>
                <span className="chip-sep" aria-hidden="true" />
              </>
            )}
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
          {/* 거르기를 바꾸면 빠지는 기록은 흐려지고, 남는 기록은 새 자리로 미끄러지고, 들어오는 기록은 떠오른다 (Morph) */}
          <Morph track=":scope > *, .rows > *">
            {rows.length === 0 ? (
              <div style={{ marginTop: 12 }}>
                {all.length === 0 ? (
                  <EmptyState title="이번 달 기록이 아직 없어요" action="지출 기록하기" onAction={() => openSpending()} />
                ) : (
                  <EmptyState
                    title="이 조건에 맞는 기록이 없어요"
                    body={`이번 달 기록 ${all.length}건 중에는 없어요.`}
                    action="거르기 지우기"
                    onAction={() => {
                      setKind("all");
                      setOwner("all");
                      setNeedsReview(false);
                    }}
                  />
                )}
              </div>
            ) : (
              <SpendingDays rows={rows} />
            )}
          </Morph>
        </div>
      </section>
    </>
  );
}
