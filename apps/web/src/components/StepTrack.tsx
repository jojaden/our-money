"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { cssTimeMs } from "@/lib/motion";

/** 원으로 늘어놓을 수 있는 가장 많은 단계. 넘으면 진행선을 그리지 않는다 (docs/design-system/components/StepTrack) */
export const MAX_STEPS = 8;

/**
 * 체크포인트 진행선 — 끝낸 수만큼 왼쪽부터 체크 원과 이음선을 채운다.
 * 이음선은 CSS 전환으로 차오르고, 새로 끝낸 원만 한 번 튄다(처음 그릴 때는 튀지 않는다).
 */
export function StepTrack({ done, total }: { done: number; total: number }) {
  const el = useRef<HTMLDivElement>(null);
  const prev = useRef(done);
  useEffect(() => {
    const from = prev.current;
    prev.current = done;
    const root = el.current;
    if (!root || done <= from || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cs = getComputedStyle(root);
    const duration = cssTimeMs(cs.getPropertyValue("--dur-pop"), 560);
    const easing = cs.getPropertyValue("--ease-pop").trim() || "ease-out";
    root.querySelectorAll<HTMLElement>(".step").forEach((n, i) => {
      if (i >= from && i < done) n.animate([{ transform: "scale(0.8)" }, { transform: "scale(1)" }], { duration, easing });
    });
  }, [done]);

  return (
    <div ref={el} className="step-track" role="img" aria-label={`${total}건 중 ${done}건 끝남`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="step-wrap">
          {i > 0 && <span className={`step-bar ${i < done ? "done" : ""}`} />}
          <span className={`step ${i < done ? "done" : ""}`}>
            <Check aria-hidden="true" />
          </span>
        </span>
      ))}
    </div>
  );
}
