"use client";

import { useEffect, useRef, useState } from "react";
import {
  Baby,
  Car,
  ChevronLeft,
  ChevronRight,
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
import type { Group, Owner, Settings } from "@/lib/types";
import { GROUP_LABEL, GROUP_ORDER } from "@/lib/types";
import { num } from "@/lib/format";
import { nameOf, type Lane } from "@/lib/calc";
import { useStore } from "@/lib/store";

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
      <span className="thumb" aria-hidden="true" style={{ width: `calc((100% - 8px) / ${n})`, transform: `translateX(${idx * 100}%)` }} />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
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

export function Track({ value, max, tick }: { value: number; max: number; tick?: number | null }) {
  const ratio = max > 0 ? Math.min(1, value / max) : value > 0 ? 1 : 0;
  const over = value > max;
  return (
    <div className="track-wrap">
      <div className="track" role="img" aria-label={`${num(max)}원 중 ${num(value)}원`}>
        <span className={`fill ${over ? "over" : ""}`} style={{ transform: `scaleX(${ratio})` }} />
      </div>
      {tick !== null && tick !== undefined && max > 0 && <span className="tick" style={{ left: `${Math.min(100, (tick / max) * 100)}%` }} aria-hidden="true" />}
    </div>
  );
}

export function ThinTrack({ value, max }: { value: number; max: number }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="thin track" aria-hidden="true">
      <span className={`fill ${value > max && max > 0 ? "over" : ""}`} style={{ transform: `scaleX(${ratio})` }} />
    </div>
  );
}

/** 한 사람의 월급이 어디로 가는지 보여주는 막대 */
export function LaneBar({ lane, s, scale }: { lane: Lane; s: Settings; scale: number }) {
  const parts = GROUP_ORDER.map((g) => ({ g, v: lane.byGroup[g] })).filter((p) => p.v > 0);
  const left = Math.max(0, lane.left);
  const over = Math.max(0, -lane.left);
  const base = Math.max(scale, lane.allocated);
  const label = parts.map((p) => `${GROUP_LABEL[p.g]} ${num(p.v)}원`).join(", ");
  return (
    <div className="lane">
      <div className="lane-head">
        <Who owner={lane.person} s={s} size="sm" />
        <span className="name">{nameOf(s, lane.person)}</span>
        <Money value={lane.income} />
      </div>
      <div className="bar" role="img" aria-label={`${nameOf(s, lane.person)} 월급 ${num(lane.income)}원: ${label}, 남음 ${num(lane.left)}원`}>
        {parts.map((p) => (
          <span key={p.g} className={p.g} style={{ flexGrow: p.v / base }} />
        ))}
        {left > 0 && <span className="left" style={{ flexGrow: left / base }} />}
        {over > 0 && <span className="over" style={{ flexGrow: over / base }} />}
        {base < scale && <span style={{ flexGrow: (scale - base) / scale, background: "transparent" }} />}
      </div>
      <div className="lane-foot">
        <span>
          공동 부담 <Money value={lane.jointShare} />
        </span>
        <span>
          {lane.left >= 0 ? "남음 " : "부족 "}
          <Money value={Math.abs(lane.left)} className={lane.left < 0 ? "neg" : ""} />
        </span>
      </div>
    </div>
  );
}

export function GroupLegend({ totals, income }: { totals: Record<Group, number>; income: number }) {
  const allocated = GROUP_ORDER.reduce((a, g) => a + totals[g], 0);
  const left = income - allocated;
  const pct = (v: number) => (income > 0 ? `${Math.round((v / income) * 100)}%` : "–");
  return (
    <div className="legend">
      {GROUP_ORDER.map((g) => (
        <div className="li" key={g}>
          <span className={`dot ${g}`} />
          <span>{GROUP_LABEL[g]}</span>
          <Money value={totals[g]} />
          <span className="pct num">{pct(totals[g])}</span>
        </div>
      ))}
      <div className="li">
        <span className="dot left" />
        <span>{left >= 0 ? "배분 안 된 돈" : "초과 배분"}</span>
        <Money value={Math.abs(left)} className={left < 0 ? "neg" : ""} />
        <span className="pct num">{pct(Math.abs(left))}</span>
      </div>
    </div>
  );
}

