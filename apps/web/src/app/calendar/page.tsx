"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { CalEvent } from "@/lib/types";
import { useData } from "@/lib/store";
import { actualAmount, findCheck, nameOf } from "@/lib/calc";
import { ddayText, eventTodo, marksIn, monthGrid, nextOccurrence, spentByDay, timeText, type Mark } from "@/lib/calendar";
import { dateWithDay, num, shortDate } from "@/lib/format";
import { MonthHeader } from "@/components/MonthHeader";
import { CategoryIcon, CheckButton, Money } from "@/components/ui";
import { EventSheet } from "@/components/EventSheet";
import { MonthTodo } from "@/components/MonthTodo";
import { Morph } from "@/components/Morph";
import { PeriodSummary } from "@/components/PeriodSummary";
import { useSheets } from "@/components/Shell";
import { spendingVisual } from "@/lib/categories";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const ORDER: Record<Mark["kind"], number> = { event: 0, payday: 1, card: 2, item: 3 };

/** 칸 안의 짧은 금액: 8,400 / 3.2만 / 120만 */
function short(n: number): string {
  if (n < 10_000) return num(n);
  const man = n / 10_000;
  return `${man >= 100 || Number.isInteger(man) ? Math.round(man) : man.toFixed(1)}만`;
}

/** 그날 끝낼 것(할 일 일정·이체·납부·카드값) — 앞 동그라미로 끝내고, 나머지를 누르면 일정은 고치기, 돈 일은 체크 화면으로 */
function CheckMark({ m, onOpen }: { m: Mark; onOpen: () => void }) {
  const { data, today, toggleCheck, togglePaid } = useData();
  const s = data.settings;
  const st = (() => {
    if (m.item) {
      const i = m.item;
      return { done: i.paid, by: i.paid_by, amount: actualAmount(i), sub: "이체·납부", toggle: () => void togglePaid(i) };
    }
    if (m.bill) {
      const { id, month } = m.bill;
      const c = findCheck(data.checks, id);
      return { done: Boolean(c), by: c?.done_by ?? null, amount: m.amount, sub: "카드값", toggle: () => void toggleCheck({ id, month, kind: "card", amount: m.amount ?? 0 }, !c) };
    }
    const e = m.event!;
    const t = eventTodo(data, m.occ!);
    const when = [m.occ!.start !== m.occ!.end ? `${shortDate(m.occ!.start)}~${shortDate(m.occ!.end)}` : "", timeText(e)].filter(Boolean).join(" · ") || "하루";
    return {
      done: Boolean(t.check),
      by: t.check?.done_by ?? null,
      amount: m.amount,
      sub: `${when}${e.owner !== "joint" ? ` · ${nameOf(s, e.owner)}` : ""}`,
      toggle: () => void toggleCheck({ id: t.id, month: t.month, kind: "event", amount: e.amount ?? 0 }, !t.check),
    };
  })();
  const main = (
    <>
      <div className="t">{m.title}</div>
      <div className="s">
        {st.sub}
        {st.done ? ` · ${st.by ? `${nameOf(s, st.by)} ` : ""}완료` : m.event ? " · 할 일" : ""}
      </div>
    </>
  );
  return (
    <div className={`row cal-mark ${st.done ? "done" : ""}`}>
      <CheckButton on={st.done} onToggle={st.toggle} label={`${m.title} ${st.done ? "완료 취소" : "완료로 표시"}`} />
      {m.event ? (
        <button type="button" className="row-open" onClick={onOpen}>
          {main}
        </button>
      ) : (
        <Link href="/check" className="row-open">
          {main}
        </Link>
      )}
      <div className="r">
        {st.amount ? <Money value={st.amount} /> : null}
        {m.event?.dday && !st.done && <div className="s">{ddayText(m.occ!, today)}</div>}
      </div>
    </div>
  );
}

/**
 * 달력 — 날짜마다 그날 쓴 돈과 월급날·카드 결제일·이체일·일정. 날짜를 누르면 아래에 그날 것이 펼쳐진다(할 일 일정은 바로 체크).
 * 더하기는 그날 머리의 "+ 추가" 하나(시트 맨 위에서 할 일·일정·D-day 를 고른다).
 * 옆에 이번 달 할 일·일정과 D-day, 아래에 기간 모아 보기 (폰에서는 달력 → 그날 → 할 일 → D-day → 모아 보기). 위쪽 막대의 달 넘기기를 그대로 쓴다(가계부 달 이름 = 달력 달).
 */
