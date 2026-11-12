"use client";

import { Component, createContext, createRef, useContext, useLayoutEffect, type ReactNode } from "react";
import { cssTimeMs } from "@/lib/motion";

/**
 * 안의 칸이 바뀔 때 스르륵 이어지게 하는 상자 (docs/design-system 움직임 "칸 바뀌기").
 * - 남는 칸은 옛 자리에서 새 자리로 미끄러지고(FLIP), 상자 높이도 따라간다: `dur-tab`·`ease-drawer` (세그먼트 썸과 같은 박자)
 * - 새 칸은 6px 아래 살짝 흐린 데서 또렷하게 떠오른다: `dur-swap`·`ease-out`, 24ms 씩 차례로
 * - 빠진 칸은 그 자리에서 `dur-swap` 절반 길이로 흐려지며 사라진다
 * 칸을 알아보는 것은 DOM 노드 그 자체라(React 가 같은 노드를 다시 쓴다) 따로 key 를 달 필요가 없다.
 * 같은 칸에서 글만 바뀌는 곳(도움말 등)은 key 를 바꿔 주면 겹쳐 바뀐다.
 * 바뀌기 직전 자리를 재야 해서 getSnapshotBeforeUpdate 가 있는 클래스 컴포넌트다. 움직임은 WAAPI 로 돌려 transform·opacity 는 컴포지터에서 움직인다.
 * 움직임 줄이기면 아무것도 하지 않는다.
 */

type Rect = { x: number; y: number; w: number; h: number };
type Snap = { h: number; items: Map<Element, Rect> };

/** 기본: 상자의 자식과 손자 (시트의 칸과 그 안의 줄·도움말) */
const TRACK = ":scope > *, :scope > * > *";

let T: { move: number; swap: number; drawer: string; out: string } | null = null;
/** 움직임 토큰 (tokens.css 의 dur-tab·dur-swap·ease-drawer·ease-out) — 처음 한 번 읽는다 */
export function tokens() {
  if (T) return T;
  const css = getComputedStyle(document.documentElement);
  const ms = (n: string, d: number) => cssTimeMs(css.getPropertyValue(n), d);
  const ease = (n: string) => css.getPropertyValue(n).trim() || "ease-out";
  T = { move: ms("--dur-tab", 420), swap: ms("--dur-swap", 260), drawer: ease("--ease-drawer"), out: ease("--ease-out") };
  return T;
}

/** 움직임 줄이기 */
export const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const rel = (r: DOMRect, b: DOMRect): Rect => ({ x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height });

/**
 * follow: 펼치기·접기 상자 — 펼쳐 늘어난 끝이 화면 밑이면 거기까지 화면을 내리고, 접어서 누른 줄이 화면 위로 올라가면 따라 올라간다.
 *   누른 줄(펼치기·접기 버튼)이 화면 위로 넘어가도록 내리지는 않는다. 화면 안쪽은 위쪽 막대 아래 ~ 하단 메뉴 위.
 * quick: 자리 옮기기·상자 높이를 dur-tab 대신 dur-swap 으로 (짧은 목록을 빨리 펼치기)
 */
export class Morph extends Component<{ children: ReactNode; className?: string; track?: string; enter?: boolean; follow?: boolean; quick?: boolean }, object, Snap | null> {
  private box = createRef<HTMLDivElement>();
  /** 마지막으로 누른 곳 (follow) — 펼치기·접기 버튼 */
  private anchor: Element | null = null;
  /** 자리 옮기기·높이 — 다음에 바뀌면 지금 보이는 자리에서 다시 시작한다 */
  private moves: Animation[] = [];

  private items(): Element[] {
    // 사라지는 중인 칸(inert)과 그 안쪽은 빼고
    return [...this.box.current!.querySelectorAll(this.props.track ?? TRACK)].filter((el) => !el.closest("[inert]"));
  }

