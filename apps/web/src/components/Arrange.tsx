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
/** 든 카드는 누른 곳으로 모이며 이 높이쯤으로 줄어든다 — 긴 카드(곡선·요약)도 끌기 쉽게. 줄이는 비율은 0.4~0.75 */
const LIFT_H = 200;
/** 든 카드가 들어갈 곳에 대면 그 사이만 이만큼 벌어진다 (원래 자리는 닫힌다) */
const OPEN = 64;
/** 흔들림: 카드 크기와 상관없이 가장 먼 모서리가 이만큼(px) 움직이게 각도를 맞춘다 */
const JIGGLE_PX = 1.6;

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
    "--jl": `-${(((h >>> 4) % 8) * 0.09).toFixed(2)}s`,
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
  /** 든 카드를 뺀 나머지 중 몇 번째 앞에 들어가나 (-1 = 아직 안 정함) */
  to: number;
  /** 든 카드를 뺀 나머지: 원래 자리를 닫은 뒤의 위치와 지금 비켜 있는 거리 */
  others: { s: HTMLElement; top: number; h: number; close: number; shift: number }[];
  y0: number;
  scroll0: number;
  y: number;
  dy: number;
  raf: number;
  /** 줄인 비율과 그 중심(누른 곳)의 카드 안 세로 위치 */
  s: number;
  oy: number;
}