export default function CalendarPage() {
  const { data, month, today } = useData();
  const s = data.settings;
  const { openSpending } = useSheets();
  const cells = monthGrid(month);
  const from = cells[0];
  const to = cells[cells.length - 1];
  const marks = marksIn(data, from, to);
  const spent = spentByDay(data, from, to);
  const inMonth = (d: string) => d.slice(0, 7) === month;
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked && inMonth(picked) ? picked : inMonth(today) ? today : `${month}-01`;
  const [sheet, setSheet] = useState<{ open: boolean; key: number; event?: CalEvent; date: string }>({ open: false, key: 0, date: day });
  const openEvent = (event?: CalEvent, date = day) => setSheet((x) => ({ open: true, key: x.key + 1, event, date }));

  const monthSpent = [...spent.entries()].filter(([d]) => inMonth(d)).reduce((a, [, v]) => a + v, 0);
  const monthEvents = new Set([...marks.entries()].filter(([d]) => inMonth(d)).flatMap(([, ms]) => ms.filter((m) => m.event).map((m) => m.event!.id))).size;
  // 일정이 먼저(하루 종일 → 시간 순), 그다음 월급날·카드값·이체
  const dayMarks = [...(marks.get(day) ?? [])].sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.event?.start_time ?? "").localeCompare(b.event?.start_time ?? ""));
  const daySpendings = data.spendings.filter((x) => x.date === day).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const ddays = data.events
    .filter((e) => e.dday)
    .map((e) => ({ e, o: nextOccurrence(e, today) }))
    .filter((x): x is { e: CalEvent; o: NonNullable<typeof x.o> } => x.o !== null)
    .sort((a, b) => a.o.start.localeCompare(b.o.start));

  return (
    <>
      <MonthHeader title={(l) => `${l} 달력`} sub={`${Number(month.slice(5))}월 1일 – ${Number(cells.filter(inMonth).at(-1)!.slice(8))}일`}>
        <p className="finding">
          <span className="nw">
            이번 달 쓴 돈 <strong><Money value={monthSpent} /></strong>
          </span>{" "}
          <span className="nw clause">
            <span className="sep">· </span>일정 {monthEvents}개
          </span>
        </p>
      </MonthHeader>

      <div className="grid">
        <div className="col span-7">
          <section className="group o1" aria-label="달력">
            <div className="card cal">
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
                  const kinds = [...new Set(ms.filter((m) => !(m.occ && m.occ.start !== m.occ.end)).map((m) => (m.kind === "payday" ? `k-payday ${m.owner}` : `k-${m.kind}`)))].slice(0, 3);
                  const bars = ms.filter((m) => m.occ && m.occ.start !== m.occ.end).slice(0, 2);
                  const amount = spent.get(d) ?? 0;
                  const label = [dateWithDay(d), amount ? `쓴 돈 ${num(amount)}원` : "", ...ms.map((m) => m.title)].filter(Boolean).join(", ");
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`cal-day ${inMonth(d) ? "" : "out"} ${d === today ? "today" : ""} ${d === day ? "picked" : ""} ${i % 7 === 0 ? "sun" : i % 7 === 6 ? "sat" : ""}`}
                      aria-label={label}
                      aria-pressed={d === day}
                      onClick={() => setPicked(d)}
                    >
                      <span className="n">{Number(d.slice(8))}</span>
                      {amount > 0 && <span className="amt">{short(amount)}</span>}
                      {kinds.length > 0 && (
                        <span className="dots" aria-hidden="true">
                          {kinds.map((k) => (
                            <i key={k} className={k} />
                          ))}
                        </span>
                      )}
                      {bars.map((m) => (
                        <i key={m.event!.id} className={`bar ${m.event!.owner} ${m.occ!.start === d ? "first" : ""} ${m.occ!.end === d ? "last" : ""}`} aria-hidden="true" />
                      ))}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="group o2" aria-labelledby="day-h">
            <div className="group-head">
              <h2 id="day-h">{dateWithDay(day)}</h2>
              <button type="button" className="aside head-btn" onClick={() => openEvent(undefined, day)}>
                <Plus aria-hidden="true" /> 추가
              </button>
            </div>
            {/* 다른 날을 고르면 그날 목록이 겹쳐 바뀐다 */}
            <Morph className="card" track=":scope > *, .rows > *">
              {dayMarks.length === 0 && daySpendings.length === 0 ? (
                <p className="empty" key={day}>
                  이날은 일정도 기록도 없어요.
                </p>
              ) : (
                <div className="rows" key={day}>
                  {dayMarks.map((m, i) =>
                    (m.event?.todo && m.occ) || m.item || m.bill ? (
                      <CheckMark key={m.event ? `e${m.event.id}` : `${m.kind}${i}`} m={m} onOpen={() => openEvent(m.event)} />
                    ) : m.event ? (
                      <button type="button" className="row no-lead cal-mark" key={`e${m.event.id}`} onClick={() => openEvent(m.event)}>
                        <div style={{ minWidth: 0 }}>
                          <div className="t">
                            <i className={`mark-dot k-event ${m.event.owner}`} aria-hidden="true" />
                            {m.title}
                          </div>
                          <div className="s">
                            {[m.occ && m.occ.start !== m.occ.end ? `${shortDate(m.occ.start)}~${shortDate(m.occ.end)}` : "", timeText(m.event)].filter(Boolean).join(" · ") || "하루"}
                            {m.event.owner !== "joint" ? ` · ${nameOf(s, m.event.owner)}` : ""}
                            {m.event.note ? ` · ${m.event.note}` : ""}
                          </div>
                        </div>
                        <div className="r">
                          {m.amount ? <Money value={m.amount} /> : null}
                          {m.event.dday && m.occ && <div className="s">{ddayText(m.occ, today)}</div>}
                        </div>
                      </button>
                    ) : (
                      <Link href="/check" className="row no-lead cal-mark" key={`${m.kind}${i}`}>
                        <div style={{ minWidth: 0 }}>
                          <div className="t">
                            <i className={`mark-dot k-${m.kind} ${m.owner ?? ""}`} aria-hidden="true" />
                            {m.title}
                          </div>
                          <div className="s">옮길 돈은 체크에서</div>
                        </div>
                        <div className="r">{m.amount ? <Money value={m.amount} /> : null}</div>
                      </Link>
                    ),
                  )}
                  {daySpendings.map((x) => (
                    <button type="button" className="row" key={x.id} onClick={() => openSpending(x)}>
                      <CategoryIcon visual={spendingVisual(data, x)} />
                      <div style={{ minWidth: 0 }}>
                        <div className="t">{x.memo || "지출"}</div>
                        <div className="s">{x.owner === "joint" ? "공동" : `${nameOf(s, x.owner)} 용돈`}</div>
                      </div>
                      <div className="r">
                        <Money value={x.amount} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Morph>
          </section>

          <PeriodSummary month={month} day={day} className="o5" />
        </div>

        <div className="col span-5">
          <MonthTodo month={month} onOpenEvent={(e) => openEvent(e)} className="o3" />

          <section className="group o4" aria-labelledby="dday-h">
            <div className="group-head">
              <h2 id="dday-h">D-day</h2>
            </div>
            <Morph className="card" track=":scope > *, .rows > *">
              {ddays.length === 0 ? (
                <p className="empty">날짜를 고르고 &quot;+ 추가&quot;에서 D-day를 고르면(기념일·만기) 여기에 모여요. 할 일도 D-day 세기를 켜면 같이 모여요.</p>
              ) : (
                <div className="rows">
                  {ddays.map(({ e, o }) => (
                    <button type="button" className="row no-lead" key={e.id} onClick={() => openEvent(e)}>
                      <div style={{ minWidth: 0 }}>
                        <div className="t">{e.title}</div>
                        <div className="s">{o.start === o.end ? dateWithDay(o.start) : `${shortDate(o.start)} ~ ${shortDate(o.end)}`}</div>
                      </div>
                      <div className="r">
                        <span className={`pill ${o.start <= today ? "warning" : ""}`}>{ddayText(o, today)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Morph>
          </section>
        </div>
      </div>

      <EventSheet key={sheet.key} open={sheet.open} event={sheet.event} date={sheet.date} onOpenChange={(open) => setSheet((x) => ({ ...x, open }))} />
    </>
  );
}
