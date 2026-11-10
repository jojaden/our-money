// 플랜과 기록에서 이체 목록, 카드값, 정산, 예산 사용을 계산한다.
// 화면에 보이는 모든 합계는 여기서 행(row)을 더해서 만든다.

import type {
  Account,
  Check,
  CheckKind,
  Data,
  Group,
  Month,
  MonthItem,
  Owner,
  Person,
  PlanItem,
  Settings,
  Spending,
} from "./types";
import { GROUP_ORDER } from "./types";
import { pad, parseYmd, ymd } from "./format";

/* ---------- 기간 ---------- */

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** 날짜가 속한 가계부 월. cycle_start 가 25면 10/25 은 11월이다. */
export function monthOf(date: string, cycleStart: number): string {
  const d = parseYmd(date);
  const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  if (cycleStart > 1 && d.getDate() >= cycleStart) return addMonths(key, 1);
  return key;
}

export function currentMonth(cycleStart: number, today = ymd(new Date())): string {
  return monthOf(today, cycleStart);
}

/** [start, end) — end 는 다음 기간의 첫날 */
export function periodOf(key: string, cycleStart: number): { start: string; end: string; last: string } {
  const [y, m] = key.split("-").map(Number);
  const start = cycleStart > 1 ? new Date(y, m - 2, cycleStart) : new Date(y, m - 1, 1);
  const end = cycleStart > 1 ? new Date(y, m - 1, cycleStart) : new Date(y, m, 1);
  const last = new Date(end.getTime() - 86_400_000);
  return { start: ymd(start), end: ymd(end), last: ymd(last) };
}

export function inPeriod(date: string, p: { start: string; end: string }): boolean {
  return date >= p.start && date < p.end;
}

/** 기간 중 오늘까지 지난 비율 (0~1) 과 남은 일수 */
export function periodProgress(key: string, cycleStart: number, today = ymd(new Date())) {
  const p = periodOf(key, cycleStart);
  const s = parseYmd(p.start).getTime();
  const e = parseYmd(p.end).getTime();
  const t = parseYmd(today).getTime();
  const total = Math.round((e - s) / 86_400_000);
  if (t < s) return { ratio: 0, daysLeft: total, total, state: "future" as const };
  if (t >= e) return { ratio: 1, daysLeft: 0, total, state: "past" as const };
  const elapsed = Math.round((t - s) / 86_400_000) + 1;
  return { ratio: elapsed / total, daysLeft: total - elapsed + 1, total, state: "current" as const };
}

/** 그 달의 특정 일자 (결제일 등). 기간 안의 날짜로 맞춘다. */
export function dateInMonth(key: string, day: number, cycleStart: number): string {
  const p = periodOf(key, cycleStart);
  const [y, m] = key.split("-").map(Number);
  // 31일처럼 그달에 없는 날은 그달 마지막 날 (11월 31일 → 11월 30일)
  const on = (yy: number, mm: number) => ymd(new Date(yy, mm - 1, Math.min(day, new Date(yy, mm, 0).getDate())));
  // 기간이 전달 후반부터 시작하면 결제일이 전달에 있을 수 있다.
  const inThis = on(y, m);
  if (inPeriod(inThis, p)) return inThis;
  const inPrev = on(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);
  if (inPeriod(inPrev, p)) return inPrev;
  return inThis;
}

/* ---------- 사람과 비율 ---------- */

/**
 * 화면에 쓰는 두 사람 이름을 로그인한 계정(users)의 이름으로 맞춘다.
 * 아직 로그인하지 않았거나 이름이 비어 있는 사람은 settings 의 이름을 그대로 쓴다.
 */
export function withUserNames(data: Data): Data {
  const nameFor = (p: Person) => data.users.find((u) => u.person === p)?.name.trim() ?? "";
  const a = nameFor("a") || data.settings.name_a;
  const b = nameFor("b") || data.settings.name_b;
  if (a === data.settings.name_a && b === data.settings.name_b) return data;
  return { ...data, settings: { ...data.settings, name_a: a, name_b: b } };
}

