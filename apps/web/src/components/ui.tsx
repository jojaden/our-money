"use client";

import { useEffect, useRef, useState } from "react";
import {
  Baby,
  Car,
  Coffee,
  Ellipsis,
  Gift,
  Heart,
  House as HomeIcon,
  Package,
  Pill,
  Receipt,
  ShoppingBasket,
  Tag,
  Ticket,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { CatIcon, CatVisual } from "@/lib/categories";
import { Drawer } from "vaul";
import type { Owner, Settings } from "@/lib/types";
import { num } from "@/lib/format";
import { nameOf } from "@/lib/calc";
import { useStore } from "@/lib/store";
import { Morph } from "./Morph";

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

const CAT_ICONS: Record<CatIcon, LucideIcon> = {
  basket: ShoppingBasket,
  utensils: Utensils,
  package: Package,
  car: Car,
  pill: Pill,
  gift: Gift,
  ticket: Ticket,
  more: Ellipsis,
  tag: Tag,
  wallet: Wallet,
  receipt: Receipt,
  coffee: Coffee,
  home: HomeIcon,
  baby: Baby,
  heart: Heart,
};

export function CategoryIcon({ visual, size = "" }: { visual: CatVisual; size?: "" | "sm" }) {
  const Icon = CAT_ICONS[visual.icon];
  return (
    <span className={`cat ${size}`} style={{ background: visual.bg, color: visual.ink }} aria-hidden="true">
      <Icon />
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

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="toggle" onClick={() => onChange(!on)} />;
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
    const id = ++layerSeq;
    const prev = window.history.state ?? {};
    window.history.pushState({ ...prev, sheet: true, layers: [...(prev.layers ?? []), id] }, "");
    pushed.current = true;
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerAction?: React.ReactNode;
  className?: string;
}) {
  useBackToClose(open, onOpenChange);
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="sheet-overlay" />
        <Drawer.Content className={`sheet ${className}`} aria-describedby={undefined}>
          <div className="sheet-handle" aria-hidden="true" />
          {/* 제목이 바뀌면(예: 새 할 일 → 새 일정) 겹쳐 바뀌고, 칸이 생기고 빠지면 시트가 스르륵 늘고 준다 */}
          <Morph className="sheet-head" track=":scope > *">
            <Drawer.Title asChild key={title}>
              <h2>{title}</h2>
            </Drawer.Title>
            {headerAction}
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
  const { toasts, dismissToast, pending } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {/* 사라진 토스트는 흐려지고 나머지는 제자리로 내려온다 (들어오기는 .toast 의 @starting-style) */}
      <Morph className="toast-stack" track=":scope > *" enter={false}>
        {pending > 0 && (
          <div className="toast" role="status">
            <span>보내지 못한 저장 {pending}건 · 연결되면 자동으로 보내요</span>
          </div>
        )}
        {toasts.map((t) => (
          <div className="toast" key={t.id} role="status">
            <span>{t.text}</span>
            {t.undo && (
              <button
                type="button"
                onClick={() => {
                  t.undo?.();
                  dismissToast(t.id);
                }}
              >
                되돌리기
              </button>
            )}
          </div>
        ))}
      </Morph>
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

