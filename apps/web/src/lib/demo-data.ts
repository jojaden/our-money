// 데모 모드용 예시 데이터. 이름·금액·계좌는 모두 가상이며 실제 설정으로 바꿔야 한다.

import type { Account, CalEvent, Category, Check, Data, Month, MonthItem, PlanItem, Settings, Spending, User } from "./types";
import { addMonths, checkId, currentMonth, dateInMonth, paydayDate, periodOf, snapshotItems, transfersOf } from "./calc";
import { parseYmd, ymd } from "./format";

const settings: Settings = {
  id: 1,
  name_a: "현빈",
  name_b: "예진",
  salary_a: 3_800_000,
  salary_b: 3_200_000,
  salary_account_a: "acc-a-salary",
  salary_account_b: "acc-b-salary",
  split_mode: "fixed",
  ratio_a: 50,
  cycle_start: 25,
  payday: 25,
  payday_a: 25,
  payday_b: 10,
};

// 로그인한 두 계정 (가상). 이름은 각자 설정에서 바꾼다.
const users: User[] = [
  { id: "demo-a", email: "hyunbin@example.com", person: "a", name: "현빈" },
  { id: "demo-b", email: "yejin@example.com", person: "b", name: "예진" },
];

const bank = (id: string, name: string, owner: Account["owner"], institution: string, sort: number): Account => ({
  id, name, kind: "bank", owner, institution, billing_account_id: null, pay_day: null, sort, archived: false,
});
const card = (id: string, name: string, owner: Account["owner"], institution: string, billing: string, payDay: number, sort: number): Account => ({
  id, name, kind: "card", owner, institution, billing_account_id: billing, pay_day: payDay, sort, archived: false,
});

const accounts: Account[] = [
  bank("acc-a-salary", "현빈 급여통장", "a", "신한은행", 1),
  bank("acc-b-salary", "예진 급여통장", "b", "국민은행", 2),
  bank("acc-joint", "공동 생활비통장", "joint", "카카오뱅크 모임통장", 3),
  bank("acc-fixed", "고정비 통장", "joint", "토스뱅크", 4),
  bank("acc-saving", "공동 적금", "joint", "우리은행", 5),
  bank("acc-emergency", "비상금 통장", "joint", "토스뱅크", 6),
  bank("acc-a-isa", "현빈 ISA", "a", "키움증권", 7),
  card("card-joint", "공동 신용카드", "joint", "삼성카드", "acc-joint", 14, 10),
  card("card-a", "현빈 카드", "a", "현대카드", "acc-a-salary", 15, 11),
  card("card-b", "예진 카드", "b", "신한카드", "acc-b-salary", 10, 12),
];

let sortSeq = 0;
const item = (id: string, p: Partial<PlanItem> & Pick<PlanItem, "group" | "name" | "amount" | "payer" | "method">): PlanItem => ({
  id,
  account_id: null,
  card_id: null,
  due_day: null,
  note: "",
  active: true,
  goal_amount: null,
  goal_start: null,
  sort: ++sortSeq,
  ...p,
});

