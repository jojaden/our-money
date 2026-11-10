"use client";

import Link from "next/link";
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarPlus, ChevronLeft, Menu, Plus, X } from "lucide-react";
import type { CalEvent, Spending } from "@/lib/types";
import { useData } from "@/lib/store";
import { actualAmount, findCheck, nameOf } from "@/lib/calc";
import { ddayText, eventTodo, marksIn, monthGrid, nextOccurrence, rangeDays, rangeOf, rangeText, spentByDay, timeText, type Mark, type Range } from "@/lib/calendar";
import { leaveSummary, resetSummary } from "@/lib/summaryNav";
import { dateWithDay, monthLabel, shortDate } from "@/lib/format";
import { MonthHeader } from "@/components/MonthHeader";
import { afterSheet, CategoryIcon, CheckButton, Money, Seg, Sheet } from "@/components/ui";
import { EventSheet } from "@/components/EventSheet";
import { MonthTodo } from "@/components/MonthTodo";
import { CalendarCard } from "@/components/CalendarCard";
import { Morph, slideIn } from "@/components/Morph";
import { PeriodSummary } from "@/components/PeriodSummary";
import { usePrimaryAction, useSheets } from "@/components/Shell";
import { spendingVisual } from "@/lib/categories";

const ORDER: Record<Mark["kind"], number> = { event: 0, payday: 1, card: 2, item: 3 };

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

export default function CalendarPage() {
  // 주소의 기간을 읽으려면 Suspense 가 있어야 정적 내보내기가 된다
  return (
    <Suspense fallback={null}>
      <Calendar />
    </Suspense>
  );
}

/**
 * 주소에 기간(?from=…&to=…)이 있으면 모아 보기, 없으면 달력.
 * 바뀔 때 들어가는 쪽은 오른쪽에서, 돌아오는 쪽은 왼쪽에서 밀려 들어온다(애플의 밀어 넣기). 뒤로가기는 브라우저 기록을 따른다.
 */
function Calendar() {
  const q = useSearchParams();
  const range = rangeOf(q.get("from"), q.get("to"));
  const mode = range ? "sum" : "cal";
  const prev = useRef(mode);
  useLayoutEffect(() => {
    if (prev.current === mode) return;
    prev.current = mode;
    window.scrollTo(0, 0);
    slideIn(document.querySelectorAll(".page-enter > *"), mode === "sum" ? 1 : -1);
  }, [mode]);
  return range ? <PeriodView range={range} /> : <CalendarMonth />;
}

/** 모아 보기 — "‹ 달력"으로 돌아가고, 기간 제목을 누르면 달 고르기 시트의 "기간"이 열린다 */
function PeriodView({ range }: { range: Range }) {
  const { today } = useData();
  const router = useRouter();
  const { openMonths } = useSheets();
  const title = rangeText(range, Number(today.slice(0, 4)));
  return (
    <>
      <header className="page-head sum-head">
        <div style={{ minWidth: 0 }}>
          <button type="button" className="back-btn" onClick={() => leaveSummary(router)}>
            <ChevronLeft aria-hidden="true" />
            달력
          </button>
          <div className="title-row">
            <h1>
              <button type="button" className="range-btn" aria-haspopup="dialog" aria-label={`${title}, 기간 바꾸기`} onClick={() => openMonths({ range })}>
                {title}
              </button>
            </h1>
          </div>
          <p className="sub">모아 보기 · {rangeDays(range)}일</p>
        </div>
      </header>
      <PeriodSummary range={range} />
    </>
  );
}

/** 다른 달의 날짜를 눌렀을 때 새 달에서도 선택과 날짜 패널 열기를 이어 간다. */
let carried: { date: string; openDay: boolean } | null = null;

