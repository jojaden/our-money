// 달력: 일정 반복 펼치기, D-day, 날짜별 표시(월급날·카드 결제일·이체일·일정)와 그날 쓴 돈.
// 달력은 가계부 기간(예: 10/25~11/24)이 아니라 보통 달력 달(11/1~11/30)로 그린다.

import type { CalEvent, Check, Data, MonthItem, Owner, Person, Spending } from "./types";
import { actualAmount, cardBills, checkId, dateInMonth, findCheck, itemsOf, monthOf, monthRow, nameOf, needsPayCheck, paydayDate } from "./calc";
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

export function addDays(date: string, n: number): string {
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
  /** 이체일이면 그 항목 (그날 목록에서 바로 완료) */
  item?: MonthItem;
  /** 카드 결제일이면 그 체크 (checks id·가계부 달) */
  bill?: { id: string; month: string };
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
      add({ kind: "card", date: b.dueDate, title: `${b.card.name} 결제`, amount: b.dueAmount, owner: b.card.owner, bill: { id: checkId("card", key, b.card.id), month: key } });
    }
    if (monthRow(data, key)) {
      for (const i of itemsOf(data, key)) {
        if (!i.due_day || !needsPayCheck(i)) continue;
        add({ kind: "item", date: dateInMonth(key, i.due_day, s.cycle_start), title: i.name, amount: i.amount, owner: i.payer, item: i });
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

/* ---------- 일정 할 일 ---------- */

/** 일정 할 일 한 번 — 반복 일정은 회차마다 따로 끝낸다 (checks 의 event) */
export interface EventTodo {
  occ: Occurrence;
  /** checks id: `e:${가계부 달}:${일정 id}@${회차 시작일}` */
  id: string;
  month: string;
  check?: Check;
}

export function eventTodo(data: Data, occ: Occurrence): EventTodo {
  const month = monthOf(occ.start, data.settings.cycle_start);
  const id = checkId("event", month, `${occ.event.id}@${occ.start}`);
  return { occ, id, month, check: findCheck(data.checks, id) };
}

/** [from, to] 와 겹치는 할 일 일정들 */
export function eventTodos(data: Data, from: string, to: string): EventTodo[] {
  return data.events.filter((e) => e.todo).flatMap((e) => occurrences(e, from, to).map((o) => eventTodo(data, o)));
}

/* ---------- 기간 모아 보기 ---------- */

export interface Range {
  from: string;
  to: string;
}

/** day 가 든 주 (달력과 같이 일요일부터) */
export function weekOf(day: string): Range {
  const from = addDays(day, -parseYmd(day).getDay());
  return { from, to: addDays(from, 6) };
}

/** 달력 달 (1일 ~ 말일) */
export function calendarMonth(key: string): Range {
  const [y, m] = key.split("-").map(Number);
  return { from: `${key}-01`, to: ymd(new Date(y, m, 0)) };
}

/** 끝낸 일 하나 (모아 보기) */
export interface Done {
  date: string;
  title: string;
  amount: number;
  by: Person | null;
}

export interface Summary {
  days: number;
  spent: number;
  spendings: Spending[];
  byOwner: Record<Owner, number>;
  /** 분류별 합 (큰 것부터). 분류가 없으면 category_id null */
  byCategory: { categoryId: string | null; owner: Owner; amount: number; count: number }[];
  done: Done[];
  events: Occurrence[];
}

/**
 * [from, to] 를 모아서: 쓴 돈(산 날 기준, 할부는 전액), 끝낸 일(이체·납부·카드값·정산·일정 할 일 — 끝낸 날 기준), 걸친 일정.
 * 끝낸 날은 폰의 날짜로 센다.
 */
export function summarize(data: Data, from: string, to: string): Summary {
  const spendings = data.spendings.filter((x) => x.date >= from && x.date <= to);
  const byOwner: Record<Owner, number> = { joint: 0, a: 0, b: 0 };
  const cats = new Map<string, Summary["byCategory"][number]>();
  for (const x of spendings) {
    byOwner[x.owner] += x.amount;
    // 분류 없는 개인 용돈은 사람마다 따로 (아이콘이 사람 색 지갑)
    const key = x.category_id ?? `none:${x.owner === "joint" ? "joint" : x.owner}`;
    const c = cats.get(key) ?? { categoryId: x.category_id, owner: x.owner, amount: 0, count: 0 };
    c.amount += x.amount;
    c.count++;
    cats.set(key, c);
  }

  const acc = new Map(data.accounts.map((a) => [a.id, a.name]));
  const inRange = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = ymd(new Date(iso));
    return d >= from && d <= to ? d : null;
  };
  const done: Done[] = [];
  for (const i of data.month_items) {
    const d = i.paid ? inRange(i.paid_at) : null;
    if (d) done.push({ date: d, title: i.name, amount: actualAmount(i), by: i.paid_by });
  }
  for (const c of data.checks) {
    const d = inRange(c.done_at);
    if (d) done.push({ date: d, title: checkTitle(data, c, acc), amount: c.amount, by: c.done_by });
  }
  done.sort((a, b) => b.date.localeCompare(a.date));

  const events = data.events.flatMap((e) => occurrences(e, from, to)).sort((a, b) => a.start.localeCompare(b.start));
  return {
    days: days(from, to) + 1,
    spent: byOwner.joint + byOwner.a + byOwner.b,
    spendings,
    byOwner,
    byCategory: [...cats.values()].sort((a, b) => b.amount - a.amount),
    done,
    events,
  };
}

/** 체크 id 로 무엇을 끝냈는지 (id 모양은 types.ts Check) */
function checkTitle(data: Data, c: Check, acc: Map<string, string>): string {
  const key = c.id.split(":").slice(2).join(":");
  const name = (id: string) => acc.get(id) ?? "지운 계좌";
  if (c.kind === "transfer") {
    const [from, to] = key.split(">");
    return `${name(from)} → ${name(to)} 이체`;
  }
  if (c.kind === "card") return `${name(key)} 결제 준비`;
  if (c.kind === "event") return data.events.find((e) => e.id === key.split("@")[0])?.title ?? "지운 일정";
  return "정산";
}

/* ---------- 시간 ---------- */

/** "19:30" → "오후 7시 30분" */
export function clockText(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}시${m ? ` ${m}분` : ""}`;
}

/** "오후 7시", "오후 7시~9시 30분", "오전 11시~오후 1시", "오후 6시까지". 시간이 없으면 "" */
export function timeText(e: Pick<CalEvent, "start_time" | "end_time">): string {
  const a = e.start_time ? clockText(e.start_time) : "";
  const b = e.end_time ? clockText(e.end_time) : "";
  if (a && b) return `${a}~${a.slice(0, 2) === b.slice(0, 2) ? b.slice(3) : b}`;
  return a || (b ? `${b}까지` : "");
}

const CLOCK = /(?:(오전|오후|아침|낮|저녁|밤|새벽)\s*)?(?:(\d{1,2})\s*시(?!간)(?:\s*(\d{1,2})\s*분|\s*(반))?|(\d{1,2}):(\d{2}))/y;
const MORNING = new Set(["오전", "아침", "새벽"]);

function hhmm(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * pos 에서 시작하는 시각 하나 → 'HH:MM'. 오전·오후를 안 쓴 "N시"는 inherit(범위의 앞 시각)를 따르고,
 * 그것도 없으면 쓰는 지금에 맞춘다: 오전 그 시각이 아직 안 지났으면 오전, 지났으면 오후 (지금 2시에 "5시" → 오후 5시).
 */
function clockAt(text: string, pos: number, nowMin: number, inherit?: string): { hm: string; end: number; meridiem?: string } | null {
  CLOCK.lastIndex = pos;
  const m = CLOCK.exec(text);
  if (!m) return null;
  let h = Number(m[2] ?? m[5]);
  const min = m[4] ? 30 : Number(m[3] ?? m[6] ?? 0);
  if (h > 24 || min > 59) return null;
  const meridiem = m[1] ?? (m[2] ? inherit : undefined);
  if (meridiem && MORNING.has(meridiem)) h = h === 12 ? 0 : h;
  else if (meridiem === "밤" && h === 12) h = 0;
  else if (meridiem) h = h < 12 ? h + 12 : h;
  else if (m[2] && h >= 1 && h <= 12) h = (h % 12) * 60 + min >= nowMin ? h % 12 : (h % 12) + 12;
  return { hm: hhmm(h % 24, min), end: CLOCK.lastIndex, meridiem };
}

/** 제목 속 시간 하나 — index~end 가 그 글자. closed: 뒤에 빈칸이 와서(띄어 써서) 시간 칸으로 옮길 때 */
export interface TimeHit {
  index: number;
  end: number;
  text: string;
  /** 'HH:MM' — "6시까지"처럼 끝만 쓰면 null */
  start: string | null;
  until: string | null;
  closed: boolean;
}

/**
 * 제목에서 처음 나온 시간: "오후5시", "5시", "오전 5시40분", "5시 반", "19:30", "오후 7시~9시", "7시부터 9시까지", "6시까지"(끝만).
 * 낱말 한가운데("2시즌", "3시간")는 시간으로 보지 않는다.
 */
export function findTime(text: string, now: Date): TimeHit | null {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < text.length; i++) {
    // 숫자 한가운데(예: 2026)에서는 시작하지 않는다
    if (/\d/.test(text[i - 1] ?? "")) continue;
    const a = clockAt(text, i, nowMin);
    if (!a) continue;
    let end = a.end;
    let start: string | null = a.hm;
    let until: string | null = null;
    const sep = /\s*(?:부터|~|-|–)\s*/y;
    sep.lastIndex = end;
    if (sep.exec(text)) {
      const b = clockAt(text, sep.lastIndex, nowMin, a.meridiem);
      if (b) {
        const bh = Number(b.hm.slice(0, 2));
        until = b.hm < a.hm && bh < 12 ? hhmm(bh + 12, Number(b.hm.slice(3))) : b.hm;
        end = b.end;
      }
    }
    const tail = /\s*(부터|까지|에|쯤)/y;
    tail.lastIndex = end;
    const t = tail.exec(text);
    if (t) {
      end = tail.lastIndex;
      if (t[1] === "까지" && !until) {
        until = start;
        start = null;
      }
    }
    const next = text[end];
    if (next !== undefined && !/[\s,.!?~\-–)]/.test(next)) continue;
    return { index: i, end, text: text.slice(i, end), start, until, closed: next !== undefined && /\s/.test(next) };
  }
  return null;
}
