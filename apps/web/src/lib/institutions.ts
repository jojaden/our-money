// 은행·증권사·카드사 이름 — 지갑에 카드·통장을 넣을 때 몇 글자만 쳐도 고르게 한다.
// 이름이 한 가지로 맞춰지면("삼성 카드" → "삼성카드") 나중에 카드 알림으로 카드사를 찾기 쉽다.
// 로고는 각 회사의 공식 사이트·앱 아이콘(96px, public/inst/)으로, 통장·카드가 어느 회사 것인지 알아보는 데만 쓴다 — 상표는 각 회사의 것.

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

/** 목록 이름 → 로고 파일(public/inst/<이름>.png). 깔끔한 로고를 못 구한 곳(우체국·삼성카드)은 없음 → 첫 글자 배지 */
const LOGO: Record<string, string> = {
  KB국민은행: "kb", 신한은행: "shinhan", 우리은행: "woori", 하나은행: "hana", NH농협은행: "nh", IBK기업은행: "ibk", 카카오뱅크: "kakaobank",
  케이뱅크: "kbank", 토스뱅크: "tossbank", SC제일은행: "sc", 한국씨티은행: "citi", KDB산업은행: "kdb", 수협은행: "suhyup", iM뱅크: "im",
  부산은행: "busan", 경남은행: "kyongnam", 광주은행: "kjbank", 전북은행: "jbbank", 제주은행: "jeju", 새마을금고: "kfcc", 신협: "cu", 지역농협: "nh",
  미래에셋증권: "miraeasset", 삼성증권: "samsungpop", 한국투자증권: "koreainvest", NH투자증권: "nhqv", KB증권: "kbsec", 키움증권: "kiwoom",
  신한투자증권: "shinhansec", 토스증권: "tossinvest",
  신한카드: "shinhancard", 현대카드: "hyundaicard", KB국민카드: "kbcard", 롯데카드: "lottecard", 하나카드: "hana", 우리카드: "wooricard",
  BC카드: "bccard", NH농협카드: "nhcard",
};

// 적은 이름에 들어 있으면 맞는 것으로 보는 말: 목록 이름과, 앞 영문을 뗀 이름("KB국민은행" → "국민은행"). 너무 짧은 말("카드")은 뺀다
const KEYS = Object.keys(LOGO)
  .flatMap((n) => [norm(n), norm(n).replace(/^[a-z]+/, "")].filter((k) => k.length >= 3).map((k) => [k, LOGO[n]] as const))
  .sort((a, b) => b[0].length - a[0].length);

/** 기관 이름의 로고 파일 경로. "국민은행"·"카카오뱅크 모임통장"처럼 조금 달라도 가장 길게 맞는 이름으로 찾는다 */
export function logoOf(institution: string): string | null {
  const q = norm(institution);
  if (!q) return null;
  const hit = KEYS.find(([k]) => q.includes(k));
  return hit ? `/inst/${hit[1]}.png` : null;
}
