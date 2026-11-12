"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Clock, Target } from "lucide-react";
import { useData } from "@/lib/store";
import { addMonths, currentMonth, monthRow, nameOf, periodOf } from "@/lib/calc";
import { FirstRun, MonthHeader } from "@/components/MonthHeader";
import { Money } from "@/components/ui";
import { byUrgency, eventTasks, useTasks, type PaydayGroup, type Task } from "@/components/tasks";
import { dDay, dateWithDay, monthLabel, shortDate } from "@/lib/format";
import { TaskRow } from "@/components/TaskRow";
import { MAX_STEPS, StepTrack } from "@/components/StepTrack";
import { Celebrate } from "@/components/Celebrate";
import { MonthClose } from "@/components/MonthClose";
import { Morph, useMorphFlip } from "@/components/Morph";
import { Arrange, Slot } from "@/components/Arrange";

/** 체크에서 옮길 수 있는 카드와 처음 순서 (폰) */
const CHECK_CARDS = ["summary", "payday", "fixed", "saving", "cards", "settle", "todos", "close"];
import { TaskMeter } from "@/components/BudgetCard";

/** 할 일 줄 — 끝낸 줄은 아래 "✓ 끝낸 N건 · 보기" 한 줄로 접어 남은 일만 보이게 한다 */
function Rows({ tasks, expandable, fromShown }: { tasks: Task[]; expandable?: boolean; fromShown?: boolean }) {
  const [open, setOpen] = useState(false);
  // 보기·접기는 이 컴포넌트만 다시 그리므로 바깥 Morph 에 바뀐다고 알린다
  const flip = useMorphFlip();
  const sorted = [...tasks].sort(byUrgency);
  const done = sorted.filter((t) => t.done).length;
  const shown = open ? sorted : sorted.filter((t) => !t.done);
  return (
    <>
      {shown.length > 0 && (
        <div className="rows" style={{ ["--inset" as string]: "40px" }}>
          {shown.map((t) => (
            <TaskRow key={t.key} task={t} expandable={expandable} fromShown={fromShown} />
          ))}
        </div>
      )}
      {done > 0 && (
        <button type="button" className={`fold-row${shown.length > 0 ? " ruled" : ""}`} aria-expanded={open} onClick={() => flip(() => setOpen((v) => !v))}>
          <span className="fold-t">
            <Check aria-hidden="true" />
            {done === sorted.length ? `모두 끝냈어요 · ${done}건` : `끝낸 ${done}건`}
          </span>
          <span className="fold-a">
            {open ? "접기" : "보기"}
            <ChevronDown aria-hidden="true" />
          </span>
        </button>
      )}
    </>
  );
}

/** 카드 위 이름표 + 끝낸 수, 카드 안에는 할 일 줄만. 체크하면 줄이 끝낸 쪽으로 스르륵 옮겨 간다 */
function Section({ id, title, tasks, empty, foot }: { id: string; title: string; tasks: Task[]; empty: string; foot?: React.ReactNode }) {
  const done = tasks.filter((t) => t.done).length;
  return (
    <section className="group" aria-labelledby={id}>
      <div className="group-head">
        <h2 id={id}>{title}</h2>
        {tasks.length > 0 && <span className="aside num">{`${done} / ${tasks.length}`}</span>}
      </div>
      <Morph className="card" track=":scope > *, .rows > *" follow quick>
        {tasks.length === 0 ? <p className="empty">{empty}</p> : <Rows tasks={tasks} />}
        {foot}
      </Morph>
    </section>
  );
}

/**
 * 맨 위 요약 카드 (토스·뱅크샐러드의 요약 카드처럼) — 화면 머리는 달만 두고 답은 여기에.
 * 큰 숫자는 남은 건수, 그 아래 진행 막대, 남은 묶음마다 한 줄(건수 · 금액). 줄을 누르면 그 섹션으로 내려간다.
 */
