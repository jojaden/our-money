"use client";

import { useLayoutEffect, useRef } from "react";
import { cssTimeMs } from "@/lib/motion";

/**
 * 가로 막대 (docs/design-system README "숫자와 막대"). 같은 뜻은 이 모양 하나로 그린다:
 * 예산 대비 쓴 돈(눈금 = 오늘까지 써도 되는 선이나 분류 예산), 할 일 진행, 모으는 목표.
 * 버튼 안에도 들어가도록 span 으로 그린다. 채움은 accent 한 색, 넘치면 negative.
 * 채움은 막대 폭만 한 둥근 띠를 translateX 로 밀어 넣는다 — 레이아웃 없이 합성만 해서 움직임이 싸고, 오른쪽 끝도 둥글다.
 */
export function Meter({
  fillRef,
  value,
  over = false,
  mile = null,
  mileText,
  label,
  thin = false,
}: {
  /** JS 로 움직일 때(useTween + drawMeter). 없으면 value 로 그린다 */
  fillRef?: React.Ref<HTMLElement>;
  /** 정해진 비율(0–1). CSS 전환으로 옮기고, 조상에 .flat 이 있으면 빈 막대에서 자란다 */
  value?: number;
  /** 넘침: 채움을 negative 로 */
  over?: boolean;
  /** 이정표 자리(0–1): 오늘까지 써도 되는 선 */
  mile?: number | null;
  mileText?: string;
  /** 없으면 읽지 않는 그림이다(옆 글이 같은 값을 말한다) */
  label?: string;
  thin?: boolean;
}) {
  return (
    <span className={`meter${thin ? " thin" : ""}${over ? " over" : ""}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <i className="track">
        {value === undefined ? <i className="fill" ref={fillRef} /> : <i className="fill css" style={{ transform: shift(value) }} />}
      </i>
      {mile !== null && (
        <i className="mile" style={{ left: `${Math.min(1, Math.max(0, mile)) * 100}%` }}>
          {mileText && <span>{mileText}</span>}
        </i>
      )}
    </span>
  );
}

/** 막대를 비율 r(0–1)만큼 채운다 */
export function drawMeter(fill: HTMLElement | null, r: number) {
  if (fill) fill.style.transform = shift(r);
}

const shift = (r: number) => `translateX(${((Math.min(1, Math.max(0, r)) - 1) * 100).toFixed(2)}%)`;

// ease-out, ease-value 토큰과 같은 모양의 곡선 (숫자와 끝 점을 호와 같은 박자로 움직이려고 JS 로 계산)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
const easeValue = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const ms = (token: string, fallback: number) => cssTimeMs(getComputedStyle(document.documentElement).getPropertyValue(token), fallback);

/** 키마다 마지막으로 보인 값 — 탭을 다시 열거나 달을 넘겨도 0 부터 다시 그리지 않는다 */
const shown = new Map<string, number[]>();

/**
 * 값 여럿을 한 박자로 옮긴다. 처음 보는 key 는 start 에서 dur-ring·ease-out 으로,
 * 그다음부터는 마지막으로 보인 값에서 dur-value·ease-value 로 이어 간다(움직이는 중에 바뀌면 그 자리에서 다시 출발).
 * draw 가 DOM 을 직접 바꾸므로 React 상태를 프레임마다 바꾸지 않는다.
 */
export function useTween(key: string, to: number[], start: number[], draw: (v: number[]) => void) {
  const drawRef = useRef(draw);
  useLayoutEffect(() => {
    drawRef.current = draw;
  });
  const target = to.join(",");
  const first = start.join(",");
  useLayoutEffect(() => {
    const goal = target.split(",").map(Number);
    const prev = shown.get(key);
    const from = prev ?? first.split(",").map(Number);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from.every((v, i) => v === goal[i])) {
      shown.set(key, goal);
      drawRef.current(goal);
      return;
    }
    const dur = prev ? ms("--dur-value", 800) : ms("--dur-ring", 1100);
    const ease = prev ? easeValue : easeOut;
    let t0: number | null = null;
    let raf = 0;
    drawRef.current(from);
    const step = (t: number) => {
      t0 ??= t;
      const p = Math.min(1, (t - t0) / dur);
      const e = ease(p);
      const v = from.map((f, i) => f + (goal[i] - f) * e);
      shown.set(key, v);
      drawRef.current(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, target, first]);
}
