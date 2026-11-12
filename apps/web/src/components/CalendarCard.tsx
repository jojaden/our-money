"use client";

import type { Mark } from "@/lib/calendar";
import { dateWithDay, num } from "@/lib/format";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 칸 안의 짧은 금액: 8,400 / 3.2만 / 120만 */
function short(n: number): string {
  if (n < 10_000) return num(n);
  const man = n / 10_000;
  return `${man >= 100 || Number.isInteger(man) ? Math.round(man) : man.toFixed(1)}만`;
}

/**
 * 달력 — 카드로 감싸지 않고 화면 너비를 다 쓴다. 날짜마다 일정 이름(입력한 사람 색)·쓴 돈·돈 일의 점.
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
          const events = ms.filter((m) => m.event);
          const kinds = [...new Set(ms.filter((m) => !m.event).map((m) => (m.kind === "payday" ? `k-payday ${m.owner}` : `k-${m.kind}`)))].slice(0, 3);
          const amount = spent.get(d) ?? 0;
          const income = ms.reduce((a, m) => a + (m.kind === "payday" ? (m.amount ?? 0) : 0), 0);
          const label = [dateWithDay(d), income ? `들어올 돈 ${num(income)}원` : "", amount ? `쓴 돈 ${num(amount)}원` : "", ...ms.map((m) => m.title)].filter(Boolean).join(", ");
          return (
            <button
              key={d}
              type="button"
              className={`cal-day ${inMonth(d) ? "" : "out"} ${d === today ? "today" : ""} ${d === day ? "picked" : ""} ${i % 7 === 0 ? "sun" : i % 7 === 6 ? "sat" : ""}`}
              aria-label={label}
              aria-pressed={d === day}
              onClick={() => onPick(d, true)}
            >
              <span className="n">{Number(d.slice(8))}</span>
              <span className="cal-events" aria-hidden="true">
                {events.slice(0, 3).map((m) => <span className={`cal-event ${m.event!.created_by ?? ""}`} key={m.event!.id}>{m.title}</span>)}
                {events.length > 3 && <span className="cal-more">+{events.length - 3}개</span>}
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
      </div>
    </div>
  );
}
