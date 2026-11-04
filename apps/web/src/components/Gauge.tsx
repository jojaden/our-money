"use client";

import { useId, useLayoutEffect, useRef } from "react";

/**
 * 빛을 받은 튜브 게이지 — 테두리·몸통·가운데 빛 세 겹이 같은 값으로 함께 움직인다
 * (docs/design-system README "게이지와 막대"). 반원(half)은 홈 첫 카드, 270°(ring)는 작은 카드에 쓴다.
 */
type Pt = [number, number];
const ARC = {
  half: {
    box: "0 0 300 160",
    d: "M26 148 A124 124 0 0 1 274 148",
    // "오늘" 글자를 호 안쪽에 휘게 쓰는 길
    text: "M52 148 A98 98 0 0 1 248 148",
    w: [22, 20, 8],
    knob: [8, 3.5],
    mile: [4.5, 2],
    at: (p: number): Pt => {
      const a = Math.PI * (1 - p);
      return [150 + 124 * Math.cos(a), 148 - 124 * Math.sin(a)];
    },
  },
  ring: {
    box: "0 0 92 92",
    d: "M19.13 72.87 A38 38 0 1 1 72.87 72.87",
    text: null,
    w: [10, 8.5, 3.6],
    knob: [5.5, 2.5],
    mile: [2.6, 1.5],
    at: (p: number): Pt => {
      const a = ((135 + 270 * p) * Math.PI) / 180;
      return [46 + 38 * Math.cos(a), 46 + 38 * Math.sin(a)];
    },
  },
} as const;
export type ArcShape = keyof typeof ARC;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 채운 호와 끝 점을 비율 r(0–1)에 맞춘다 */
export function drawArc(fill: SVGGElement | null, knob: SVGCircleElement | null, shape: ArcShape, r: number) {
  const v = clamp01(r);
  fill?.style.setProperty("--off", String(100 - v * 100));
  if (knob) {
    const [x, y] = ARC[shape].at(v);
    knob.setAttribute("cx", x.toFixed(2));
    knob.setAttribute("cy", y.toFixed(2));
  }
}

/**
 * 튜브 호 그림. 채운 호(fill)와 끝 점(knob)은 ref 로 drawArc 가 옮긴다 — React 가 프레임마다 다시 그리지 않게.
 * mile: 이정표 자리(0–1, 오늘까지 예상). mileText 는 반원에서만 호를 따라 쓴다.
 */
export function TubeArc({
  shape,
  label,
  mile = null,
  mileText,
  fillRef,
  knobRef,
}: {
  shape: ArcShape;
  label: string;
  mile?: number | null;
  mileText?: string;
  fillRef: React.Ref<SVGGElement>;
  knobRef: React.Ref<SVGCircleElement>;
}) {
  const a = ARC[shape];
  const [rim, body, hi] = a.w;
  const textId = useId();
  const m = mile === null ? null : clamp01(mile);
  const at = m === null ? null : a.at(m);
  // 호 양 끝에서는 글자가 잘리므로 쓰지 않는다
  const textAt = a.text && mileText && m !== null && m > 0.08 && m < 0.92 ? m : null;
  return (
    <svg className={`tube ${shape}`} viewBox={a.box} role="img" aria-label={label}>
      {textAt !== null && (
        <defs>
          <path id={textId} d={a.text ?? undefined} />
        </defs>
      )}
      <path className="tr rim" strokeWidth={rim} d={a.d} />
      <path className="tr body" strokeWidth={body} d={a.d} />
      <path className="tr hi" strokeWidth={hi} d={a.d} />
      <g ref={fillRef} className="fl">
        <path className="rim" strokeWidth={rim} pathLength={100} d={a.d} />
        <path className="body" strokeWidth={body} pathLength={100} d={a.d} />
        <path className="hi" strokeWidth={hi} pathLength={100} d={a.d} />
      </g>
      {at && <circle className="mile" cx={at[0]} cy={at[1]} r={a.mile[0]} strokeWidth={a.mile[1]} />}
      {textAt !== null && (
        <text className="mile-t">
          <textPath href={`#${textId}`} startOffset={`${(textAt * 100).toFixed(1)}%`} textAnchor="middle">
            {mileText}
          </textPath>
        </text>
      )}
      <circle ref={knobRef} className="knob" r={a.knob[0]} strokeWidth={a.knob[1]} />
    </svg>
  );
}

// ease-out, ease-value 토큰과 같은 모양의 곡선 (숫자와 끝 점을 호와 같은 박자로 움직이려고 JS 로 계산)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
const easeValue = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const ms = (token: string, fallback: number) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(token)) || fallback;

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
    const t0 = performance.now();
    let raf = 0;
    drawRef.current(from);
    const step = (t: number) => {
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
