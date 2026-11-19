"use client";

import { Check, Copy, Layers, ListChecks, Pencil, Settings as Gear, Share, Trash2, Undo2 } from "lucide-react";
import type { CalEvent, MonthItem, Settings, Spending } from "@/lib/types";
import { useData } from "@/lib/store";
import { ddayText, eventTodo, timeText, type Occurrence } from "@/lib/calendar";
import { toIcs } from "@/lib/ics";
import { appCan, toApp, useInApp } from "@/lib/native";
import { dateWithDay } from "@/lib/format";
import type { HoldAction } from "./HoldMenu";
import type { Task } from "./tasks";

/** 메뉴의 일이 다른 화면·시트로 갈 때 — 날짜 패널 안이면 패널을 먼저 닫고 간다(부르는 쪽이 정한다) */
export interface HoldNav {
  go: (path: string) => void;
  edit: (e: CalEvent) => void;
  copy: (e: CalEvent) => void;
  editSpending?: (x: Spending) => void;
}

/** 공유할 글: 제목, 날짜·시간(기간이면 처음~끝), D-day 면 남은 날, 메모 */
function shareText(o: Occurrence, today: string): string {
  const e = o.event;
  const time = timeText(e);
  const when = o.start !== o.end ? `${dateWithDay(o.start)} ~ ${dateWithDay(o.end)}` : `${dateWithDay(o.start)}${time ? ` ${time}` : ""}`;
  return [e.title, when, e.dday ? ddayText(o, today) : "", e.note].filter(Boolean).join("\n");
}

/**
 * 일정 하나 공유. 앱은 .ics 파일로 공유 창(받는 쪽이 캘린더에 바로 넣는다 — 일정 내보내기와 같은 길),
 * 브라우저는 기기 공유 창, 둘 다 안 되면 글을 클립보드에. 누른 그 순간에 불러야 공유 창이 열린다.
 */
async function shareEvent(o: Occurrence, s: Settings, app: boolean, today: string, toast: (msg: string, undo?: () => void, opts?: { error?: boolean }) => void) {
  const text = shareText(o, today);
  if (app && appCan("ics")) return toApp({ type: "ics", text: toIcs([o.event], s) });
  if (!app && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: o.event.title, text });
      return;
    } catch (err) {
      // 공유 창을 닫은 것이면 그대로 끝
      if ((err as Error).name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("일정 내용을 복사했어요");
  } catch {
    toast("이 기기에서는 공유도 복사도 안 돼요. 설정 › 일정 내보내기로 파일을 보내 주세요", undefined, { error: true });
  }
}

const doneAction = (done: boolean, run: () => void): HoldAction => ({ label: done ? "완료 취소" : "완료", icon: done ? Undo2 : Check, run });

/**
 * 꾹 누르기 메뉴의 줄들 — 무엇을 눌렀는지에 따라 할 수 있는 일만 (components/HoldMenu, docs/design-system/components/HoldMenu).
 * - 일정: 수정 · 복사 · 공유 | 삭제
 * - 할 일: 완료(완료 취소) · 수정 · 복사 · 공유 | 삭제
 * - D-day: 수정 · 복사 · 공유(남은 날 포함) | 삭제
 * - 나갈 돈(카드값·이체·납부·정산 체크): 완료(완료 취소) · 체크에서 보기 · 플랜에서 보기(플랜 항목만)
 * - 들어올 돈(월급날): 체크에서 나누기 · 플랜에서 월급 고치기 · 월급날 바꾸기
 * - 쓴 돈: 수정 | 삭제
 */
export function useHoldActions(nav: HoldNav) {
  const { data, today, upsert, remove, toast, toggleCheck } = useData();
  const app = useInApp();
  const s = data.settings;

  const forEvent = (o: Occurrence): HoldAction[] => {
    const e = o.event;
    const what = e.todo ? "할 일을" : e.dday ? "D-day를" : "일정을";
    const todo = e.todo ? eventTodo(data, o) : null;
    const done = Boolean(todo?.check);
    return [
      ...(todo ? [doneAction(done, () => void toggleCheck({ id: todo.id, month: todo.month, kind: "event", amount: e.amount ?? 0 }, !done))] : []),
      { label: "수정", icon: Pencil, run: () => nav.edit(e) },
      { label: "복사", icon: Copy, run: () => nav.copy(e) },
      { label: "공유", icon: Share, now: true, run: () => void shareEvent(o, s, app, today, toast) },
      {
        label: "삭제",
        icon: Trash2,
        danger: true,
        // 일정 시트의 삭제와 같다: 묻지 않고 지우고 토스트의 되돌리기로 살린다 (반복 일정은 통째로)
        run: async () => {
          if (await remove("events", [e.id])) toast(e.repeat !== "none" ? `반복하는 ${what} 모두 지웠어요` : `${what} 지웠어요`, () => void upsert("events", [e]));
        },
      },
    ];
  };

  /** 나갈 돈 체크 (카드값·이체·납부·정산) */
  const forCheck = (done: boolean, toggle: () => void, item?: MonthItem): HoldAction[] => [
    doneAction(done, toggle),
    { label: "체크에서 보기", icon: ListChecks, run: () => nav.go("/check/") },
    ...(item ? [{ label: "플랜에서 보기", icon: Layers, run: () => nav.go("/plan/") }] : []),
  ];

  /** 모아 보기의 할 일 줄 — 일정 할 일이면 일정 메뉴, 아니면 체크 메뉴 */
  const forTask = (t: Task): HoldAction[] => (t.todo ? forEvent(t.todo.occ) : forCheck(t.done, t.toggle, t.item));

  const forPayday = (): HoldAction[] => [
    { label: "체크에서 나누기", icon: ListChecks, run: () => nav.go("/check/") },
    { label: "플랜에서 월급 고치기", icon: Layers, run: () => nav.go("/plan/") },
    { label: "월급날 바꾸기", icon: Gear, run: () => nav.go("/settings/?s=people") },
  ];

  const forSpending = (x: Spending): HoldAction[] => [
    ...(nav.editSpending ? [{ label: "수정", icon: Pencil, run: () => nav.editSpending!(x) }] : []),
    {
      label: "삭제",
      icon: Trash2,
      danger: true,
      // 지출 시트의 삭제와 같다
      run: async () => {
        if (await remove("spendings", [x.id])) toast("기록을 지웠어요", () => void upsert("spendings", [x]));
      },
    },
  ];

  return { forEvent, forCheck, forTask, forPayday, forSpending };
}

export type HoldActions = ReturnType<typeof useHoldActions>;