export function nameOf(s: Settings, o: Owner): string {
  if (o === "a") return s.name_a || "A";
  if (o === "b") return s.name_b || "B";
  return "공동";
}

export function other(p: Person): Person {
  return p === "a" ? "b" : "a";
}

export function ratioA(s: Settings, m: Pick<Month, "income_a" | "income_b"> | null): number {
  if (s.split_mode === "income" && m) {
    const total = m.income_a + m.income_b;
    if (total > 0) return m.income_a / total;
  }
  return Math.min(100, Math.max(0, s.ratio_a)) / 100;
}

/** 공동 금액을 두 사람 몫으로 나눈다. 원 단위로 반올림하고 나머지는 B 몫. */
export function split(amount: number, rA: number): { a: number; b: number } {
  const a = Math.round(amount * rA);
  return { a, b: amount - a };
}

export function shareOf(item: Pick<MonthItem, "amount" | "payer">, person: Person, rA: number): number {
  if (item.payer === person) return item.amount;
  if (item.payer === "joint") return split(item.amount, rA)[person];
  return 0;
}

export function salaryAccount(s: Settings, p: Person): string | null {
  return p === "a" ? s.salary_account_a : s.salary_account_b;
}

/** 이 사람의 월급날 (1~31). 사람별 월급날이 없으면(migrations/006 전) 예전 공통 월급날 */
export function paydayOf(s: Settings, p: Person): number {
  return (p === "a" ? s.payday_a : s.payday_b) ?? s.payday;
}

/** 주말이면 그 앞 금요일 (토 → 금, 일 → 금). 공휴일은 보지 않는다 */
export function weekdayOnOrBefore(date: string): string {
  const d = parseYmd(date);
  const back = d.getDay() === 6 ? 1 : d.getDay() === 0 ? 2 : 0;
  return back ? ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back)) : date;
}

/** 이 가계부 달 안에서 이 사람의 월급날 (YYYY-MM-DD). 주말이면 월급이 실제로 들어오는 앞 평일 */
export function paydayDate(month: string, s: Settings, p: Person): string {
  return weekdayOnOrBefore(dateInMonth(month, paydayOf(s, p), s.cycle_start));
}

export function accountMap(accounts: Account[]): Map<string, Account> {
  return new Map(accounts.map((a) => [a.id, a]));
}

/** 이 항목의 돈이 결제일에 있어야 하는 계좌 */
export function destinationOf(item: Pick<MonthItem, "method" | "card_id" | "account_id">, accounts: Map<string, Account>): string | null {
  if (item.method === "card_auto" && item.card_id) {
    return accounts.get(item.card_id)?.billing_account_id ?? item.account_id;
  }
  return item.account_id;
}

/* ---------- 월 데이터 ---------- */

export function itemsOf(data: Data, month: string): MonthItem[] {
  return data.month_items
    .filter((i) => i.month === month)
    .sort((x, y) => GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group) || x.sort - y.sort);
}

export function monthRow(data: Data, month: string): Month | null {
  return data.months.find((m) => m.id === month) ?? null;
}

export function incomeOf(m: Month | null): number {
  if (!m) return 0;
  return m.income_a + m.income_b + m.extra_income;
}

export function groupTotals(items: MonthItem[]): Record<Group, number> {
  const t: Record<Group, number> = { fixed: 0, living: 0, allowance: 0, saving: 0 };
  for (const i of items) t[i.group] += i.amount;
  return t;
}

export interface Lane {
  person: Person;
  income: number;
  byGroup: Record<Group, number>;
  /** 공동 부담 몫 (그룹 무관) */
  jointShare: number;
  allocated: number;
  left: number;
}

