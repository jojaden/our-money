"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BellRing, Check, ChevronDown, ChevronRight, CircleCheck, Clock, Target } from "lucide-react";
import { useData } from "@/lib/store";
import { currentMonth, nameOf, other, periodOf } from "@/lib/calc";
import type { Person } from "@/lib/types";
import { FirstRun, MonthHeader } from "@/components/MonthHeader";
import { Money } from "@/components/ui";
import { byUrgency, eventTasks, useTasks, type PaydayGroup, type Task } from "@/components/tasks";
import { dDay, dateWithDay, monthLabel, num, shortDate } from "@/lib/format";
import { haptic, shareText } from "@/lib/native";
import { nudgeId, sentRecently } from "@/lib/partner";
import { TaskRow } from "@/components/TaskRow";
import { MAX_STEPS, StepTrack } from "@/components/StepTrack";
import { MonthClose } from "@/components/MonthClose";
import { Morph, still, tokens, useMorphFlip } from "@/components/Morph";
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
  // 키보드로 체크하면 그 줄이 목록에서 빠지며 초점이 BODY 로 떨어진다 — 같은 자리(다음 줄)의 체크, 없으면 "끝낸 N건" 줄로 옮긴다
  const list = useRef<HTMLDivElement>(null);
  const fold = useRef<HTMLButtonElement>(null);
  const checked = useRef<{ i: number; t: number } | null>(null);
  const keys = shown.map((t) => t.key).join("|");
  useLayoutEffect(() => {
    const c = checked.current;
    checked.current = null;
    const a = document.activeElement;
    if (!c || (a && a !== document.body) || performance.now() - c.t > 2000) return;
    const checks = [...(list.current?.querySelectorAll<HTMLElement>(":scope > .row .check") ?? [])];
    (checks[Math.min(c.i, checks.length - 1)] ?? fold.current)?.focus({ preventScroll: true });
  }, [keys]);
  return (
    <>
      {shown.length > 0 && (
        <div
          ref={list}
          className="rows"
          style={{ ["--inset" as string]: "40px" }}
          onClickCapture={(e) => {
            const row = (e.target as Element).closest(".check")?.closest(".row");
            if (row && list.current) checked.current = { i: [...list.current.querySelectorAll(":scope > .row")].indexOf(row), t: performance.now() };
          }}
        >
          {shown.map((t) => (
            <TaskRow key={t.key} task={t} expandable={expandable} fromShown={fromShown} />
          ))}
        </div>
      )}
      {done > 0 && (
        <button ref={fold} type="button" className={`fold-row${shown.length > 0 ? " ruled" : ""}`} aria-expanded={open} onClick={() => flip(() => setOpen((v) => !v))}>
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

/** 상대 몫 할 일은 한 줄로 접어 두고("예진 것 2건 · 남은 1건"), 누르면 펼친다 */
function Others({ name, tasks, ruled }: { name: string; tasks: Task[]; ruled: boolean }) {
  const [open, setOpen] = useState(false);
  const flip = useMorphFlip();
  const left = tasks.filter((t) => !t.done).length;
  return (
    <>
      <button type="button" className={`fold-row others${ruled ? " ruled" : ""}`} aria-expanded={open} onClick={() => flip(() => setOpen((v) => !v))}>
        <span className="fold-t">
          {name} 것 {tasks.length}건{left > 0 ? ` · 남은 ${left}건` : " · 모두 끝냄"}
        </span>
        <span className="fold-a">
          {open ? "접기" : "보기"}
          <ChevronDown aria-hidden="true" />
        </span>
      </button>
      {open && <Rows tasks={tasks} />}
    </>
  );
}

/**
 * 카드 위 이름표 + 끝낸 수, 카드 안에는 할 일 줄만. 체크하면 줄이 끝낸 쪽으로 스르륵 옮겨 간다.
 * 내 것·공동 것을 먼저 보이고, 상대 것은 아래 한 줄로 접어 둔다(각자 월급날·카드 결제일이 달라 내 할 일부터)
 */
function Section({ id, title, tasks, empty, foot, me, otherName }: { id: string; title: string; tasks: Task[]; empty: string; foot?: React.ReactNode; me?: Person; otherName?: string }) {
  const done = tasks.filter((t) => t.done).length;
  const theirs = me ? tasks.filter((t) => t.person === other(me)) : [];
  const mine = me ? tasks.filter((t) => t.person !== other(me)) : tasks;
  return (
    <section className="group" aria-labelledby={id}>
      <div className="group-head">
        <h2 id={id}>{title}</h2>
        {tasks.length > 0 && <span className="aside num">{`${done} / ${tasks.length}`}</span>}
      </div>
      <Morph className="card" track=":scope > *, .rows > *" follow quick>
        {tasks.length === 0 ? (
          <p className="empty">{empty}</p>
        ) : (
          <>
            {mine.length > 0 && <Rows tasks={mine} />}
            {theirs.length > 0 && <Others name={otherName ?? ""} tasks={theirs} ruled={mine.length > 0} />}
          </>
        )}
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
      {/* 모두 끝내면 큰 숫자·막대·남은 줄 대신 한 줄로 줄어든다(Morph) — 축하는 100% 화면이 맡는다 */}
      <Morph track=":scope > *">
      {left === 0 && total > 0 ? (
        <p className="done-line">
          <CircleCheck aria-hidden="true" />
          <span id="sum-h">{label}를 모두 끝냈어요</span>
          <span className="num">{`${done} / ${total}`}</span>
        </p>
      ) : (
      <>
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
      </>
      )}
      </Morph>
    </section>
  );
}

/** 한 사람의 월급날: 그날 자기 월급통장에서 옮길 돈. 머리는 칸 나눈 진행 막대(StepTrack), 아래는 할 일 줄 */
/**
 * 콕 찌르기 — 상대 월급날이 지났는데 옮길 돈이 남았으면 상대에게 알린다.
 * 앱 안 알림(nudges 표 → 상대 종·토스트, 하루 한 번)과 함께, 카톡 같은 앱으로 보낼 글을 공유 창으로 연다.
 */
function NudgeFoot({ g, name, month, count, amount }: { g: PaydayGroup; name: string; month: string; count: number; amount: number }) {
  const { data, me, upsert, toast } = useData();
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (busy) return;
    setBusy(true);
    haptic(10);
    const title = `${name} 월급날 옮길 돈 ${count}건 · ${num(amount)}원이 남았어요`;
    const again = sentRecently(data.nudges, me, g.person, month, Date.now());
    // 저장은 시작만 하고 공유 창을 먼저 연다 — 공유·복사는 누른 순간(사용자 제스처) 안에 불러야 막히지 않는다
    const saving = again ? Promise.resolve(true) : upsert("nudges", [{ id: nudgeId(), to_person: g.person, month, title }]);
    const r = await shareText(`[우리 집 가계부] ${title}`);
    const ok = await saving;
    setBusy(false);
    // 저장이 거절되면(019 전 DB 등) 스토어가 이미 "저장하지 못했어요"를 띄운다 — 알렸다고 하지 않는다
    if (!ok) return;
    toast(again ? "오늘은 앱 알림을 이미 보냈어요" : r === "copied" ? `${name}에게 알렸어요 · 보낼 글을 복사했어요` : `${name}에게 알렸어요`);
  };
  return (
    <div className="card-foot">
      <span className="s">앱 알림과 함께 카톡으로도 보낼 수 있어요</span>
      <button type="button" className="btn" disabled={busy} onClick={() => void send()}>
        <BellRing aria-hidden="true" /> 콕 찌르기
      </button>
    </div>
  );
}

function PaydaySection({ g, today, name, month, quiet = false }: { g: PaydayGroup; today: string; name: string; month: string; quiet?: boolean }) {
  const { data, doneSeq, toast } = useData();
  // 콕 찌르기는 이번 달에만 — 받는 쪽 종은 이번 달 옮길 돈이 남았을 때만 보여 준다
  const current = month === currentMonth(data.settings.cycle_start, today);
  const id = `pay-${g.person}`;
  // 상대의 월급날은 머리와 남은 상태 한 줄만, 옮길 돈 줄은 눌러야 펼친다
  const [open, setOpen] = useState(!quiet);
  const flip = useMorphFlip();
  const left = g.transfers.filter((t) => !t.done);
  const done = g.transfers.length - left.length;
  const leftAmount = left.reduce((a, t) => a + t.amount, 0);
  const arrived = g.date <= today;
  const early = left.filter((t) => t.early);
  const sum = (l: Task[]) => l.reduce((a, t) => a + t.amount, 0);
  // 내 월급날 옮길 돈을 이 기기에서 마지막 하나까지 체크한 순간: 카드가 살짝 부풀고 진동·토스트 (월급날 의식의 끝)
  const card = useRef<HTMLElement>(null);
  const seen = useRef({ left: left.length, seq: doneSeq });
  useEffect(() => {
    const was = seen.current;
    seen.current = { left: left.length, seq: doneSeq };
    if (quiet || was.left === 0 || left.length !== 0 || doneSeq === was.seq) return;
    haptic([10, 50, 14]);
    toast(`${name} 월급날 옮길 돈을 모두 옮겼어요`);
    const t = tokens();
    if (!still()) card.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.02)", offset: 0.4 }, { transform: "scale(1)" }], { duration: t.move, easing: t.out });
  }, [left.length, doneSeq, quiet, name, toast]);
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
    <section className="card payday" aria-labelledby={id} ref={card}>
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
          {open && g.transfers.length <= MAX_STEPS && <StepTrack done={done} total={g.transfers.length} />}
          <p className="step-meta">
            <Clock aria-hidden="true" />
            <span>{status}</span>
          </p>
          {/* 끝낸 건 보기·접기, 나눠 낸 몫 펼치기: 줄이 차례로 떠오르고 상자 높이가 따라간다 */}
          <Morph track=":scope > *, .rows > *" follow quick>
            {open ? (
              <Rows tasks={g.transfers} expandable fromShown />
            ) : (
              <button type="button" className="fold-row ruled" aria-expanded={false} onClick={() => flip(() => setOpen(true))}>
                <span className="fold-t">옮길 돈 {g.transfers.length}건</span>
                <span className="fold-a">
                  보기
                  <ChevronDown aria-hidden="true" />
                </span>
              </button>
            )}
          </Morph>
          {quiet && current && arrived && left.length > 0 && <NudgeFoot g={g} name={name} month={month} count={left.length} amount={leftAmount} />}
        </>
      )}
    </section>
  );
}

