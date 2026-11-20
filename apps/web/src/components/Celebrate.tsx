"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight } from "lucide-react";
import { haptic } from "@/lib/native";
import { useLayer } from "./ui";

const SEEN = "om-celebrated";
const BEADS = Array.from({ length: 16 }, (_, i) => {
  // 매번 같은 흩어짐 — 렌더 중 Math.random 을 쓰지 않으려고 각도·거리를 번호로 정한다
  const j = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  const a = (i / 16) * Math.PI * 2 + j * 0.4;
  const r = 120 + j * 90;
  return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r), d: 300 + Math.round(j * 160), s: 10 + Math.round(j * 8) };
});

/**
 * 100% 축하 — 그달 체크를 모두 끝낸 순간 (docs/design-system/components/Celebrate). 띄우는 때는 CelebrateWatch 가 정한다.
 * - play: 직접 끝낸 순간마다 1씩 늘린다 → 그때마다 띄운다(본 적 있어도)
 * - done: 앱을 열었을 때 이미 다 끝나 있으면(상대가 끝냈을 때 등) 이 기기에서 그달 한 번만
 * 아무 곳이나(여백) 누르거나 Esc 로 닫히고 원래 화면으로 돌아간다. 날짜 창(시트) 위에 떴으면 그 누르기·Esc 가 시트까지 닫지 않는다.
 * 페이지 틀(main)은 넘기기 움직임 때문에 transform 을 가져서, 위쪽 막대·캡슐보다 위에 덮으려면 body 에 그린다.
 */
export function Celebrate({
  done,
  play = 0,
  finished,
  month,
  label,
  chips,
  next,
}: {
  /** 앱을 열었을 때 이미 이번 달을 모두 끝냈나 (이 기기에서 그달 한 번만 띄운다) */
  done: boolean;
  /** 직접 끝낸 순간마다 늘어나는 수 — 늘면 띄운다 */
  play?: number;
  /** 지금도 그달을 다 끝낸 상태인가 — 체크 저장이 거절돼(OM409 등) 다시 읽은 내용에 남은 일이 생기면 false */
  finished: boolean;
  month: string;
  label: string;
  chips: { name: string; count: number }[];
  next: { title: string; sub: string; href: string; onGo: () => void };
}) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const n = useRef<HTMLSpanElement>(null);
  // 떠 있는 동안 뒤는 inert, 닫으면 띄우기 전 초점 자리로 (마지막 체크로 줄이 빠졌으면 목록이 옮겨 둔 자리)
  useLayer(open, root);
  // 체크는 화면에 먼저 반영하고 저장하므로, 저장이 거절되면 "다 끝냄"이 거둬진다 — 띄우기 전이면 띄우지 않고, 떠 있으면 닫아 오류 알림을 덮지 않는다
  const still = useRef(finished);
  useEffect(() => {
    still.current = finished;
  }, [finished]);
  if (!finished && open && !leaving) setLeaving(true);

  useEffect(() => {
    if (!done) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN);
    } catch {}
    if (seen === month) return;
    // 마지막 체크 원이 튀는 것을 본 다음에 띄운다
    const t = setTimeout(() => {
      if (!still.current) return;
      try {
        localStorage.setItem(SEEN, month);
      } catch {}
      setLeaving(false);
      setOpen(true);
    }, 450);
    return () => clearTimeout(t);
  }, [done, month]);

  // 직접 끝낸 순간: 본 적 있어도 띄운다 (마지막 체크 원이 튀는 것을 본 다음에)
  useEffect(() => {
    if (!play) return;
    const t = setTimeout(() => {
      if (!still.current) return;
      try {
        localStorage.setItem(SEEN, month);
      } catch {}
      setLeaving(false);
      setOpen(true);
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 끝낸 순간(play)에만
  }, [play]);

  useEffect(() => {
    if (!open) return;
    const el = root.current;
    el?.focus();
    // 시트(Radix)는 document 에서 바깥 누르기·Esc 를 듣는다 — 축하 화면에서 끝내 시트가 함께 닫히지 않게
    const stop = (e: Event) => e.stopPropagation();
    el?.addEventListener("pointerdown", stop);
    const close = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setLeaving(true);
    };
    addEventListener("keydown", close, true);
    const off = () => {
      el?.removeEventListener("pointerdown", stop);
      removeEventListener("keydown", close, true);
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return off;
    // 300ms 에 숫자가 튀며 1.3초 동안 0→100 (4제곱 감속), 같은 순간 짧은 진동
    let raf = 0;
    if (n.current) n.current.textContent = "0";
    const t = setTimeout(() => {
      haptic(15);
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / 1300);
        if (n.current) n.current.textContent = String(Math.round(100 * (1 - Math.pow(1 - p, 4))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, 300);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
      off();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div
      ref={root}
      className={`celebrate ${leaving ? "leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebrate-h"
      tabIndex={-1}
      onClick={() => setLeaving(true)}
      onAnimationEnd={(e) => e.target === e.currentTarget && leaving && setOpen(false)}
    >
      <div className="bloom" aria-hidden="true" />
      <div className="rays" aria-hidden="true" />
      <div className="spark" aria-hidden="true" />
      <div aria-hidden="true">
        {BEADS.map((b, i) => (
          <i key={i} className="bead" style={{ ["--x" as string]: `${b.x}px`, ["--y" as string]: `${b.y}px`, ["--d" as string]: `${b.d}ms`, width: b.s, height: b.s }} />
        ))}
      </div>
      <div className="center">
        <p className="big" aria-hidden="true">
          <span ref={n}>100</span>
          <small>%</small>
        </p>
        <h2 id="celebrate-h">{label} 할 일을 모두 끝냈어요</h2>
        <ul className="done-chips">
          {chips.slice(0, 3).map((c) => (
            <li key={c.name}>
              {c.name} <b>{c.count}</b>건
            </li>
          ))}
        </ul>
      </div>
      <Link className="next" href={next.href} onClick={next.onGo}>
        <span>
          <strong>{next.title}</strong>
          <span>{next.sub}</span>
        </span>
        <ArrowRight aria-hidden="true" />
      </Link>
    </div>,
    document.body,
  );
}
