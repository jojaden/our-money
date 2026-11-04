"use client";

import { useId, useLayoutEffect, useRef } from "react";

/**
 * 빛을 머금은 튜브 게이지 (docs/design-system README "게이지와 막대").
 * 채운 호는 옅은 시작에서 진한 끝(지금 자리)으로 번지고, 굵기 방향으로 은은한 입체(안쪽 그늘·바깥쪽 빛)를 덧씌우며,
 * 둘레에 같은 색 빛이 돈다. 끝 점은 테두리 없는 흰 점. 반원(half)은 홈 첫 카드, 270°(ring)는 작은 카드에 쓴다.
 */
type Pt = [number, number];
const ARC = {
  half: {
    box: "0 0 300 160",
    d: "M26 148 A124 124 0 0 1 274 148",
    // "오늘" 글자를 호 안쪽에 휘게 쓰는 길
    text: "M52 148 A98 98 0 0 1 248 148",
    c: [150, 148, 124],
    w: 22,
    halo: 8,
    knob: 6.5,
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
    c: [46, 46, 38],
    w: 10,
    halo: 4,
    knob: 3,
    mile: [2.6, 1.5],
    at: (p: number): Pt => {
      const a = ((135 + 270 * p) * Math.PI) / 180;
      return [46 + 38 * Math.cos(a), 46 + 38 * Math.sin(a)];
    },
  },
} as const;
export type ArcShape = keyof typeof ARC;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 채운 호, 길이 그라데이션 끝, 끝 점을 비율 r(0–1)에 맞춘다 */
export function drawArc(fill: SVGGElement | null, knob: SVGCircleElement | null, shape: ArcShape, r: number) {
  const v = clamp01(r);
  const [x, y] = ARC[shape].at(v);
  if (fill) {
    fill.style.setProperty("--off", String(100 - v * 100));
    // 그라데이션은 채운 길이 안에서 시작 → 지금 자리 (길이 0 이면 그라데이션이 사라지므로 조금은 남긴다)
    const [gx, gy] = ARC[shape].at(Math.max(v, 0.02));
    const lg = fill.querySelector("linearGradient");
    lg?.setAttribute("x2", gx.toFixed(2));
    lg?.setAttribute("y2", gy.toFixed(2));
  }
  knob?.setAttribute("cx", x.toFixed(2));
  knob?.setAttribute("cy", y.toFixed(2));
}

/** 굵기 방향 원형 그라데이션의 자리(0–1): 안쪽 가장자리, 그늘 끝, 빛, 빛 끝 */
function bands(shape: ArcShape) {
  const { c, w } = ARC[shape];
  const inR = c[2] - w / 2;
  const outR = c[2] + w / 2;
  return { outR, at: [0, 0.3, 0.6, 0.84].map((f) => ((inR + w * f) / outR).toFixed(4)) };
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
  const id = useId();
  const m = mile === null ? null : clamp01(mile);
  const at = m === null ? null : a.at(m);
  // 호 양 끝에서는 글자가 잘리므로 쓰지 않는다
  const textAt = a.text && mileText && m !== null && m > 0.08 && m < 0.92 ? m : null;
  const [sx, sy] = a.at(0);
  const { outR, at: b } = bands(shape);
  const radial = { gradientUnits: "userSpaceOnUse" as const, cx: a.c[0], cy: a.c[1], r: outR };
  return (
    <svg className={`tube ${shape}`} viewBox={a.box} role="img" aria-label={label}>
      <defs>
        {textAt !== null && <path id={`${id}t`} d={a.text ?? undefined} />}
        {/* 빈자리: 흰 라일락 튜브 */}
        <radialGradient id={`${id}k`} {...radial}>
          <stop offset={b[0]} className="tk-edge" />
          <stop offset={b[1]} className="tk-body" />
          <stop offset={b[2]} className="tk-light" />
          <stop offset={b[3]} className="tk-body" />
          <stop offset={1} className="tk-rim" />
        </radialGradient>
        {/* 입체: 색과 상관없이 덧씌우는 반투명 그늘과 빛 */}
        <radialGradient id={`${id}v`} {...radial}>
          <stop offset={b[0]} className="vo-shade" stopOpacity={0.22} />
          <stop offset={b[1]} className="vo-shade" stopOpacity={0} />
          <stop offset={b[2]} className="vo-light" stopOpacity={0.32} />
          <stop offset={b[3]} className="vo-light" stopOpacity={0} />
          <stop offset={1} className="vo-shade" stopOpacity={0.14} />
        </radialGradient>
      </defs>
      <path className="track" stroke={`url(#${id}k)`} strokeWidth={a.w} d={a.d} />
      <g ref={fillRef} className="fl">
        <linearGradient id={`${id}l`} gradientUnits="userSpaceOnUse" x1={sx} y1={sy} x2={sx} y2={sy}>
          <stop offset={0} className="lg-from" />
          <stop offset={1} className="lg-to" />
        </linearGradient>
        <path className="halo" stroke={`url(#${id}l)`} strokeWidth={a.w + a.halo} pathLength={100} d={a.d} />
        <path stroke={`url(#${id}l)`} strokeWidth={a.w} pathLength={100} d={a.d} />
        <path stroke={`url(#${id}v)`} strokeWidth={a.w} pathLength={100} d={a.d} />
      </g>
      {at && <circle className="mile" cx={at[0]} cy={at[1]} r={a.mile[0]} strokeWidth={a.mile[1]} />}
      {textAt !== null && (
        <text className="mile-t">
          <textPath href={`#${id}t`} startOffset={`${(textAt * 100).toFixed(1)}%`} textAnchor="middle">
            {mileText}
          </textPath>
        </text>
      )}
      <circle ref={knobRef} className="knob" r={a.knob} />
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
