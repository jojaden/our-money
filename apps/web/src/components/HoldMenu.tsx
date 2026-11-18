"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { afterSheet, useBackToClose } from "./ui";
import { still, tokens } from "./Morph";
import { haptic } from "@/lib/native";

export interface HoldAction {
  label: string;
  icon: LucideIcon;
  /** 빨간 글자 (삭제) — 맨 아래 따로 묶는다 */
  danger?: boolean;
  /** 누른 그 순간에 해야 하는 일(공유 창·클립보드는 사용자 동작 안에서만 열린다). 아니면 메뉴가 닫히고 기록이 빠진 뒤에 한다 */
  now?: boolean;
  run: () => void;
}

/** 꾹 누르는 시간과 그동안 움직여도 되는 거리 (애플 길게 누르기와 비슷하게) */
const HOLD = 450;
const SLOP = 8;
/** 들린 줄과 메뉴 사이, 화면 가장자리와 메뉴 사이 */
const GAP = 10;
const EDGE = 12;

/** 메뉴가 떠 있는 동안 원래 줄은 숨긴다 (들린 카드가 그 줄인 것처럼). 줄은 DOM 이라 props 밖에서 바꾼다 */
function hideRow(row: HTMLElement, hidden: boolean) {
  row.style.visibility = hidden ? "hidden" : "";
}

interface Place {
  row: HTMLElement;
  host: Element;
  /** 꾹 누르는 동안 줄어든 크기에서 들어 올린다 */
  from: number;
  /** 손가락으로 열었으면 그 손가락 — 떼지 않고 메뉴로 끌어 놓으면 그 줄을 고른다 */
  pointer: number | null;
}

/**
 * 꾹 누르면 뜨는 메뉴 (애플 컨텍스트 메뉴처럼).
 * - 누르고 있으면 줄이 살짝 눌려 들어가고(0.96), 0.45초가 차면 뒤가 흐려지며 그 줄이 떠오르고(그림자, 1.03 → 1),
 *   줄 오른쪽 끝에 맞춘 메뉴가 그 모서리에서 튀어나온다. 아래 자리가 모자라면 줄이 위로 비켜 올라간다.
 * - 손가락을 떼지 않고 메뉴 위로 끌면 그 줄이 밝아지고, 거기서 떼면 고른 것이다. 떼고 나서 눌러도 된다.
 * - 움직이면(8px) 길게 누르기는 취소되고 원래대로(시트 끌기·스크롤). 그냥 짧게 누르면 원래 누르기(고치기)다.
 * - 마우스 오른쪽 클릭·키보드 메뉴 키(contextmenu)로도 연다. 화살표로 옮기고 Enter, Esc·뒤로 가기·바깥 누르기로 닫는다.
 * 시트(vaul) 안에서는 그 시트에 그린다 — 시트가 바깥 누르기로 닫히거나 포커스를 끌어가지 않게. 시트는 will-change 로
 * fixed 의 기준이 되므로 시트 위치만큼 거꾸로 옮겨 화면 전체를 덮는다.
 */
export function HoldMenu({ actions, label, children }: { actions: HoldAction[]; /** 메뉴 이름 (화면 읽기) */ label: string; children: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [open, setOpen] = useState(false);
  const press = useRef<{ id: number; x: number; y: number; t: number; target: Element; anim?: Animation } | null>(null);
  /** 길게 눌러 연 직후 따라오는 click(원래 누르기)을 삼킨다 */
  const swallow = useRef(false);

  const show = (from: number, pointer: number | null) => {
    const row = wrap.current;
    if (!row || place) return;
    haptic(8);
    setPlace({ row, host: row.closest(".sheet") ?? document.body, from, pointer });
    setOpen(true);
  };

  const cancelPress = (back: boolean) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    window.clearTimeout(p.t);
    const el = wrap.current;
    if (back && el && !still()) {
      const now = getComputedStyle(el).transform;
      p.anim?.cancel();
      el.animate([{ transform: now === "none" ? "none" : now }, { transform: "none" }], { duration: 180, easing: "ease-out" });
    } else p.anim?.cancel();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || place) return;
    const el = wrap.current!;
    const anim = still() ? undefined : el.animate([{ transform: "none" }, { transform: "scale(0.96)" }], { duration: HOLD + 50, delay: 100, easing: "ease-out", fill: "forwards" });
    swallow.current = false;
    const id = e.pointerId;
    const target = e.target as Element;
    const t = window.setTimeout(() => {
      // 시트(vaul)가 잡아 둔 손가락을 놓아 줘야 메뉴로 끄는 동안 시트가 따라 끌리지 않는다
      if (target.hasPointerCapture?.(id)) target.releasePointerCapture(id);
      press.current = null;
      anim?.cancel();
      swallow.current = true;
      show(0.96, id);
    }, HOLD);
    press.current = { id, x: e.clientX, y: e.clientY, t, target, anim };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (p && p.id === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP) cancelPress(true);
  };

  return (
    <div
      ref={wrap}
      className="hold"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => cancelPress(true)}
      onPointerCancel={() => cancelPress(false)}
      onClickCapture={(e) => {
        // 메뉴(포털)의 누르기는 React 로 여기까지 올라오지만 줄의 누르기가 아니다
        if (!swallow.current || !wrap.current?.contains(e.target as Node)) return;
        swallow.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      onContextMenu={(e) => {
        // 오른쪽 클릭·메뉴 키·안드로이드의 길게 누르기 — 브라우저 메뉴 대신 이 메뉴를 한 번만
        e.preventDefault();
        cancelPress(false);
        if (!place) show(1, null);
      }}
    >
      {children}
      {place && (
        <HoldLayer
          place={place}
          open={open}
          actions={actions}
          label={label}
          onClose={() => setOpen(false)}
          onGone={() => {
            swallow.current = false;
            setPlace(null);
          }}
        />
      )}
    </div>
  );
}