export function MonthNav() {
  const { month, setMonth } = useStore();
  const shiftMonth = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  return (
    <div className="monthnav">
      <button type="button" className="iconbtn" aria-label="이전 달" onClick={() => shiftMonth(-1)}>
        <ChevronLeft />
      </button>
      <button type="button" className="iconbtn" aria-label="다음 달" onClick={() => shiftMonth(1)}>
        <ChevronRight />
      </button>
    </div>
  );
}

/**
 * 안드로이드 뒤로가기로 시트를 닫는다. 열릴 때 기록을 하나 쌓고,
 * 뒤로가기(popstate)면 닫고, 화면에서 닫으면 쌓은 기록을 되돌린다.
 */
function useBackToClose(open: boolean, onOpenChange: (v: boolean) => void) {
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
    window.history.pushState({ ...(window.history.state ?? {}), sheet: true }, "");
    pushed.current = true;
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      close.current(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);
}

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
  headerAction,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerAction?: React.ReactNode;
}) {
  useBackToClose(open, onOpenChange);
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="sheet-overlay" />
        <Drawer.Content className="sheet" aria-describedby={undefined}>
          <div className="sheet-handle" aria-hidden="true" />
          <div className="sheet-head">
            <Drawer.Title asChild>
              <h2>{title}</h2>
            </Drawer.Title>
            {headerAction}
          </div>
          <div className="sheet-body">{children}</div>
          {footer && <div className="sheet-foot">{footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts" aria-live="polite">
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
    </div>
  );
}

export function AmountInput({ value, onChange, id, placeholder = "0" }: { value: number; onChange: (n: number) => void; id?: string; placeholder?: string }) {
  return (
    <input
      id={id}
      className="input amount"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={value ? num(value) : ""}
      onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
    />
  );
}

export function LaneKey() {
  return (
    <div className="lanekey" aria-hidden="true">
      {GROUP_ORDER.map((g) => (
        <span key={g}>
          <i className={`dot ${g}`} />
          {g === "living" ? "생활비" : GROUP_LABEL[g]}
        </span>
      ))}
      <span>
        <i className="dot left" />
        남음
      </span>
    </div>
  );
}

/**
 * 활동 링 — 예산 대비 사용. 트랙은 같은 색을 옅게, 넘치면 빨강으로 한 바퀴 더 감긴다.
 * pace: 오늘까지 써도 되는 금액 위치에 작은 점.
 */
export function Ring({
  value,
  max,
  pace,
  size = 96,
  stroke = 11,
  color = "var(--accent)",
  center,
  label,
}: {
  value: number;
  max: number;
  pace?: number | null;
  size?: number;
  stroke?: number;
  color?: string;
  center?: React.ReactNode;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = max > 0 ? value / max : value > 0 ? 1 : 0;
  const first = Math.min(1, ratio);
  const over = Math.max(0, Math.min(1, ratio - 1));
  const paceAngle = pace !== null && pace !== undefined && max > 0 ? Math.min(1, pace / max) * 2 * Math.PI - Math.PI / 2 : null;
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.16} strokeWidth={stroke} />
        <circle
          className="ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          style={{ strokeDashoffset: c * (1 - first), ["--c" as string]: c }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        {over > 0 && (
          <circle
            className="ring-arc"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--negative)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            style={{ strokeDashoffset: c * (1 - over), ["--c" as string]: c }}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        {paceAngle !== null && (
          <circle
            cx={size / 2 + r * Math.cos(paceAngle)}
            cy={size / 2 + r * Math.sin(paceAngle)}
            r={stroke / 2 - 2.5}
            fill="var(--surface)"
            stroke="var(--text)"
            strokeWidth={2}
          />
        )}
      </svg>
      {center && <div className="ring-center">{center}</div>}
    </div>
  );
}