export default function CheckPage() {
  const { data, month, today, toggleCheck, me } = useData();
  const otherName = nameOf(data.settings, other(me));
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
  const fixed = pays.filter((t) => t.item?.group === "fixed");
  const saving = pays.filter((t) => t.item?.group === "saving");

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
                {/* 내 월급날을 먼저 (날짜가 늦어도), 상대 월급날은 접어서 */}
                {[...paydays]
                  .sort((x, y) => Number(x.person !== me) - Number(y.person !== me))
                  .map((g) => (
                    <PaydaySection key={g.person} g={g} today={today} name={nameOf(s, g.person)} month={month} quiet={g.person !== me} />
                  ))}
              </div>
            </section>
          </Slot>
        </div>
        <div className="col span-5">
          <Slot k="fixed">
            <Section id="fixed" title="고정비 납부 확인" tasks={fixed} empty="이번 달 고정비가 없어요." me={me} otherName={otherName} />
          </Slot>
          <Slot k="saving">
            <Section id="saving" title="저축·투자 납입" tasks={saving} empty="이번 달 저축 항목이 없어요." me={me} otherName={otherName} />
          </Slot>
          <Slot k="cards">
            <Section id="cards" title="카드값 준비" tasks={bills} empty="이번 달에 결제되는 카드값이 없어요." me={me} otherName={otherName} />
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
                  <Link href="/calendar" className="aside">
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

    </>
  );
}
