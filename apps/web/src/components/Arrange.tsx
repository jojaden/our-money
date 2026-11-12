"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ArrangePage } from "@/lib/types";
import { useData } from "@/lib/store";
import { haptic } from "@/lib/native";
import { still } from "./Morph";
import { useBackToClose } from "./ui";

/** 폰·태블릿(한 줄로 쌓인 화면)에서만 옮긴다 — 데스크톱 두 열은 그대로 */
const PHONE = "(max-width: 1023px)";
/** 처음 꾹 누르기 / 흔들리는 동안 다시 집기 (ms) */
const HOLD = 480;
const HOLD_AGAIN = 140;
/** 이만큼 움직이면 누르기가 아니라 굴리기 */
const SLOP = 8;
/** 화면 위·아래 끝에서 이만큼 안이면 저절로 굴린다 (px) */
const EDGE = 96;

/** 저장된 순서에서 모르는 이름은 빼고, 빠진 카드는 기본 자리에 넣는다 */
export function normalize(saved: string[] | undefined, defaults: string[]): string[] {
  // 저장된 값이 배열이 아니면(손상) 처음 순서로
  const out = (Array.isArray(saved) ? saved : []).filter((k, i, a) => typeof k === "string" && defaults.includes(k) && a.indexOf(k) === i);
  defaults.forEach((k, i) => {
    if (!out.includes(k)) out.splice(Math.min(i, out.length), 0, k);
  });
  return out;
}