/**
 * 꾹 눌러 카드를 옮기는 화면 틀(.grid 자리). 애플 홈 화면의 앱 옮기기처럼:
 * 1. 카드를 꾹 누르면(0.48초) 모든 카드가 제각각 흔들리고, 누른 카드는 누른 곳으로 모이며 작아져(높이 200px 쯤) 떠서 손가락을 따라온다.
 * 2. 든 카드의 원래 자리는 닫히고, 들어갈 곳(손가락 위치)에 대면 그 사이만 조금 벌어진다. 화면 끝에 가면 저절로 굴러간다.
 *    놓으면 다른 카드는 새 제자리로 미끄러지고, 든 카드는 새 자리로 내려앉으며 원래 크기로 커진다.
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
  /** 놓은 뒤 새 자리로 내려앉힐 카드와 놓기 직전 화면 위치, 비켜 있던 카드들의 놓기 직전 위치(offsetTop + 비킨 거리) */
  const landing = useRef<{ slot: HTMLElement; top0: number; dy: number; s: number; oy: number; others: { s: HTMLElement; at: number }[] } | null>(null);
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

  /** 든 카드를 off(px) 떨어진 곳에서 제자리로 내려앉히며 누른 곳을 중심으로 원래 크기로 키운다 */
  const settle = (s: HTMLElement, off: number) => {
    s.style.transition = "none";
    s.style.translate = `0 ${off}px`;
    void s.offsetHeight;
    s.style.transition = "";
    s.classList.remove("lifted");
    s.classList.add("landing");
    s.style.translate = "";
    const done = () => {
      s.classList.remove("landing");
      s.style.transformOrigin = "";
      s.style.removeProperty("--lift");
    };
    if (still()) done();
    else s.addEventListener("transitionend", done, { once: true });
  };

  // 흔들림 각도: 카드마다 가장 먼 모서리(가운데에서 긴 변의 반)가 JIGGLE_PX 만 움직이게 — 긴 카드 아래가 크게 흔들리지 않게
  useLayoutEffect(() => {
    if (!editing) return;
    for (const s of grid.current?.querySelectorAll<HTMLElement>("[data-card]") ?? []) {
      const r = Math.max(s.offsetWidth, s.offsetHeight) / 2 || 1;
      s.style.setProperty("--ja", `${((JIGGLE_PX / r) * 180) / Math.PI}deg`);
    }
  }, [editing]);

  // 새 순서가 그려진 뒤: 비켜 있던 카드는 놓기 직전 자리에서 새 제자리로 미끄러지고, 든 카드는 놓은 곳에서 새 자리로 내려앉는다
  const key = order.join("|");
  useLayoutEffect(() => {
    const l = landing.current;
    if (!l) return;
    landing.current = null;
    const g = grid.current;
    if (!g) return;
    for (const { s } of l.others) {
      s.style.transition = "none";
      s.style.translate = "";
    }
    // 새 자리를 재고, 놓기 직전 자리에서 시작하게 한 뒤 제자리로 (FLIP)
    const moves = l.others.map(({ s, at }) => ({ s, off: at - s.offsetTop }));
    for (const { s, off } of moves) if (off) s.style.translate = `0 ${off}px`;
    // 줄어든 채 옮겨 둔 카드의 새 제자리(문서 기준): 보이는 위 = 제자리 + dy + 누른 곳 × (1 − 비율)
    const now = l.slot.getBoundingClientRect().top + window.scrollY - l.dy - l.oy * (1 - l.s);
    settle(l.slot, l.top0 + l.dy - now);
    void g.offsetHeight;
    for (const { s } of moves) {
      s.style.transition = "";
      s.style.translate = "";
    }
  }, [key]);

  // 손가락 위치로 든 카드를 옮기고, 들어갈 자리를 정해 다른 카드를 비킨다
  const follow = (d: Drag) => {
    d.dy = d.y - d.y0 + (window.scrollY - d.scroll0);
    d.slot.style.translate = `0 ${d.dy}px`;
    // 들어갈 자리는 손가락 위치로 (줄어든 카드는 손가락 둘레에 모여 있다). 원래 자리를 닫은 뒤의 위치와 견준다
    const mid = d.y + window.scrollY;
    const to = d.others.filter((o) => o.top + o.close + o.h / 2 < mid).length;
    if (to === d.to) return;
    d.to = to;
    // 원래 자리는 닫고, 들어갈 곳만 OPEN 만큼 벌린다 — 다른 곳으로 옮기면 그 사이는 다시 좁아진다
    d.others.forEach((o, k) => {
      o.shift = o.close + (k >= to ? OPEN : 0);
      o.s.style.translate = o.shift ? `0 ${o.shift}px` : "";
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
    const gap = parseFloat(getComputedStyle(g).rowGap) || 0;
    const step = p.slot.offsetHeight + gap;
    const d: Drag = {
      id: p.id,
      slot: p.slot,
      slots,
      tops: slots.map((s) => s.getBoundingClientRect().top + window.scrollY),
      heights: slots.map((s) => s.offsetHeight),
      gap,
      from,
      to: -1,
      others: slots
        .map((s, j) => ({ s, top: s.getBoundingClientRect().top + window.scrollY, h: s.offsetHeight, close: j > from ? -step : 0, shift: 0 }))
        .filter((o) => o.s !== p.slot),
      y0: p.y,
      scroll0: window.scrollY,
      y: p.y,
      dy: 0,
      raf: 0,
      s: 1,
      oy: 0,
    };
    // 누른 곳으로 모이며 작아진다: 그 점을 중심으로 줄여 손가락 밑에 그대로 둔다
    const r = p.slot.getBoundingClientRect();
    d.oy = p.y - r.top;
    d.s = Math.min(0.75, Math.max(0.4, LIFT_H / p.slot.offsetHeight));
    p.slot.style.transformOrigin = `${p.x - r.left}px ${d.oy}px`;
    p.slot.style.setProperty("--lift", String(d.s));
    drag.current = d;
    p.slot.classList.add("lifted");
    follow(d);
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
      // 제자리: 닫고 벌렸던 카드는 원래대로, 든 카드는 제자리로 내려앉는다
      for (const o of d.others) o.s.style.translate = "";
      settle(d.slot, d.dy);
      return;
    }
    // 보이는 카드끼리의 새 순서를 전체 순서(지금 없는 카드 포함)에 끼워 넣는다
    const seen = d.slots.map((s) => s.dataset.card!);
    const moved = d.others.map((o) => o.s.dataset.card!);
    moved.splice(d.to, 0, d.slot.dataset.card!);
    let n = 0;
    const next = latest.current.order.map((k) => (seen.includes(k) ? moved[n++] : k));
    landing.current = { slot: d.slot, top0: d.tops[d.from], dy: d.dy, s: d.s, oy: d.oy, others: d.others.map((o) => ({ s: o.s, at: o.s.offsetTop + o.shift })) };
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
    // 그래프처럼 누르고 끌어서 보는 곳(data-no-arrange)에서는 카드를 집지 않는다
    if ((e.target as Element).closest("[data-no-arrange]")) return;
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