/** 사람별로 월급이 어디에 쓰이는지 */
export function lanes(s: Settings, m: Month | null, items: MonthItem[]): Lane[] {
  const rA = ratioA(s, m);
  return (["a", "b"] as Person[]).map((p) => {
    const byGroup: Record<Group, number> = { fixed: 0, living: 0, allowance: 0, saving: 0 };
    let jointShare = 0;
    for (const i of items) {
      const v = shareOf(i, p, rA);
      byGroup[i.group] += v;
      if (i.payer === "joint") jointShare += v;
    }
    const allocated = GROUP_ORDER.reduce((sum, g) => sum + byGroup[g], 0);
    const income = m ? (p === "a" ? m.income_a : m.income_b) : 0;
    return { person: p, income, byGroup, jointShare, allocated, left: income - allocated };
  });
}

/* ---------- 이체 ---------- */

export interface TransferPart {
  item: MonthItem;
  amount: number;
}

export interface Transfer {
  id: string;
  from: string;
  to: string;
  person: Person;
  amount: number;
  parts: TransferPart[];
  /** 이 이체로 채워야 하는 가장 이른 결제일 (없으면 null) */
  dueDay: number | null;
}

export interface TransferIssue {
  item: MonthItem;
  reason: "no-destination" | "no-salary-account";
}

/**
 * 월급 통장에서 각 항목의 돈이 있어야 하는 계좌로 옮길 금액을 모은다.
 * 같은 (출발, 도착) 쌍은 한 줄로 합친다.
 */
export function transfersOf(
  s: Settings,
  m: Month | null,
  items: MonthItem[],
  accounts: Account[],
): { transfers: Transfer[]; issues: TransferIssue[] } {
  const rA = ratioA(s, m);
  const acc = accountMap(accounts);
  const map = new Map<string, Transfer>();
  const issues: TransferIssue[] = [];
  const shared = s.salary_account_a !== null && s.salary_account_a === s.salary_account_b;

  for (const item of items) {
    const to = destinationOf(item, acc);
    if (!to) {
      issues.push({ item, reason: "no-destination" });
      continue;
    }
    for (const p of ["a", "b"] as Person[]) {
      const amount = shareOf(item, p, rA);
      if (amount <= 0) continue;
      const from = salaryAccount(s, p);
      if (!from) {
        issues.push({ item, reason: "no-salary-account" });
        continue;
      }
      if (from === to) continue;
      // 두 사람이 같은 월급통장을 쓰면 월급날이 달라도 섞이지 않게 사람별로 나눈다
      const id = shared ? `${from}>${to}:${p}` : `${from}>${to}`;
      const t = map.get(id) ?? { id, from, to, person: p, amount: 0, parts: [], dueDay: null };
      t.amount += amount;
      t.parts.push({ item, amount });
      if (item.due_day && (t.dueDay === null || item.due_day < t.dueDay)) t.dueDay = item.due_day;
      map.set(id, t);
    }
  }
  const order = (t: Transfer) => (t.person === "a" ? 0 : 1);
  const transfers = [...map.values()].sort((x, y) => order(x) - order(y) || y.amount - x.amount);
  return { transfers, issues };
}

export function checkId(kind: CheckKind, month: string, key = ""): string {
  if (kind === "transfer") return `t:${month}:${key}`;
  if (kind === "card") return `c:${month}:${key}`;
  if (kind === "event") return `e:${month}:${key}`;
  return `s:${month}`;
}

export function findCheck(checks: Check[], id: string): Check | undefined {
  return checks.find((c) => c.id === id);
}

/* ---------- 지출 ---------- */

/** 그 달에 잡히는 지출 한 줄. 할부면 그 달 회차의 금액이고, 원래 기록은 inst.orig */
export interface MonthSpending extends Spending {
  inst?: { no: number; of: number; orig: Spending };
}

/** 할부 개월 (카드만, 1 = 일시불) */
export function installmentsOf(x: Pick<Spending, "pay_kind" | "installment_months">): number {
  return x.pay_kind === "card" ? Math.max(1, x.installment_months ?? 1) : 1;
}

