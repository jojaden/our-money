"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Group, Method, MonthItem, Owner, PlanItem } from "@/lib/types";
import { GROUP_LABEL, METHOD_LABEL } from "@/lib/types";
import { blankMonth, useData } from "@/lib/store";
import { deleteOp, upsertOp, type Op } from "@/lib/repo";
import { monthRow, nameOf } from "@/lib/calc";
import { monthLabel } from "@/lib/format";
import { AmountInput, MAX_GOAL, Seg, Sheet, Toggle } from "./ui";

function newId(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`;
}

export function ItemSheet({
  open,
  onOpenChange,
  item,
  group: initialGroup,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: MonthItem;
  group?: Group;
}) {
  const { data, month, batch, toast } = useData();
  const s = data.settings;
  const plan = item?.plan_item_id ? data.plan_items.find((p) => p.id === item.plan_item_id) : undefined;
  const cards = useMemo(() => data.accounts.filter((a) => a.kind === "card" && !a.archived).sort((a, b) => a.sort - b.sort), [data.accounts]);
  const banks = useMemo(() => data.accounts.filter((a) => a.kind === "bank" && !a.archived).sort((a, b) => a.sort - b.sort), [data.accounts]);

  const [name, setName] = useState("");
  const [group, setGroup] = useState<Group>("fixed");
  const [amount, setAmount] = useState(0);
  const [payer, setPayer] = useState<Owner>("joint");
  const [method, setMethod] = useState<Method>("account_auto");
  const [cardId, setCardId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [dueDay, setDueDay] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [goal, setGoal] = useState(0);
  const [goalStart, setGoalStart] = useState(0);
  const [forward, setForward] = useState(true);
  // 기간: 시작·끝 달 (YYYY-MM, 비우면 제한 없음)
  const [ranged, setRanged] = useState(false);
  const [startM, setStartM] = useState("");
  const [endM, setEndM] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setGroup(item?.group ?? initialGroup ?? "fixed");
    setAmount(item?.amount ?? 0);
    setPayer(item?.payer ?? "joint");
    setMethod(item?.method ?? (initialGroup === "living" || initialGroup === "allowance" ? "manual" : "account_auto"));
    setCardId(item?.card_id ?? null);
    setAccountId(item?.account_id ?? null);
    setDueDay(item?.due_day ?? null);
    setNote(item?.note ?? "");
    setGoal(plan?.goal_amount ?? 0);
    setGoalStart(plan?.goal_start ?? 0);
    setForward(true);
    setRanged(Boolean(plan?.start_month || plan?.end_month));
    setStartM(plan?.start_month ?? month);
    setEndM(plan?.end_month ?? "");
  }, [open, item, plan, initialGroup, month]);

  // 이번 달에 이미 있는 항목은 이번 달이 기간 안이어야 한다. 새 항목은 나중 달부터 시작할 수 있다
  const periodOn = forward && ranged;
  const later = periodOn && !item && Boolean(startM) && startM > month;
  const periodError = !periodOn
    ? null
    : item && startM && startM > month
      ? `이번 달 항목이라 시작 달은 ${monthLabel(month)}이나 그 전이어야 해요`
      : endM && endM < (startM && startM > month ? startM : month)
        ? "끝 달은 시작 달과 이번 달보다 앞일 수 없어요"
        : null;
  const valid = name.trim().length > 0 && amount > 0 && (method === "card_auto" ? Boolean(cardId) : true) && !periodError;

  const save = async () => {
    if (!valid) return;
    const fields = {
      group,
      name: name.trim(),
      amount,
      payer,
      method,
      card_id: method === "card_auto" ? cardId : null,
      account_id: method === "card_auto" ? null : accountId,
      due_day: dueDay,
      note: note.trim(),
    };
    // 플랜 항목과 이번 달 항목을 한 트랜잭션으로 (하나만 저장되고 끝나지 않게)
    const ops: Op[] = [];
    // 빈 플랜(아직 시작하지 않은 달)에 처음 넣는 항목이면 그 달도 같이 만든다
    let planId = item?.plan_item_id ?? null;
    if (forward) {
      planId = planId ?? newId("pi");
      const base: PlanItem = plan ?? {
        id: planId,
        ...fields,
        sort: Math.max(0, ...data.plan_items.map((p) => p.sort)) + 1,
        active: true,
        goal_amount: null,
        goal_start: null,
      };
      ops.push(
        upsertOp("plan_items", [
          {
            ...base,
            ...fields,
            active: true,
            goal_amount: group === "saving" && goal > 0 ? goal : null,
            goal_start: group === "saving" && goal > 0 ? goalStart : null,
            start_month: periodOn && startM ? startM : null,
            end_month: periodOn && endM ? endM : null,
          },
        ]),
      );
    }
    const id = item?.id ?? (planId ? `${month}:${planId}` : `${month}:${newId("one")}`);
    const row: MonthItem = {
      id,
      month,
      plan_item_id: planId,
      sort: item?.sort ?? Math.max(0, ...data.month_items.filter((i) => i.month === month).map((i) => i.sort)) + 1,
      paid: item?.paid ?? false,
      paid_at: item?.paid_at ?? null,
      paid_by: item?.paid_by ?? null,
      paid_amount: item?.paid_amount ?? null,
      ...fields,
      rev: item?.rev,
    };
    // 나중 달부터 시작하는 새 항목은 이번 달에는 넣지 않는다
    if (!later) {
      if (!monthRow(data, month)) ops.push(upsertOp("months", [blankMonth(data, month)], { ignoreDuplicates: true }));
      ops.push(upsertOp("month_items", [row]));
    }
    onOpenChange(false);
    if (!(await batch(ops))) return;
    toast(later ? `저장했어요 · ${monthLabel(startM)}부터 들어가요` : forward ? "저장했어요 · 다음 달부터도 적용" : "이번 달만 바꿨어요");
  };

  const del = async () => {
    if (!item) return;
    const backup = item;
    const planBackup = plan;
    onOpenChange(false);
    // 이번 달에서 빼기와 다음 달부터 끄기를 한 트랜잭션으로
    if (!(await batch([deleteOp("month_items", [item.id]), ...(forward && plan ? [upsertOp("plan_items", [{ ...plan, active: false }])] : [])]))) return;
    toast(forward && plan ? "이번 달과 다음 달부터 뺐어요" : "이번 달에서 뺐어요", () => {
      void batch([...(planBackup ? [upsertOp("plan_items", [planBackup])] : []), upsertOp("month_items", [backup])]);
    });
  };

  const people: { value: Owner; label: string }[] = [
    { value: "joint", label: "공동" },
    { value: "a", label: nameOf(s, "a") },
    { value: "b", label: nameOf(s, "b") },
  ];

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={item ? item.name : `${GROUP_LABEL[group]} 추가`}
      headerAction={
        item && (
          <button type="button" className="btn danger sm" onClick={() => void del()}>
            <Trash2 aria-hidden="true" /> 빼기
          </button>
        )
      }
      footer={
        <button type="button" className="btn block" disabled={!valid} onClick={() => void save()}>
          저장
        </button>
      }
    >
      <div className="field">
        <span className="label">종류</span>
        <Seg
          label="종류"
          value={group}
          onChange={setGroup}
          options={(["fixed", "living", "allowance", "saving"] as Group[]).map((g) => ({ value: g, label: g === "living" ? "생활비" : GROUP_LABEL[g] }))}
        />
      </div>
      <div className="field">
        <label htmlFor="it-name">이름</label>
        <input id="it-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 월세, 실손보험, 적금" maxLength={30} />
      </div>
      <div className="inline-fields field">
        <div className="field">
          <label htmlFor="it-amount">매달 금액</label>
          <AmountInput id="it-amount" value={amount} onChange={setAmount} />
        </div>
        <div className="field" style={{ marginTop: 0 }}>
          <label htmlFor="it-due">{group === "living" || group === "allowance" ? "이체일 (선택)" : "결제·이체일"}</label>
          <select id="it-due" className="select" value={dueDay ?? ""} onChange={(e) => setDueDay(e.target.value ? Number(e.target.value) : null)}>
            <option value="">없음</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                매달 {d}일
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <span className="label">누구 돈에서 나가나요</span>
        <Seg label="부담" value={payer} onChange={setPayer} options={people} />
        {payer === "joint" && <p className="help">공동은 설정한 분담 비율로 나눠서 각자 월급통장에서 옮겨요.</p>}
      </div>
      <div className="field">
        <label htmlFor="it-method">나가는 방식</label>
        <select id="it-method" className="select" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
          {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </select>
      </div>
      {method === "card_auto" ? (
        <div className="field">
          <label htmlFor="it-card">결제 카드</label>
          <select id="it-card" className="select" value={cardId ?? ""} onChange={(e) => setCardId(e.target.value || null)}>
            <option value="">카드 선택</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="help">카드값이 빠져나가는 결제계좌로 돈을 옮기도록 이체 목록에 넣어요.</p>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="it-acc">{group === "saving" ? "넣을 계좌" : "돈이 있어야 하는 계좌"}</label>
          <select id="it-acc" className="select" value={accountId ?? ""} onChange={(e) => setAccountId(e.target.value || null)}>
            <option value="">계좌 선택</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <p className="help">월급통장이 아닌 계좌면 이번 달 ‘옮길 돈’ 목록에 올라가요.</p>
        </div>
      )}
      {group === "saving" && (
        <div className="inline-fields field">
          <div className="field">
            <label htmlFor="it-goal">목표 금액 (선택)</label>
            <AmountInput id="it-goal" value={goal} onChange={setGoal} max={MAX_GOAL} />
          </div>
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="it-goal-start">지금까지 모은 돈</label>
            <AmountInput id="it-goal-start" value={goalStart} onChange={setGoalStart} max={MAX_GOAL} />
          </div>
        </div>
      )}
      <div className="field">
        <label htmlFor="it-note">메모</label>
        <input id="it-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 급여통장에서 연금저축으로 자동이체" maxLength={60} />
      </div>
      <div className="field">
        <div className="switchrow">
          <div>
            <div className="t">다음 달부터도 적용</div>
            <div className="s">끄면 {item ? "이번 달만 바뀌어요" : "이번 달에만 들어가요"}.</div>
          </div>
          <Toggle on={forward} onChange={setForward} label="다음 달부터도 적용" />
        </div>
      </div>
      {forward && (
        <div className="field">
          <div className="switchrow">
            <div>
              <div className="t">기간 정하기</div>
              <div className="s">대출·보험처럼 끝이 있거나 몇 달만 내는 항목</div>
            </div>
            <Toggle on={ranged} onChange={setRanged} label="기간 정하기" />
          </div>
          {ranged && (
            <div className="inline-fields" style={{ marginTop: 8 }}>
              <div className="field" style={{ marginTop: 0 }}>
                <label htmlFor="it-start">시작 달</label>
                <input id="it-start" type="month" className="input" value={startM} onChange={(e) => setStartM(e.target.value)} />
              </div>
              <div className="field" style={{ marginTop: 0 }}>
                <label htmlFor="it-end">끝 달 (선택)</label>
                <input id="it-end" type="month" className="input" value={endM} min={startM || undefined} onChange={(e) => setEndM(e.target.value)} />
              </div>
            </div>
          )}
          {periodError ? (
            <p className="help" role="alert">
              {periodError}
            </p>
          ) : (
            later && <p className="help">이번 달에는 넣지 않고 {monthLabel(startM)}부터 들어가요.</p>
          )}
        </div>
      )}
    </Sheet>
  );
}

export function IncomeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, month, upsert, toast } = useData();
  const s = data.settings;
  const saved = data.months.find((x) => x.id === month);
  // 빈 플랜이면 지난달(없으면 설정) 월급으로 채운 새 달 — 저장하면 그 달이 시작된다
  const m = useMemo(() => saved ?? blankMonth(data, month), [saved, data, month]);
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [extra, setExtra] = useState(0);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setA(m.income_a);
    setB(m.income_b);
    setExtra(m.extra_income);
    setNote(m.extra_note);
  }, [open, m]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="이번 달 수입"
      footer={
        <button
          type="button"
          className="btn block"
          onClick={async () => {
            onOpenChange(false);
            if (!(await upsert("months", [{ ...m, income_a: a, income_b: b, extra_income: extra, extra_note: note.trim() }]))) return;
            toast("수입을 저장했어요");
          }}
        >
          저장
        </button>
      }
    >
      <div className="field">
        <label htmlFor="in-a">{nameOf(s, "a")} 월급 (실수령)</label>
        <AmountInput id="in-a" value={a} onChange={setA} />
      </div>
      <div className="field">
        <label htmlFor="in-b">{nameOf(s, "b")} 월급 (실수령)</label>
        <AmountInput id="in-b" value={b} onChange={setB} />
      </div>
      <div className="field">
        <label htmlFor="in-x">기타 수입</label>
        <AmountInput id="in-x" value={extra} onChange={setExtra} />
        <input className="input" aria-label="기타 수입 메모" placeholder="예: 명절 상여금" value={note} onChange={(e) => setNote(e.target.value)} maxLength={40} />
        <p className="help">기타 수입은 합계에만 더해지고 이체 목록에는 들어가지 않아요.</p>
      </div>
    </Sheet>
  );
}
