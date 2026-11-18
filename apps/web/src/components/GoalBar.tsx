"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { num } from "@/lib/format";
import { Meter } from "./Meter";
import { useRevealOnce } from "./reveal";

/**
 * 모으는 돈의 목표 대비 진행 (docs/design-system/components/GoalBar).
 * 막대는 예산 막대와 같은 Meter(thin, accent 한 색). 목표를 넘으면 막대는 100%에서 멈추고 "목표 달성" 알약을 붙인다. 누르면 그 항목 시트를 연다.
 * 막대 아래 이정표 도장 넷(25·50·75·100%, 카카오뱅크 26주적금 도장 참고) — 지난 것은 accent 로 찍히고, 이 기기에서 처음 보는 도장은 한 번 튄다.
 */
const STAMPS = [25, 50, 75, 100];
const SEEN_KEY = "our-money-goal-stamps";

function readSeen(id: string): number {
  try {
    return (JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, number>)[id] ?? 0;
  } catch {
    return 0;
  }
}

export function GoalBar({ id, name, desc, saved, target, onOpen }: { id: string; name: string; desc: string; saved: number; target: number; onOpen: () => void }) {
  const grown = useRevealOnce("goals");
  const reached = target > 0 ? STAMPS.filter((p) => saved * 100 >= p * target).length : 0;
  // 지난번에 이 기기에서 본 도장 수 — 그보다 많으면 새로 찍힌 도장만 튄다
  const [seen] = useState(() => (typeof window === "undefined" ? reached : readSeen(id)));
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, number>;
      if (all[id] === reached) return;
      all[id] = reached;
      localStorage.setItem(SEEN_KEY, JSON.stringify(all));
    } catch {}
  }, [id, reached]);
  const next = STAMPS[reached];
  const toNext = next !== undefined ? Math.max(0, Math.ceil((next * target) / 100) - saved) : 0;
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
        <span className={`goal-bar${grown ? "" : " flat"}`} role="progressbar" aria-label={`${name} 모은 돈`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(saved, target)} aria-valuetext={`${num(target)}원 중 ${num(saved)}원, ${pct}%`}>
          <Meter thin value={ratio} />
        </span>
        {target > 0 && (
          <span className="goal-stamps" aria-label={`이정표 ${STAMPS.length}개 중 ${reached}개${next !== undefined ? `, 다음 ${next}%까지 ${num(toNext)}원` : ""}`}>
            {STAMPS.map((p, i) => (
              <span key={p} className={`stamp${i < reached ? " on" : ""}${i < reached && i >= seen ? " new" : ""}`} aria-hidden="true">
                {i < reached && <Check />}
                {p}%
              </span>
            ))}
            {next !== undefined && (
              <span className="stamp-next" aria-hidden="true">
                {next}%까지 {num(toNext)}원
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}