const plan: PlanItem[] = [
  item("pi-rent", { group: "fixed", name: "월세", amount: 1_100_000, payer: "joint", method: "account_auto", account_id: "acc-fixed", due_day: 27 }),
  item("pi-mgmt", { group: "fixed", name: "관리비", amount: 230_000, payer: "joint", method: "account_auto", account_id: "acc-fixed", due_day: 30 }),
  item("pi-parents", { group: "fixed", name: "양가 부모님 용돈", amount: 300_000, payer: "joint", method: "manual", account_id: "acc-fixed", due_day: 5 }),
  item("pi-phone", { group: "fixed", name: "통신비 2회선", amount: 98_000, payer: "joint", method: "card_auto", card_id: "card-joint", due_day: 3 }),
  item("pi-net", { group: "fixed", name: "인터넷·TV", amount: 33_000, payer: "joint", method: "card_auto", card_id: "card-joint", due_day: 20 }),
  item("pi-subs", { group: "fixed", name: "넷플릭스·유튜브", amount: 31_900, payer: "joint", method: "card_auto", card_id: "card-joint", due_day: 12 }),
  item("pi-ins-a", { group: "fixed", name: "실손보험", amount: 42_000, payer: "a", method: "account_auto", account_id: "acc-a-salary", due_day: 10 }),
  item("pi-ins-b", { group: "fixed", name: "실손보험", amount: 39_000, payer: "b", method: "account_auto", account_id: "acc-b-salary", due_day: 10 }),
  item("pi-living", { group: "living", name: "공동 생활비", amount: 1_400_000, payer: "joint", method: "manual", account_id: "acc-joint" }),
  item("pi-allow-a", { group: "allowance", name: "현빈 용돈", amount: 400_000, payer: "a", method: "manual", account_id: "acc-a-salary" }),
  item("pi-allow-b", { group: "allowance", name: "예진 용돈", amount: 400_000, payer: "b", method: "manual", account_id: "acc-b-salary" }),
  item("pi-saving", { group: "saving", name: "전세 보증금 적금", amount: 1_000_000, payer: "joint", method: "manual", account_id: "acc-saving", due_day: 26, goal_amount: 30_000_000, goal_start: 8_400_000 }),
  item("pi-emergency", { group: "saving", name: "비상금", amount: 200_000, payer: "joint", method: "manual", account_id: "acc-emergency", due_day: 26, goal_amount: 10_000_000, goal_start: 6_200_000 }),
  item("pi-isa", { group: "saving", name: "ISA 주식", amount: 500_000, payer: "a", method: "manual", account_id: "acc-a-isa", due_day: 26 }),
  item("pi-pension", { group: "saving", name: "연금저축", amount: 300_000, payer: "b", method: "account_auto", account_id: "acc-b-salary", due_day: 26, note: "급여통장에서 연금저축으로 자동이체" }),
];

const categories: Category[] = [
  ["cat-grocery", "장보기", 500_000],
  ["cat-eatout", "외식·배달", 300_000],
  ["cat-home", "생활용품", 150_000],
  ["cat-car", "교통·차량", 150_000],
  ["cat-health", "병원·약", 50_000],
  ["cat-event", "경조사", 100_000],
  ["cat-fun", "문화·여가", 100_000],
  ["cat-etc", "기타", 50_000],
].map(([id, name, budget], i) => ({ id: id as string, name: name as string, budget: budget as number, sort: i + 1 }));

// 결정적 의사난수
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type Tpl = [cat: string, memo: string, min: number, max: number, kind: Spending["pay_kind"], account: string | null];
const TEMPLATES: Tpl[] = [
  ["cat-grocery", "이마트", 48_000, 132_000, "card", "card-joint"],
  ["cat-grocery", "쿠팡 로켓프레시", 23_000, 71_000, "card", "card-joint"],
  ["cat-grocery", "동네 시장", 8_000, 26_000, "cash", "acc-joint"],
  ["cat-eatout", "배달의민족", 21_000, 38_000, "card", "card-joint"],
  ["cat-eatout", "주말 외식", 46_000, 89_000, "card", "card-joint"],
  ["cat-home", "다이소", 6_000, 24_000, "card", "card-joint"],
  ["cat-car", "주유", 55_000, 72_000, "card", "card-joint"],
  ["cat-car", "주차비", 3_000, 9_000, "transfer", "acc-joint"],
  ["cat-fun", "영화", 26_000, 32_000, "card", "card-joint"],
  ["cat-health", "약국", 7_000, 18_000, "cash", "acc-joint"],
];

function round100(n: number) {
  return Math.round(n / 100) * 100;
}

