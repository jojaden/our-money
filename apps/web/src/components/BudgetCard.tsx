"use client";

import Link from "next/link";
import { useRef } from "react";
import { CircleAlert, TrendingDown, TrendingUp } from "lucide-react";
import type { LivingStatus } from "@/lib/calc";
import { PAY_KIND_LABEL } from "@/lib/types";
import { num } from "@/lib/format";
import { Meter, drawMeter, useTween } from "./Meter";

const KINDS = ["card", "cash", "transfer"] as const;

/**
 * 예산 하나의 남은 돈 — 숫자가 가장 크고, 그 아래 예산 대비 가로 막대, 그다음 상태·설명 (docs/design-system/components/BudgetCard).
 * 홈 첫 카드(공동 생활비)와 내 용돈 작은 카드가 같은 모양이고 크기만 다르다. 막대의 눈금은 오늘까지 써도 되는 선.
 * 막대·남은 돈은 한 값으로 같은 박자에 움직이고, 글 줄과 속도 알약은 바로 바뀐다.
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
  const fill = useRef<HTMLElement>(null);
  const cap = useRef<HTMLSpanElement>(null);
  const fig = useRef<HTMLSpanElement>(null);
  const { budget, spent, left, pace } = status;

  useTween(`budget-${bucket}`, [spent, budget], [0, budget], ([v, b]) => {
    const over = v > b;
    drawMeter(fill.current, b > 0 ? v / b : v > 0 ? 1 : 0);
    root.current?.toggleAttribute("data-over", over);
    if (cap.current) cap.current.textContent = over ? "예산 초과" : "남은 돈";
    if (fig.current) fig.current.textContent = num(Math.round(Math.abs(b - v)));
  });

  const kind = compact ? "compact" : "lead";
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
      <section className={`card budget ${kind} ${bucket} ${className}`} aria-labelledby={id}>
        {head}
        <p className="empty">{empty}</p>
      </section>
    );
  }

  const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const mile = pace !== null && budget > 0 ? pace / budget : null;
  const label = `예산의 ${pct}% 사용${mile !== null ? `, 오늘까지 예상 ${Math.round(mile * 100)}%` : ""}`;
  const daily =
    budget > 0 && left <= 0 ? (
      <p className="daily">이번 달 예산을 다 썼어요</p>
    ) : status.perDay !== null ? (
      <p className="daily">
        {compact ? "" : `남은 ${status.daysLeft}일, `}하루 <b>{num(status.perDay)}원</b>
        {compact ? "" : "씩 쓸 수 있어요"}
      </p>
    ) : null;

  return (
    <section ref={root} className={`card budget ${kind} ${bucket} ${className}`} aria-labelledby={id}>
      {head}
      <div className="budget-body">
        {/* 움직이는 숫자는 aria-hidden, 읽어 주는 글은 끝 값 그대로 */}
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
        <Meter fillRef={fill} mile={mile} mileText={compact ? undefined : "오늘"} label={label} />
        <p className="used">
          {num(budget)}원 중 {num(spent)}원 썼어요 · {pct}%
        </p>
        <div className="budget-foot">
          <PacePill status={status} />
          {daily}
        </div>
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
 * 결제수단 나눔 — 한 줄에 점 · 이름 · % 만 ("● 카드 88%  ● 현금 12%"). 바로 위 예산 막대와 겹쳐 보이지 않게 막대는 그리지 않고,
 * 금액은 위 "…중 …썼어요"에 이미 있어서 비중만 말한다. 0원인 수단은 빼고, 순서와 점 색은 카드·현금·계좌이체로 고정한다.
 */
function Kinds({ byKind }: { byKind: LivingStatus["byKind"] }) {
  const parts = KINDS.filter((k) => byKind[k] > 0);
  if (parts.length === 0) return null;
  const pct = shares(parts.map((k) => byKind[k]));
  return (
    <p className="kinds">
      <span className="sr-only">결제수단별: </span>
      {parts.map((k, i) => (
        <span key={k} className={`k-${k}`}>
          <i aria-hidden="true" />
          {PAY_KIND_LABEL[k]} <b>{pct[i] > 0 ? `${pct[i]}%` : "1% 미만"}</b>
        </span>
      ))}
    </p>
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

/** 할 일 진행 — 예산 막대와 같은 가로 막대 (숫자 "9 / 20 완료"는 쓰는 쪽이 더 크게 둔다) */
export function TaskMeter({ done, total }: { done: number; total: number }) {
  const fill = useRef<HTMLElement>(null);
  const max = Math.max(1, total);
  useTween("tasks", [done, max], [0, max], ([v, m]) => drawMeter(fill.current, v / m));
  return <Meter fillRef={fill} thin label={`${total}건 중 ${done}건 완료`} />;
}
