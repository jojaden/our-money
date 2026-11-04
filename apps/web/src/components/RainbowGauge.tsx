"use client";

import { useRef } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { num } from "@/lib/format";
import { TubeArc, drawArc, useTween, type ArcShape } from "./Gauge";

export interface Bucket {
  key: "living" | "allowance";
  name: string;
  budget: number;
  spent: number;
  /** 줄 아래 한 줄 (예: 두 사람 용돈 나눔) */
  note?: string;
}

const SHAPES: ArcShape[] = ["rb0", "rb1"];

/**
 * 가계부 머리 — 쓴 돈 버킷(생활비·용돈)을 겹친 반원 튜브로 (docs/design-system/components/RainbowGauge).
 * 고정비·저축은 지출 기록이 아니라 체크로만 알 수 있어 체크 화면이 맡는다. 가운데 금액 = 기록 목록 합계.
 * 호·끝 점·가운데 %·금액은 useTween 한 박자로 움직인다.
 */
export function RainbowGauge({ buckets, prev }: { buckets: Bucket[]; prev: { now: number; then: number } | null }) {
  const fills = [useRef<SVGGElement>(null), useRef<SVGGElement>(null)];
  const knobs = [useRef<SVGCircleElement>(null), useRef<SVGCircleElement>(null)];
  const pctEl = useRef<HTMLSpanElement>(null);
  const fig = useRef<HTMLSpanElement>(null);
  const budget = buckets.reduce((a, b) => a + b.budget, 0);
  const spent = buckets.reduce((a, b) => a + b.spent, 0);
  const pctOf = (v: number, b: number) => (b > 0 ? Math.round((v / b) * 100) : 0);

  useTween(
    "rainbow",
    buckets.map((b) => b.spent),
    buckets.map(() => 0),
    (v) => {
      v.forEach((x, i) => {
        const b = buckets[i].budget;
        drawArc(fills[i].current, knobs[i].current, SHAPES[i], b > 0 ? x / b : x > 0 ? 1 : 0);
      });
      const total = v.reduce((a, x) => a + x, 0);
      if (pctEl.current) pctEl.current.textContent = String(pctOf(total, budget));
      if (fig.current) fig.current.textContent = num(Math.round(total));
    },
  );

  const label = buckets.map((b) => `${b.name} ${pctOf(b.spent, b.budget)}%`).join(", ");
  const diff = prev && prev.then > 0 ? Math.round(((prev.now - prev.then) / prev.then) * 100) : null;
  return (
    <section className="card rainbow" aria-labelledby="rainbow-h">
      <h2 id="rainbow-h" className="sr-only">
        이번 달 쓴 돈
      </h2>
      <div className="sky">
        <div className="arc" role="img" aria-label={`예산의 ${pctOf(spent, budget)}% 사용: ${label}`}>
          {buckets.map((b, i) => (
            <div key={b.key} className={`layer ${b.key}`} data-over={b.spent > b.budget ? "" : undefined}>
              <TubeArc shape={SHAPES[i]} fillRef={fills[i]} knobRef={knobs[i]} />
            </div>
          ))}
          <div className="pct" aria-hidden="true">
            <b>
              <span ref={pctEl} />
              <span className="u">%</span>
            </b>
            <small>예산 사용</small>
          </div>
        </div>
      </div>
      <div className="panel">
        <p className="cap">이번 달 쓴 돈</p>
        <p className="fig">
          <span className="sr-only">{num(spent)}원</span>
          <span aria-hidden="true">
            <span ref={fig} />
            <span className="won">원</span>
          </span>
        </p>
        <p className="used">예산 {num(budget)}원</p>
        {diff !== null && (
          <p className={`pace-pill ${diff > 0 ? "warn" : "good"}`}>
            {diff > 0 ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
            {diff === 0 ? "생활비를 지난달 이맘때만큼 썼어요" : `생활비를 지난달 이맘때보다 ${Math.abs(diff)}% ${diff > 0 ? "더" : "덜"} 썼어요`}
          </p>
        )}
        <ul className="buckets">
          {buckets.map((b) => (
            <li key={b.key} className={b.key}>
              <i aria-hidden="true" />
              <div>
                <p className="n">{b.name}</p>
                <p className="v">
                  {num(b.spent)} / {num(b.budget)}원
                </p>
                {b.note && <p className="v">{b.note}</p>}
              </div>
              <b className={b.spent > b.budget ? "neg" : undefined}>{pctOf(b.spent, b.budget)}%</b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