function spendingsBetween(start: string, endExclusive: string, seed: number, limitDate: string): Spending[] {
  const r = rng(seed);
  const out: Spending[] = [];
  const d = parseYmd(start);
  const end = parseYmd(endExclusive);
  let n = 0;
  while (d < end) {
    const date = ymd(d);
    if (date > limitDate) break;
    const count = r() < 0.25 ? 0 : r() < 0.7 ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const t = TEMPLATES[Math.floor(r() * TEMPLATES.length)];
      const amount = round100(t[2] + r() * (t[3] - t[2]));
      const paidBy = r() < 0.55 ? "a" : "b";
      out.push({
        id: `sp-${seed}-${++n}`,
        date,
        amount,
        category_id: t[0],
        pay_kind: t[4],
        account_id: t[5],
        owner: "joint",
        paid_by: paidBy,
        memo: t[1],
        created_at: `${date}T0${i}:${String(10 + n % 50).padStart(2, "0")}:00.000Z`,
      });
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function buildDemoData(today = ymd(new Date())): Data {
  const cur = currentMonth(settings.cycle_start, today);
  const prev = addMonths(cur, -1);
  const months: Month[] = [prev, cur].map((id) => ({
    id,
    income_a: settings.salary_a,
    income_b: settings.salary_b,
    extra_income: 0,
    extra_note: "",
    created_at: `${periodOf(id, settings.cycle_start).start}T10:00:00.000Z`,
  }));

  const prevItems = snapshotItems(prev, plan).map((i) => ({ ...i, paid: true, paid_at: `${periodOf(prev, 25).start}T12:00:00.000Z`, paid_by: "a" as const }));
  const curStart = periodOf(cur, settings.cycle_start).start;
  const curItems: MonthItem[] = snapshotItems(cur, plan).map((i) => {
    // 이미 지난 자동이체·결제는 일부만 확인된 상태로 둔다
    const done = ["pi-rent", "pi-pension", "pi-saving"].includes(i.plan_item_id ?? "");
    return done ? { ...i, paid: true, paid_at: `${today}T08:30:00.000Z`, paid_by: "b" as const } : i;
  });

  const checks: Check[] = [];
  const prevMonth = months[0];
  for (const t of transfersOf(settings, prevMonth, prevItems, accounts).transfers) {
    checks.push({ id: checkId("transfer", prev, t.id), month: prev, kind: "transfer", amount: t.amount, done_at: `${periodOf(prev, 25).start}T11:00:00.000Z`, done_by: t.person });
  }
  const curMonth = months[1];
  for (const t of transfersOf(settings, curMonth, curItems, accounts).transfers) {
    // 각자 월급날이 지난 이체(결제일이 월급날보다 빠른 건 지난 월급에서 미리)만 했고, 그중 ISA 와 예진 비상금 이체는 아직 안 한 상태
    const payday = paydayDate(cur, settings, t.person);
    const early = t.dueDay !== null && dateInMonth(cur, t.dueDay, settings.cycle_start) < payday;
    if ((early || payday <= today) && !(t.to === "acc-a-isa" || (t.to === "acc-emergency" && t.person === "b"))) {
      checks.push({ id: checkId("transfer", cur, t.id), month: cur, kind: "transfer", amount: t.amount, done_at: `${payday}T21:40:00.000Z`, done_by: t.person });
    }
  }

  const spendings = [
    ...spendingsBetween(periodOf(prev, 25).start, periodOf(prev, 25).end, 7, today),
    ...spendingsBetween(curStart, periodOf(cur, 25).end, 11, today),
  ];
  // 개인 카드·현금으로 먼저 낸 공동 지출 (정산 대상)
  spendings.push(
    { id: "sp-x1", date: shift(today, -3), amount: 64_000, category_id: "cat-eatout", pay_kind: "card", account_id: "card-b", owner: "joint", paid_by: "b", memo: "결혼기념일 저녁", created_at: `${shift(today, -3)}T19:30:00.000Z` },
    { id: "sp-x2", date: shift(today, -1), amount: 23_000, category_id: "cat-grocery", pay_kind: "cash", account_id: null, owner: "joint", paid_by: "a", memo: "과일가게", created_at: `${shift(today, -1)}T18:10:00.000Z` },
    { id: "sp-x3", date: shift(today, -2), amount: 15_500, category_id: null, pay_kind: "card", account_id: "card-a", owner: "a", paid_by: "a", memo: "점심", created_at: `${shift(today, -2)}T12:40:00.000Z` },
    // 각자 용돈 지출
    { id: "sp-a1", date: shift(today, -5), amount: 89_000, category_id: null, pay_kind: "card", account_id: "card-a", owner: "a", paid_by: "a", memo: "운동화", created_at: `${shift(today, -5)}T20:10:00.000Z` },
    { id: "sp-a2", date: shift(today, -1), amount: 4_800, category_id: null, pay_kind: "card", account_id: "card-a", owner: "a", paid_by: "a", memo: "커피", created_at: `${shift(today, -1)}T08:40:00.000Z` },
    { id: "sp-a3", date: shift(today, -4), amount: 12_000, category_id: null, pay_kind: "cash", account_id: null, owner: "a", paid_by: "a", memo: "회사 동료 경조사 봉투 보탬", created_at: `${shift(today, -4)}T13:00:00.000Z` },
    { id: "sp-b1", date: shift(today, -6), amount: 55_000, category_id: null, pay_kind: "card", account_id: "card-b", owner: "b", paid_by: "b", memo: "미용실", created_at: `${shift(today, -6)}T15:20:00.000Z` },
    { id: "sp-b2", date: shift(today, -2), amount: 18_000, category_id: null, pay_kind: "card", account_id: "card-b", owner: "b", paid_by: "b", memo: "책", created_at: `${shift(today, -2)}T19:05:00.000Z` },
    // 카드 알림으로 기록했는데 카드·분류·누구 돈을 정하지 못한 것 (확인 필요)
    { id: "sp-n1", date: today, amount: 32_500, category_id: null, pay_kind: "card", account_id: null, owner: "a", paid_by: "a", memo: "편의점", created_at: `${today}T09:12:00.000Z`, source: "notification", review: ["card", "category", "owner"] },
  );

  return {
    settings,
    accounts,
    plan_items: plan,
    months,
    month_items: [...prevItems, ...curItems],
    checks,
    categories,
    spendings: spendings.filter((s) => s.date <= today && s.date >= periodOf(prev, 25).start),
    users,
    events: demoEvents(Number(today.slice(0, 4))),
  };
}

/** 예시 일정: 1년에 두 번 내는 재산세, 5월 한 달 신고 기간(알림 모음에 고정), 기념일 D-day, 매달 체크하는 할 일 */
function demoEvents(y: number): CalEvent[] {
  const ev = (e: Partial<CalEvent> & Pick<CalEvent, "id" | "title" | "start_date">): CalEvent => ({
    note: "",
    end_date: null,
    repeat: "yearly",
    owner: "joint",
    dday: true,
    pin: false,
    remind_days: 3,
    amount: null,
    todo: false,
    ...e,
  });
  return [
    ev({ id: "ev-property-1", title: "재산세 (건물분)", start_date: `${y}-07-16`, end_date: `${y}-07-31`, amount: 320_000, pin: true, todo: true }),
    ev({ id: "ev-property-2", title: "재산세 (토지분)", start_date: `${y}-09-16`, end_date: `${y}-09-30`, amount: 180_000, pin: true, todo: true }),
    ev({ id: "ev-cgt", title: "양도소득세 신고", start_date: `${y}-05-01`, end_date: `${y}-05-31`, owner: "a", pin: true, todo: true, note: "해외 주식 판 것 정리해서 홈택스에 신고" }),
    ev({ id: "ev-anniv", title: "결혼기념일", start_date: `${y - 2}-11-21`, remind_days: 7 }),
    ev({ id: "ev-car", title: "자동차보험 갱신", start_date: `${y}-12-10`, owner: "a", remind_days: 14, dday: false, todo: true }),
    ev({ id: "ev-bill", title: "관리비 고지서 확인", start_date: `${y}-01-05`, repeat: "monthly", dday: false, remind_days: null, todo: true }),
  ];
}

function shift(date: string, days: number): string {
  const d = parseYmd(date);
  d.setDate(d.getDate() + days);
  return ymd(d);
}
