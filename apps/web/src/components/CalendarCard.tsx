"use client";

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { Mark } from "@/lib/calendar";
import { eventTodo } from "@/lib/calendar";
import { findCheck } from "@/lib/calc";
import { useData } from "@/lib/store";
import { dateWithDay, num } from "@/lib/format";
import { holidayName, specialDayName } from "@/lib/holidays";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 칸 안의 짧은 금액: 8,400 / 3.2만 / 120만 */
function short(n: number): string {
  if (n < 10_000) return num(n);
  const man = n / 10_000;
  return `${man >= 100 || Number.isInteger(man) ? Math.round(man) : man.toFixed(1)}만`;
}

/** 한 칸에 긋는 기간 막대 수 (넘치면 "+N") */
const LINES = 3;

/** 한 주 안의 기간 일정: c0~c1 칸(0=일요일)에 걸치고 lane 번째 줄에 놓인다 */
interface Span {
  key: string;
  mark: Mark;
  lane: number;
  c0: number;
  c1: number;
  /** 이 주에 첫날·마지막 날이 있으면 그쪽 끝을 둥글게 칸 안쪽에서 끝낸다 */
  head: boolean;
  tail: boolean;
}

/** 이만큼(일) 이상 이어지는 일정은 이름 막대 대신 칸 아래 얇은 선 + 끝나는 날 "마감" (한 달짜리 신고 기간 등) */
const LONG = 7;
const dayNo = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;
/** 기간 일정인가 (이틀 이상), 그중 긴 것인가 */
const ranged = (m: Mark) => Boolean(m.occ && m.occ.start !== m.occ.end);
const isLong = (m: Mark) => ranged(m) && dayNo(m.occ!.end) - dayNo(m.occ!.start) + 1 >= LONG;

/**
 * 주마다 기간 일정을 줄에 배정한다: 먼저 시작한 것, 같으면 긴 것부터 비어 있는 가장 위 줄로 — 그래야 같은 일정이 매일 같은 줄에 있다.
 * long: 짧은 것(이름 막대)과 긴 것(아래 얇은 선)을 따로 배정한다
 */
function weekSpans(week: string[], marks: Map<string, Mark[]>, long: boolean): Span[] {
  const seen = new Map<string, Mark>();
  for (const d of week) for (const m of marks.get(d) ?? []) if (ranged(m) && isLong(m) === long) seen.set(`${m.event!.id}:${m.occ!.start}`, m);
  const lanes: number[] = []; // 줄마다 마지막으로 찬 칸
  return [...seen.entries()]
    .sort(([, a], [, b]) => a.occ!.start.localeCompare(b.occ!.start) || b.occ!.end.localeCompare(a.occ!.end))
    .map(([key, mark]) => {
      const o = mark.occ!;
      const c0 = Math.max(0, week.indexOf(o.start));
      const c1 = week.includes(o.end) ? week.indexOf(o.end) : 6;
      let lane = lanes.findIndex((end) => end < c0);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = c1;
      return { key, mark, lane, c0, c1, head: o.start >= week[0], tail: o.end <= week[6] };
    });
}

/**
 * 칸마다 들어가는 만큼만 보이고 나머지는 "+N개"로 접는다. 칸 높이는 화면마다 달라서 그린 뒤 실제로 재서 정한다.
 * 숨길 때는 "+N개" 줄 자리까지 비운다. 칸 밖으로 넘친 기간 막대 수는 data-extra 로 받는다.
 */
function fitCells(grid: HTMLElement | null) {
  if (!grid) return;
  for (const box of grid.querySelectorAll<HTMLElement>(".cal-events")) {
    const items = [...box.querySelectorAll<HTMLElement>(":scope > .cal-item")];
    const more = box.querySelector<HTMLElement>(":scope > .cal-over");
    if (!more) continue;
    const extra = Number(box.dataset.extra ?? 0);
    for (const i of items) i.hidden = false;
    more.hidden = true;
    const room = box.clientHeight;
    const fits = (limit: number) => items.filter((i) => i.offsetTop + i.offsetHeight <= limit).length;
    let shown = fits(room);
    if (shown < items.length || extra > 0) {
      // 빈 줄은 높이가 0이라 글자를 먼저 넣고 잰다
      more.textContent = "+";
      more.hidden = false;
      shown = fits(room - more.offsetHeight - 2);
      items.slice(shown).forEach((i) => (i.hidden = true));
      more.textContent = `+${items.length - shown + extra}`;
    }
  }
}

