// 달력: 일정 반복 펼치기, D-day, 날짜별 표시(월급날·카드 결제일·이체일·일정)와 그날 쓴 돈.
// 달력은 가계부 기간(예: 10/25~11/24)이 아니라 보통 달력 달(11/1~11/30)로 그린다.

import type { CalEvent, Data, Owner } from "./types";
import { cardBills, dateInMonth, itemsOf, monthOf, monthRow, nameOf, needsPayCheck, paydayDate } from "./calc";
import { parseYmd, ymd } from "./format";

/** 일정 한 번 (기간이면 start~end, 끝 날 포함) */
export interface Occurrence {
  event: CalEvent;
  start: string;
  end: string;
}

const DAY = 86_400_000;

function days(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / DAY);
}

function addDays(date: string, n: number): string {
  const d = parseYmd(date);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** 그 해·달의 day 일 (그 달에 없는 날이면 말일 — 2/29 → 2/28, 31일 → 30일) */
function dayIn(y: number, m: number, day: number): string {
  const last = new Date(y, m + 1, 0).getDate();
  return ymd(new Date(y, m, Math.min(day, last)));
}

/** [from, to] (둘 다 포함) 와 겹치는 일정들. 반복은 시작일 이후만 */
export function occurrences(e: CalEvent, from: string, to: string): Occurrence[] {
  const len = e.end_date ? Math.max(0, days(e.start_date, e.end_date)) : 0;
  const first = parseYmd(e.start_date);
  const starts: string[] = [];
  if (e.repeat === "none") starts.push(e.start_date);
  else {
    // 기간이 길면 앞 달·앞 해에 시작한 것이 걸칠 수 있다
    const f = parseYmd(addDays(from, -len));
    const t = parseYmd(to);
    if (e.repeat === "monthly") {
      for (let y = f.getFullYear(), m = f.getMonth(); y < t.getFullYear() || (y === t.getFullYear() && m <= t.getMonth()); m === 11 ? (y++, (m = 0)) : m++) {
        starts.push(dayIn(y, m, first.getDate()));
      }
    } else {
      for (let y = f.getFullYear(); y <= t.getFullYear(); y++) starts.push(dayIn(y, first.getMonth(), first.getDate()));
    }
  }
  return starts
    .filter((s) => s >= e.start_date)
    .map((s) => ({ event: e, start: s, end: addDays(s, len) }))
    .filter((o) => o.end >= from && o.start <= to);
}

/** 오늘 이후(진행 중 포함) 가장 가까운 한 번 — 3년 안에서 찾는다 */
export function nextOccurrence(e: CalEvent, today: string): Occurrence | null {
  return occurrences(e, today, addDays(today, 3 * 366))[0] ?? null;
}

/** D-day 글: "D-12", "오늘", "진행 중 · 3일 남음" */
export function ddayText(o: Occurrence, today: string): string {
  if (o.start > today) return `D-${days(today, o.start)}`;
  if (o.start === o.end || o.end === today) return o.end === today && o.start !== o.end ? "오늘 마감" : "오늘";
  return `진행 중 · ${days(today, o.end)}일 남음`;
}

export type MarkKind = "payday" | "card" | "item" | "event";

/** 달력 칸에 찍는 것 하나 */
export interface Mark {
  kind: MarkKind;
  date: string;
  title: string;
  amount?: number | null;
  owner?: Owner;
  done?: boolean;
  /** 일정이면 그 일정 (눌러서 고치기) */
  event?: CalEvent;
  /** 기간 일정의 시작·끝 (칸마다 띠를 그린다) */
  occ?: Occurrence;
}

/**
 * [from, to] 의 날짜별 표시. 월급날·카드 결제일·고정비/저축 이체일은 가계부 달(기간)마다 계산해서 날짜로 놓는다.
 * 기간 일정은 걸친 날마다 넣는다.
 */
export function marksIn(data: Data, from: string, to: string): Map<string, Mark[]> {
  const s = data.settings;
  const out = new Map<string, Mark[]>();
  const add = (m: Mark) => {
    if (m.date < from || m.date > to) return;
    out.set(m.date, [...(out.get(m.date) ?? []), m]);
  };
  for (let key = monthOf(from, s.cycle_start); key <= monthOf(to, s.cycle_start); key = nextKey(key)) {
    for (const p of ["a", "b"] as const) add({ kind: "payday", date: paydayDate(key, s, p), title: `${nameOf(s, p)} 월급날`, owner: p });
    for (const b of cardBills(data, key)) {
      if (!b.dueDate || b.dueAmount <= 0) continue;
      add({ kind: "card", date: b.dueDate, title: `${b.card.name} 결제`, amount: b.dueAmount, owner: b.card.owner });
    }
    if (monthRow(data, key)) {
      for (const i of itemsOf(data, key)) {
        if (!i.due_day || !needsPayCheck(i)) continue;
        add({ kind: "item", date: dateInMonth(key, i.due_day, s.cycle_start), title: i.name, amount: i.amount, owner: i.payer, done: i.paid });
      }
    }
  }
  for (const e of data.events) {
    for (const o of occurrences(e, from, to)) {
      for (let d = o.start > from ? o.start : from; d <= o.end && d <= to; d = addDays(d, 1)) {
        add({ kind: "event", date: d, title: e.title, amount: e.amount, owner: e.owner, event: e, occ: o });
      }
    }
  }
  return out;
}

function nextKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** 그날 실제로 결제한 돈 (할부도 산 날 전액 — 가계부의 달별 예산과는 다르다) */
export function spentByDay(data: Data, from: string, to: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const x of data.spendings) if (x.date >= from && x.date <= to) out.set(x.date, (out.get(x.date) ?? 0) + x.amount);
  return out;
}

/** 달력 달(YYYY-MM)의 칸: 일요일부터 시작하는 주 단위, 앞뒤 달 날짜 포함 */
export function monthGrid(key: string): string[] {
  const [y, m] = key.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - first.getDay());
  const last = new Date(y, m, 0);
  const cells = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
}
