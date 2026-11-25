import type { Data, MonthItem, PlanItem } from "./types";

/*
 * 입력 추천 — 글자를 치면 지난 기록 중 많이·최근에 쓴 것을 칩으로 (데이터는 기기 안에서만, 서버 저장 없음).
 * 한글은 자모로 풀어 비교해서 조합 중인 글자("관ㄹ")와 초성("ㄱㄹㅂ")으로도 찾는다.
 */

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNG = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅗㅏ", "ㅗㅐ", "ㅗㅣ", "ㅛ", "ㅜ", "ㅜㅓ", "ㅜㅔ", "ㅜㅣ", "ㅠ", "ㅡ", "ㅡㅣ", "ㅣ"];
const JONG = ["", "ㄱ", "ㄲ", "ㄱㅅ", "ㄴ", "ㄴㅈ", "ㄴㅎ", "ㄷ", "ㄹ", "ㄹㄱ", "ㄹㅁ", "ㄹㅂ", "ㄹㅅ", "ㄹㅌ", "ㄹㅍ", "ㄹㅎ", "ㅁ", "ㅂ", "ㅂㅅ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
/** 홑자모로 따로 친 겹자모 (조합 중에 "ㄳ"처럼 보일 때) */
const COMPAT: Record<string, string> = { ㄳ: "ㄱㅅ", ㄵ: "ㄴㅈ", ㄶ: "ㄴㅎ", ㄺ: "ㄹㄱ", ㄻ: "ㄹㅁ", ㄼ: "ㄹㅂ", ㄽ: "ㄹㅅ", ㄾ: "ㄹㅌ", ㄿ: "ㄹㅍ", ㅀ: "ㄹㅎ", ㅄ: "ㅂㅅ", ㅘ: "ㅗㅏ", ㅙ: "ㅗㅐ", ㅚ: "ㅗㅣ", ㅝ: "ㅜㅓ", ㅞ: "ㅜㅔ", ㅟ: "ㅜㅣ", ㅢ: "ㅡㅣ" };

/** 비교용 글: 소문자, 빈칸 하나, 한글은 자모로 ("관리비" → "ㄱㅗㅏㄴㄹㅣㅂㅣ") */
export function jamo(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase().replace(/\s+/g, " ").trim()) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c >= 0 && c < 11172) out += CHO[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)] + JONG[c % 28];
    else out += COMPAT[ch] ?? ch;
  }
  return out;
}

/** 초성만 ("관리비" → "ㄱㄹㅂ"). 한글이 아닌 글자는 그대로 */
export function initials(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase().replace(/\s+/g, "")) {
    const c = ch.charCodeAt(0) - 0xac00;
    out += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
  }
  return out;
}

const ONLY_CHO = /^[ㄱ-ㅎ]+$/;

/** 친 글자가 이 글과 맞는가: 0 = 앞에서부터, 1 = 중간 낱말 앞에서부터, 2 = 초성, -1 = 아님 */
export function matchRank(text: string, typed: string): number {
  const t = jamo(typed);
  if (!t) return -1;
  const j = jamo(text);
  if (j.startsWith(t)) return 0;
  // "토스 송금"의 "송", "부모님 · 예시은행"의 "예시"
  const words = text.split(/[\s·,/()]+/).filter(Boolean);
  if (words.slice(1).some((w) => jamo(w).startsWith(t))) return 1;
  const compact = typed.replace(/\s+/g, "");
  if (compact.length >= 2 && ONLY_CHO.test(compact) && initials(text).includes(compact)) return 2;
  return -1;
}

/** 추천 후보 한 건 — 같은 글끼리 묶어 센다. at 은 언제 쓴 기록인지(ISO 문자열, 큰 것이 최근) */
export interface Seen<T> {
  text: string;
  at: string;
  item: T;
}

export interface Suggestion<T> {
  text: string;
  /** 같은 글의 가장 최근 기록 — 고르면 이 값으로 다른 칸을 채운다 */
  item: T;
  count: number;
}

/**
 * 친 글자에 맞는 추천: 맞는 정도(앞에서부터가 먼저) → 많이 쓴 순 → 최근 순. 친 글과 똑같은 글은 뺀다(이미 다 쳤다).
 * exclude 는 이미 있는 것이라 다시 권하지 않을 글.
 */
export function suggest<T>(seen: Seen<T>[], typed: string, opts: { limit?: number; exclude?: Iterable<string> } = {}): Suggestion<T>[] {
  const t = typed.trim();
  if (!t) return [];
  const skip = new Set([...(opts.exclude ?? [])].map((x) => x.trim()));
  const groups = new Map<string, { last: Seen<T>; count: number }>();
  for (const s of seen) {
    const text = s.text.trim();
    if (!text || text === t || skip.has(text)) continue;
    const g = groups.get(text);
    if (!g) groups.set(text, { last: s, count: 1 });
    else {
      g.count += 1;
      if (s.at > g.last.at) g.last = s;
    }
  }
  return [...groups.entries()]
    .map(([text, g]) => ({ text, g, rank: matchRank(text, t) }))
    .filter((x) => x.rank >= 0)
    .sort((a, b) => a.rank - b.rank || b.g.count - a.g.count || b.g.last.at.localeCompare(a.g.last.at))
    .slice(0, opts.limit ?? 5)
    .map(({ text, g }) => ({ text, item: g.last.item, count: g.count }));
}

/* ---------- 입력칸마다 추천 출처 (두 사람 기록 모두) ---------- */

type Dated = { created_at?: string; updated_at?: string };
const atOf = (r: Dated) => r.updated_at ?? r.created_at ?? "";
const seen = <T extends Dated>(rows: T[], text: (r: T) => string | null | undefined): Seen<T>[] => rows.flatMap((r) => (text(r) ? [{ text: text(r)!, at: atOf(r), item: r }] : []));

/** 일정 제목 — 고르면 그 일정의 종류·시간·누구·알림·금액을 따른다 */
export const eventTitles = (d: Data) => seen(d.events, (e) => e.title);
export const eventNotes = (d: Data) => seen(d.events, (e) => e.note);
/** 지출 메모 — 고르면 그때 분류·결제수단·누구 돈·금액을 따른다 */
export const spendingMemos = (d: Data) => seen(d.spendings, (s) => s.memo);
/** 플랜 항목 이름 — 플랜과 지난 달 항목. 나눠 낸 몫(한 사람 몫 금액)은 빼고 */
export const itemNames = (d: Data): Seen<MonthItem | PlanItem>[] => seen<MonthItem | PlanItem>([...d.plan_items, ...d.month_items], (i) => (i.pair_id ? null : i.name));
export const itemPayees = (d: Data) => seen<MonthItem | PlanItem>([...d.plan_items, ...d.month_items], (i) => i.to_name);
export const itemNotes = (d: Data) => seen<MonthItem | PlanItem>([...d.plan_items, ...d.month_items], (i) => i.note);