/**
 * 달력 — 카드로 감싸지 않고 화면 너비를 다 쓴다. 날짜 칸 안에서 무엇이 있는지 이름으로 바로 읽힌다:
 * - 7일 이상 이어지는 일정(한 달짜리 신고 기간 등)은 막대 대신 걸친 칸 아래 여백에 2px 선, 끝나는 날에 "마감 이름"
 * - 기간 일정(이틀~6일)은 걸친 칸을 잇는 칠한 막대에 이름 (날짜 바로 아래 맨 위, 칸 위에 겹친 그리드 아이템)
 * - 하루 종일 일정은 칠한 칸, 시간이 있는 일정은 왼쪽 막대 + 옅은 바탕 — 색은 공동·현빈·예진(일정의 owner)
 * - 체크(카드값·이체·납부, 할 일 일정)는 앞에 동그라미, 끝내면 채운 동그라미와 옅은 글자
 * - 공휴일은 날짜를 빨갛게(일요일처럼), 칸 첫 줄에 빨간 칸 이름("크리스마스")
 * - 쉬는 날은 아닌 기념일(크리스마스 이브·빼빼로데이·화이트데이…)은 같은 자리에 초록 (일요일이면 날짜는 빨강 그대로)
 * - 들어올 돈(월급날)은 +금액(금액이 없으면 "월급"), 쓴 돈은 금액으로 칸 아래에
 * 폰에서는 줄이 남는 높이를 나눠 가져 화면을 꽉 채운다(달력 화면의 첫 칸). 좌우로 밀면 날짜 칸만 넘어가고 요일 줄은 제자리다.
 */
