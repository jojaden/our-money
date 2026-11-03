"use client";

import { useMemo } from "react";
import type { Data, MonthItem, Person } from "@/lib/types";
import { METHOD_LABEL } from "@/lib/types";
import {
  accountMap,
  addMonths,
  cardBills,
  checkId,
  dateInMonth,
  findCheck,
  itemsOf,
  monthRow,
  nameOf,
  needsPayCheck,
  paydayDate,
  settlementOf,
  transfersOf,
  type CardBill,
  type Settlement,
  type Transfer,
  type TransferIssue,
} from "@/lib/calc";
import { parseYmd, shortDate } from "@/lib/format";
import { useData } from "@/lib/store";

export type TaskKind = "transfer" | "pay" | "card" | "settle";

export interface Task {
  key: string;
  kind: TaskKind;
  title: string;
  /** 출발 → 도착 (이체만) */
  from?: string;
  to?: string;
  sub: string;
  amount: number;
  /** 기한 (YYYY-MM-DD) */
  due: string | null;
  /** 이체: 옮길 사람의 이번 달 월급날 (YYYY-MM-DD) */
  payday?: string;
  /** 이체: 결제일이 월급날보다 빨라서 지난 월급에서 미리 옮겨야 함 */
  early?: boolean;
  done: boolean;
  doneBy: Person | null;
  person: Person | "joint";
  transfer?: Transfer;
  item?: MonthItem;
  bill?: CardBill;
  settlement?: Settlement;
  toggle: () => void;
}

export function dueState(due: string | null, today: string, done: boolean): "done" | "overdue" | "soon" | "later" | "none" {
  if (done) return "done";
  if (!due) return "none";
  if (due < today) return "overdue";
  const diff = (parseYmd(due).getTime() - parseYmd(today).getTime()) / 86_400_000;
  return diff <= 3 ? "soon" : "later";
}

/** 월급날이 아직 안 와서 지금 할 수 없는 이체 (미리 옮겨야 하는 것은 제외) */
export function waiting(t: Task, today: string): boolean {
  return t.kind === "transfer" && !t.done && !t.early && Boolean(t.payday) && t.payday! > today;
}

/** 이 사람이 월급날에 할 일 */
export interface PaydayGroup {
  person: Person;
  /** 이번 달 월급날 */
  date: string;
  /** 지난달 월급날 — 결제일이 이번 월급날보다 빠른 이체는 이 월급에서 미리 옮긴다 */
  prevDate: string;
  transfers: Task[];
}

export function dueText(due: string | null, today: string): string {
  if (!due) return "";
  if (due === today) return "오늘";
  const diff = Math.round((parseYmd(due).getTime() - parseYmd(today).getTime()) / 86_400_000);
  if (diff === 1) return "내일";
  if (diff < 0) return `${shortDate(due)} 지남`;
  return `${shortDate(due)}까지`;
}

function names(parts: { item: MonthItem }[]) {
  const n = [...new Set(parts.map((p) => p.item.name))];
  return n.length > 3 ? `${n.slice(0, 3).join("·")} 외 ${n.length - 3}건` : n.join("·");
}

export function useTasks(month: string): {
  tasks: Task[];
  transfers: Task[];
  pays: Task[];
  bills: Task[];
  settle: Task | null;
  issues: TransferIssue[];
  /** 두 사람의 월급날과 그날 옮길 돈 — 이번 달에 먼저 오는 월급날부터 */
  paydays: PaydayGroup[];
  started: boolean;
} {
  const { data, today, toggleCheck, togglePaid } = useData();
  return useMemo(() => build(data, month, today, toggleCheck, togglePaid), [data, month, today, toggleCheck, togglePaid]);
}

