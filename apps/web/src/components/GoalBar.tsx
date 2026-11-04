"use client";

import { num } from "@/lib/format";
import { useRevealOnce } from "./reveal";

/**
 * 모으는 돈의 목표 대비 진행 (docs/design-system/components/GoalBar).
 * 목표를 넘으면 막대는 100%에서 멈추고 "목표 달성" 알약을 붙인다. 누르면 그 항목 시트를 연다.
 */
export function GoalBar({ name, desc, saved, target, onOpen }: { name: string; desc: string; saved: number; target: number; onOpen: () => void }) {
  const grown = useRevealOnce("goals");
  const ratio = target > 0 ? Math.min(1, saved / target) : 0;
  const pct = target > 0 ? Math.floor((saved / target) * 100) : 0;
  const done = target > 0 && saved >= target;
  return (
    <button type="button" className="card goal-card" onClick={onOpen}>
      <span className="goal-title">
        <strong>{name}</strong>
        <small>{desc}</small>
      </span>
      <span className="goal">
        <span className="goal-head">
          <span>목표</span>
          <b>{num(target)}원</b>
        </span>
        <span className="goal-now">
          {num(saved)}
          <span>
            {" "}
            / {num(target)} · {pct}%
          </span>
          {done && <span className="pill positive">목표 달성</span>}
        </span>
        <span className="goal-bar" role="progressbar" aria-label={`${name} 모은 돈`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(saved, target)} aria-valuetext={`${num(target)}원 중 ${num(saved)}원, ${pct}%`}>
          <i style={{ width: grown ? `${ratio * 100}%` : 0 }} />
        </span>
      </span>
    </button>
  );
}