/** 할부 no 회차(1부터)의 금액 — 매달 똑같이 나누고 남는 원은 첫 달에 */
export function installmentShare(amount: number, months: number, no: number): number {
  const base = Math.floor(amount / months);
  return no === 1 ? amount - base * (months - 1) : base;
}

/** key 달이 from 달보다 몇 달 뒤인지 */
function monthsBetween(from: string, key: string): number {
  return (Number(key.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(key.slice(5, 7)) - Number(from.slice(5, 7));
}

/** 날짜를 n달 뒤 같은 날로 (그 달에 없는 날이면 말일) */
function shiftMonths(date: string, n: number): string {
  const d = parseYmd(date);
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return ymd(new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last)));
}

/**
 * 그 달 기간의 지출. 할부는 산 달부터 개월 수만큼 매달 나눈 금액이 그 달 지출이 된다
 * (예산·카드값·정산 모두 이 금액). 2회차부터는 산 날과 같은 날짜에 둔다.
 */
export function spendingsIn(data: Data, month: string): MonthSpending[] {
  const c = data.settings.cycle_start;
  const p = periodOf(month, c);
  const out: MonthSpending[] = [];
  for (const x of data.spendings) {
    const n = installmentsOf(x);
    if (n === 1) {
      if (inPeriod(x.date, p)) out.push(x);
      continue;
    }
    const no = monthsBetween(monthOf(x.date, c), month) + 1;
    if (no < 1 || no > n) continue;
    const at = no === 1 ? x.date : shiftMonths(x.date, no - 1);
    out.push({ ...x, date: inPeriod(at, p) ? at : p.start, amount: installmentShare(x.amount, n, no), inst: { no, of: n, orig: x } });
  }
  return out.sort((x, y) => (x.date === y.date ? y.created_at.localeCompare(x.created_at) : y.date.localeCompare(x.date)));
}

export function sum<T>(rows: T[], f: (r: T) => number): number {
  return rows.reduce((acc, r) => acc + f(r), 0);
}

export interface LivingStatus {
  budget: number;
  spent: number;
  left: number;
  byKind: { card: number; cash: number; transfer: number };
  /** 오늘까지 써도 되는 금액 (기간 경과 비율 × 예산) */
  pace: number | null;
  daysLeft: number;
  perDay: number | null;
}

/**
 * 예산 대비 사용. owner 가 joint 면 공동 생활비, 사람이면 그 사람의 용돈.
 * 지출의 비용귀속(owner)이 같은 기록을 더한다.
 */
export function budgetStatus(data: Data, month: string, owner: Owner, today = ymd(new Date())): LivingStatus {
  const items = itemsOf(data, month).filter((i) => (owner === "joint" ? i.group === "living" : i.group === "allowance" && i.payer === owner));
  const budget = sum(items, (i) => i.amount);
  const rows = spendingsIn(data, month).filter((x) => x.owner === owner);
  const spent = sum(rows, (r) => r.amount);
  const byKind = {
    card: sum(rows.filter((r) => r.pay_kind === "card"), (r) => r.amount),
    cash: sum(rows.filter((r) => r.pay_kind === "cash"), (r) => r.amount),
    transfer: sum(rows.filter((r) => r.pay_kind === "transfer"), (r) => r.amount),
  };
  const prog = periodProgress(month, data.settings.cycle_start, today);
  const left = budget - spent;
  return {
    budget,
    spent,
    left,
    byKind,
    pace: prog.state === "current" ? Math.round(budget * prog.ratio) : null,
    daysLeft: prog.daysLeft,
    perDay: prog.state === "current" && prog.daysLeft > 0 && left > 0 ? Math.floor(left / prog.daysLeft) : null,
  };
}

export function livingStatus(data: Data, month: string, today = ymd(new Date())): LivingStatus {
  return budgetStatus(data, month, "joint", today);
}

