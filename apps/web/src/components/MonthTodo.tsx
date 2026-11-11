"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CalEvent } from "@/lib/types";
import { REPEAT_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { nameOf, periodOf } from "@/lib/calc";
import { ddayText, occurrences, timeText } from "@/lib/calendar";
import { monthLabel, parseYmd, shortDate } from "@/lib/format";
import { byUrgency, eventTasks, useTasks } from "./tasks";
import { TaskRow } from "./TaskRow";
import { Morph } from "./Morph";
import { Meter } from "./Meter";

/** 접었을 때 보이는 남은 할 일·다가오는 일정 수 */
const BRIEF = 4;
const BRIEF_PLANS = 3;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 달력의 "이번 달 할 일·일정"
 * - 할 일: 체크 화면의 이체·납부·카드값·정산 + 할 일(재산세 내기 등)을 급한 순서로. 여기서 바로 체크한다.
 * - 일정: 체크가 없는 일정과 D-day 의 그달 회차를 날짜 순서로. 누르면 고친다.
 * 접어 두면 남은 할 일과 다가오는 일정 몇 개만, 펼치면 끝낸 일·지난 일정까지 전부.
 * 체크 화면과 같은 가계부 달(예: 10/25~11/24) 기준이다.
 */
export function MonthTodo({ month, onOpenEvent, className = "" }: { month: string; onOpenEvent: (e: CalEvent) => void; className?: string }) {
  const { data, today, toggleCheck } = useData();
  const s = data.settings;
  const { tasks: money } = useTasks(month);
  const p = periodOf(month, s.cycle_start);
  const events = useMemo(() => eventTasks(data, p.start, p.last, toggleCheck), [data, p.start, p.last, toggleCheck]);
  const plans = useMemo(
    () =>
      data.events
        .filter((e) => !e.todo)
        .flatMap((e) => occurrences(e, p.start, p.last))
        .sort((a, b) => a.start.localeCompare(b.start) || (a.event.start_time ?? "").localeCompare(b.event.start_time ?? "") || a.event.title.localeCompare(b.event.title)),
    [data.events, p.start, p.last],
  );
  const [open, setOpen] = useState(false);

  const all = [...money, ...events].sort(byUrgency);
  const left = all.filter((t) => !t.done);
  const done = all.length - left.length;
  const shown = open ? all : left.slice(0, BRIEF);
  const shownPlans = open ? plans : plans.filter((o) => o.end >= today).slice(0, BRIEF_PLANS);
  const more = open ? 0 : all.length - shown.length + plans.length - shownPlans.length;
  const label = monthLabel(month);

  return (
    <section className={`group ${className}`} aria-labelledby="todo-h">
      <div className="group-head">
        <h2 id="todo-h">{label} 할 일·일정</h2>
        <span className="aside num">{`${shortDate(p.start)} – ${shortDate(p.last)}`}</span>
      </div>
      {/* 모두 보기·접기, 체크한 줄이 빠지고 다음 줄이 올라오는 것이 스르륵 */}
      <Morph className="card month-todo" track=":scope > *, .rows > *">
        {all.length === 0 && plans.length === 0 ? (
          <p className="empty">할 일과 일정이 없어요. 날짜를 고르고 일정 추가(+)로 만들거나 플랜을 시작하면 여기에 모여요.</p>
        ) : (
          <>
            {all.length > 0 && (
              <>
                <div className="mt-head">
                  <h3>할 일</h3>
                  <span className="num">{`${done} / ${all.length}`}</span>
                </div>
                <div className="mt-bar" role="progressbar" aria-label={`${label} 할 일`} aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={done}>
                  <Meter thin value={done / all.length} />
                </div>
                {shown.length === 0 ? (
                  <p className="empty">{label} 할 일을 모두 끝냈어요.</p>
                ) : (
                  <div className="rows" style={{ ["--inset" as string]: "40px" }}>
                    {shown.map((t) => (
                      <TaskRow key={t.key} task={t} />
                    ))}
                  </div>
                )}
              </>
            )}
            {plans.length > 0 && (
              <>
                <div className="mt-head">
                  <h3>일정</h3>
                  <span className="num">{`${plans.length}개`}</span>
                </div>
                {shownPlans.length === 0 ? (
                  <p className="empty">남은 일정이 없어요.</p>
                ) : (
                  <div className="rows" style={{ ["--inset" as string]: "52px" }}>
                    {shownPlans.map((o) => {
                      const e = o.event;
                      const d = parseYmd(o.start);
                      const past = o.end < today;
                      return (
                        <button type="button" className={`row ${past ? "past" : ""}`} key={`${e.id}${o.start}`} onClick={() => onOpenEvent(e)}>
                          <span className={`date-lead ${e.owner}`} aria-hidden="true">
                            <b>{d.getDate()}</b>
                            <small>{WEEK[d.getDay()]}</small>
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className="t">{e.title}</div>
                            <div className="s">
                              {[o.start === o.end ? "" : `${shortDate(o.start)}~${shortDate(o.end)}`, timeText(e), e.repeat !== "none" ? REPEAT_LABEL[e.repeat] : "", e.owner !== "joint" ? nameOf(s, e.owner) : "", e.note]
                                .filter(Boolean)
                                .join(" · ") || "하루"}
                            </div>
                          </div>
                          <div className="r">{!past && <span className="s">{ddayText(o, today)}</span>}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
        <div className="card-foot">
          {more > 0 || open ? (
            <button type="button" className="btn ghost sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              {open ? "접기" : `모두 보기 (${more})`}
            </button>
          ) : (
            <span />
          )}
          <Link href="/check" className="aside s">
            체크에서 보기
          </Link>
        </div>
      </Morph>
    </section>
  );
}
