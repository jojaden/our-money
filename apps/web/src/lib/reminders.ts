// 안드로이드 앱이 스스로 띄우는 폰 알림 목록. 로그인은 웹에만 있어서, 웹이 앱을 열어 둔 동안 앞으로 35일의 알림을 넘기고
// 폰이 그 시각에 띄운다 (apps/mobile androidApp remind/Reminders.kt). 앱을 다시 열면 새 목록으로 바뀐다.
// - 일정 미리 알림: 일정 시트에서 고른 며칠 전(remind_days) 아침 9시. 내 일정과 공동 일정만, 끝낸 할 일은 빼고
// - 월급날 아침 9시: 내 월급날, 그날 옮길 돈
// - 나갈 돈 전날 저녁 8시: 내일 기한인 고정비 납부·카드값 (나와 공동 몫, 아직 체크하지 않은 것)

import type { Data, Person } from "./types";
import type { PaydayGroup, Task } from "@/components/tasks";
import { addDays, eventTodo, occurrences, timeText } from "./calendar";
import { nameOf, paydayDate } from "./calc";
import { dateWithDay, num } from "./format";

export interface Reminder {
  /** 같은 알림이면 다시 보내도 같은 id (폰이 한 번만 띄운다) */
  id: string;
  /** 'YYYY-MM-DDTHH:MM' 폰 시간 */
  at: string;
  /** 폰 알림 채널 — 사람이 종류마다 끌 수 있다 */
  ch: "event" | "payday" | "due";
  title: string;
  body: string;
  /** 누르면 열 화면 */
  open: "calendar" | "check";
}

const DAYS = 35;
const MORNING = "09:00";
const EVENING = "20:00";

/** 그달의 월급날·나갈 돈 (useTasks 의 결과 — 아직 만들지 않은 달이면 비어 있다) */
export interface MonthTasks {
  /** 가계부 달 'YYYY-MM' */
  month: string;
  paydays: PaydayGroup[];
  pays: Task[];
  bills: Task[];
}

const mine = (me: Person, who: Person | "joint") => who === me || who === "joint";

export function reminders(data: Data, me: Person, today: string, months: MonthTasks[]): Reminder[] {
  const until = addDays(today, DAYS);
  const out: Reminder[] = [];

  for (const e of data.events) {
    if (e.remind_days === null || !mine(me, e.owner)) continue;
    for (const o of occurrences(e, addDays(today, e.remind_days), addDays(until, e.remind_days))) {
      const day = addDays(o.start, -e.remind_days);
      if (day < today || day > until || o.start < today) continue;
      if (e.todo && eventTodo(data, o).check) continue;
      const when = e.remind_days === 0 ? "오늘" : e.remind_days === 1 ? "내일" : `D-${e.remind_days}`;
      out.push({
        id: `e:${e.id}@${o.start}:${e.remind_days}`,
        at: `${day}T${MORNING}`,
        ch: "event",
        title: `${when} · ${e.title}`,
        body: [dateWithDay(o.start), timeText(e)].filter(Boolean).join(" · "),
        open: "calendar",
      });
    }
  }

  const seen = new Set<string>();
  for (const m of months) {
    // 월급날은 그달을 아직 만들지 않았어도 알린다 (옮길 돈은 만든 달에만 있다)
    const date = paydayDate(m.month, data.settings, me);
    if (date >= today && date <= until && !seen.has(date)) {
      seen.add(date);
      const g = m.paydays.find((x) => x.person === me);
      const left = (g?.transfers ?? []).filter((t) => !t.done && !t.early);
      const sum = left.reduce((a, t) => a + t.amount, 0);
      out.push({
        id: `p:${me}:${date}`,
        at: `${date}T${MORNING}`,
        ch: "payday",
        title: `${nameOf(data.settings, me)} 월급날이에요`,
        body: left.length > 0 ? `오늘 옮길 돈 ${left.length}건 · ${num(sum)}원` : "오늘 월급이 들어와요",
        open: "check",
      });
    }
  }

  // 같은 날 나갈 돈은 한 알림으로
  const byDay = new Map<string, Task[]>();
  for (const m of months) {
    for (const t of [...m.pays, ...m.bills]) {
      if (t.done || !t.due || !mine(me, t.person)) continue;
      const eve = addDays(t.due, -1);
      if (eve < today || eve > until) continue;
      const list = byDay.get(t.due) ?? [];
      if (!list.some((x) => x.key === t.key)) byDay.set(t.due, [...list, t]);
    }
  }
  for (const [due, list] of byDay) {
    const sum = list.reduce((a, t) => a + t.amount, 0);
    const names = list.slice(0, 2).map((t) => `${t.kind === "card" ? t.bill!.card.name : t.title} ${num(t.amount)}원`);
    out.push({
      id: `d:${me}:${due}`,
      at: `${addDays(due, -1)}T${EVENING}`,
      ch: "due",
      title: `내일 나갈 돈 ${list.length}건 · ${num(sum)}원`,
      body: `${names.join(" · ")}${list.length > 2 ? ` 외 ${list.length - 2}건` : ""}`,
      open: "check",
    });
  }

  return out.sort((a, b) => a.at.localeCompare(b.at)).slice(0, 80);
}
