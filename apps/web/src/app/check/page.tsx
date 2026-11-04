"use client";

import Link from "next/link";
import { AlertTriangle, Clock, Target } from "lucide-react";
import { useData } from "@/lib/store";
import { addMonths, currentMonth, monthRow, nameOf } from "@/lib/calc";
import { FirstRun, MonthHeader } from "@/components/MonthHeader";
import { Money } from "@/components/ui";
import { byUrgency, useTasks, type PaydayGroup, type Task } from "@/components/tasks";
import { dDay, dateWithDay, monthLabel, shortDate } from "@/lib/format";
import { TaskRow } from "@/components/TaskRow";
import { TaskGauge } from "@/components/BudgetCard";
import { MAX_STEPS, StepTrack } from "@/components/StepTrack";
import { Celebrate } from "@/components/Celebrate";

function Rows({ tasks, expandable, fromShown }: { tasks: Task[]; expandable?: boolean; fromShown?: boolean }) {
  return (
    <div className="rows" style={{ ["--inset" as string]: "40px" }}>
      {[...tasks].sort(byUrgency).map((t) => (
        <TaskRow key={t.key} task={t} expandable={expandable} fromShown={fromShown} />
      ))}
    </div>
  );
}

/** 카드 위 이름표 + 끝낸 수, 카드 안에는 할 일 줄만 */
function Section({ id, title, tasks, empty }: { id: string; title: string; tasks: Task[]; empty: string }) {
  const done = tasks.filter((t) => t.done).length;
  return (
    <section className="group" aria-labelledby={id}>
      <div className="group-head">
        <h2 id={id}>{title}</h2>
        {tasks.length > 0 && <span className="aside num">{`${done} / ${tasks.length}`}</span>}
      </div>
      <div className="card">{tasks.length === 0 ? <p className="empty">{empty}</p> : <Rows tasks={tasks} />}</div>
    </section>
  );
}

/** 한 사람의 월급날: 그날 자기 월급통장에서 옮길 돈. 머리는 진행선(StepTrack), 아래는 할 일 줄 */
function PaydaySection({ g, today, name }: { g: PaydayGroup; today: string; name: string }) {
  const id = `pay-${g.person}`;
  const left = g.transfers.filter((t) => !t.done);
  const done = g.transfers.length - left.length;
  const leftAmount = left.reduce((a, t) => a + t.amount, 0);
  const arrived = g.date <= today;
  const early = left.filter((t) => t.early);
  const sum = (l: Task[]) => l.reduce((a, t) => a + t.amount, 0);
  const when = <span className={arrived && left.length > 0 ? "neg" : undefined}>{dDay(g.date, today)}</span>;
  let status: React.ReactNode;
  if (left.length === 0) status = "모두 옮겼어요.";
  else if (!arrived) {
    const onPay = left.filter((t) => !t.early);
    status = (
      <>
        {when}
        {onPay.length > 0 && (
          <>
            {" "}· 월급이 들어오면 <strong className="num">{onPay.length}건</strong> · <Money value={sum(onPay)} />을 옮겨요.
          </>
        )}
        {early.length > 0 && (
          <>
            {" "}결제일이 이번 월급날보다 빠른 <strong className="num">{early.length}건</strong> · <Money value={sum(early)} />은 지난 월급({shortDate(g.prevDate)})에서 미리 옮겨요.
          </>
        )}
      </>
    );
  } else
    status = (
      <>
        {g.date === today ? "오늘 월급날" : when} · 남은 <strong className="num">{left.length}건</strong> · <Money value={leftAmount} />
      </>
    );
  return (
    <section className="card payday" aria-labelledby={id}>
      <div className="card-head">
        <h3 id={id}>{name} 월급날</h3>
        <span className="aside">{dateWithDay(g.date)}</span>
      </div>
      {g.transfers.length === 0 ? (
        <p className="empty">옮길 돈이 없어요. 모두 월급통장에서 바로 나가요.</p>
      ) : (
        <>
          <p className="step-meta">
            <Target aria-hidden="true" />
            <span>
              <b className="num">
                {done} / {g.transfers.length}
              </b>
              건 옮김 · {g.transfers[0].from}에서
            </span>
          </p>
          {g.transfers.length <= MAX_STEPS && <StepTrack done={done} total={g.transfers.length} />}
          <p className="step-meta">
            <Clock aria-hidden="true" />
            <span>{status}</span>
          </p>
          <Rows tasks={g.transfers} expandable fromShown />
        </>
      )}
    </section>
  );
}

