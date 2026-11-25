"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, Copy } from "lucide-react";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { CheckButton, Money } from "./ui";
import { MiniCard } from "./pass";
import { PaidAmountSheet } from "./PaidAmountSheet";
import { asking, dueState, dueText, waiting, type Task } from "./tasks";
import { useMorphFlip } from "./Morph";
import { shortDate } from "@/lib/format";
import { accountNumberRun } from "@/lib/payee";

/** fromShown: 카드 머리가 이미 "OO 급여통장에서"를 말할 때 이체 줄은 도착 계좌만 쓴다 */
export function TaskRow({ task, expandable = false, fromShown = false }: { task: Task; expandable?: boolean; fromShown?: boolean }) {
  const { data, today, toast } = useData();
  const s = data.settings;
  const [open, setOpen] = useState(false);
  // 받는 곳 계좌번호 복사 — 직접 이체할 때 은행 앱에 붙여 넣는다
  const copyPayee = async (number: string) => {
    try {
      await navigator.clipboard.writeText(number);
      toast("계좌번호를 복사했어요");
    } catch {
      toast("이 기기에서는 복사가 안 돼요", undefined, { error: true });
    }
  };
  // 나눠 낸 몫 펼치기는 이 줄만 다시 그리므로 바깥 Morph(체크 카드·월급날)에 바뀐다고 알린다
  const flip = useMorphFlip();
  const [editing, setEditing] = useState(false);
  const [session, setSession] = useState(0);
  // 완료한 납부는 금액을 눌러 실제로 낸 금액을 적는다
  const editable = task.kind === "pay" && task.done && task.item;
  const state = dueState(task.due, today, task.done);
  const label = `${task.title} ${task.done ? "완료 취소" : "완료로 표시"}`;

  const meta = task.done ? (
    <span className="s">{task.doneBy ? `${nameOf(s, task.doneBy)} 완료` : "완료"}</span>
  ) : waiting(task, today) ? (
    // 아직 월급날 전: 재촉하지 않고 언제 할 일인지만
    <span className="s">{shortDate(task.payday!)} 월급날</span>
  ) : asking(task, today) ? (
    // 자동으로 나가는 돈은 날짜가 지나도 늦은 게 아니라 확인할 일
    <span className="pill">{shortDate(task.due!)} 나갔나요?</span>
  ) : task.early && state !== "overdue" ? (
    <span className="pill warning">미리 · {dueText(task.due, today)}</span>
  ) : state === "overdue" ? (
    <span className="pill negative">{dueText(task.due, today)}</span>
  ) : state === "soon" ? (
    <span className="pill warning">{dueText(task.due, today)}</span>
  ) : task.due ? (
    <span className="s">{dueText(task.due, today)}</span>
  ) : null;

  return (
    <>
      <div className={`row ${task.done ? "done" : ""}`}>
        <CheckButton on={task.done} onToggle={task.toggle} label={label} />
        <div style={{ minWidth: 0 }}>
          {task.kind === "transfer" && fromShown ? (
            <div className="t">{task.to}</div>
          ) : task.kind === "transfer" ? (
            <div className="t flow">
              <span className="acc">{task.from}</span>
              <span className="acc">
                <ArrowRight aria-label="에서" />
                {task.to}
              </span>
            </div>
          ) : (
            // 카드값: 작은 카드 그림이 "카드"를 말하므로 이름만 (읽어 주는 이름은 체크 버튼의 전체 제목)
            <div className="t">
              {task.bill && <MiniCard account={task.bill.card} />}
              {task.bill ? task.bill.card.name : task.title}
            </div>
          )}
          {expandable && task.transfer && task.transfer.parts.length > 1 ? (
            <button
              type="button"
              className="s parts-toggle"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, border: 0, background: "none", padding: 0, color: "var(--muted)", maxWidth: "100%" }}
              aria-expanded={open}
              onClick={() => flip(() => setOpen((v) => !v))}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.sub}</span>
              <ChevronDown aria-hidden="true" width={14} height={14} style={{ flex: "none", transform: open ? "rotate(180deg)" : undefined, transition: "transform 200ms var(--ease-out)" }} />
            </button>
          ) : (
            // 좁은 폰(320px)에서도 끝까지 읽히게 줄을 바꾼다
            <div className="s wrap">{task.sub}</div>
          )}
          {task.payee && (
            <div className="s payee">
              <ArrowRight aria-label="받는 곳" />
              <PayeeText text={task.payee.text} />
              {task.payee.copy && !task.done && (
                <button type="button" className="payee-copy" aria-label={`${task.payee.text} 계좌번호 복사`} onClick={() => void copyPayee(task.payee!.copy!)}>
                  <Copy aria-hidden="true" />
                  복사
                </button>
              )}
            </div>
          )}
          {task.warn && !task.done && <div className="s warn">{task.warn}</div>}
        </div>
        <div className="r">
          {editable ? (
            <button type="button" className="amt-edit" aria-label={`${task.title} 실제로 낸 금액 고치기`} onClick={() => {
                setSession((n) => n + 1);
                setEditing(true);
              }}
            >
              <Money value={task.amount} />
            </button>
          ) : task.kind === "event" && !task.amount ? null : (
            <Money value={task.amount} />
          )}
          <div style={{ marginTop: 2 }}>{meta}</div>
        </div>
      </div>
      {open && task.transfer && (
        <div className="parts">
          {task.transfer.parts.map((p) => (
            <div className="p" key={p.item.id}>
              <span>
                {p.item.name}
                {p.item.payer === "joint" && p.amount !== p.item.amount ? ` (${nameOf(s, task.transfer!.person)} 몫)` : ""}
              </span>
              <Money value={p.amount} />
            </div>
          ))}
        </div>
      )}
      {task.item && task.kind === "pay" && <PaidAmountSheet key={session} open={editing} onOpenChange={setEditing} item={task.item} />}
    </>
  );
}

/** 받는 곳 글 — 계좌번호 조각은 줄을 바꿔도 끊기지 않게 */
function PayeeText({ text }: { text: string }) {
  const run = accountNumberRun(text);
  if (!run) return <span>{text}</span>;
  const at = text.indexOf(run);
  return (
    <span>
      {text.slice(0, at)}
      <span className="nowrap">{run}</span>
      {text.slice(at + run.length)}
    </span>
  );
}