export function CalendarCard({
  month,
  cells,
  marks,
  spent,
  day,
  today,
  onPick,
}: {
  month: string;
  cells: string[];
  marks: Map<string, Mark[]>;
  spent: Map<string, number>;
  day: string;
  today: string;
  /** 그 달 밖이면 그 달로 넘어간다 */
  onPick: (d: string, openDay: boolean) => void;
}) {
  const { data } = useData();
  const grid = useRef<HTMLDivElement>(null);
  // 그릴 때마다 다시 재고, 칸 크기가 바뀌면(화면 회전·창 크기) 또 잰다
  useLayoutEffect(() => fitCells(grid.current));
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fitCells(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const inMonth = (d: string) => d.slice(0, 7) === month;
  const weekCells = Array.from({ length: Math.ceil(cells.length / 7) }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const weeks = weekCells.map((week) => weekSpans(week, marks, false));
  const threads = weekCells.map((week) => weekSpans(week, marks, true));
  /** 끝낸 체크인가 — 이체·납부는 낸 표시, 카드값은 체크 기록, 할 일 일정은 그 회차의 체크 */
  const done = (m: Mark) => (m.item ? m.item.paid : m.bill ? Boolean(findCheck(data.checks, m.bill.id)) : m.event?.todo && m.occ ? Boolean(eventTodo(data, m.occ).check) : false);
  return (
    <div className="cal">
      <div className="cal-week" aria-hidden="true">
        {WEEK.map((w, i) => (
          <span key={w} className={i === 0 ? "sun" : i === 6 ? "sat" : ""}>
            {w}
          </span>
        ))}
      </div>
      <div className="cal-grid" role="grid" aria-label={`${Number(month.slice(5))}월`} ref={grid} data-month-slide="">
        {cells.map((d, i) => {
          const ms = marks.get(d) ?? [];
          // 이 칸을 지나는 기간 막대만큼 빈자리(맨 위), 그 아래 하루 일정 → 체크
          const spans = weeks[Math.floor(i / 7)].filter((s) => s.c0 <= i % 7 && i % 7 <= s.c1);
          const used = Math.min(LINES, spans.reduce((n, s) => Math.max(n, s.lane + 1), 0));
          // 하루 종일이 먼저, 그다음 시작 시각 순
          const singles = ms
            .filter((m) => m.event && !(m.occ && m.occ.start !== m.occ.end))
            .sort((a, b) => (a.event!.start_time ?? "").localeCompare(b.event!.start_time ?? ""));
          const checks = ms.filter((m) => m.kind === "card" || m.kind === "item");
          // 긴 기간 일정이 끝나는 날: 칸에 "마감 이름" (선만으로는 무엇인지 모르니 끝날에만 이름을 적는다)
          const dues = ms.filter((m) => isLong(m) && m.occ!.end === d);
          const amount = spent.get(d) ?? 0;
          const income = ms.reduce((a, m) => a + (m.kind === "payday" ? (m.amount ?? 0) : 0), 0);
          // 월급 금액을 아직 안 적은 월급날도 표시는 남긴다
          const payday = ms.some((m) => m.kind === "payday");
          // 공휴일(설·추석·크리스마스·대체공휴일…): 날짜를 일요일처럼 빨갛게, 칸 첫 줄에 이름
          const hol = holidayName(d);
          // 쉬는 날은 아니지만 챙기는 날(크리스마스 이브·빼빼로데이…): 초록으로
          const sp = hol ? null : specialDayName(d);
          const label = [dateWithDay(d), hol ?? sp ?? "", income ? `들어올 돈 ${num(income)}원` : "", amount ? `쓴 돈 ${num(amount)}원` : "", ...ms.map((m) => m.title)].filter(Boolean).join(", ");
          return (
            <button
              key={d}
              type="button"
              className={`cal-day ${inMonth(d) ? "" : "out"} ${d === today ? "today" : ""} ${d === day ? "picked" : ""} ${i % 7 === 0 ? "sun" : i % 7 === 6 ? "sat" : ""} ${hol ? "hol" : sp ? "sp" : ""}`}
              style={{ gridRow: Math.floor(i / 7) + 1, gridColumn: (i % 7) + 1 }}
              aria-label={label}
              aria-pressed={d === day}
              onClick={() => onPick(d, true)}
            >
              <span className="n">{Number(d.slice(8))}</span>
              <span className="cal-events" aria-hidden="true" data-extra={spans.filter((s) => s.lane >= LINES).length}>
                {used > 0 && <span className="cal-lanes" style={{ "--n": used } as CSSProperties} />}
                {hol && <span className="cal-item hol">{hol}</span>}
                {sp && <span className="cal-item sp">{sp}</span>}
                {dues.map((m) => (
                  <span key={`due:${m.event!.id}`} className={`cal-item due o-${m.event!.owner} ${m.event!.todo && done(m) ? "done" : ""}`}>
                    {m.event!.todo && <i className="ring" />}
                    <b>마감</b> {m.title}
                  </span>
                ))}
                {singles.map((m) => {
                  const e = m.event!;
                  return (
                    <span key={e.id} className={`cal-item ev o-${e.owner} ${e.start_time ? "timed" : "fill"} ${e.todo && done(m) ? "done" : ""}`}>
                      {e.todo && <i className="ring" />}
                      {m.title}
                    </span>
                  );
                })}
                {checks.map((m, k) => (
                  <span key={`${m.kind}:${k}`} className={`cal-item chk ${done(m) ? "done" : ""}`}>
                    <i className="ring" />
                    {m.title}
                  </span>
                ))}
                <span className="cal-over" hidden />
              </span>
              {payday && <span className="amt in">{income > 0 ? `+${short(income)}` : "월급"}</span>}
              {amount > 0 && <span className="amt">{short(amount)}</span>}
            </button>
          );
        })}
        {/* 기간 일정: 걸친 칸을 잇는 칠한 막대에 이름. 칸 위에 겹치고 누르기는 아래 칸이 받는다 */}
        {weeks.flatMap((spans, w) =>
          spans
            .filter((s) => s.lane < LINES)
            .map((s) => (
              <span
                key={`${s.key}:${w}`}
                className={`cal-line o-${s.mark.event!.owner} ${s.head ? "head" : ""} ${s.tail ? "tail" : ""}`}
                style={{ gridRow: w + 1, gridColumn: `${s.c0 + 1} / ${s.c1 + 2}`, "--lane": s.lane } as CSSProperties}
                aria-hidden="true"
              >
                {s.mark.title}
              </span>
            )),
        )}
        {/* 긴 기간 일정(7일 이상): 걸친 칸 아래 여백에 2px 선만 (두 줄까지). 칸의 자리는 쓰지 않는다 */}
        {threads.flatMap((spans, w) =>
          spans
            .filter((s) => s.lane < 2)
            .map((s) => (
              <span
                key={`${s.key}:${w}`}
                className={`cal-thread o-${s.mark.event!.owner} ${s.head ? "head" : ""} ${s.tail ? "tail" : ""}`}
                style={{ gridRow: w + 1, gridColumn: `${s.c0 + 1} / ${s.c1 + 2}`, "--lane": s.lane } as CSSProperties}
                aria-hidden="true"
              />
            )),
        )}
      </div>
    </div>
  );
}