  /**
   * 안쪽 컴포넌트가 제 상태만 바꿔(보기·접기 등) Morph 가 다시 그려지지 않을 때: 바꾸기 직전에 before() 로 자리를 재 두고,
   * 그 컴포넌트가 그려진 뒤(useLayoutEffect) flush() 로 움직인다 — useMorphFlip
   */
  private pending: Snap | null = null;
  private api = {
    before: () => {
      this.pending = this.getSnapshotBeforeUpdate();
    },
    flush: () => {
      const snap = this.pending;
      this.pending = null;
      if (snap) this.componentDidUpdate(null, null, snap);
    },
  };

  getSnapshotBeforeUpdate(): Snap | null {
    const box = this.box.current;
    if (!box || still()) return null;
    const b = box.getBoundingClientRect();
    const items = new Map<Element, Rect>();
    for (const el of this.items()) {
      const r = el.getBoundingClientRect();
      if (r.width || r.height) items.set(el, rel(r, b));
    }
    return { h: b.height, items };
  }

  componentDidUpdate(_p: unknown, _s: unknown, snap: Snap | null) {
    this.pending = null;
    const box = this.box.current;
    if (!snap || !box) return;
    const t = tokens();
    for (const a of this.moves) a.cancel();
    this.moves = [];
    box.classList.remove("morphing");

    // 자리는 모두 먼저 잰다 (바깥 칸 움직임을 걸면 안쪽 칸 자리가 같이 바뀌어 보인다)
    const b = box.getBoundingClientRect();
    const move = this.props.quick ? t.swap : t.move;
    if (this.props.follow && Math.abs(b.height - snap.h) > 1) this.follow(b, b.height > snap.h);
    const now = this.items().map((el) => [el, el.getBoundingClientRect()] as const);
    const moved = new Map<Element, [number, number]>();
    const fresh: Element[] = [];
    for (const [el, r] of now) {
      if (!r.width && !r.height) continue;
      // 바깥 칸이 이미 움직이면 그만큼 빼고 움직인다 (같은 곡선이라 더하면 제 길로 간다)
      let up: [number, number] = [0, 0];
      let inFresh = false;
      for (let p = el.parentElement; p && p !== box; p = p.parentElement) {
        const d = moved.get(p);
        if (d) up = d;
        else if (fresh.includes(p)) inFresh = true;
        else continue;
        break;
      }
      const was = inFresh ? undefined : snap.items.get(el);
      if (!was) {
        fresh.push(el);
        continue;
      }
      const at = rel(r, b);
      const d: [number, number] = [was.x - at.x, was.y - at.y];
      moved.set(el, d);
      const x = d[0] - up[0];
      const y = d[1] - up[1];
      if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) {
        this.moves.push(el.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: "none" }], { duration: move, easing: t.drawer }));
      }
    }

    // 새 칸: 안쪽 칸까지 함께 새로 생겼으면 바깥 칸(카드 바탕)은 흐린 데서 나타나기만 하고, 안쪽 칸이 차례로 떠오른다 (새 목록이 한 줄씩)
    if (this.props.enter !== false) {
      let n = 0;
      for (const el of fresh) {
        if (fresh.some((o) => o !== el && el.contains(o))) {
          if (!fresh.some((o) => o !== el && o.contains(el))) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: t.swap, easing: t.out });
          continue;
        }
        el.animate([{ opacity: 0, transform: "translateY(6px)", filter: "blur(2px)" }, { opacity: 1, transform: "none", filter: "none" }], {
          duration: t.swap,
          easing: t.out,
          delay: Math.min(60 + n++ * 24, 180),
          fill: "backwards",
        });
      }
    }

    // 빠진 칸: 옛 자리에 잠깐 남겨 흐리게 지운다 (바깥 칸째 빠졌으면 바깥 칸만)
    const gone = [...snap.items].filter(([el]) => !el.isConnected);
    for (const [el, p] of gone) {
      if (gone.some(([o]) => o !== el && o.contains(el))) continue;
      const g = el as HTMLElement;
      Object.assign(g.style, { position: "absolute", left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px`, margin: "0", pointerEvents: "none" });
      g.inert = true;
      g.setAttribute("aria-hidden", "true");
      box.append(g);
      const a = g.animate([{ opacity: 1 }, { opacity: 0, filter: "blur(2px)" }], { duration: t.swap / 2, easing: t.out, fill: "forwards" });
      a.finished.then(
        () => g.remove(),
        () => g.remove(),
      );
    }

    if (Math.abs(b.height - snap.h) > 1) {
      box.classList.add("morphing");
      const a = box.animate([{ height: `${snap.h}px` }, { height: `${b.height}px` }], { duration: move, easing: t.drawer });
      a.onfinish = () => box.classList.remove("morphing");
      this.moves.push(a);
    }
  }

  /** 펼치거나 접은 뒤(b = 새 자리) 화면을 따라 옮긴다 — 움직임을 걸기 전에 불러 누른 줄의 새 자리를 잰다 */
  private follow(b: DOMRect, grew: boolean) {
    const bar = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
    const nav = document.querySelector<HTMLElement>(".navbar");
    // 하단 메뉴는 position: fixed 라 offsetParent 가 늘 비어 있다 — 실제로 그려지는지(display)로 본다. 숨어 비켜 있으면(달력·카드 옮기기) 화면 끝까지
    const navTop = nav && getComputedStyle(nav).display !== "none" && getComputedStyle(nav).visibility !== "hidden" && getComputedStyle(nav).opacity !== "0" ? nav.getBoundingClientRect().top : innerHeight;
    const top = Math.max(0, bar) + 8;
    const bottom = Math.min(innerHeight, navTop) - 12;
    const a = this.anchor?.isConnected && this.box.current?.contains(this.anchor) ? this.anchor.getBoundingClientRect() : null;
    let dy = 0;
    if (grew) {
      // 늘어난 끝까지 내리되, 누른 줄(없으면 상자 위)이 화면 위로 넘어가지 않게
      if (b.bottom > bottom) dy = Math.max(0, Math.min(b.bottom - bottom, (a ?? b).top - top));
    } else {
      // 누른 줄(없으면 상자 끝)이 화면 위로 올라가면 그 줄이 위쪽 막대 바로 아래에 오도록 따라 올라간다
      const end = a ? a.top : b.bottom - 48;
      if (end < top) dy = end - top - 16;
    }
    if (Math.abs(dy) > 1) window.scrollBy({ top: dy, behavior: still() ? "auto" : "smooth" });
  }

  componentWillUnmount() {
    for (const a of this.moves) a.cancel();
  }

  render() {
    return (
      <div
        ref={this.box}
        className={`morph ${this.props.className ?? ""}`}
        onPointerDownCapture={
          this.props.follow
            ? (e) => {
                this.anchor = e.target as Element;
              }
            : undefined
        }
      >
        <MorphCtx.Provider value={this.api}>{this.props.children}</MorphCtx.Provider>
      </div>
    );
  }
}

const MorphCtx = createContext<{ before: () => void; flush: () => void } | null>(null);

/**
 * Morph 안쪽에서 제 상태만 바꾸는 곳(끝낸 건 보기, 나눠 낸 몫 펼치기 등)에 쓴다. 바꾸는 함수를 flip(() => setOpen(...)) 로 감싸면
 * 바뀌기 직전 자리를 재고, 이 컴포넌트가 다시 그려진 뒤 가장 가까운 Morph 가 칸 바뀌기 움직임을 건다.
 */
export function useMorphFlip() {
  const m = useContext(MorphCtx);
  useLayoutEffect(() => {
    m?.flush();
  });
  return (change: () => void) => {
    m?.before();
    change();
  };
}

/** 화면이 통째로 바뀔 때(달력 ↔ 모아 보기) 새 화면이 그 방향에서 밀려 들어온다 — 달 넘기기와 같은 28px·dur-tab·ease-drawer */
export function slideIn(els: Iterable<Element>, dir: 1 | -1) {
  if (still()) return;
  const t = tokens();
  for (const el of els) el.animate([{ opacity: 0, transform: `translateX(${28 * dir}px)` }, { opacity: 1, transform: "none" }], { duration: t.move, easing: t.drawer });
}