/** 그 사람의 용돈 */
export function allowanceStatus(data: Data, month: string, person: Person, today = ymd(new Date())): LivingStatus {
  return budgetStatus(data, month, person, today);
}

export interface CategoryUse {
  id: string | null;
  name: string;
  budget: number;
  spent: number;
}

export function categoryUse(data: Data, month: string): CategoryUse[] {
  const rows = spendingsIn(data, month).filter((x) => x.owner === "joint");
  const out: CategoryUse[] = [...data.categories]
    .sort((a, b) => a.sort - b.sort)
    .map((c) => ({ id: c.id, name: c.name, budget: c.budget, spent: sum(rows.filter((r) => r.category_id === c.id), (r) => r.amount) }));
  const none = sum(rows.filter((r) => !r.category_id || !data.categories.some((c) => c.id === r.category_id)), (r) => r.amount);
  if (none > 0) out.push({ id: null, name: "미분류", budget: 0, spent: none });
  return out;
}

/* ---------- 카드값 ---------- */

export interface CardBill {
  card: Account;
  /** 이번 달에 결제되는 금액 (지난 기간 사용분) */
  dueAmount: number;
  dueDate: string | null;
  /** 이번 기간에 쌓이는 중인 금액 (다음 달 청구) */
  usingAmount: number;
  billing: Account | null;
}

/** 그달에 실제로 나간 금액: 납부 확인 때 다른 금액을 적었으면 그 금액, 아니면 플랜 금액 */
export function actualAmount(i: Pick<MonthItem, "amount" | "paid" | "paid_amount">): number {
  return i.paid && i.paid_amount != null ? i.paid_amount : i.amount;
}

function cardUsage(data: Data, cardId: string, month: string): number {
  const spent = sum(
    spendingsIn(data, month).filter((x) => x.pay_kind === "card" && x.account_id === cardId),
    (x) => x.amount,
  );
  const fixed = sum(
    data.month_items.filter((i) => i.month === month && i.method === "card_auto" && i.card_id === cardId),
    actualAmount,
  );
  return spent + fixed;
}

export function cardBills(data: Data, month: string): CardBill[] {
  const acc = accountMap(data.accounts);
  return data.accounts
    .filter((a) => a.kind === "card" && !a.archived)
    .sort((a, b) => a.sort - b.sort)
    .map((card) => ({
      card,
      dueAmount: cardUsage(data, card.id, addMonths(month, -1)),
      dueDate: card.pay_day ? dateInMonth(month, card.pay_day, data.settings.cycle_start) : null,
      usingAmount: cardUsage(data, card.id, month),
      billing: card.billing_account_id ? acc.get(card.billing_account_id) ?? null : null,
    }));
}

/* ---------- 정산 ---------- */

export interface Settlement {
  /** 돈을 보내야 하는 사람 */
  from: Person;
  to: Person;
  amount: number;
  /** 각자 공동비용을 개인 돈으로 먼저 낸 금액 */
  advanced: Record<Person, number>;
}

/** 공동 지출을 개인 카드·계좌·현금으로 먼저 낸 만큼 서로 정산한다. */
export function settlementOf(data: Data, month: string): Settlement | null {
  const acc = accountMap(data.accounts);
  const m = monthRow(data, month);
  const rA = ratioA(data.settings, m);
  const advanced: Record<Person, number> = { a: 0, b: 0 };
  for (const x of spendingsIn(data, month)) {
    if (x.owner !== "joint") continue;
    const account = x.account_id ? acc.get(x.account_id) : null;
    if (account && account.owner === "joint") continue;
    advanced[x.paid_by] += x.amount;
  }
  // A가 먼저 낸 공동비용 중 B 몫, B가 먼저 낸 것 중 A 몫
  const bOwesA = split(advanced.a, rA).b;
  const aOwesB = split(advanced.b, rA).a;
  const net = bOwesA - aOwesB;
  if (net === 0) return advanced.a + advanced.b > 0 ? { from: "a", to: "b", amount: 0, advanced } : null;
  return net > 0 ? { from: "b", to: "a", amount: net, advanced } : { from: "a", to: "b", amount: -net, advanced };
}

