"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { Mark } from "@/lib/calendar";
import { addDays } from "@/lib/calendar";
import { dateWithDay, num } from "@/lib/format";
import { still, tokens } from "./Morph";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const FOLD_KEY = "our-money-cal-folded";

/** 칸 안의 짧은 금액: 8,400 / 3.2만 / 120만 */
function short(n: number): string {
  if (n < 10_000) return num(n);
  const man = n / 10_000;
  return `${man >= 100 || Number.isInteger(man) ? Math.round(man) : man.toFixed(1)}만`;
}

/**
 * 달력 — 카드로 감싸지 않고 화면 너비를 다 쓴다. 날짜마다 일정 이름(입력한 사람 색)·쓴 돈·돈 일의 점. 아래 손잡이를 누르거나 위로 밀면 고른 날의 한 주로 접힌다.
 * 접을 때는 고른 주가 제자리에 남고 나머지 줄이 접혀 들어간다(높이·위치를 dur-tab·ease-drawer 로).
 * 접힌 동안 좌우로 밀면 주가 넘어가고(달을 넘으면 그 달로), 펼치면 지금처럼 달이 넘어간다. 접힘은 이 기기에 기억한다.
 */
export function CalendarCard({
  month,
  cells,
  marks,
  spent,
  day,
  today,
  onPick,
}: {
  month: string;
  cells: string[];
  marks: Map<string, Mark[]>;
  spent: Map<string, number>;
  day: string;
  today: string;
  /** 그 달 밖이면 그 달로 넘어간다. 주 스와이프는 날짜 패널을 열지 않는다. */
  onPick: (d: string, openDay: boolean) => void;
}) {
  const inMonth = (d: string) => d.slice(0, 7) === month;
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(FOLD_KEY) === "1";
    } catch {
      return false;
    }
  });
  const clip = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const swiped = useRef<1 | -1 | 0>(0);
  const runs = useRef<Animation[]>([]);
  const week = Math.max(0, Math.floor(cells.indexOf(day) / 7));

  const fold = (v: boolean) => {
    setFolded(v);
    try {
      localStorage.setItem(FOLD_KEY, v ? "1" : "0");
    } catch {}
  };

  // 접기·펼치기·주 바꾸기: 보이는 높이와 달력 위치를 옮긴다. 그릴 때마다 맞추고(금액이 늦게 와서 줄 높이가 바뀌어도),
  // 바뀐 것이 있으면 지금 보이는 자리에서 이어 움직인다. 처음 그릴 때와 움직임 줄이기면 바로
  useLayoutEffect(() => {
    const c = clip.current;
    const g = grid.current;
    const row = g?.children[week * 7] as HTMLElement | undefined;
    if (!c || !g || !row) return;
    const from = c.getBoundingClientRect().height;
    const prev = new DOMMatrix(getComputedStyle(g).transform).m42;
    for (const a of runs.current) a.cancel();
    runs.current = [];
    const to = folded ? row.offsetHeight : g.offsetHeight;
    const y = folded ? -row.offsetTop : 0;
    c.style.height = folded ? `${to}px` : "";
    g.style.transform = y ? `translateY(${y}px)` : "";
    const dir = swiped.current;
    swiped.current = 0;
    if (still() || !c.dataset.ready) {
      c.dataset.ready = "1";
      return;
    }
    const t = tokens();
    if (dir) {
      // 주를 넘기면 위아래가 아니라 민 쪽에서 들어온다
      runs.current.push(c.animate([{ opacity: 0, transform: `translateX(${28 * dir}px)` }, { opacity: 1, transform: "none" }], { duration: t.move, easing: t.drawer }));
      return;
    }
    if (Math.abs(from - to) > 1) runs.current.push(c.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: t.move, easing: t.drawer }));
    if (Math.abs(prev - y) > 1) runs.current.push(g.animate([{ transform: `translateY(${prev}px)` }, { transform: `translateY(${y}px)` }], { duration: t.move, easing: t.drawer }));
  });

  // 접힌 동안 좌우로 밀기 → 한 주 앞뒤. 손가락을 따라가다 충분히 끌거나 빠르게 튕기면 넘어간다
  const g0 = useRef<{ x: number; y: number; t: number; id: number; lock: "x" | "y" | null; dx: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (!folded || e.pointerType === "mouse") return;
    g0.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, lock: null, dx: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    const s = g0.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.lock) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      s.lock = Math.abs(dx) > Math.abs(dy) * 1.3 ? "x" : "y";
      if (s.lock === "x") (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (s.lock !== "x" || !clip.current) return;
    s.dx = dx;
    const w = clip.current.offsetWidth || 360;
    const r = (dx * w * 0.55) / (w + 0.55 * Math.abs(dx));
    Object.assign(clip.current.style, { transition: "none", transform: `translateX(${r}px)`, opacity: String(1 - Math.min(0.35, Math.abs(r) / w)) });
  };
  const onUp = (e: React.PointerEvent) => {
    const s = g0.current;
    g0.current = null;
    if (!s || s.id !== e.pointerId || s.lock !== "x" || !clip.current) return;
    const v = s.dx / Math.max(1, performance.now() - s.t);
    if (Math.abs(s.dx) > 60 || Math.abs(v) > 0.45) {
      Object.assign(clip.current.style, { transition: "", transform: "", opacity: "" });
      const dir = s.dx < 0 ? 1 : -1;
      swiped.current = dir;
      onPick(addDays(day, 7 * dir), false);
    } else {
      Object.assign(clip.current.style, { transition: "transform var(--dur-tab) var(--ease-drawer), opacity 300ms ease", transform: "", opacity: "" });
    }
  };

  // 손잡이: 누르면 바꾸고, 위로 밀면 접고 아래로 밀면 편다 (민 뒤 따라오는 클릭은 건너뛴다)
  const h0 = useRef<{ y: number; id: number } | null>(null);
  const dragged = useRef(false);

  return (
    <div className={`cal ${folded ? "folded" : ""}`}>
      <div className="cal-week" aria-hidden="true">
        {WEEK.map((w, i) => (
          <span key={w} className={i === 0 ? "sun" : i === 6 ? "sat" : ""}>
            {w}
          </span>
        ))}
      </div>
      {/* 접힌 동안은 좌우로 밀어도 달이 아니라 주가 넘어간다 */}
      <div
        ref={clip}
        className="cal-clip"
        data-no-swipe={folded ? "" : undefined}
        style={{ touchAction: folded ? "pan-y" : undefined }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div ref={grid} className="cal-grid" role="grid" aria-label={`${Number(month.slice(5))}월`}>
          {cells.map((d, i) => {
            const ms = marks.get(d) ?? [];
            const events = ms.filter((m) => m.event);
            const kinds = [...new Set(ms.filter((m) => !m.event).map((m) => (m.kind === "payday" ? `k-payday ${m.owner}` : `k-${m.kind}`)))].slice(0, 3);
            const amount = spent.get(d) ?? 0;
            const label = [dateWithDay(d), amount ? `쓴 돈 ${num(amount)}원` : "", ...ms.map((m) => m.title)].filter(Boolean).join(", ");
            const hidden = folded && Math.floor(i / 7) !== week;
            return (
              <button
                key={d}
                type="button"
                className={`cal-day ${inMonth(d) ? "" : "out"} ${d === today ? "today" : ""} ${d === day ? "picked" : ""} ${i % 7 === 0 ? "sun" : i % 7 === 6 ? "sat" : ""}`}
                aria-label={label}
                aria-pressed={d === day}
                aria-hidden={hidden || undefined}
                tabIndex={hidden ? -1 : undefined}
                onClick={() => onPick(d, true)}
              >
                <span className="n">{Number(d.slice(8))}</span>
                <span className="cal-events" aria-hidden="true">
                  {events.slice(0, 3).map((m) => <span className={`cal-event ${m.event!.created_by ?? ""}`} key={m.event!.id}>{m.title}</span>)}
                  {events.length > 3 && <span className="cal-more">+{events.length - 3}개</span>}
                </span>
                {amount > 0 && <span className="amt">{short(amount)}</span>}
                {kinds.length > 0 && (
                  <span className="dots" aria-hidden="true">
                    {kinds.map((k) => (
                      <i key={k} className={k} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        className="cal-fold"
        aria-expanded={!folded}
        aria-label={folded ? "달력 펼치기" : "한 주로 접기"}
        onClick={() => {
          if (dragged.current) dragged.current = false;
          else fold(!folded);
        }}
        onPointerDown={(e) => {
          dragged.current = false;
          h0.current = { y: e.clientY, id: e.pointerId };
        }}
        onPointerUp={(e) => {
          const s = h0.current;
          h0.current = null;
          if (!s || s.id !== e.pointerId || Math.abs(e.clientY - s.y) <= 16) return;
          dragged.current = true;
          fold(e.clientY < s.y);
        }}
      >
        <i aria-hidden="true" />
      </button>
    </div>
  );
}
