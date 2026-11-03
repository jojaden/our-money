"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { FirstRun, MonthHeader } from "@/components/MonthHeader";
import { Money, Ring } from "@/components/ui";
import { byUrgency, useTasks, type PaydayGroup, type Task } from "@/components/tasks";
import { dDay, dateWithDay, shortDate } from "@/lib/format";
import { TaskRow } from "@/components/TaskRow";

function Section({ id, title, aside, tasks, empty, expandable, children }: { id: string; title: string; aside?: React.ReactNode; tasks: Task[]; empty: string; expandable?: boolean; children?: React.ReactNode }) {
  const done = tasks.filter((t) => t.done).length;
  return (
    <section className="card" aria-labelledby={id}>
      <div className="card-head">
        <h2 id={id}>{title}</h2>
        <span className="aside num">{aside ?? (tasks.length > 0 ? `${done} / ${tasks.length}` : "")}</span>
      </div>
      {children}
      {tasks.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <div className="rows" style={{ ["--inset" as string]: "40px" }}>
          {[...tasks].sort(byUrgency).map((t) => (
            <TaskRow key={t.key} task={t} expandable={expandable} />
          ))}
        </div>
      )}
    </section>
  );
}

/** 한 사람의 월급날: 그날 자기 월급통장에서 옮길 돈 */
function PaydaySection({ g, today, name }: { g: PaydayGroup; today: string; name: string }) {
  const left = g.transfers.filter((t) => !t.done);
  const leftAmount = left.reduce((a, t) => a + t.amount, 0);
  const arrived = g.date <= today;
  const early = left.filter((t) => t.early);
  let status: React.ReactNode;
  if (g.transfers.length === 0) status = null;
  else if (left.length === 0) status = "모두 옮겼어요.";
  else if (!arrived) {
    const onPay = left.filter((t) => !t.early);
    const sum = (l: Task[]) => l.reduce((a, t) => a + t.amount, 0);
    status = (
      <>
        {onPay.length > 0 && (
          <>
            월급이 들어오면 <strong className="num">{onPay.length}건</strong> · <Money value={sum(onPay)} />을 옮겨요.{" "}
          </>
        )}
        {early.length > 0 && (
          <>
            결제일이 이번 월급날보다 빠른 <strong className="num">{early.length}건</strong> · <Money value={sum(early)} />은 지난 월급({shortDate(g.prevDate)})에서 미리 옮겨요.
          </>
        )}
      </>
    );
  } else
    status = (
      <>
        {g.date === today ? "오늘 월급날이에요. " : ""}남은 <strong className="num">{left.length}건</strong> · <Money value={leftAmount} />
      </>
    );
  return (
    <Section
      id={`pay-${g.person}`}
      title={`${name} 월급날`}
      aside={
        <>
          {dateWithDay(g.date)} · <span className={arrived && left.length > 0 ? "neg" : undefined}>{dDay(g.date, today)}</span>
        </>
      }
      tasks={g.transfers}
      empty="옮길 돈이 없어요. 모두 월급통장에서 바로 나가요."
      expandable
    >
      {status && (
        <p className="kpi-sub" style={{ margin: "0 0 4px" }}>
          {status}
        </p>
      )}
    </Section>
  );
}

export default function CheckPage() {
  const { data, month, today } = useData();
  const s = data.settings;
  const { tasks, pays, bills, settle, issues, paydays, started } = useTasks(month);

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

  return (
    <>
      <MonthHeader title={(l) => `${l} 체크`}>
        <div className="progress-line">
          <Ring value={done} max={Math.max(1, tasks.length)} size={52} stroke={8} color="var(--accent)" label={`${tasks.length}건 중 ${done}건 완료`} center={<b className="num">{tasks.length ? Math.round((done / tasks.length) * 100) : 0}%</b>} />
          <p className="finding" style={{ margin: 0 }}>
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
          {paydays.map((g) => (
            <PaydaySection key={g.person} g={g} today={today} name={nameOf(s, g.person)} />
          ))}
        </div>
        <div className="col span-5">
          <Section id="fixed" title="고정비 납부 확인" tasks={fixed} empty="이번 달 고정비가 없어요." />
          <Section id="saving" title="저축·투자 납입" tasks={saving} empty="이번 달 저축 항목이 없어요." />
          <Section id="cards" title="카드값 준비" tasks={bills} empty="이번 달에 결제되는 카드값이 없어요." />
          {settle && <Section id="settle" title="두 사람 정산" tasks={[settle]} empty="" />}
        </div>
      </div>
    </>
  );
}
