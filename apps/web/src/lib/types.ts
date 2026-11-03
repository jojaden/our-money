// 데이터 모델. 테이블 이름과 컬럼은 supabase/schema.sql 과 1:1로 맞춘다.

export type Person = "a" | "b";
export type Owner = Person | "joint";

export type Group = "fixed" | "living" | "allowance" | "saving";

/** 돈이 실제로 나가는 방식 */
export type Method = "card_auto" | "account_auto" | "manual" | "cash";

/** 지출 한 건의 결제수단 */
export type PayKind = "card" | "cash" | "transfer";

export type AccountKind = "bank" | "card";

export interface Settings {
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
  payday: number;
}

export interface Account {
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
}

interface ItemFields {
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
}

export interface Month {
  /** YYYY-MM */
  id: string;
  income_a: number;
  income_b: number;
  extra_income: number;
  extra_note: string;
  created_at: string;
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

export interface Category {
  id: string;
  name: string;
  /** 월 예산 (0이면 미설정) */
  budget: number;
  sort: number;
}

export interface Spending {
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
