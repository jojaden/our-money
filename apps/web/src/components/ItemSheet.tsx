"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Group, Method, MonthItem, Owner, PlanItem } from "@/lib/types";
import { GROUP_LABEL, METHOD_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { AmountInput, Seg, Sheet, Toggle } from "./ui";

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
  const { data, month, upsert, remove, toast } = useData();
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
  }, [open, item, plan, initialGroup]);

  const valid = name.trim().length > 0 && amount > 0 && (method === "card_auto" ? Boolean(cardId) : true);

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
      await upsert("plan_items", [{ ...base, ...fields, active: true, goal_amount: group === "saving" && goal > 0 ? goal : null, goal_start: group === "saving" && goal > 0 ? goalStart : null }]);
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
      ...fields,
      rev: item?.rev,
    };
    onOpenChange(false);
    await upsert("month_items", [row]);
    toast(forward ? "저장했어요 · 다음 달부터도 적용" : "이번 달만 바꿨어요");
  };

  const del = async () => {
    if (!item) return;
    const backup = item;
    const planBackup = plan;
    onOpenChange(false);
    await remove("month_items", [item.id]);
    if (forward && plan) await upsert("plan_items", [{ ...plan, active: false }]);
    toast(forward && plan ? "이번 달과 다음 달부터 뺐어요" : "이번 달에서 뺐어요", () => {
      void upsert("month_items", [backup]);
      if (planBackup) void upsert("plan_items", [planBackup]);
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
            <AmountInput id="it-goal" value={goal} onChange={setGoal} />
          </div>
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="it-goal-start">지금까지 모은 돈</label>
            <AmountInput id="it-goal-start" value={goalStart} onChange={setGoalStart} />
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
    </Sheet>
  );
}

export function IncomeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, month, upsert, toast } = useData();
  const s = data.settings;
  const m = data.months.find((x) => x.id === month);
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [extra, setExtra] = useState(0);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open || !m) return;
    setA(m.income_a);
    setB(m.income_b);
    setExtra(m.extra_income);
    setNote(m.extra_note);
  }, [open, m]);

  if (!m) return null;
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
            await upsert("months", [{ ...m, income_a: a, income_b: b, extra_income: extra, extra_note: note.trim() }]);
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
