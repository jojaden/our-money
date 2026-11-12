"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { still } from "./Morph";
import { useBackToClose } from "./ui";

/** 커지기·줄어들기 (ms) — 열 때는 서랍 박자, 닫을 때는 조금 빠르게 */
const OPEN_MS = 420;
const CLOSE_MS = 260;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * 누른 글자 자리에서 화면 가운데로 점점 커지며 뜨는 창 (docs/design-system/components/Calendar "요약 창").
 * 닫으면 누른 자리로 줄어들며 사라진다. transform·opacity 만 움직인다.
 * 뒤로 가기·Esc·바깥 누르기로 닫는다. 시트(z 40)보다 아래에 떠서, 안에서 연 일정·지출 시트가 위에 겹친다.
 */
export function ZoomPop({
  open,
  onOpenChange,
  from,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 누른 글자 — 여기서 커지고 여기로 줄어든다 */
  from: HTMLElement | null;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const [shown, setShown] = useState(open);
  const panel = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useBackToClose(open, onOpenChange);
  if (open && !shown) setShown(true);

  // 누른 글자 가운데에서 창 가운데까지의 거리와 크기 비율
  const delta = () => {
    const p = panel.current?.getBoundingClientRect();
    const f = from?.getBoundingClientRect();
    if (!p || !f) return null;
    const dx = f.left + f.width / 2 - (p.left + p.width / 2);
    const dy = f.top + f.height / 2 - (p.top + p.height / 2);
    const s = Math.max(0.12, Math.min(f.width / p.width, 0.5));
    return `translate(${dx}px, ${dy}px) scale(${s})`;
  };

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (open) {
      el.focus({ preventScroll: true });
      const t = delta();
      if (t && !still()) {
        el.animate([{ transform: t, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: OPEN_MS, easing: EASE });
        veil.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: "ease" });
      }
      return;
    }
    if (!shown) return;
    // 움직임 줄이기면 길이 0 — 끝나면(onfinish) 내린다
    const t = delta();
    const ms = still() ? 0 : CLOSE_MS;
    const a = el.animate(t ? [{ transform: "none", opacity: 1 }, { transform: t, opacity: 0 }] : [{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: EASE, fill: "forwards" });
    const b = veil.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: "ease", fill: "forwards" });
    a.onfinish = () => setShown(false);
    return () => {
      a.cancel();
      b?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 열고 닫을 때만
  }, [open]);

  // 닫히면 누른 글자로 포커스를 돌려준다
  useEffect(() => {
    if (!open && shown) from?.focus({ preventScroll: true });
  }, [open, shown, from]);

  if (!shown) return null;
  return createPortal(
    <div ref={veil} className="zoom-pop" inert={!open} onClick={() => onOpenChange(false)}>
      <div
        ref={panel}
        className="zoom-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onOpenChange(false);
        }}
      >
        <div className="zoom-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="cal-close" aria-label="닫기" onClick={() => onOpenChange(false)}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="zoom-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