function HoldLayer({ place, open, actions, label, onClose, onGone }: { place: Place; open: boolean; actions: HoldAction[]; label: string; onClose: () => void; onGone: () => void }) {
  const layer = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const shift = useRef(0);
  const [hot, setHot] = useState(-1);
  const opened = useRef(false);
  /** 메뉴를 연 손가락을 뗀 때 — 브라우저가 그 자리(흐린 바탕·메뉴 줄)에 click 을 하나 더 만든다. 그 click 은 삼킨다 */
  const lifted = useRef(0);
  // 부르는 쪽 함수가 그릴 때마다 바뀌어도 닫기 애니메이션·손가락 처리는 한 번만
  const cb = useRef({ onClose, onGone, open });
  useLayoutEffect(() => {
    cb.current = { onClose, onGone, open };
  });
  useBackToClose(open, (v) => !v && cb.current.onClose());

  const items = [...actions.filter((a) => !a.danger), ...actions.filter((a) => a.danger)];
  const pick = (a: HoldAction) => {
    // 닫히는 중(오므라드는 메뉴)에는 고르지 않는다
    if (!cb.current.open) return;
    if (a.now) a.run();
    // 메뉴가 쌓은 뒤로 가기 기록이 빠진 뒤에 한다 — 그래야 이어서 날짜 패널을 닫고 시트를 여는 기록이 꼬이지 않는다
    else afterSheet(a.run);
    cb.current.onClose();
  };

  // 자리 잡기와 들어 올리기
  useLayoutEffect(() => {
    const el = layer.current;
    const pv = preview.current;
    const mn = menu.current;
    if (!el || !pv || !mn) return;
    const host = place.host.getBoundingClientRect();
    const hostClips = place.host !== document.body && getComputedStyle(place.host).overflow !== "visible";
    // 시트가 fixed 의 기준이라 그만큼 거꾸로 옮겨 화면 (0,0) 에 맞춘다
    if (place.host !== document.body) Object.assign(el.style, { left: `${-host.left}px`, top: `${-host.top}px` });
    const cs = getComputedStyle(el);
    const vh = window.visualViewport?.height ?? innerHeight;
    const box = hostClips ? host : { top: 0, bottom: vh, left: 0, right: innerWidth };
    const b = {
      top: box.top + parseFloat(cs.paddingTop) + EDGE,
      bottom: box.bottom - parseFloat(cs.paddingBottom) - EDGE,
      left: box.left + EDGE,
      right: box.right - EDGE,
    };
    // 줄을 그대로 베껴 같은 자리에 둔다 (눌리지 않게 inert)
    const r = place.row.getBoundingClientRect();
    pv.replaceChildren(place.row.firstElementChild!.cloneNode(true));
    // 들린 카드는 양옆 12px 넓혀 안쪽 여백(.hold-preview 12px)을 두고, 글자는 원래 자리에 그대로 둔다
    Object.assign(pv.style, { left: `${r.left - 12}px`, top: `${r.top}px`, width: `${r.width + 24}px`, height: `${r.height}px` });
    const mh = mn.offsetHeight;
    const mw = mn.offsetWidth;
    // 아래에 메뉴 자리가 모자라면 줄을 위로 올리고, 그래도 안 되면 메뉴를 위에
    let dy = Math.min(0, b.bottom - (r.bottom + GAP + mh));
    let above = false;
    if (r.top + dy < b.top) {
      dy = 0;
      above = r.top - GAP - mh >= b.top;
    }
    shift.current = dy;
    const top = above ? r.top - GAP - mh : Math.min(r.bottom + dy + GAP, b.bottom - mh);
    const left = Math.min(Math.max(r.right - mw, b.left), b.right - mw);
    Object.assign(mn.style, { left: `${left}px`, top: `${top}px`, transformOrigin: `${above ? "bottom" : "top"} right` });
    hideRow(place.row, true);
    if (still()) {
      pv.style.transform = `translateY(${dy}px)`;
    } else {
      const t = tokens();
      el.querySelector(".hold-dim")!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: t.swap, easing: t.out });
      pv.animate(
        [{ transform: `translateY(0) scale(${place.from})` }, { transform: `translateY(${dy * 0.9}px) scale(1.03)`, offset: 0.55 }, { transform: `translateY(${dy}px) scale(1)` }],
        { duration: t.move, easing: t.out, fill: "forwards" },
      );
      mn.animate([{ opacity: 0, transform: "scale(0.4)" }, { opacity: 1, transform: "scale(1)" }], { duration: t.move, delay: 40, easing: getComputedStyle(document.documentElement).getPropertyValue("--ease-pop").trim() || t.out, fill: "backwards" });
    }
    opened.current = true;
    // 키보드·마우스로 열었으면 첫 줄에 포커스 (손가락은 끌어서 고르니 두지 않는다)
    if (place.pointer === null) mn.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
  }, [place]);

  // 닫기: 메뉴는 오므라들고 줄은 제자리로 내려앉은 뒤 원래 줄을 다시 보인다
  useEffect(() => {
    if (open || !opened.current) return;
    const el = layer.current;
    const pv = preview.current;
    const mn = menu.current;
    const done = () => {
      hideRow(place.row, false);
      // 메뉴 안에 있던 포커스는 그 줄로 돌려준다
      if (layer.current?.contains(document.activeElement) && place.row.isConnected) place.row.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
      cb.current.onGone();
    };
    if (still() || !el || !pv || !mn) return done();
    const t = tokens();
    mn.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.7)" }], { duration: 160, easing: t.out, fill: "forwards" });
    el.querySelector(".hold-dim")!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: t.swap, easing: t.out, fill: "forwards" });
    const a = pv.animate([{ transform: `translateY(${shift.current}px) scale(1)` }, { transform: "translateY(0) scale(1)" }], { duration: t.swap, easing: t.out, fill: "forwards" });
    a.finished.then(done, done);
  }, [open, place]);

  // 열린 동안 Esc 는 이 메뉴만 닫는다 (시트의 Esc 보다 먼저 받는다)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      cb.current.onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  // 손가락을 떼지 않고 메뉴로 끌면 밝히고, 거기서 떼면 고른다
  useEffect(() => {
    const id = place.pointer;
    if (id === null) return;
    const at = (e: PointerEvent) => {
      const b = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-hold-i]");
      return b && menu.current?.contains(b) ? Number(b.dataset.holdI) : -1;
    };
    const move = (e: PointerEvent) => e.pointerId === id && setHot(at(e));
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      stop();
      lifted.current = e.timeStamp;
      setHot(-1);
      const i = at(e);
      if (i >= 0) pick(items[i]);
    };
    const stop = () => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", stop, true);
    };
    // 캡처로 듣는다 — 메뉴 층이 pointermove 를 막아도 끌어서 고르기는 받는다
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", stop, true);
    return stop;
    // 손가락 하나에 한 번만 건다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const list = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
    list[next]?.focus();
  };

  const safe = items.filter((a) => !a.danger).length;
  return createPortal(
    // data-vaul-no-drag: 이 위에서 끄는 손가락으로 시트가 끌려 내려가지 않게
    <div
      ref={layer}
      className="hold-layer"
      data-vaul-no-drag=""
      // 메뉴 위에서 끄는 손가락이 React 로 올라가 시트 끌기·달 넘기기 밀기를 움직이지 않게 (pointerup 은 시트가 끌기를 끝내도록 둔다)
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onClickCapture={(e) => {
        if (!lifted.current || e.timeStamp - lifted.current > 600) return;
        lifted.current = 0;
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <div className="hold-dim" onClick={() => cb.current.onClose()} />
      <div ref={preview} className="hold-preview" aria-hidden="true" inert />
      <div ref={menu} className="hold-menu" role="menu" aria-label={label} onKeyDown={onMenuKey}>
        {items.map((a, i) => (
          <button
            key={a.label}
            type="button"
            role="menuitem"
            data-hold-i={i}
            className={`${a.danger ? "danger" : ""} ${i === safe && i > 0 ? "split" : ""} ${hot === i ? "hot" : ""}`}
            onClick={() => pick(a)}
          >
            {a.label}
            <a.icon aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>,
    place.host,
  );
}