/* ---------- 저축 목표 ---------- */

/** 항목이 그달에 실제로 나갔는가: 자동이체·납부는 납부 확인, 직접 이체하는 저축은 이체 완료로 본다. */
export function itemDone(data: Data, item: MonthItem): boolean {
  if (needsPayCheck(item)) return item.paid;
  if (item.group === "saving") {
    const m = monthRow(data, item.month);
    const { transfers } = transfersOf(data.settings, m, itemsOf(data, item.month), data.accounts);
    const related = transfers.filter((t) => t.parts.some((p) => p.item.id === item.id));
    if (related.length === 0) return item.paid;
    return related.every((t) => findCheck(data.checks, checkId("transfer", item.month, t.id)));
  }
  return false;
}

export function goalProgress(data: Data, item: PlanItem): { saved: number; target: number } | null {
  if (!item.goal_amount) return null;
  const paid = sum(
    data.month_items.filter((i) => i.plan_item_id === item.id && itemDone(data, i)),
    actualAmount,
  );
  return { saved: (item.goal_start ?? 0) + paid, target: item.goal_amount };
}

/* ---------- 새 달 ---------- */

/** 플랜 항목이 그 달에 들어가는가: 켜져 있고, 시작·끝 달을 정했으면 그 안 (대출·몇 달만 내는 보험 등) */
export function planInMonth(p: Pick<PlanItem, "active" | "start_month" | "end_month">, month: string): boolean {
  return p.active && (!p.start_month || p.start_month <= month) && (!p.end_month || month <= p.end_month);
}

/** 템플릿에서 그달의 항목을 만든다. id 가 결정적이라 두 폰이 동시에 눌러도 중복되지 않는다. */
export function snapshotItems(month: string, plan: PlanItem[]): MonthItem[] {
  return plan
    .filter((p) => planInMonth(p, month))
    .map((p) => ({
      id: `${month}:${p.id}`,
      month,
      plan_item_id: p.id,
      group: p.group,
      name: p.name,
      amount: p.amount,
      payer: p.payer,
      account_id: p.account_id,
      method: p.method,
      card_id: p.card_id,
      due_day: p.due_day,
      sort: p.sort,
      note: p.note,
      paid: false,
      paid_at: null,
      paid_by: null,
    }));
}

/**
 * 따로 납부 확인이 필요한 항목. 생활비·용돈은 예산이라 체크하지 않고,
 * 직접 이체하는 저축은 '옮길 돈' 이체 체크가 곧 납입이다.
 */
export function needsPayCheck(i: Pick<MonthItem, "group" | "method">): boolean {
  return i.group === "fixed" || (i.group === "saving" && i.method !== "manual");
}

export interface MonthProgress {
  done: number;
  total: number;
}

export function monthProgress(data: Data, month: string): MonthProgress {
  const m = monthRow(data, month);
  if (!m) return { done: 0, total: 0 };
  const items = itemsOf(data, month);
  const { transfers } = transfersOf(data.settings, m, items, data.accounts);
  const tDone = transfers.filter((t) => findCheck(data.checks, checkId("transfer", month, t.id))).length;
  const pay = items.filter(needsPayCheck);
  const pDone = pay.filter((i) => i.paid).length;
  const bills = cardBills(data, month).filter((b) => b.dueAmount > 0);
  const bDone = bills.filter((b) => findCheck(data.checks, checkId("card", month, b.card.id))).length;
  return { done: tDone + pDone + bDone, total: transfers.length + pay.length + bills.length };
}

