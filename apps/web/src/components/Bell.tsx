"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarCheck, CalendarDays, CreditCard, Heart, ReceiptText, Repeat, Wallet } from "lucide-react";
import type { Person } from "@/lib/types";
import { METHOD_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { addMonths, currentMonth, nameOf, paydayDate, periodOf } from "@/lib/calc";
import { ddayText, nextOccurrence, summaryHref, timeText } from "@/lib/calendar";
import { dateWithDay, num, parseYmd, shortDate } from "@/lib/format";
import { asking, byUrgency, dueState, eventTasks, useTasks, waiting, type Task } from "./tasks";
import { TaskRow } from "./TaskRow";
import { afterSheet, Sheet } from "./ui";
import { usePendingClose } from "./ClosePrompt";
import { WeekReport, weekSummary } from "./WeekReport";

const SEEN_KEY = "our-money-bell-seen";
/** 월급날은 며칠 전부터 알리나 */
const PAYDAY_AHEAD = 3;

/** 체크할 것이 아닌 다가오는 날 (월급날, 미리 알림을 켠 일정·D-day) */
interface Upcoming {
  key: string;
  date: string;
  title: string;
  sub: string;
  pill: string;
  icon: "payday" | "event" | "dday";
  person?: Person | "joint";
  href: string;
}

function daysUntil(today: string, d: string) {
  return Math.round((parseYmd(d).getTime() - parseYmd(today).getTime()) / 86_400_000);
}

/**
 * 지금(오늘이 든 가계부 달) 챙길 것.
 * - 고정: 할 일 중 "기간 동안 알림 모음에 고정"을 켠 것 — 그 기간 안이고 아직 안 끝냈으면 맨 위에
 * - 잘 나갔나요?: 자동이체·카드 자동결제인데 날짜가 지나도 체크 전인 납부 (늦은 게 아니라 확인할 일)
 * - 확인할 지출: 결제 알림으로 적어서 카드·분류 등 확인할 칸이 남은 지출 (가계부의 "확인 필요")
 * - 지난 것 / 오늘·곧: 이체·납부·카드값·정산은 3일 안, 할 일은 3일과 그 할 일의 미리 알림 중 긴 쪽 안. 월급날 전 이체는 빼고
 * - 다가오는 날: 월급날(3일 안), 미리 알림을 켠 일정·D-day(그 날 수 안)
 * - 지난주 돌아보기: 일·월·화요일에 지난주(일~토) 쓴 돈 (주마다 새 알림 하나)
 */
function useAlerts() {
  const { data, today, toggleCheck } = useData();
  const s = data.settings;
  const month = currentMonth(s.cycle_start, today);
  const { tasks } = useTasks(month);
  return useMemo(() => {
    const p = periodOf(month, s.cycle_start);
    const todos = eventTasks(data, p.start, p.last, toggleCheck);
    const pinned = todos.filter((t) => !t.done && t.todo!.occ.event.pin && t.todo!.occ.start <= today && today <= t.todo!.occ.end);
    const pinnedKeys = new Set(pinned.map((t) => t.key));
    const near = (t: Task) => {
      if (t.done || pinnedKeys.has(t.key) || waiting(t, today) || asking(t, today) || !t.due) return false;
      if (t.todo) return daysUntil(today, t.due) <= Math.max(3, t.todo.occ.event.remind_days ?? 0);
      const st = dueState(t.due, today, false);
      return st === "overdue" || st === "soon";
    };
    const urgent = [...tasks, ...todos].filter(near).sort(byUrgency);
    const asks = tasks.filter((t) => asking(t, today)).sort(byUrgency);

    const upcoming: Upcoming[] = [];
    for (const person of ["a", "b"] as const) {
      for (const m of [month, addMonths(month, 1)]) {
        const d = paydayDate(m, s, person);
        const n = daysUntil(today, d);
        if (n < 0 || n > PAYDAY_AHEAD) continue;
        upcoming.push({ key: `payday:${person}:${d}`, date: d, title: `${nameOf(s, person)} 월급날`, sub: dateWithDay(d), pill: n === 0 ? "오늘" : `D-${n}`, icon: "payday", person, href: "/check" });
      }
    }
    for (const e of data.events) {
      if (e.todo || e.remind_days == null) continue;
      const o = nextOccurrence(e, today);
      if (!o) continue;
      const n = daysUntil(today, o.start);
      if (n < 0 || n > e.remind_days) continue;
      const when = o.start === o.end ? dateWithDay(o.start) : `${dateWithDay(o.start)}부터`;
      upcoming.push({ key: `event:${e.id}@${o.start}`, date: o.start, title: e.title, sub: [when, timeText(e), e.owner !== "joint" ? nameOf(s, e.owner) : ""].filter(Boolean).join(" · "), pill: ddayText(o, today), icon: e.dday ? "dday" : "event", person: e.owner, href: "/calendar" });
    }
    upcoming.sort((a, b) => a.date.localeCompare(b.date));
    const reviews = data.spendings.filter((x) => x.review?.length);
    const week = weekSummary(data, today);

    return {
      week,
      pinned,
      late: urgent.filter((t) => t.due! < today),
      soon: urgent.filter((t) => t.due! >= today),
      asks,
      reviews,
      upcoming,
      keys: [...pinned.map((t) => t.key), ...urgent.map((t) => t.key), ...asks.map((t) => `ask:${t.key}`), ...reviews.map((x) => `rv:${x.id}`), ...upcoming.map((u) => u.key), ...(week ? [week.key] : [])],
    };
  }, [data, month, s, tasks, today, toggleCheck]);
}

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

const ICON = { payday: Wallet, event: CalendarDays, dday: Heart };

/**
 * 종 — 폰은 위쪽 막대 오른쪽 톱니(설정) 옆, 데스크톱은 레일 아래 톱니 위(rail).
 * 숫자는 이 기기에서 마지막으로 연 뒤 새로 생긴 알림 수(DB 에 남기지 않는다 — 두 사람·기기마다 따로).
 * 열면 모두 본 것으로 하고, 시트 안에서 지난달 마감·할 일·이체를 바로 한다(끝내면 목록에서 스르륵 빠진다). 다가오는 날을 누르면 그 화면으로.
 */
export function BellButton({ rail = false }: { rail?: boolean }) {
  const router = useRouter();
  const a = useAlerts();
  // 지난달을 아직 마감하지 않았으면 맨 위에 (홈 카드에서 "나중에"를 눌러도 여기엔 남는다)
  const close = usePendingClose();
  const keys = close ? [`close:${close.month}`, ...a.keys] : a.keys;
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(readSeen);
  const unseen = keys.filter((k) => !seen.has(k)).length;

  const show = () => {
    // 지금 있는 것만 남겨 쌓이지 않게
    const now = new Set(keys);
    setSeen(now);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...now]));
    } catch {}
    setOpen(true);
  };
  const go = (href: string) => {
    afterSheet(() => router.push(href));
    setOpen(false);
  };
  const empty = keys.length === 0;

  const group = (title: string, tasks: Task[]) =>
    tasks.length > 0 && (
      <div className="field" key={title}>
        <h3 className="sum-h">{title}</h3>
        <div className="rows" style={{ ["--inset" as string]: "40px" }}>
          {tasks.map((t) => (
            <TaskRow key={t.key} task={t} />
          ))}
        </div>
      </div>
    );

  return (
    <>
      <button type="button" className={rail ? "rail-btn bell" : "sq bell"} aria-haspopup="dialog" aria-label={unseen > 0 ? `알림 ${unseen}개 새로 있음` : "알림"} onClick={show}>
        <Bell aria-hidden="true" />
        {rail && <span className="tip">알림</span>}
        {unseen > 0 && (
          <span className="badge num" key={unseen} aria-hidden="true">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="알림">
        {empty ? (
          <p className="empty" key="empty">
            지금 챙길 것이 없어요. 마감하지 않은 지난달, 기한이 3일 안으로 다가온 이체·납부·할 일, 다가오는 월급날, 미리 알림을 켠 일정, 그리고 일요일마다 지난주 돌아보기가 여기에 모여요.
          </p>
        ) : (
          <>
            {a.week && (
              <div className="field" key="week">
                <h3 className="sum-h">지난주 돌아보기</h3>
                <WeekReport w={a.week} onOpen={() => go(summaryHref(a.week!.week))} />
              </div>
            )}
            {close && (
              <div className="field" key="close">
                <h3 className="sum-h">지난달 마무리</h3>
                <div className="rows" style={{ ["--inset" as string]: "52px" }}>
                  <div className="row">
                    <span className="alert-ic" aria-hidden="true">
                      <CalendarCheck />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="t">{close.label}을 마감할까요?</div>
                      <div className="s">{close.summary}</div>
                    </div>
                    <div className="r">
                      <button type="button" className="btn sm" onClick={() => void close.close()}>
                        마감하기
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {group("기간 동안 고정", a.pinned)}
            {group("지난 것", a.late)}
            {a.asks.length > 0 && (
              <div className="field" key="asks">
                <h3 className="sum-h">잘 나갔나요?</h3>
                <div className="rows" style={{ ["--inset" as string]: "52px" }}>
                  {a.asks.map((t) => {
                    const Icon = t.item!.method === "card_auto" ? CreditCard : Repeat;
                    return (
                      <div className="row" key={t.key}>
                        <span className="alert-ic" aria-hidden="true">
                          <Icon />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="t">
                            {t.title} {num(t.amount)}원
                          </div>
                          <div className="s">
                            {shortDate(t.due!)} {METHOD_LABEL[t.item!.method]} 날이 지났어요
                          </div>
                        </div>
                        <div className="r">
                          <button type="button" className="btn sm" aria-label={`${t.title} 나갔어요, 완료로 표시`} onClick={t.toggle}>
                            나갔어요
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {a.reviews.length > 0 && (
              <div className="field" key="reviews">
                <h3 className="sum-h">확인할 지출</h3>
                <div className="rows" style={{ ["--inset" as string]: "52px" }}>
                  <button type="button" className="row" onClick={() => go("/ledger/all/?review=1")}>
                    <span className="alert-ic" aria-hidden="true">
                      <ReceiptText />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="t">결제 알림으로 적은 지출 {a.reviews.length}건</div>
                      <div className="s">카드·분류·누구 돈을 가계부의 &quot;확인 필요&quot;에서 확인해 주세요</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
            {group("오늘·곧", a.soon)}
            {a.upcoming.length > 0 && (
              <div className="field" key="upcoming">
                <h3 className="sum-h">다가오는 날</h3>
                <div className="rows" style={{ ["--inset" as string]: "52px" }}>
                  {a.upcoming.map((u) => {
                    const Icon = ICON[u.icon];
                    return (
                      <button type="button" className="row" key={u.key} onClick={() => go(u.href)}>
                        <span className={`alert-ic ${u.icon} ${u.person ?? ""}`} aria-hidden="true">
                          <Icon />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="t">{u.title}</div>
                          <div className="s">{u.sub}</div>
                        </div>
                        <div className="r">
                          <span className={`pill ${u.pill === "오늘" ? "warning" : ""}`}>{u.pill}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}
