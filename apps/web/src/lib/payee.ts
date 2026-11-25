import type { Account, MonthItem } from "./types";

/** 받는 곳 칸 글자 수 — DB CHECK(migrations/020) 와 같다 */
export const MAX_PAYEE = 60;

/** 받는 곳 글에서 계좌번호(숫자 8자리 이상, 사이에 - 나 빈칸)가 적힌 그대로의 조각 */
export function accountNumberRun(text: string): string | null {
  for (const m of text.matchAll(/\d[\d -]*\d/g)) if (m[0].replace(/\D/g, "").length >= 8) return m[0];
  return null;
}

/** 계좌번호를 숫자만 — 은행 앱에 붙여 넣기 좋게 */
export function accountNumberIn(text: string): string | null {
  return accountNumberRun(text)?.replace(/\D/g, "") ?? null;
}

/** 받는 곳: 내 통장이면 그 이름, 아니면 적어 둔 글. 비었으면 null. copy 는 복사할 계좌번호 */
export function payeeOf(i: Pick<MonthItem, "to_account_id" | "to_name">, accounts: Account[]): { text: string; copy: string | null } | null {
  if (i.to_account_id) {
    const a = accounts.find((x) => x.id === i.to_account_id);
    return a ? { text: a.name, copy: null } : null;
  }
  const t = (i.to_name ?? "").trim();
  return t ? { text: t, copy: accountNumberIn(t) } : null;
}