export default function CheckPage() {
  const { data, month, today, setMonth } = useData();
  const s = data.settings;
  const { tasks, transfers, pays, bills, settle, issues, paydays, started } = useTasks(month);

  if (!started) {
    return (
      <>
        <MonthHeader title={(l) => `${l} 체크`} />
        <FirstRun />
      </>
    );
  }

  const done = tasks.filter((t) => t.done).length;
  const left = tasks.filter((t) => !t.done);
  const fixed = pays.filter((t) => t.item?.group === "fixed");
  const saving = pays.filter((t) => t.item?.group === "saving");
  const next = addMonths(month, 1);
  const nextReady = monthRow(data, next) !== null;

  return (
    <>
      <MonthHeader title={(l) => `${l} 체크`}>
        <div className="progress-line">
          <TaskGauge done={done} total={tasks.length} />
          <p className="finding">
            {left.length === 0 ? (
              "이번 달 체크를 모두 마쳤어요."
            ) : (
              <>
                <span className="nw">
                  <strong className="num">
                    {done} / {tasks.length}
                  </strong>{" "}
                  완료
                </span>{" "}
                <span className="nw clause">
                  <span className="sep">· </span>남은 일 {left.length}건
                </span>
              </>
            )}
          </p>
        </div>
      </MonthHeader>

      {issues.length > 0 && (
        <div className="notice" role="note" style={{ marginBottom: 16 }}>
          <AlertTriangle aria-hidden="true" />
          <span>
            {issues.length}개 항목은 계좌나 월급통장이 지정되지 않아 이체 목록에서 빠졌어요:{" "}
            {[...new Set(issues.map((i) => i.item.name))].join(", ")}. <Link href="/plan" style={{ textDecoration: "underline" }}>플랜에서 지정하기</Link>
          </span>
        </div>
      )}

      <div className="grid">
        <div className="col span-7">
          <section className="group" aria-labelledby="payday-h">
            <div className="group-head">
              <h2 id="payday-h">월급날에 옮길 돈</h2>
            </div>
            <div className="stack">
              {paydays.map((g) => (
                <PaydaySection key={g.person} g={g} today={today} name={nameOf(s, g.person)} />
              ))}
            </div>
          </section>
        </div>
        <div className="col span-5">
          <Section id="fixed" title="고정비 납부 확인" tasks={fixed} empty="이번 달 고정비가 없어요." />
          <Section id="saving" title="저축·투자 납입" tasks={saving} empty="이번 달 저축 항목이 없어요." />
          <Section id="cards" title="카드값 준비" tasks={bills} empty="이번 달에 결제되는 카드값이 없어요." />
          {settle && <Section id="settle" title="두 사람 정산" tasks={[settle]} empty="" />}
        </div>
      </div>

      <Celebrate
        done={tasks.length > 0 && left.length === 0 && month === currentMonth(s.cycle_start, today)}
        month={month}
        label={monthLabel(month)}
        chips={[
          { name: "옮길 돈", count: transfers.length },
          { name: "고정비", count: fixed.length },
          { name: "저축", count: saving.length },
          { name: "카드값", count: bills.length },
        ].filter((c) => c.count > 0)}
        next={{
          title: `${monthLabel(next)} 플랜 ${nextReady ? "미리 보기" : "미리 만들기"}`,
          sub: nextReady ? "다음 달 배분을 미리 살펴봐요" : "이번 달 배분을 그대로 이어받아요",
          href: "/plan",
          onGo: () => setMonth(next),
        }}
      />
    </>
  );
}