function build(
  data: Data,
  month: string,
  today: string,
  toggleCheck: ReturnType<typeof useData>["toggleCheck"],
  togglePaid: ReturnType<typeof useData>["togglePaid"],
) {
  const s = data.settings;
  const m = monthRow(data, month);
  if (!m) return { tasks: [], transfers: [], pays: [], bills: [], settle: null, issues: [], paydays: [], started: false };
  const items = itemsOf(data, month);
  const acc = accountMap(data.accounts);
  const accName = (id: string | null) => (id ? acc.get(id)?.name ?? "삭제된 계좌" : "계좌 미지정");
  const { transfers: tr, issues } = transfersOf(s, m, items, data.accounts);
  const transfers: Task[] = tr.map((t) => {
    const id = checkId("transfer", month, t.id);
    const c = findCheck(data.checks, id);
    // 각자 자기 월급날에 옮긴다. 결제일이 월급날보다 늦으면 그 결제일이 기한,
    // 월급날보다 빠르면 이번 월급으로는 늦으니 지난 월급에서 미리 옮겨 둬야 한다
    const payday = paydayDate(month, s, t.person);
    const pay = t.dueDay ? dateInMonth(month, t.dueDay, s.cycle_start) : null;
    const early = pay !== null && pay < payday;
    return {
      key: id,
      kind: "transfer",
      title: `${accName(t.from)} → ${accName(t.to)}`,
      from: accName(t.from),
      to: accName(t.to),
      sub: early ? `${names(t.parts)} · 결제일 ${shortDate(pay!)}이 월급날보다 빨라요` : names(t.parts),
      amount: t.amount,
      due: pay ?? payday,
      payday,
      early,
      done: Boolean(c),
      doneBy: c?.done_by ?? null,
      person: t.person,
      transfer: t,
      toggle: () => void toggleCheck({ id, month, kind: "transfer", amount: t.amount }, !c),
    };
  });

  const pays: Task[] = items.filter(needsPayCheck).map((i) => {
    const via = i.method === "card_auto" ? accName(i.card_id) : accName(i.account_id);
    return {
      key: i.id,
      kind: "pay",
      title: i.name,
      sub: `${nameOf(s, i.payer)} · ${METHOD_LABEL[i.method]} · ${via}`,
      amount: i.amount,
      due: i.due_day ? dateInMonth(month, i.due_day, s.cycle_start) : null,
      done: i.paid,
      doneBy: i.paid_by,
      person: i.payer,
      item: i,
      toggle: () => void togglePaid(i),
    };
  });

  const bills: Task[] = cardBills(data, month)
    .filter((b) => b.dueAmount > 0)
    .map((b) => {
      const id = checkId("card", month, b.card.id);
      const c = findCheck(data.checks, id);
      return {
        key: id,
        kind: "card",
        title: `${b.card.name} 결제 준비`,
        sub: b.billing ? `${b.billing.name}에 있어야 해요` : "결제 계좌 미지정",
        amount: b.dueAmount,
        due: b.dueDate,
        done: Boolean(c),
        doneBy: c?.done_by ?? null,
        person: b.card.owner,
        bill: b,
        toggle: () => void toggleCheck({ id, month, kind: "card", amount: b.dueAmount }, !c),
      };
    });

  const st = settlementOf(data, month);
  let settle: Task | null = null;
  if (st && st.amount > 0) {
    const id = checkId("settle", month);
    const c = findCheck(data.checks, id);
    settle = {
      key: id,
      kind: "settle",
      title: `${nameOf(s, st.from)} → ${nameOf(s, st.to)} 정산`,
      sub: "공동 지출을 개인 돈으로 먼저 낸 만큼",
      amount: st.amount,
      due: null,
      done: Boolean(c),
      doneBy: c?.done_by ?? null,
      person: st.from,
      settlement: st,
      toggle: () => void toggleCheck({ id, month, kind: "settle", amount: st.amount }, !c),
    };
  }

  const paydays: PaydayGroup[] = (["a", "b"] as Person[])
    .map((p) => ({
      person: p,
      date: paydayDate(month, s, p),
      prevDate: paydayDate(addMonths(month, -1), s, p),
      transfers: transfers.filter((t) => t.person === p),
    }))
    .sort((x, y) => x.date.localeCompare(y.date) || x.person.localeCompare(y.person));

  const tasks = [...transfers, ...pays, ...bills, ...(settle ? [settle] : [])];
  return { tasks, transfers, pays, bills, settle, issues, paydays, started: true };
}

/** 할 일을 급한 순서로 */
export function byUrgency(a: Task, b: Task): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  const ad = a.due ?? "9999";
  const bd = b.due ?? "9999";
  if (ad !== bd) return ad.localeCompare(bd);
  const order = { transfer: 0, pay: 1, card: 2, settle: 3 };
  return order[a.kind] - order[b.kind];
}
