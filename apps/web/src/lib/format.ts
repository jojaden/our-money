const nf = new Intl.NumberFormat("ko-KR");

export function num(n: number): string {
  return nf.format(Math.round(n));
}

/** 부호를 붙인 금액: +12,000 / −3,000 */
export function signed(n: number): string {
  if (n === 0) return "0";
  return (n > 0 ? "+" : "−") + nf.format(Math.abs(Math.round(n)));
}

/** 차트 라벨용 짧은 금액: 1,250만 / 3.2억 */
export function short(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`;
  if (abs >= 10_000) return `${nf.format(Math.round(n / 10_000))}만`;
  return nf.format(n);
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export function dayLabel(s: string, today = ymd(new Date())): string {
  const d = parseYmd(s);
  const t = parseYmd(today);
  const diff = Math.round((t.getTime() - d.getTime()) / 86_400_000);
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일`;
  if (diff === 0) return `오늘 · ${base}`;
  if (diff === 1) return `어제 · ${base}`;
  return base;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const thisYear = new Date().getFullYear();
  return y === thisYear ? `${m}월` : `${y}년 ${m}월`;
}

export function shortDate(s: string): string {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 입력창의 "1,234,000" 같은 문자열을 숫자로 */
export function parseAmount(s: string): number {
  const n = Number(s.replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/* ---------- 조사 ---------- */

function jong(word: string): number {
  const c = word.trim().slice(-1).charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28;
  // 숫자·영문: 받침 있는 것처럼 읽히는 경우만 대충 맞춘다
  return /[136780lmnLMN]$/.test(word.trim()) ? 1 : 0;
}

/** 으로/로 */
export function ro(word: string): string {
  const j = jong(word);
  return `${word}${j === 0 || j === 8 ? "로" : "으로"}`;
}
/** 이/가 */
export function iga(word: string): string {
  return `${word}${jong(word) === 0 ? "가" : "이"}`;
}
/** 을/를 */
export function eul(word: string): string {
  return `${word}${jong(word) === 0 ? "를" : "을"}`;
}
/** 은/는 */
export function eun(word: string): string {
  return `${word}${jong(word) === 0 ? "는" : "은"}`;
}
/** 라서/이라서 */
export function rase(word: string): string {
  return `${word}${jong(word) === 0 ? "라서" : "이라서"}`;
}
