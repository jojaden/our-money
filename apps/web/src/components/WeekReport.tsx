"use client";

import type { Data } from "@/lib/types";
import { addDays, spentByDay, weekOf, type Range } from "@/lib/calendar";
import { num, parseYmd } from "@/lib/format";

/** 일요일·월요일·화요일에 지난주(일~토)를 돌아본다 */
const SHOW_DAYS = 3;

export interface WeekSummary {
  key: string;
  week: Range;
  /** 일~토 하루 지출 */
  days: number[];
  total: number;
  /** 그 전 주 합계 */
  before: number;
}

export function weekSummary(data: Data, today: string): WeekSummary | null {
  if (parseYmd(today).getDay() >= SHOW_DAYS) return null;
  const week = weekOf(addDays(today, -7));
  const spent = spentByDay(data, week.from, week.to);
  const days = Array.from({ length: 7 }, (_, i) => spent.get(addDays(week.from, i)) ?? 0);
  const prev = weekOf(addDays(week.from, -7));
  const before = [...spentByDay(data, prev.from, prev.to).values()].reduce((a, v) => a + v, 0);
  return { key: `week:${week.from}`, week, days, total: days.reduce((a, v) => a + v, 0), before };
}

const md = (d: string) => `${d.slice(5, 7)}.${d.slice(8)}`;

/** "11월 2주차" — 주가 시작한 달에서 몇 번째 주인지 (시작일 기준) */
function weekLabel(from: string): string {
  const d = parseYmd(from);
  return `${d.getMonth() + 1}월 ${Math.ceil(d.getDate() / 7)}주차`;
}

const W = 280;
const H = 64;
const P = 8;

/**
 * 알림 모음 맨 위 "지난주 돌아보기" — "지난주는 351,733원 썼어요" 와 일~토 하루 지출 선.
 * 누르면 그 주 모아 보기(달력)로 간다.
 */
export function WeekReport({ w, onOpen }: { w: WeekSummary; onOpen: () => void }) {
  const max = Math.max(1, ...w.days);
  // 아래 요일 글자(7칸)의 가운데에 점을 둔다
  const x = (i: number) => ((i + 0.5) / 7) * W;
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const path = w.days.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const diff = w.total - w.before;
  return (
    <button type="button" className="week-report" onClick={onOpen}>
      <span className="wr-title">
        <span className="hero-label">지난주 쓴 돈</span>
        <span className="hero-amt">
          {num(w.total)}
          <small>원</small>
        </span>
      </span>
      <span className="wr-sub">
        {weekLabel(w.week.from)} ({md(w.week.from)}~{md(w.week.to)})
        {w.before > 0 && diff !== 0 ? ` · 그 전 주보다 ${num(Math.abs(diff))}원 ${diff > 0 ? "더" : "덜"}` : ""}
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} className="wr-line" aria-hidden="true">
        <path d={path} />
        {w.days.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={3.5} />
        ))}
      </svg>
      <span className="wr-days" aria-hidden="true">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </span>
    </button>
  );
}
