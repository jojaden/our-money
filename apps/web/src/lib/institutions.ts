// 은행·증권사·카드사 이름 — 지갑에 카드·통장을 넣을 때 몇 글자만 쳐도 고르게 한다.
// 이름이 한 가지로 맞춰지면("삼성 카드" → "삼성카드") 나중에 카드 알림으로 카드사를 찾기 쉽다. 로고·색은 쓰지 않는다.

export const BANKS = [
  "KB국민은행", "신한은행", "우리은행", "하나은행", "NH농협은행", "IBK기업은행", "카카오뱅크", "케이뱅크", "토스뱅크",
  "SC제일은행", "한국씨티은행", "KDB산업은행", "수협은행", "iM뱅크", "부산은행", "경남은행", "광주은행", "전북은행", "제주은행",
  "우체국", "새마을금고", "신협", "지역농협",
  "미래에셋증권", "삼성증권", "한국투자증권", "NH투자증권", "KB증권", "키움증권", "신한투자증권", "토스증권",
];

export const CARD_ISSUERS = [
  "신한카드", "삼성카드", "현대카드", "KB국민카드", "롯데카드", "하나카드", "우리카드", "BC카드", "NH농협카드",
  "IBK기업은행", "카카오뱅크", "케이뱅크", "토스뱅크", "우체국", "새마을금고", "신협", "수협은행",
];

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 적은 글자가 들어간 이름(앞에서 맞는 것 먼저), 이미 같은 이름이면 비운다 */
export function suggestInstitutions(kind: "bank" | "card", typed: string, max = 6): string[] {
  const q = norm(typed);
  if (!q) return [];
  const list = kind === "card" ? CARD_ISSUERS : BANKS;
  if (list.some((n) => norm(n) === q && n === typed.trim())) return [];
  return list
    .filter((n) => norm(n).includes(q))
    .sort((a, b) => Number(!norm(a).startsWith(q)) - Number(!norm(b).startsWith(q)))
    .slice(0, max);
}

/** 띄어쓰기·대소문자만 다른 이름은 목록의 이름으로 맞춘다 ("삼성 카드" → "삼성카드") */
export function canonicalInstitution(typed: string): string {
  const q = norm(typed);
  return [...CARD_ISSUERS, ...BANKS].find((n) => norm(n) === q) ?? typed.trim();
}
