"use client";

import Link from "next/link";
import { useRef } from "react";
import { CircleAlert, TrendingDown, TrendingUp } from "lucide-react";
import type { LivingStatus } from "@/lib/calc";
import { PAY_KIND_LABEL } from "@/lib/types";
import { num } from "@/lib/format";
import { TubeArc, drawArc, useTween } from "./Gauge";

const KINDS = ["card", "cash", "transfer"] as const;

/**
 * 예산 하나의 남은 돈 — 답 숫자 하나와 튜브 게이지 (docs/design-system/components/BudgetCard).
 * 홈 첫 카드(공동 생활비)는 반원 호 아래로 하늘색이 흰 바탕에 스며드는 큰 카드, 내 용돈은 270° 게이지의 작은 카드.
 * 호·끝 점·%·남은 돈은 한 값으로 같은 박자에 움직이고, 글 줄과 속도 알약은 바로 바뀐다.
 */
export function BudgetCard({
  id,
  title,
  status,
  bucket,
  link,
  compact = false,
  className = "",
  empty,
}: {
  id: string;
  title: React.ReactNode;
  status: LivingStatus;
  bucket: "living" | "allowance";
  link?: { href: string; label: string };
  compact?: boolean;
  className?: string;
  empty?: React.ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const fill = useRef<SVGGElement>(null);
  const knob = useRef<SVGCircleElement>(null);
  const pctEl = useRef<HTMLSpanElement>(null);
  const cap = useRef<HTMLSpanElement>(null);
  const fig = useRef<HTMLSpanElement>(null);
  const { budget, spent, left, pace } = status;
  const shape = compact ? "ring" : "half";

  useTween(`budget-${bucket}`, [spent, budget], [0, budget], ([v, b]) => {
    const over = v > b;
    drawArc(fill.current, knob.current, shape, b > 0 ? v / b : v > 0 ? 1 : 0);
    root.current?.toggleAttribute("data-over", over);
    if (pctEl.current) pctEl.current.textContent = String(b > 0 ? Math.round((v / b) * 100) : 0);
    if (cap.current) cap.current.textContent = over ? "예산 초과" : "남은 돈";
    if (fig.current) fig.current.textContent = num(Math.round(Math.abs(b - v)));
  });

  const head = (
    <div className="budget-head">
      <h2 id={id}>{title}</h2>
      {link && (
        <Link className="aside" href={link.href}>
          {link.label}
        </Link>
      )}
    </div>
  );
  if (budget === 0 && spent === 0 && empty) {
    return (
      <section className={`card budget ${compact ? "compact" : "lead"} ${bucket} ${className}`} aria-labelledby={id}>
        {head}
        <p className="empty">{empty}</p>
      </section>
    );
  }

  const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const mile = pace !== null && budget > 0 ? pace / budget : null;
  const label = `예산의 ${pct}% 사용${mile !== null ? `, 오늘까지 예상 ${Math.round(mile * 100)}%` : ""}`;
  const gauge = (
    <>
      <TubeArc shape={shape} label={label} mile={mile} mileText="오늘" fillRef={fill} knobRef={knob} />
      <div className="pct" aria-hidden="true">
        <b>
          <span ref={pctEl} />
          <span className="u">%</span>
        </b>
        <small>사용</small>
      </div>
    </>
  );
  // 움직이는 숫자는 aria-hidden, 읽어 주는 글은 끝 값 그대로
  const figure = (
    <>
      <p className="cap">
        <span className="sr-only">{left < 0 ? "예산 초과" : "남은 돈"}</span>
        <span ref={cap} aria-hidden="true" />
      </p>
      <p className="fig">
        <span className="sr-only">{num(Math.abs(left))}원</span>
        <span aria-hidden="true">
          <span ref={fig} />
          <span className="won">원</span>
        </span>
      </p>
      <p className="used">
        {num(budget)}원 중 {num(spent)}원 썼어요
      </p>
    </>
  );
  const daily =
    budget > 0 && left <= 0 ? (
      <p className="daily">이번 달 예산을 다 썼어요</p>
    ) : status.perDay !== null ? (
      <p className="daily">
        {compact ? "" : `남은 ${status.daysLeft}일, `}하루 <b>{num(status.perDay)}원</b>
        {compact ? "" : "씩 쓸 수 있어요"}
      </p>
    ) : null;

  if (compact) {
    return (
      <section ref={root} className={`card budget compact ${bucket} ${className}`} aria-labelledby={id}>
        {head}
        <div className="budget-body">
          <div style={{ minWidth: 0 }}>{figure}</div>
          <div className="mini">{gauge}</div>
        </div>
        <div className="budget-foot">
          <PacePill status={status} />
          {daily}
        </div>
        {KINDS.some((k) => status.byKind[k] > 0) && (
          <p className="kinds-line">
            {KINDS.filter((k) => status.byKind[k] > 0)
              .map((k) => `${PAY_KIND_LABEL[k]} ${num(status.byKind[k])}원`)
              .join(" · ")}
          </p>
        )}
      </section>
    );
  }
  return (
    <section ref={root} className={`card budget lead ${bucket} ${className}`} aria-labelledby={id}>
      <div className="sky">
        {head}
        <div className="arc">{gauge}</div>
      </div>
      <div className="panel">
        {figure}
        <PacePill status={status} />
        {daily}
        <Kinds byKind={status.byKind} />
      </div>
    </section>
  );
}

/** 합이 100이 되게 반올림 (나머지가 큰 쪽부터 1씩) */
function shares(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  const raw = values.map((v) => (v / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  for (const i of values.map((_, i) => i).sort((a, b) => raw[b] - out[b] - (raw[a] - out[a]))) if (left-- > 0) out[i]++;
  return out;
}

/**
 * 결제수단 나눔 — 비율 막대 한 줄과 그 아래 목록(점·이름·%·금액). 토스 소비 분석처럼 한눈에 비중을 보고 줄에서 금액을 읽는다.
 * 0원인 수단은 빼고, 순서와 색은 카드·현금·계좌이체로 고정한다(금액 순으로 다시 칠하지 않는다).
 */
function Kinds({ byKind }: { byKind: LivingStatus["byKind"] }) {
  const parts = KINDS.filter((k) => byKind[k] > 0);
  if (parts.length === 0) return null;
  const pct = shares(parts.map((k) => byKind[k]));
  return (
    <div className="kinds">
      <div className="kinds-bar" aria-hidden="true">
        {parts.map((k) => (
          <i key={k} className={`k-${k}`} style={{ flexGrow: byKind[k] }} />
        ))}
      </div>
      <ul className="buckets" aria-label="결제수단별">
        {parts.map((k, i) => (
          <li key={k} className={`k-${k}`}>
            <i aria-hidden="true" />
            <span className="n">
              {PAY_KIND_LABEL[k]} <span className="v">{pct[i] > 0 ? `${pct[i]}%` : "1% 미만"}</span>
            </span>
            <b>{num(byKind[k])}원</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 속도 알약 — 예상보다 덜 씀 / 더 씀 / 예산 초과. 꾸짖지 않고 사실만 말한다 */
function PacePill({ status }: { status: LivingStatus }) {
  if (status.budget > 0 && status.left < 0) {
    return (
      <p className="pace-pill bad">
        <CircleAlert aria-hidden="true" />
        예산을 {num(-status.left)}원 넘었어요
      </p>
    );
  }
  if (status.pace === null) return null;
  const diff = status.spent - status.pace;
  return (
    <p className={`pace-pill ${diff > 0 ? "warn" : "good"}`}>
      {diff > 0 ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
      예상보다 {num(Math.abs(diff))}원 {diff > 0 ? "더" : "덜"} 썼어요
    </p>
  );
}

/** 할 일 진행 — 작은 카드와 같은 270° 튜브, 가운데 % */
export function TaskGauge({ done, total }: { done: number; total: number }) {
  const fill = useRef<SVGGElement>(null);
  const knob = useRef<SVGCircleElement>(null);
  const pctEl = useRef<HTMLSpanElement>(null);
  const max = Math.max(1, total);
  useTween("tasks", [done, max], [0, max], ([v, m]) => {
    drawArc(fill.current, knob.current, "ring", v / m);
    if (pctEl.current) pctEl.current.textContent = String(Math.round((v / m) * 100));
  });
  return (
    <div className="task-gauge">
      <TubeArc shape="ring" label={`${total}건 중 ${done}건 완료`} fillRef={fill} knobRef={knob} />
      <div className="pct" aria-hidden="true">
        <b>
          <span ref={pctEl} />
          <span className="u">%</span>
        </b>
      </div>
    </div>
  );
}
