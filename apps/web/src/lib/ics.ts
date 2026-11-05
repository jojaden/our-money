// 일정을 iCalendar(.ics, RFC 5545) 파일로 — 구글·애플·삼성 캘린더가 모두 가져온다.
// 우리 DB 가 원본이고 이 파일은 그 순간의 복사본(체크 완료 여부·사람 색은 담지 않는다).
// 일정마다 UID 를 고정해서, 같은 달력에 다시 가져오면 지원하는 앱(애플 등)은 새로 만들지 않고 고친다.

import type { CalEvent, Settings } from "./types";
import { nameOf } from "./calc";
import { addDays } from "./calendar";
import { num, parseYmd } from "./format";

/** 할 일·D-day·일정 */
export function eventKind(e: CalEvent): "할 일" | "D-day" | "일정" {
  return e.todo ? "할 일" : e.dday ? "D-day" : "일정";
}

/** TEXT 값: \ ; , 줄바꿈을 이스케이프 */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const enc = new TextEncoder();

/** 한 줄은 75바이트(UTF-8)까지 — 넘으면 접고 다음 줄을 빈칸으로 시작한다. 한글 한 글자(3바이트)를 가르지 않는다 */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length === 0 ? 75 : 74)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const day = (d: string) => d.replace(/-/g, "");

/** 이 기기 시각(YYYY-MM-DD + HH:MM)을 UTC 로: 20261105T100000Z */
function utc(d: string, hm: string, plusMin = 0): string {
  const [y, m, dd] = d.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  return new Date(y, m - 1, dd, h, mi + plusMin).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * 반복: 우리 앱은 그 달에 없는 날이면 말일로 옮긴다(31일 → 30일, 2/29 → 2/28).
 * RRULE 은 없는 날을 건너뛰므로 29~31일은 "28일부터 그 날까지 중 마지막 날"(BYSETPOS=-1)로 같은 뜻을 만든다.
 */
function rrule(e: CalEvent): string | null {
  if (e.repeat === "none") return null;
  const d = parseYmd(e.start_date);
  const dom = d.getDate();
  const last = dom > 28 ? `;BYMONTHDAY=${Array.from({ length: dom - 27 }, (_, i) => 28 + i).join(",")};BYSETPOS=-1` : "";
  if (e.repeat === "monthly") return `RRULE:FREQ=MONTHLY${last}`;
  return `RRULE:FREQ=YEARLY${last && d.getMonth() === 1 ? `;BYMONTH=2${last}` : ""}`;
}

/**
 * 미리 알림: 하루 종일이면 그 날 수 전 오전 9시(당일이면 그날 9시), 시간이 있으면 그 날 수 전 같은 시각(당일이면 1시간 전).
 * (구글은 가져올 때 알림을 빼고 그 달력의 기본 알림을 쓴다)
 */
function alarm(e: CalEvent, timed: boolean, summary: string): string[] {
  const n = e.remind_days;
  if (n == null) return [];
  const trigger = timed ? (n === 0 ? "-PT1H" : `-P${n}D`) : n === 0 ? "PT9H" : `-PT${n * 24 - 9}H`;
  return ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(summary)}`, `TRIGGER:${trigger}`, "END:VALARM"];
}

function vevent(e: CalEvent, s: Settings, stamp: string): string[] {
  const end = e.end_date ?? e.start_date;
  const summary = e.todo ? `할 일 · ${e.title}` : e.title;
  const timed = Boolean(e.start_time || e.end_time);
  let when: string[];
  if (!timed) when = [`DTSTART;VALUE=DATE:${day(e.start_date)}`, `DTEND;VALUE=DATE:${day(addDays(end, 1))}`];
  else if (e.start_time && e.end_time) when = [`DTSTART:${utc(e.start_date, e.start_time)}`, `DTEND:${utc(end, e.end_time)}`];
  else if (e.start_time)
    // 시작만: 하루면 한 시간, 기간이면 끝 날이 다 갈 때까지
    when = [`DTSTART:${utc(e.start_date, e.start_time)}`, `DTEND:${e.start_date === end ? utc(e.start_date, e.start_time, 60) : utc(addDays(end, 1), "00:00")}`];
  // 끝만("6시까지"): 하루면 그 시각 한 점, 기간이면 첫날 0시부터
  else if (e.start_date === end) when = [`DTSTART:${utc(end, e.end_time!)}`, `DTEND:${utc(end, e.end_time!)}`];
  else when = [`DTSTART:${utc(e.start_date, "00:00")}`, `DTEND:${utc(end, e.end_time!)}`];
  const desc = [e.owner !== "joint" ? `누구: ${nameOf(s, e.owner)}` : "", e.amount ? `낼 돈: ${num(e.amount)}원` : "", e.note].filter(Boolean).join("\n");
  const rule = rrule(e);
  return [
    "BEGIN:VEVENT",
    `UID:${e.id}@our-money`,
    `DTSTAMP:${stamp}`,
    ...when,
    ...(rule ? [rule] : []),
    `SUMMARY:${esc(summary)}`,
    ...(desc ? [`DESCRIPTION:${esc(desc)}`] : []),
    `CATEGORIES:${esc(eventKind(e))}`,
    ...alarm(e, timed, summary),
    "END:VEVENT",
  ];
}

/** 일정들을 .ics 글로 (줄 끝은 CRLF) */
export function toIcs(events: CalEvent[], s: Settings, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//our-money//우리 집 가계부//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:우리 집",
    ...events.flatMap((e) => vevent(e, s, stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