/** 그 달 기간의 처음부터 n일째(0부터)까지 쓴 금액 — "지난달 이맘때" 비교용 */
export function spentToDay(data: Data, month: string, owner: Owner, dayIndex: number): number {
  const p = periodOf(month, data.settings.cycle_start);
  const start = parseYmd(p.start);
  const cut = new Date(start.getFullYear(), start.getMonth(), start.getDate() + dayIndex + 1);
  const cutStr = ymd(cut);
  return sum(
    spendingsIn(data, month).filter((x) => x.owner === owner && x.date < cutStr),
    (x) => x.amount,
  );
}

/** 오늘이 이 달 기간의 며칠째인지 (0부터). 지난 달이면 마지막 날. */
export function dayIndexOf(month: string, cycleStart: number, today: string): number {
  const p = periodOf(month, cycleStart);
  const s = parseYmd(p.start).getTime();
  const e = parseYmd(p.last).getTime();
  const t = Math.min(e, Math.max(s, parseYmd(today).getTime()));
  return Math.round((t - s) / 86_400_000);
}

/* ---------- 다른 달에서 불러오기 ---------- */

/** m 보다 앞선 달 중 플랜이 있는 가장 최근 달 */
export function latestMonthBefore(data: Data, m: string): string | null {
  const ids = data.months.map((x) => x.id).filter((id) => id < m).sort();
  return ids.length ? ids[ids.length - 1] : null;
}

/**
 * from 달의 플랜을 to 달 항목으로 옮긴다.
 * - 반복 항목은 그 달의 금액·계좌·방식 그대로 (그 달에만 바꾼 값도 이어진다)
 * - 반복을 끈(삭제한) 항목과 기간이 끝난 항목은 빼고, from 달을 만든 뒤에 새로 만든 반복 항목과 기간이 시작된 항목은 더한다
 *   (from 달에 일부러 넣지 않은 반복 항목은 다시 끌어오지 않는다 — 빈 플랜에서 하나씩 만든 달)
 * - 일회성 항목은 oneOffs 가 켜져 있을 때만
 * id 가 결정적이라 두 폰이 동시에 만들어도 중복되지 않는다.
 */
export function itemsFromMonth(data: Data, from: string, to: string, opts: { oneOffs?: boolean } = {}): MonthItem[] {
  const active = new Set(data.plan_items.filter((p) => planInMonth(p, to)).map((p) => p.id));
  const reset = { paid: false, paid_at: null, paid_by: null, paid_amount: null } as const;
  const out: MonthItem[] = [];
  for (const i of itemsOf(data, from)) {
    if (i.plan_item_id) {
      if (!active.has(i.plan_item_id)) continue;
      out.push({ ...i, ...reset, id: `${to}:${i.plan_item_id}`, month: to });
    } else if (opts.oneOffs) {
      const key = i.id.includes(":") ? i.id.slice(i.id.indexOf(":") + 1) : i.id;
      out.push({ ...i, ...reset, id: `${to}:${key}`, month: to });
    }
  }
  const have = new Set(out.map((i) => i.plan_item_id).filter(Boolean));
  const since = monthRow(data, from)?.created_at ?? "";
  const added = data.plan_items.filter((p) => !have.has(p.id) && ((p.created_at ?? "") > since || !planInMonth(p, from)));
  out.push(...snapshotItems(to, added));
  return out;
}

/** 이미 있는 달에 from 달 항목 중 빠진 것만 (반복 항목은 같은 항목, 일회성은 같은 이름·종류면 있는 것으로 본다) */
export function missingFromMonth(data: Data, from: string, to: string, opts: { oneOffs?: boolean } = {}): MonthItem[] {
  const cur = itemsOf(data, to);
  const plans = new Set(cur.map((i) => i.plan_item_id).filter(Boolean));
  const names = new Set(cur.map((i) => `${i.group}|${i.name.trim()}`));
  return itemsFromMonth(data, from, to, opts).filter((i) =>
    i.plan_item_id ? !plans.has(i.plan_item_id) : !names.has(`${i.group}|${i.name.trim()}`),
  );
}
