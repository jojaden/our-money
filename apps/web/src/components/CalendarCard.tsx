"use client";

import type { CSSProperties } from "react";
import type { Mark } from "@/lib/calendar";
import { dateWithDay, num } from "@/lib/format";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 칸 안의 짧은 금액: 8,400 / 3.2만 / 120만 */
function short(n: number): string {
  if (n < 10_000) return num(n);
  const man = n / 10_000;
  return `${man >= 100 || Number.isInteger(man) ? Math.round(man) : man.toFixed(1)}만`;
}

/** 한 칸에 보이는 하루 일정 수 */
const ROWS = 3;
/** 한 칸에 긋는 기간 줄 수 (넘치면 "+N개") */
const LINES = 4;

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

/** 주마다 기간 일정(이틀 이상)을 줄에 배정한다: 먼저 시작한 것, 같으면 긴 것부터 비어 있는 가장 위 줄로 — 그래야 같은 일정이 매일 같은 줄에 있다 */
function weekSpans(week: string[], marks: Map<string, Mark[]>): Span[] {
  const seen = new Map<string, Mark>();
  for (const d of week) for (const m of marks.get(d) ?? []) if (m.occ && m.occ.start !== m.occ.end) seen.set(`${m.event!.id}:${m.occ.start}`, m);
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
 * 달력 — 카드로 감싸지 않고 화면 너비를 다 쓴다. 날짜마다 일정 이름(입력한 사람 색)·쓴 돈·돈 일의 점.
 * 기간 일정은 이름 없이 날짜 바로 아래 맨 위에 걸친 칸을 잇는 얇은 줄로만 긋는다(칸 위에 겹친 그리드 아이템).
 * 칸에는 그 줄만큼 빈자리를 둬 하루 일정이 아래로 비킨다. 이름은 날짜를 누르면 나오는 목록에 있다.
 * 폰에서는 줄이 남는 높이를 나눠 가져 화면을 꽉 채운다(달력 화면의 첫 칸). 좌우로 밀면 달이 넘어간다.
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
  const inMonth = (d: string) => d.slice(0, 7) === month;
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, w) => weekSpans(cells.slice(w * 7, w * 7 + 7), marks));
  return (
    <div className="cal">
      <div className="cal-week" aria-hidden="true">
        {WEEK.map((w, i) => (
          <span key={w} className={i === 0 ? "sun" : i === 6 ? "sat" : ""}>
            {w}
          </span>
        ))}
      </div>
      <div className="cal-grid" role="grid" aria-label={`${Number(month.slice(5))}월`}>
        {cells.map((d, i) => {
          const ms = marks.get(d) ?? [];
          // 이 칸을 지나는 기간 띠가 쓰는 줄 수만큼 빈자리, 남은 줄에 하루 일정
          // 이 칸을 지나는 기간 줄만큼 빈자리(맨 위), 그 아래 하루 일정
          const spans = weeks[Math.floor(i / 7)].filter((s) => s.c0 <= i % 7 && i % 7 <= s.c1);
          const used = Math.min(LINES, spans.reduce((n, s) => Math.max(n, s.lane + 1), 0));
          const singles = ms.filter((m) => m.event && !(m.occ && m.occ.start !== m.occ.end));
          const hidden = spans.filter((s) => s.lane >= LINES).length + Math.max(0, singles.length - ROWS);
          const kinds = [...new Set(ms.filter((m) => !m.event).map((m) => (m.kind === "payday" ? `k-payday ${m.owner}` : `k-${m.kind}`)))].slice(0, 3);
          const amount = spent.get(d) ?? 0;
          const income = ms.reduce((a, m) => a + (m.kind === "payday" ? (m.amount ?? 0) : 0), 0);
          const label = [dateWithDay(d), income ? `들어올 돈 ${num(income)}원` : "", amount ? `쓴 돈 ${num(amount)}원` : "", ...ms.map((m) => m.title)].filter(Boolean).join(", ");
          return (
            <button
              key={d}
              type="button"
              className={`cal-day ${inMonth(d) ? "" : "out"} ${d === today ? "today" : ""} ${d === day ? "picked" : ""} ${i % 7 === 0 ? "sun" : i % 7 === 6 ? "sat" : ""}`}
              style={{ gridRow: Math.floor(i / 7) + 1, gridColumn: (i % 7) + 1 }}
              aria-label={label}
              aria-pressed={d === day}
              onClick={() => onPick(d, true)}
            >
              <span className="n">{Number(d.slice(8))}</span>
              <span className="cal-events" aria-hidden="true">
                {used > 0 && <span className="cal-lanes" style={{ "--n": used } as CSSProperties} />}
                {singles.slice(0, ROWS).map((m) => <span className={`cal-event ${m.event!.created_by ?? ""}`} key={m.event!.id}>{m.title}</span>)}
                {hidden > 0 && <span className="cal-more">+{hidden}개</span>}
              </span>
              {income > 0 && <span className="amt in">+{short(income)}</span>}
              {amount > 0 && <span className="amt">{short(amount)}</span>}
              {kinds.length > 0 && (
                <span className="dots" aria-hidden="true">
                  {kinds.map((k) => (
                    <i key={k} className={k} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
        {/* 기간 일정: 걸친 칸을 잇는 얇은 줄. 칸 위에 겹치고 누르기는 아래 칸이 받는다 */}
        {weeks.flatMap((spans, w) =>
          spans
            .filter((s) => s.lane < LINES)
            .map((s) => (
              <span
                key={`${s.key}:${w}`}
                className={`cal-line ${s.mark.event!.created_by ?? ""} ${s.head ? "head" : ""} ${s.tail ? "tail" : ""}`}
                style={{ gridRow: w + 1, gridColumn: `${s.c0 + 1} / ${s.c1 + 2}`, "--lane": s.lane } as CSSProperties}
                aria-hidden="true"
              />
            )),
        )}
      </div>
    </div>
  );
}