/** 월 달력은 넓게, 날짜 내역과 월 전체 목록은 요청할 때만 아래 패널로 보여 준다. */
function CalendarMonth() {
  const { data, month, today, setMonth } = useData();
  const router = useRouter();
  const { openSpending } = useSheets();
  const cells = monthGrid(month);
  const marks = marksIn(data, cells[0], cells[cells.length - 1]);
  const spent = spentByDay(data, cells[0], cells[cells.length - 1]);
  const inMonth = (d: string) => d.slice(0, 7) === month;
  const [picked, setPicked] = useState<string | null>(() => carried && inMonth(carried.date) ? carried.date : null);
  const day = picked && inMonth(picked) ? picked : inMonth(today) ? today : `${month}-01`;
  const [panel, setPanel] = useState<"day" | "month" | "dday">(() => carried?.openDay ? "day" : "month");
  const [panelOpen, setPanelOpen] = useState(Boolean(carried?.openDay));
  const showPanel = (value: "day" | "month" | "dday") => { setPanel(value); setPanelOpen(true); };
  const returnPanel = useRef<"day" | "month" | "dday" | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; key: number; event?: CalEvent; date: string }>({ open: false, key: 0, date: day });
  useEffect(() => {
    carried = null;
    resetSummary();
  }, []);
  const pick = (date: string, openDay: boolean) => {
    if (inMonth(date)) {
      setPicked(date);
      if (openDay) showPanel("day");
    } else {
      carried = { date, openDay };
      setMonth(date.slice(0, 7));
    }
  };
  const openEvent = (event?: CalEvent, date = day) => setSheet((x) => ({ open: true, key: x.key + 1, event, date }));
  // 패널이 쌓은 기록을 되돌린 뒤 편집·지출 시트를 연다. 뒤로가기가 페이지를 건너뛰지 않게 한다.
  const closeThen = (run: () => void) => {
    afterSheet(run);
    setPanelOpen(false);
  };
  const editEvent = (event?: CalEvent) => {
    returnPanel.current = panel;
    closeThen(() => openEvent(event));
  };
  const closeEvent = (open: boolean) => {
    if (!open && returnPanel.current) {
      const back = returnPanel.current;
      returnPanel.current = null;
      afterSheet(() => showPanel(back));
    }
    setSheet((x) => ({ ...x, open }));
  };
  usePrimaryAction("일정 추가", "event", () => openEvent());
  const monthSpent = [...spent.entries()].filter(([d]) => inMonth(d)).reduce((a, [, v]) => a + v, 0);
  const monthEvents = new Set([...marks.entries()].filter(([d]) => inMonth(d)).flatMap(([, ms]) => ms.filter((m) => m.event).map((m) => m.event!.id))).size;

  return (
    <>
      <MonthHeader
        name="달력"
        sub={`${Number(month.slice(5))}월 1일 – ${Number(cells.filter(inMonth).at(-1)!.slice(8))}일`}
        leading={<button type="button" className="cal-menu" aria-label="달력 메뉴: 이번 달 할 일·일정과 D-day" aria-haspopup="dialog" onClick={() => showPanel("month")}><Menu aria-hidden="true" /></button>}
      >
        <p className="cal-summary">일정 {monthEvents}개 <span aria-hidden="true">·</span> 이번 달 쓴 돈 <Money value={monthSpent} /></p>
      </MonthHeader>
      <section className="calendar-month" aria-label="월 달력">
        <CalendarCard month={month} cells={cells} marks={marks} spent={spent} day={day} today={today} onPick={pick} />
        <p className="cal-hint">날짜를 누르면 그날 일정과 기록이 열려요.</p>
      </section>
      <Sheet
        open={panelOpen}
        onOpenChange={(open) => { if (!open) setPanelOpen(false); }}
        title={panel === "day" ? dateWithDay(day) : `${monthLabel(month)} 모아 보기`}
        className="cal-panel"
        headerAction={<div className="cal-panel-actions">
          {panel === "day" && <button type="button" className="cal-add" aria-label={`${dateWithDay(day)} 일정 추가`} onClick={() => editEvent()}><Plus aria-hidden="true" /></button>}
          <button type="button" className="cal-close" aria-label="달력 패널 닫기" onClick={() => setPanelOpen(false)}><X aria-hidden="true" /></button>
        </div>}
      >
        <div onClickCapture={(e) => {
          // 패널 안의 체크 링크도 먼저 패널 기록을 닫고 이동한다.
          if (!(e.target as Element).closest('a[href="/check"], a[href="/check/"]') || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          closeThen(() => router.push("/check"));
        }}>
          {panel === "day" ? <DayAgenda day={day} marks={marks.get(day) ?? []} onOpenEvent={editEvent} onOpenSpending={(x) => closeThen(() => openSpending(x))} /> : <>
            <Seg label="달력 모아 보기" value={panel === "dday" ? "dday" : "month"} onChange={(value) => setPanel(value)} options={[{ value: "month", label: "할 일·일정" }, { value: "dday", label: "D-day" }]} />
            <div className="cal-overview">
              {panel === "dday" ? <DdayList onOpenEvent={editEvent} /> : <MonthTodo month={month} onOpenEvent={editEvent} />}
            </div>
          </>}
        </div>
      </Sheet>
      <EventSheet key={sheet.key} open={sheet.open} event={sheet.event} date={sheet.date} onOpenChange={closeEvent} />
    </>
  );
}

