"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CatVisual } from "@/lib/categories";
import { CatGlyph } from "./CatGlyphs";
import { Drawer } from "vaul";
import type { Owner, Settings } from "@/lib/types";
import { num } from "@/lib/format";
import { nameOf } from "@/lib/calc";
import { useStore, type Toast } from "@/lib/store";
import { Morph, still } from "./Morph";
import { X } from "lucide-react";

export function Money({ value, className = "", sign = false, animate = false }: { value: number | null | undefined; className?: string; sign?: boolean; animate?: boolean }) {
  const shown = useRolling(value ?? 0, animate);
  if (value === null || value === undefined) return <span className={`money dash ${className}`}>–</span>;
  const v = animate ? shown : value;
  const s = sign && v > 0 ? "+" : v < 0 ? "−" : "";
  return (
    <span className={`money ${className}`} aria-label={animate ? `${num(value)}원` : undefined}>
      {s}
      {num(Math.abs(v))}
      <span className="unit">원</span>
    </span>
  );
}

/** 숫자가 바뀌면 이전 값에서 새 값으로 굴러가듯 바뀐다 (애플식 감속). 처음 그릴 때는 바로 보여준다. */
export function useRolling(target: number, enabled = true, duration = 720): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const start = from.current;
    if (start === target) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setShown(target);
      return;
    }
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 4);
      const v = Math.round(start + (target - start) * e);
      from.current = v;
      setShown(v);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, enabled, duration]);
  return enabled ? shown : target;
}

export function CategoryIcon({ visual, size = "" }: { visual: CatVisual; size?: "" | "sm" }) {
  // 바탕은 그 색을 옅게 푼 원(.cat, 다크는 well). bg 를 주면 그 색으로 꽉 채운 원
  return (
    <span className={`cat ${size}`} style={{ color: visual.ink, ...(visual.bg ? { background: visual.bg } : {}) }} aria-hidden="true">
      <CatGlyph icon={visual.icon} />
    </span>
  );
}

/** 브랜드 마크: 두 사람의 원이 겹치는 부분이 '공동' */
/**
 * 브랜드 마크 — 앱 아이콘과 같은 그림 (두 이름의 '현'인 ㅎ, 흰 지붕 아래 금빛 동전).
 * 그림은 scripts/icons.mjs 가 public/mark.png 로 만든다.
 */
