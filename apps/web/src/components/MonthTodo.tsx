"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useData } from "@/lib/store";
import { periodOf } from "@/lib/calc";
import { monthLabel } from "@/lib/format";
import { byUrgency, eventTasks, useTasks } from "./tasks";
import { TaskRow } from "./TaskRow";

/** 접었을 때 보이는 남은 일 수 */
const BRIEF = 4;

/**
 * 달력의 "이번 달 할 일" — 체크 화면의 이체·납부·카드값·정산에 할 일 일정(재산세 내기 등)을 더해 급한 순서로.
 * 접어 두면 남은 일 몇 개만, 펼치면 끝낸 일까지 전부. 여기서 바로 체크한다.
 * 할 일 일정은 체크 화면과 같은 가계부 달(예: 10/25~11/24) 안의 회차만 넣는다.
 */
export function MonthTodo({ month, className = "" }: { month: string; className?: string }) {
  const { data, toggleCheck } = useData();
  const { tasks: money } = useTasks(month);
  const p = periodOf(month, data.settings.cycle_start);
  const events = useMemo(() => eventTasks(data, p.start, p.last, toggleCheck), [data, p.start, p.last, toggleCheck]);
  const [open, setOpen] = useState(false);

  const all = [...money, ...events].sort(byUrgency);
  const left = all.filter((t) => !t.done);
  const done = all.length - left.length;
  const shown = open ? all : left.slice(0, BRIEF);
  const more = open ? 0 : all.length - shown.length;
  const label = monthLabel(month);

  return (
    <section className={`group ${className}`} aria-labelledby="todo-h">
      <div className="group-head">
        <h2 id="todo-h">{label} 할 일</h2>
        {all.length > 0 && <span className="aside num">{`${done} / ${all.length}`}</span>}
      </div>
      <div className="card month-todo">
        {all.length > 0 && (
          <div className="mt-bar" role="progressbar" aria-label={`${label} 할 일`} aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={done}>
            <i style={{ transform: `scaleX(${done / all.length})` }} />
          </div>
        )}
        {all.length === 0 ? (
          <p className="empty">할 일이 없어요. 일정에서 &quot;할 일로 체크하기&quot;를 켜거나 플랜을 시작하면 여기에 모여요.</p>
        ) : shown.length === 0 ? (
          <p className="empty">{label} 할 일을 모두 끝냈어요.</p>
        ) : (
          <div className="rows" style={{ ["--inset" as string]: "40px" }}>
            {shown.map((t) => (
              <TaskRow key={t.key} task={t} />
            ))}
          </div>
        )}
        <div className="card-foot">
          {more > 0 || open ? (
            <button type="button" className="btn ghost sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              {open ? "접기" : `끝낸 일까지 모두 보기 (${more})`}
            </button>
          ) : (
            <span />
          )}
          <Link href="/check" className="aside s">
            체크에서 보기
          </Link>
        </div>
      </div>
    </section>
  );
}