/** 카드마다 흔들림 박자·시작점을 조금씩 다르게 — 이름에서 늘 같은 값 */
function hash(k: string): number {
  let h = 7;
  for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

const OrderCtx = createContext<string[]>([]);

/**
 * 옮길 수 있는 카드 하나. 폰에서는 order 로 자리를 잡고(--o), 흔들리는 동안은 안쪽을 누를 수 없다.
 * 내용이 없으면 Slot 도 두지 않는다(빈 칸이 간격을 차지하지 않게).
 */
export function Slot({ k, children }: { k: string; children: React.ReactNode }) {
  const order = useContext(OrderCtx);
  const i = order.indexOf(k);
  const h = hash(k);
  const style = {
    "--o": i + 1,
    // 애플 홈 화면처럼 카드마다 0.24~0.33초 박자, 시작점은 음수 지연으로 흩뜨린다
    "--jd": `${(0.24 + (h % 10) * 0.01).toFixed(2)}s`,
    "--jl": `-${((h >> 4) % 8) * 0.09}s`,
  } as React.CSSProperties;
  return (
    <div className="slot" data-card={k} data-j={i % 2} style={style}>
      {children}
    </div>
  );
}

interface Press {
  id: number;
  x: number;
  y: number;
  slot: HTMLElement;
  timer: number;
}
interface Drag {
  id: number;
  slot: HTMLElement;
  slots: HTMLElement[];
  /** 집을 때의 문서 기준 위치·높이 */
  tops: number[];
  heights: number[];
  gap: number;
  from: number;
  to: number;
  y0: number;
  scroll0: number;
  y: number;
  dy: number;
  raf: number;
}

/**
 * 꾹 눌러 카드를 옮기는 화면 틀(.grid 자리). 애플 홈 화면의 앱 옮기기처럼:
 * 1. 카드를 꾹 누르면(0.48초) 모든 카드가 제각각 흔들리고, 누른 카드는 살짝 커지며 떠서 손가락을 따라온다.
 * 2. 끄는 동안 다른 카드는 비켜 미끄러지고, 화면 끝에 가면 저절로 굴러간다. 놓으면 새 자리로 내려앉는다.
 * 3. 흔들리는 동안 카드를 잠깐(0.14초) 누르면 다시 집는다. 위 "완료"·뒤로 가기로 끝낸다.
 * 순서는 사람마다 서버에 남는다(users.card_order). 움직임은 translate·rotate·scale 만.
 */
export function Arrange({ page, defaults, children }: { page: ArrangePage; defaults: string[]; children: React.ReactNode }) {
  const { cardOrder, setCardOrder } = useData();
  const order = normalize(cardOrder[page], defaults);
  const [editing, setEditing] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const press = useRef<Press | null>(null);
  const drag = useRef<Drag | null>(null);
  /** 들기 직후 클릭 한 번을 삼키는 리스너 — 놓고 나면 곧 뗀다 */
  const swallowing = useRef<((e: MouseEvent) => void) | null>(null);
  /** 놓은 뒤 새 자리로 내려앉힐 카드와 놓기 직전 화면 위치 */
  const landing = useRef<{ slot: HTMLElement; top: number; dy: number } | null>(null);
  // 창 전체에서 듣는 손가락 처리는 한 번만 붙이므로, 그 안에서는 늘 마지막 값을 ref 로 읽는다
  const latest = useRef({ editing, order, save: setCardOrder });
  useEffect(() => {
    latest.current = { editing, order, save: setCardOrder };
  });
  useBackToClose(editing, setEditing);

  // 흔드는 동안: 달 넘기기 쓸기·하단 메뉴를 멈춘다(shell.css)
  useEffect(() => {
    const root = document.documentElement;
    if (editing) root.dataset.arranging = "";
    else delete root.dataset.arranging;
    return () => void delete root.dataset.arranging;
  }, [editing]);

  /** 든 카드를 off(px) 떨어진 곳에서 제자리로 내려앉힌다 */
  const settle = (s: HTMLElement, off: number) => {
    s.style.transition = "none";
    s.style.translate = `0 ${off}px`;
    void s.offsetHeight;
    s.style.transition = "";
    s.classList.remove("lifted");
    s.classList.add("landing");
    s.style.translate = "";
    const done = () => s.classList.remove("landing");
    if (still()) done();
    else s.addEventListener("transitionend", done, { once: true });
  };

  // 새 순서가 그려진 뒤: 비켜 있던 카드는 그 자리 그대로(이제 진짜 자리), 든 카드는 놓은 곳에서 새 자리로 내려앉는다
  const key = order.join("|");
  useLayoutEffect(() => {
    const l = landing.current;
    if (!l) return;
    landing.current = null;
    const g = grid.current;
    if (!g) return;
    for (const s of g.querySelectorAll<HTMLElement>("[data-card]")) {
      if (s === l.slot) continue;
      s.style.transition = "none";
      s.style.translate = "";
    }
    const now = l.slot.getBoundingClientRect().top - l.dy;
    settle(l.slot, l.top - now);
    void g.offsetHeight;
    for (const s of g.querySelectorAll<HTMLElement>("[data-card]")) if (s !== l.slot) s.style.transition = "";
  }, [key]);

  // 손가락 위치로 든 카드를 옮기고, 들어갈 자리를 정해 다른 카드를 비킨다
  const follow = (d: Drag) => {
    d.dy = d.y - d.y0 + (window.scrollY - d.scroll0);
    d.slot.style.translate = `0 ${d.dy}px`;
    const mid = d.tops[d.from] + d.heights[d.from] / 2 + d.dy;
    let to = 0;
    d.slots.forEach((_, j) => {
      if (j !== d.from && d.tops[j] + d.heights[j] / 2 < mid) to++;
    });
    if (to === d.to) return;
    d.to = to;
    const step = d.heights[d.from] + d.gap;
    d.slots.forEach((s, j) => {
      if (j === d.from) return;
      const shift = d.from < to && j > d.from && j <= to ? -step : to < d.from && j >= to && j < d.from ? step : 0;
      s.style.translate = shift ? `0 ${shift}px` : "";
    });
  };

  // 화면 위·아래 끝에 대고 있으면 저절로 굴린다 (가까울수록 빠르게)
  const tick = () => {
    const d = drag.current;
    if (!d) return;
    const bottom = window.innerHeight - EDGE;
    const v = d.y < EDGE ? -((EDGE - d.y) / EDGE) * 14 : d.y > bottom ? ((d.y - bottom) / EDGE) * 14 : 0;
    if (v) {
      window.scrollBy(0, v);
      follow(d);
    }
    d.raf = requestAnimationFrame(tick);
  };

  const lift = () => {
    const p = press.current;
    const g = grid.current;
    if (!p || !g) return;
    press.current = null;
    if (!latest.current.editing) setEditing(true);
    haptic(10);
    // 지금 화면에 보이는 순서대로 (폰에서는 order 로 섞여 있다)
    const slots = [...g.querySelectorAll<HTMLElement>("[data-card]")].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const from = slots.indexOf(p.slot);
    const d: Drag = {
      id: p.id,
      slot: p.slot,
      slots,
      tops: slots.map((s) => s.getBoundingClientRect().top + window.scrollY),
      heights: slots.map((s) => s.offsetHeight),
      gap: parseFloat(getComputedStyle(g).rowGap) || 0,
      from,
      to: from,
      y0: p.y,
      scroll0: window.scrollY,
      y: p.y,
      dy: 0,
      raf: 0,
    };
    drag.current = d;
    p.slot.classList.add("lifted");
    d.raf = requestAnimationFrame(tick);
    // 손을 떼면 그 아래 버튼·링크가 눌리지 않게 바로 뒤 클릭 한 번을 삼킨다 (놓은 뒤 곧 뗀다 — 위 "완료"를 먹지 않게)
    const swallow = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    swallowing.current = swallow;
    document.addEventListener("click", swallow, { capture: true, once: true });
  };

  const drop = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    haptic(6);
    // 놓는 손가락의 클릭은 pointerup 바로 뒤에 온다 — 그다음에 삼키기를 뗀다
    const swallow = swallowing.current;
    swallowing.current = null;
    if (swallow) window.setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 60);
    if (d.to === d.from) {
      settle(d.slot, d.dy);
      return;
    }
    // 보이는 카드끼리의 새 순서를 전체 순서(지금 없는 카드 포함)에 끼워 넣는다
    const seen = d.slots.map((s) => s.dataset.card!);
    const moved = [...seen];
    moved.splice(d.to, 0, ...moved.splice(d.from, 1));
    let n = 0;
    const next = latest.current.order.map((k) => (seen.includes(k) ? moved[n++] : k));
    landing.current = { slot: d.slot, top: d.slot.getBoundingClientRect().top, dy: d.dy };
    void latest.current.save(page, next);
  };

  // 누르기·끌기는 창 전체에서 듣는다(손가락이 카드 밖으로 나가도). 끄는 동안 화면 굴리기는 막는다
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (p && p.id === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP) {
        window.clearTimeout(p.timer);
        press.current = null;
      }
      const d = drag.current;
      if (d && d.id === e.pointerId) {
        d.y = e.clientY;
        follow(d);
      }
    };
    const up = (e: PointerEvent) => {
      const p = press.current;
      if (p && p.id === e.pointerId) {
        window.clearTimeout(p.timer);
        press.current = null;
      }
      if (drag.current?.id === e.pointerId) drop();
    };
    const touch = (e: TouchEvent) => {
      if (drag.current && e.cancelable) e.preventDefault();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    document.addEventListener("touchmove", touch, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.removeEventListener("touchmove", touch);
      if (press.current) window.clearTimeout(press.current.timer);
      if (drag.current) cancelAnimationFrame(drag.current.raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 한 번 (안에서는 ref 로 최신 값을 읽는다)
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || drag.current || !matchMedia(PHONE).matches) return;
    const slot = (e.target as Element).closest<HTMLElement>("[data-card]");
    if (!slot || !grid.current?.contains(slot)) return;
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, slot, timer: window.setTimeout(lift, editing ? HOLD_AGAIN : HOLD) };
  };

  return (
    <OrderCtx.Provider value={order}>
      <div
        ref={grid}
        className={`grid ${editing ? "arranging" : ""}`}
        onPointerDown={onPointerDown}
        onContextMenu={(e) => {
          // 꾹 누르는 동안 길게 누르기 메뉴·글자 고르기가 뜨지 않게
          if (press.current || editing) e.preventDefault();
        }}
      >
        {children}
      </div>
      {editing &&
        createPortal(
          <div className="arrange-bar" role="toolbar" aria-label="카드 옮기기">
            <button type="button" className="btn ghost" onClick={() => void setCardOrder(page, null)} disabled={!cardOrder[page]}>
              처음 순서
            </button>
            <span className="arrange-hint">카드를 끌어 옮겨요</span>
            <button type="button" className="btn sm" onClick={() => setEditing(false)}>
              완료
            </button>
          </div>,
          document.body,
        )}
    </OrderCtx.Provider>
  );
}