export function Mark({ size = 28 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="mark" src="/mark.png" width={size} height={size} alt="" aria-hidden="true" />;
}

/**
 * 빈 화면·불러오기 실패 (docs/design-system/components/EmptyState).
 * 무엇이 비었는지(제목) + 왜·무엇이 모이는지(설명) + 다음 행동 하나(버튼). 할 일이 없는 "끝났어요"류는 쓰지 않고 한 줄 .empty 그대로.
 * 불러오기 실패는 error — 남아 있는 알림이라 role="alert" 이고 버튼은 "다시 시도".
 */
export function EmptyState({ title, body, action, onAction, error = false }: { title: string; body?: string; action?: string; onAction?: () => void; error?: boolean }) {
  return (
    <div className={`empty empty-state ${error ? "error" : ""}`} role={error ? "alert" : undefined}>
      <p className="es-title">{title}</p>
      {body && <p className="es-body">{body}</p>}
      {action && onAction && (
        <button type="button" className="btn secondary sm" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

/** 불러오는 동안 줄 모양 자리 (실제 줄과 같은 높이, 숨 쉬듯 옅어졌다 짙어짐 — opacity 만) */
export function SkeletonRows({ count = 3, label }: { count?: number; label: string }) {
  return (
    <div className="skeleton-rows" role="status" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <span className="skeleton-row" key={i} style={{ ["--i" as string]: i }} aria-hidden="true">
          <span className="sk sk-dot" />
          <span className="sk-lines">
            <span className="sk sk-t" />
            <span className="sk sk-s" />
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * 사람 아이콘 — 동전 하나를 반으로 나눴다. 현빈는 왼쪽 반, 예진는 오른쪽 반, 공동은 전체.
 * 두 이름이 모두 '현'으로 시작해서 글자 이니셜 대신 그림으로 구분한다.
 */
export function PersonGlyph({ owner }: { owner: Owner }) {
  const color = owner === "a" ? "var(--a)" : owner === "b" ? "var(--b)" : "var(--accent)";
  const left = owner === "a" || owner === "joint";
  const right = owner === "b" || owner === "joint";
  const L = "M11.2 4.6a7.4 7.4 0 0 0 0 14.8Z";
  const R = "M12.8 4.6a7.4 7.4 0 0 1 0 14.8Z";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {left ? <path d={L} fill={color} /> : <path d={L} fill="none" stroke="var(--control)" strokeWidth="1.4" />}
      {right ? <path d={R} fill={color} /> : <path d={R} fill="none" stroke="var(--control)" strokeWidth="1.4" />}
    </svg>
  );
}

export function Who({ owner, s, size = "" }: { owner: Owner; s: Settings; size?: "" | "sm" }) {
  const name = nameOf(s, owner);
  return (
    <span className={`who ${owner} ${size}`} role="img" aria-label={name} title={name}>
      <PersonGlyph owner={owner} />
    </span>
  );
}

export function CheckButton({ on, onToggle, label, disabled }: { on: boolean; onToggle: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" className="check" aria-pressed={on} aria-label={label} onClick={onToggle} disabled={disabled}>
      <span className="ring">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="toggle" disabled={disabled} onClick={() => onChange(!on)} />;
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const n = options.length;
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      <span className="thumb" aria-hidden="true" style={{ width: `calc((100% - 6px) / ${n})`, transform: `translateX(${idx * 100}%)` }} />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 같은 자료를 다른 범위로 보는 글자 탭 — 고른 칸만 옅은 인디고 알약 (docs/design-system/components/TextTabs) */
export function TextTabs<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="text-tabs" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ value, options, onChange, label }: { value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 안드로이드 뒤로가기로 시트를 닫는다. 열릴 때 기록을 하나 쌓고,
 * 뒤로가기(popstate)면 닫고, 화면에서 닫으면 쌓은 기록을 되돌린다.
 */
/** 열린 창마다 기록에 남기는 번호 — 겹쳐 연 창(상세 위의 시트)에서 뒤로 가기가 맨 위 하나만 닫게 */
let layerSeq = 0;

export function useBackToClose(open: boolean, onOpenChange: (v: boolean) => void) {
  const pushed = useRef(false);
  const layer = useRef(0);
  const close = useRef(onOpenChange);
  close.current = onOpenChange;
  useEffect(() => {
    if (!open) {
      if (pushed.current) {
        pushed.current = false;
        if (window.history.state?.sheet) window.history.back();
      }
      return;
    }
    // StrictMode가 같은 열린 시트의 effect를 재설치해도 기록은 한 칸만 쌓는다.
    if (!pushed.current) {
      layer.current = ++layerSeq;
      const prev = window.history.state ?? {};
      window.history.pushState({ ...prev, sheet: true, layers: [...(prev.layers ?? []), layer.current] }, "");
      pushed.current = true;
    }
    const id = layer.current;
    const onPop = () => {
      // 위에 겹친 창의 기록만 빠졌으면 이 창은 그대로 둔다
      if (!pushed.current || window.history.state?.layers?.includes(id)) return;
      pushed.current = false;
      close.current(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);
}

/** 시트를 닫으며 다른 화면으로 갈 때: 시트가 쌓은 뒤로가기 기록이 빠진 다음에 옮긴다 (먼저 옮기면 그 뒤로가기가 새 화면을 되돌린다). 시트를 닫기 전에 부른다 */
export function afterSheet(fn: () => void) {
  if (window.history.state?.sheet) window.addEventListener("popstate", () => setTimeout(fn), { once: true });
  else fn();
}

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
  headerAction,
  className = "",
  keep = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerAction?: React.ReactNode;
  className?: string;
  /**
   * 적던 내용이 있으면 true — 바깥 누르기·끌어내리기로는 닫히지 않는다(실수로 잃지 않게).
   * 일부러 닫는 길은 남긴다: 뒤로 가기·Esc·머리의 닫기(×). 바깥을 누르면 시트가 살짝 튀어 안 닫힌다는 것을 보여 준다.
   */
  keep?: boolean;
}) {
  useBackToClose(open, onOpenChange);
  const content = useRef<HTMLDivElement>(null);
  // 연 곳 기억: Drawer.Trigger 없이 open 으로 열어 Radix 가 돌려줄 곳을 모른다 — 열리는 순간의 초점을 잡아 두고, 닫히면(Esc·뒤로 가기·닫기·바깥) 그리로 돌려준다
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  }, [open]);
  const nudge = () => {
    if (still()) return;
    content.current?.animate([{ translate: "0 0" }, { translate: "0 -10px" }, { translate: "0 0" }], { duration: 320, easing: "cubic-bezier(0.3, 0, 0.2, 1)" });
  };
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} dismissible={!keep}>
      <Drawer.Portal>
        <Drawer.Overlay className="sheet-overlay" onClick={keep ? nudge : undefined} />
        <Drawer.Content
          ref={content}
          className={`sheet ${className}`}
          aria-describedby={undefined}
          // 닫기를 막아 둔 동안에도 Esc 는 일부러 닫는 길이라 직접 닫는다
          onEscapeKeyDown={keep ? () => onOpenChange(false) : undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            content.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            const el = opener.current;
            opener.current = null;
            // 연 버튼이 사라졌으면(줄 지우기·메뉴 닫힘) Radix 기본 동작에 맡긴다
            if (!el?.isConnected) return;
            event.preventDefault();
            el.focus({ preventScroll: true });
          }}
        >
          <div className="sheet-handle" aria-hidden="true" />
          {/* 제목이 바뀌면(예: 새 할 일 → 새 일정) 겹쳐 바뀌고, 칸이 생기고 빠지면 시트가 스르륵 늘고 준다 */}
          <Morph className="sheet-head" track=":scope > *">
            <Drawer.Title asChild key={title}>
              <h2>{title}</h2>
            </Drawer.Title>
            {headerAction}
            {keep && (
              <button type="button" className="cal-close sheet-close" aria-label="닫기 (적던 내용은 지워져요)" onClick={() => onOpenChange(false)}>
                <X aria-hidden="true" />
              </button>
            )}
          </Morph>
          <div className="sheet-body">
            <Morph>{children}</Morph>
          </div>
          {footer && <div className="sheet-foot">{footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function Toasts() {
  const { toasts, dismissToast, pending, error, data, reload } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {/* 사라진 토스트는 흐려지고 나머지는 제자리로 내려온다 (들어오기는 .toast 의 @starting-style) */}
      <Morph className="toast-stack" track=":scope > *" enter={false}>
        {/* 남는 토스트(.sticky): 있는 동안 페이지 아래 여백을 그만큼 늘려 맨 아래 내용을 가리지 않는다 (shell.css) */}
        {error && data && (
          <div className="toast stale sticky" role="status">
            <span>최신 내용을 불러오지 못했어요</span>
            <button type="button" onClick={() => void reload()}>
              다시 시도
            </button>
          </div>
        )}
        {pending > 0 && (
          <div className="toast sticky" role="status">
            <span>보내지 못한 저장 {pending}건 · 연결되면 자동으로 보내요</span>
          </div>
        )}
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} dismiss={dismissToast} />
        ))}
      </Morph>
    </div>
  );
}

/** 토스트 한 장: 정한 시간 뒤 사라지되 손가락·초점이 올라가 있는 동안은 멈춘다(WCAG 2.2.1). 실패는 닫을 때까지 남는다 */
function ToastItem({ t, dismiss }: { t: Toast; dismiss: (id: number) => void }) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (t.error || held) return;
    const timer = window.setTimeout(() => dismiss(t.id), t.undo ? 5000 : 2600);
    return () => window.clearTimeout(timer);
  }, [t, held, dismiss]);
  return (
    <div
      className="toast"
      role={t.error ? "alert" : "status"}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false);
      }}
    >
      <span>{t.text}</span>
      {t.undo && (
        <button
          type="button"
          onClick={() => {
            t.undo?.();
            dismiss(t.id);
          }}
        >
          되돌리기
        </button>
      )}
      {t.error && (
        <button type="button" className="toast-close" aria-label="알림 닫기" onClick={() => dismiss(t.id)}>
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** DB 한도와 같은 금액 상한 (migrations/005) */
export const MAX_AMOUNT = 1_000_000_000;
export const MAX_SPENDING = 100_000_000;
export const MAX_GOAL = 10_000_000_000;

export function AmountInput({
  value,
  onChange,
  id,
  placeholder = "0",
  max = MAX_AMOUNT,
}: {
  value: number;
  onChange: (n: number) => void;
  id?: string;
  placeholder?: string;
  max?: number;
}) {
  return (
    <input
      id={id}
      className="input amount"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={value ? num(value) : ""}
      onChange={(e) => onChange(Math.min(max, Number(e.target.value.replace(/[^\d]/g, "")) || 0))}
    />
  );
}