/** 날짜 패널: 그날 일정·돈 일·지출만 날짜 순으로 보여 준다. */
function DayAgenda({ day, marks, onOpenEvent, onOpenSpending }: { day: string; marks: Mark[]; onOpenEvent: (event?: CalEvent) => void; onOpenSpending: (spending: Spending) => void }) {
  const { data, today } = useData();
  const s = data.settings;
  const dayMarks = [...marks].sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.event?.start_time ?? "").localeCompare(b.event?.start_time ?? ""));
  const daySpendings = data.spendings.filter((x) => x.date === day).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <Morph className="cal-agenda" track=":scope > *, .rows > *">
      {dayMarks.length === 0 && daySpendings.length === 0 ? (
        <div className="cal-empty" key={day}>
          <span className="cal-empty-icon" aria-hidden="true"><CalendarPlus /></span>
          <p className="t">비어 있는 날이에요</p>
          <p className="s">약속이나 할 일을 남겨 두면 달력에 바로 보여요.</p>
          <button type="button" className="btn sm secondary" onClick={() => onOpenEvent()}>
            <Plus aria-hidden="true" />
            일정 추가
          </button>
        </div>
      ) : (
        <div className="rows" key={day}>
          {dayMarks.map((m, i) =>
            (m.event?.todo && m.occ) || m.item || m.bill ? (
              <CheckMark key={m.event ? `e${m.event.id}` : `${m.kind}${i}`} m={m} onOpen={() => onOpenEvent(m.event)} />
            ) : m.event ? (
              <button type="button" className="row no-lead cal-mark" key={`e${m.event.id}`} onClick={() => onOpenEvent(m.event)}>
                <div style={{ minWidth: 0 }}>
                  <div className="t">
                    <i className={`mark-dot k-event ${m.event.created_by ?? ""}`} aria-hidden="true" />
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
            <button type="button" className="row" key={x.id} onClick={() => onOpenSpending(x)}>
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
  );
}

function DdayList({ onOpenEvent }: { onOpenEvent: (event: CalEvent) => void }) {
  const { data, today } = useData();
  const ddays = data.events.filter((e) => e.dday)
    .map((e) => ({ e, o: nextOccurrence(e, today) }))
    .filter((x): x is { e: CalEvent; o: NonNullable<typeof x.o> } => x.o !== null)
    .sort((a, b) => a.o.start.localeCompare(b.o.start));
  return (
    <section className="group cal-ddays" aria-labelledby="dday-h">
      <div className="group-head">
        <h2 id="dday-h">D-day</h2>
      </div>
      <Morph className="card" track=":scope > *, .rows > *">
        {ddays.length === 0 ? (
          <p className="empty">날짜를 고르고 일정 추가(+)에서 D-day를 고르면(기념일·만기) 여기에 모여요. 할 일도 D-day 세기를 켜면 같이 모여요.</p>
        ) : (
          <div className="rows">
            {ddays.map(({ e, o }) => (
              <button type="button" className="row no-lead" key={e.id} onClick={() => onOpenEvent(e)}>
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
  );
}
