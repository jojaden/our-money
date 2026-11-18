"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { summaryHref } from "@/lib/calendar";
import { categoryName, categoryVisual, spendingVisual } from "@/lib/categories";
import { monthLabel, num, shortDate } from "@/lib/format";
import { monthReport } from "@/lib/report";
import { Meter } from "./Meter";
import { afterSheet, CategoryIcon, Money, Sheet } from "./ui";

/**
 * 한 달 결산 한 장 (뱅크샐러드 머니리포트 참고) — 그달이 끝나면 홈 "10월이 끝났어요"의 돌아보기, 체크의 마무리에서 연다.
 * 쓴 돈과 지난달과의 차이 → 나간 돈 구성(고정비·공동 생활비·용돈·저축) → 가장 많이 쓴 분류·가장 큰 지출 → 생활비 결과.
 * 자세한 분류·기록은 달력 모아 보기(그달 기간)로, 메모는 체크의 마무리로 넘긴다.
 */
export function MonthReportSheet({ month, open, onOpenChange }: { month: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, setMonth } = useData();
  const router = useRouter();
  const s = data.settings;
  const r = useMemo(() => monthReport(data, month), [data, month]);
  const label = monthLabel(month);
  const diff = r.prevSpent === null ? null : r.spent - r.prevSpent;
  const out = r.parts.reduce((a, x) => a + x.amount, 0);
  const go = (href: string) => {
    afterSheet(() => router.push(href));
    onOpenChange(false);
  };
  const top = r.topCategory;
  const topName = top ? (categoryName(data.categories, top.categoryId) ?? (top.owner === "joint" ? "분류 없음" : `${nameOf(s, top.owner)} 용돈`)) : "";

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`${label} 결산`}
      footer={
        <button
          type="button"
          className="btn block secondary"
          onClick={() => {
            setMonth(month);
            go("/check#month-close");
          }}
        >
          {label} 메모 남기기
        </button>
      }
    >
      <div className="report">
        <p className="hero-label">{label}에 쓴 돈</p>
        <p className="hero-amt">
          {num(r.spent)}
          <small>원</small>
        </p>
        <p className="report-sub">
          {diff === null ? `기록 ${r.count}건` : diff === 0 ? "지난달과 같아요" : (
            <>
              지난달보다 <b>{num(Math.abs(diff))}원</b> {diff > 0 ? "더" : "덜"} 썼어요 · 기록 {r.count}건
            </>
          )}
        </p>

        {r.parts.length > 0 && (
          <>
            <h3 className="sum-h">나간 돈 {num(out)}원</h3>
            <div className="rows">
              {r.parts.map((x) => (
                <div className="row catrow" key={x.key}>
                  <div style={{ minWidth: 0 }}>
                    <div className="t">{x.label}</div>
                    <Meter thin value={x.amount / Math.max(1, out)} label={`${x.label} ${num(x.amount)}원`} />
                  </div>
                  <div className="r">
                    <Money value={x.amount} />
                    <div className="s">{Math.round((x.amount / Math.max(1, out)) * 100)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {(top || r.biggest) && <h3 className="sum-h">눈에 띈 것</h3>}
        <div className="rows" style={{ ["--inset" as string]: "52px" }}>
          {top && (
            <div className="row">
              <CategoryIcon visual={top.categoryId ? categoryVisual(topName) : spendingVisual(data, { category_id: null, owner: top.owner })} />
              <div style={{ minWidth: 0 }}>
                <div className="t">가장 많이 쓴 분류 · {topName}</div>
                <div className="s">{top.count}건 · 쓴 돈의 {Math.round((top.amount / Math.max(1, r.spent)) * 100)}%</div>
              </div>
              <div className="r">
                <Money value={top.amount} />
              </div>
            </div>
          )}
          {r.biggest && (
            <div className="row">
              <CategoryIcon visual={spendingVisual(data, r.biggest)} />
              <div style={{ minWidth: 0 }}>
                <div className="t">가장 큰 지출 · {r.biggest.memo || "지출"}</div>
                <div className="s">{`${shortDate(r.biggest.date)} · ${r.biggest.owner === "joint" ? "공동" : `${nameOf(s, r.biggest.owner)} 용돈`}`}</div>
              </div>
              <div className="r">
                <Money value={r.biggest.amount} />
              </div>
            </div>
          )}
        </div>

        {r.living && (
          <>
            <h3 className="sum-h">공동 생활비</h3>
            <p className="report-living">
              예산 {num(r.living.budget)}원 중 {num(r.living.spent)}원 ·{" "}
              {r.living.left >= 0 ? <b className="pos">{num(r.living.left)}원 남겼어요</b> : <b className="neg">{num(-r.living.left)}원 넘었어요</b>}
            </p>
          </>
        )}

        <button type="button" className="link-btn" onClick={() => go(summaryHref({ from: r.period.start, to: r.period.last }))}>
          분류·기록 자세히 보기
        </button>
      </div>
    </Sheet>
  );
}