function CheckSummary({ label, done, total, parts }: { label: string; done: number; total: number; parts: { id: string; name: string; tasks: Task[] }[] }) {
  const left = total - done;
  const rows = parts
    .map((p) => {
      const l = p.tasks.filter((t) => !t.done);
      return { ...p, count: l.length, amount: l.reduce((a, t) => a + t.amount, 0) };
    })
    .filter((p) => p.count > 0);
  const go = (id: string) => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  return (
    <section className="card check-sum" aria-labelledby="sum-h">
      <div className="sum-head">
        <h2 id="sum-h" className="hero-label">{label}</h2>
        <span className="num">{`${done} / ${total}`}</span>
      </div>
      <p className="hero-amt">
        {left === 0 ? (
          "모두 끝냈어요"
        ) : (
          <>
            {left}
            <small>건 남았어요</small>
          </>
        )}
      </p>
      <TaskMeter done={done} total={total} />
      {rows.length > 0 && (
        <ul className="sum-left">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => go(r.id)}>
                <span className="n">{r.name}</span>
                <span className="v">
                  {r.count}건{r.amount > 0 && <> · <Money value={r.amount} /></>}
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 한 사람의 월급날: 그날 자기 월급통장에서 옮길 돈. 머리는 칸 나눈 진행 막대(StepTrack), 아래는 할 일 줄 */
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
          {/* 끝낸 건 보기·접기, 나눠 낸 몫 펼치기: 줄이 차례로 떠오르고 상자 높이가 따라간다 */}
          <Morph track=":scope > *, .rows > *" follow quick>
            <Rows tasks={g.transfers} expandable fromShown />
          </Morph>
        </>
      )}
    </section>
  );
}

export default function CheckPage() {
  const { data, month, today, setMonth, toggleCheck } = useData();
  const s = data.settings;
  const { tasks, transfers, pays, bills, settle, issues, paydays, started } = useTasks(month);
  // 달력에서 만든 할 일(재산세 내기 등) — 같은 가계부 달(예: 10/25~11/24). 이체·납부 진행률과 축하에는 넣지 않는다
  const p = periodOf(month, s.cycle_start);
  const todos = useMemo(() => eventTasks(data, p.start, p.last, toggleCheck), [data, p.start, p.last, toggleCheck]);

  if (!started) {
    return (
      <>
        <MonthHeader name="체크" />
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
      <MonthHeader name="체크" />

      {issues.length > 0 && (
        <div className="notice" role="note" style={{ marginBottom: 16 }}>
          <AlertTriangle aria-hidden="true" />
          <span>
            {issues.length}개 항목은 계좌나 월급통장이 지정되지 않아 이체 목록에서 빠졌어요:{" "}
            {[...new Set(issues.map((i) => i.item.name))].join(", ")}. <Link href="/plan" style={{ textDecoration: "underline" }}>플랜에서 지정하기</Link>
          </span>
        </div>
      )}

      {/* 폰에서는 카드를 꾹 눌러 옮긴다 */}
      <Arrange page="check" defaults={CHECK_CARDS}>
        <div className="col span-7">
          <Slot k="summary">
            <CheckSummary
              label={`${monthLabel(month)} 체크`}
              done={done}
              total={tasks.length}
              parts={[
                { id: "payday-h", name: "옮길 돈", tasks: transfers },
                { id: "fixed", name: "고정비", tasks: fixed },
                { id: "saving", name: "저축·투자", tasks: saving },
                { id: "cards", name: "카드값", tasks: bills },
                { id: "settle", name: "두 사람 정산", tasks: settle ? [settle] : [] },
              ]}
            />
          </Slot>
          <Slot k="payday">
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
          </Slot>
        </div>
        <div className="col span-5">
          <Slot k="fixed">
            <Section id="fixed" title="고정비 납부 확인" tasks={fixed} empty="이번 달 고정비가 없어요." />
          </Slot>
          <Slot k="saving">
            <Section id="saving" title="저축·투자 납입" tasks={saving} empty="이번 달 저축 항목이 없어요." />
          </Slot>
          <Slot k="cards">
            <Section id="cards" title="카드값 준비" tasks={bills} empty="이번 달에 결제되는 카드값이 없어요." />
          </Slot>
          {settle && (
            <Slot k="settle">
              <Section id="settle" title="두 사람 정산" tasks={[settle]} empty="" />
            </Slot>
          )}
          <Slot k="todos">
            <Section
              id="todos"
              title="할 일"
              tasks={todos}
              empty="이번 달 할 일이 없어요. 달력의 일정 추가에서 ‘할 일’을 고르면 여기에도 모여요."
              foot={
                <div className="card-foot">
                  <span />
                  <Link href="/calendar" className="aside s">
                    달력에서 보기
                  </Link>
                </div>
              }
            />
          </Slot>
          <Slot k="close">
            <MonthClose key={month} month={month} />
          </Slot>
        </div>
      </Arrange>

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
        next={
          // 이번 달은 끝난 뒤에 마감한다(새 달이 되면 홈·종이 묻는다) → 다음 달 플랜으로
          {
            title: `${monthLabel(next)} 플랜 ${nextReady ? "미리 보기" : "미리 만들기"}`,
            sub: nextReady ? "다음 달 배분을 미리 살펴봐요" : "이번 달 배분을 그대로 이어받아요",
            href: "/plan",
            onGo: () => setMonth(next),
          }
        }
      />
    </>
  );
}
