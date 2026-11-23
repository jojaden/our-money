/**
 * 시간 고르기(TimeWheel·TimePanel)가 쓰는 시각 셈. 시각은 DB 와 같은 "HH:MM"(00:00~23:59), 비면 "".
 * 다른 모듈을 부르지 않아 node 테스트(clock.test.mjs)가 바로 읽는다.
 */

export const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** 분 → "HH:MM". 하루를 넘거나 앞서면 "" (밤을 넘기는 시간은 두지 않는다) */
export const fromMin = (n: number): string => (n < 0 || n > 1439 ? "" : `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`);

/** 30 → "30분", 60 → "1시간", 90 → "1시간 30분" */
export function durationText(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}시간` : "", m ? `${m}분` : ""].filter(Boolean).join(" ");
}

/** 바퀴 세 줄의 값: 오후인지 · 1~12시 · 분 */
export function clockParts(t: string): { pm: boolean; h12: number; m: number } {
  const [h, m] = t.split(":").map(Number);
  return { pm: h >= 12, h12: h % 12 === 0 ? 12 : h % 12, m };
}

/** 바퀴 세 줄 → "HH:MM" (오전 12시는 0시, 오후 12시는 12시) */
export const joinClock = (pm: boolean, h12: number, m: number): string => fromMin(((h12 % 12) + (pm ? 12 : 0)) * 60 + m);

/** 처음 보여 줄 시작 — 지금 다음 정시(밤 11시 넘으면 그대로 11시) */
export const nextHour = (now: Date): string => fromMin(Math.min(now.getHours() + 1, 23) * 60);

/**
 * 시작을 옮기면 끝도 같은 길이만큼 따라간다(일정 앱의 흔한 규칙). 끝이 없거나 시작 전이었으면 그대로,
 * 따라간 끝이 자정을 넘으면 끝을 지운다(하루 안의 시간만 둔다).
 */
export function followEnd(prevStart: string, nextStart: string, end: string): string {
  if (!prevStart || !end || !nextStart) return end;
  const len = toMin(end) - toMin(prevStart);
  return len > 0 ? fromMin(toMin(nextStart) + len) : end;
}

/** 분 바퀴의 칸: 5분 단위에 지금 값이 그 사이(예: 37분)면 끼워 넣는다 — 열자마자 몰래 반올림하지 않게 */
export function minuteSteps(m: number | null): number[] {
  const list = Array.from({ length: 12 }, (_, i) => i * 5);
  return m === null || m % 5 === 0 ? list : [...list, m].sort((a, b) => a - b);
}
