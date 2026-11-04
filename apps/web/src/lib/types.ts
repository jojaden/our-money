// 데이터 모델. 테이블 이름과 컬럼은 supabase/schema.sql 과 1:1로 맞춘다.

export type Person = "a" | "b";
export type Owner = Person | "joint";

export type Group = "fixed" | "living" | "allowance" | "saving";

/** 돈이 실제로 나가는 방식 */
export type Method = "card_auto" | "account_auto" | "manual" | "cash";

/** 지출 한 건의 결제수단 */
export type PayKind = "card" | "cash" | "transfer";

export type AccountKind = "bank" | "card";

/**
 * 서버(트리거)가 채우는 칸 — supabase/migrations/004.
 * rev 는 읽은 그대로 돌려보내야 한다: 그사이 다른 폰이 고쳤으면 서버가 저장을 거절한다(충돌).
 */
export interface Meta {
  rev?: number;
  created_at?: string;
  created_by?: Person | null;
  updated_at?: string;
  updated_by?: Person | null;
}

export interface Settings extends Meta {
  id: 1;
  name_a: string;
  name_b: string;
  salary_a: number;
  salary_b: number;
  salary_account_a: string | null;
  salary_account_b: string | null;
  /** fixed: ratio_a 고정 / income: 그달 소득 비율 */
  split_mode: "fixed" | "income";
  /** A가 공동비용을 부담하는 비율 (0~100) */
  ratio_a: number;
  /** 가계부 한 달의 시작일 (1~28). 25면 11월 = 10/25 ~ 11/24 */
  cycle_start: number;
  /** 예전 공통 월급날 (v0.1). 사람별 월급날이 없을 때(migrations/006 전)만 쓴다 — paydayOf() 로 읽는다 */
  payday: number;
  /** 사람별 월급날 (1~31, 그달에 없는 날이면 말일) */
  payday_a?: number;
  payday_b?: number;
}

export interface Account extends Meta {
  id: string;
  name: string;
  kind: AccountKind;
  owner: Owner;
  /** 은행·카드사 이름 */
  institution: string;
  /** 카드: 결제 대금이 빠져나가는 계좌 */
  billing_account_id: string | null;
  /** 카드: 결제일 */
  pay_day: number | null;
  sort: number;
  archived: boolean;
  /** 카드 번호 끝 4자리 — 카드 알림 자동 기록에서 카드를 찾을 때 */
  last4?: string | null;
  note?: string;
  /** 지갑 카드 그림 색 (migrations/008, 카드만). 비면 이번 달 쓴 버킷 색 */
  color?: PassColor | null;
}

/** 지갑에서 고르는 카드 색 — tokens.json 의 pass-* 와 DB CHECK(migrations/008) 이 같은 목록 */
export const PASS_COLORS = ["black", "silver", "gold", "rose", "red", "green", "blue", "purple"] as const;
export type PassColor = (typeof PASS_COLORS)[number];
export const PASS_COLOR_LABEL: Record<PassColor, string> = { black: "검정", silver: "은색", gold: "금색", rose: "분홍", red: "빨강", green: "초록", blue: "파랑", purple: "보라" };

interface ItemFields extends Meta {
  group: Group;
  name: string;
  amount: number;
  /** 누구 돈에서 나가는가 */
  payer: Owner;
  /** 이 돈이 있어야 하는 계좌 (카드 결제면 비워두고 카드의 결제계좌를 쓴다) */
  account_id: string | null;
  method: Method;
  card_id: string | null;
  due_day: number | null;
  sort: number;
  note: string;
}

/** 매달 반복되는 플랜 항목 (템플릿) */
export interface PlanItem extends ItemFields {
  id: string;
  active: boolean;
  /** 저축 목표 */
  goal_amount: number | null;
  goal_start: number | null;
  /** 이 달(YYYY-MM)부터 / 이 달까지만 — 대출·할부처럼 끝이 있는 항목 */
  start_month?: string | null;
  end_month?: string | null;
}

export interface Month extends Meta {
  /** YYYY-MM */
  id: string;
  income_a: number;
  income_b: number;
  extra_income: number;
  extra_note: string;
  created_at: string;
  note?: string;
  /** 그달을 마감한 시각 */
  closed_at?: string | null;
}

/** 그달에 고정된 플랜 항목 */
export interface MonthItem extends ItemFields {
  /** `${month}:${plan_item_id}` */
  id: string;
  month: string;
  plan_item_id: string | null;
  paid: boolean;
  paid_at: string | null;
  paid_by: Person | null;
  /** 실제로 나간 금액 (플랜 금액과 다를 때) */
  paid_amount?: number | null;
}

export type CheckKind = "transfer" | "card" | "settle";

export interface Check {
  /** transfer: `t:${month}:${from}>${to}`  card: `c:${month}:${cardId}`  settle: `s:${month}` */
  id: string;
  month: string;
  kind: CheckKind;
  amount: number;
  done_at: string;
  done_by: Person;
}

export interface Category extends Meta {
  id: string;
  name: string;
  /** 월 예산 (0이면 미설정) */
  budget: number;
  sort: number;
}

export type SpendingSource = "manual" | "preset" | "notification" | "import";

export interface Spending extends Meta {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  category_id: string | null;
  pay_kind: PayKind;
  /** 카드 또는 계좌 */
  account_id: string | null;
  /** 비용귀속 */
  owner: Owner;
  /** 실제로 결제한 사람 */
  paid_by: Person;
  memo: string;
  created_at: string;
  /** 어떻게 기록됐나: 직접 · 자주 쓰는 지출 · 카드 알림 · 가져오기 */
  source?: SpendingSource;
  tags?: string[];
  /** 할부 개월 (1 = 일시불) */
  installment_months?: number;
  /** 카드 승인번호 — 같은 승인 건이 두 번 기록되지 않게 */
  approval_no?: string | null;
}

export interface Member {
  email: string;
  person: Person;
}

/** 로그인한 계정 (supabase/migrations/003_users.sql). 이름은 그 계정 본인만 바꾼다. */
export interface User {
  /** auth.users.id (데모는 `demo-a`) */
  id: string;
  email: string;
  person: Person;
  name: string;
}

export interface Data {
  settings: Settings;
  accounts: Account[];
  plan_items: PlanItem[];
  months: Month[];
  month_items: MonthItem[];
  checks: Check[];
  categories: Category[];
  spendings: Spending[];
  users: User[];
}

export type TableName = Exclude<keyof Data, "settings"> | "settings";

export type Row<T extends TableName> = T extends "settings"
  ? Settings
  : T extends keyof Data
    ? Data[T] extends (infer R)[]
      ? R
      : never
    : never;

export const GROUP_LABEL: Record<Group, string> = {
  fixed: "고정비",
  living: "공동 생활비",
  allowance: "용돈",
  saving: "저축·투자",
};

export const GROUP_ORDER: Group[] = ["fixed", "living", "allowance", "saving"];

export const METHOD_LABEL: Record<Method, string> = {
  card_auto: "카드 자동결제",
  account_auto: "자동이체",
  manual: "직접 이체",
  cash: "현금",
};

export const PAY_KIND_LABEL: Record<PayKind, string> = {
  card: "카드",
  cash: "현금",
  transfer: "계좌이체",
};
