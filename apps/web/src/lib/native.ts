// 폰 앱처럼 느끼게 하는 작은 도구들.

import { useSyncExternalStore } from "react";
import type { WidgetCalendar } from "./calendar";
import type { Reminder } from "./reminders";
import type { ThemeChoice } from "./theme";

/** 짧은 진동 (안드로이드). 의미 있는 순간에만: 완료, 저장, 삭제. */
export function haptic(pattern: number | number[] = 10) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {}
}

/** 홈 화면에 설치된 앱으로 실행 중인가 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** 안드로이드 앱(웹뷰) 안에서 열렸나 — 앱이 user agent 끝에 붙인다 (apps/mobile/androidApp MainActivity) */
export function inApp(): boolean {
  return typeof navigator !== "undefined" && /\bOurMoneyApp\//.test(navigator.userAgent);
}

/**
 * 앱에 부탁하기 (앱이 우리 주소에서 온 메시지만 받는다). 앱 밖이면 아무것도 하지 않는다.
 * - "card-notice": 카드 알림 모으기 화면
 * - { type: "ics", text }: 일정 .ics 를 파일로 만들어 공유 창 열기
 * - { type: "expect", items }: 이번 달 남은 할 일 — 결제 알림과 맞춰 보라고 (폰에만 둔다)
 * - { type: "matches" }: 결제 알림으로 맞춘 것과 확인할 지출을 보내 달라고 (답장은 onApp 으로 온다)
 * - { type: "applied", ids }: 체크를 마쳤으니 지우라고
 * - { type: "calendar", ... }: 홈 화면 달력 위젯이 그릴 달력 요약 / { type: "calendar-clear" }: 로그아웃할 때 지우라고
 * - { type: "theme", dark, choice }: 화면 테마 — 시스템 막대 아이콘·웹뷰 바탕·달력 위젯을 맞추라고
 * - { type: "reminders", items }: 앞으로 35일의 폰 알림 (lib/reminders.ts)
 * - { type: "notify-status" } 폰 알림을 허용했는지 알려 달라고(답은 "ourmoney-notify" 이벤트),
 *   { type: "notify-ask" } 허용을 물어 달라고(영구 거절이면 알림 설정 화면), { type: "notify-settings" } 알림 종류 설정 화면
 */
export function toApp(
  message:
    | "card-notice"
    | { type: "ics"; text: string }
    | { type: "expect"; items: AppExpect[] }
    | { type: "matches" }
    | { type: "applied"; ids: string[] }
    | ({ type: "calendar" } & WidgetCalendar)
    | { type: "calendar-clear" }
    | { type: "theme"; dark: boolean; choice: ThemeChoice }
    | { type: "reminders"; items: Reminder[] }
    | { type: "notify-status" }
    | { type: "notify-ask" }
    | { type: "notify-settings" },
) {
  bridge()?.postMessage(typeof message === "string" ? message : JSON.stringify(message));
}

/** 결제 알림과 맞춰 볼 할 일 하나 (apps/mobile core notice/Match.kt 의 Expect) */
export interface AppExpect {
  key: string;
  kind: string;
  title: string;
  amount: number;
  due: string | null;
  method: string | null;
  last4: string | null;
}

/** 결제 알림으로 맞춘 것 — 확실한 것과 사람이 폰 알림에서 "체크하기"를 고른 것 */
export interface AppMatch {
  id: string;
  key: string;
  title: string;
  amount: number;
}

/** 할 일과 맞지 않은 카드 결제(또는 그 취소) — 가계부에 "확인 필요"로 적는다 */
export interface AppSpend {
  id: string;
  cancel: boolean;
  amount: number;
  merchant: string | null;
  last4: string | null;
  /** 할부 개월 (1 = 일시불), 모르면 null */
  months: number | null;
  /** 알림이 온 시각 (ms) */
  at: number;
}

interface Bridge {
  postMessage(m: string): void;
  addEventListener(type: "message", fn: (e: { data: string }) => void): void;
  removeEventListener(type: "message", fn: (e: { data: string }) => void): void;
}

function bridge(): Bridge | undefined {
  return typeof window === "undefined" ? undefined : (window as Window & { OurMoneyApp?: Bridge }).OurMoneyApp;
}

/** 앱이 보낸 답장 받기 (지금은 { type: "matches", items, spends }). 앱 밖이면 아무것도 하지 않는다. 그만 받는 함수를 돌려준다 */
export function onApp(fn: (msg: { type: "matches"; items: AppMatch[]; spends: AppSpend[] }) => void): () => void {
  const b = bridge();
  if (!b) return () => {};
  const h = (e: { data: string }) => {
    try {
      const msg = JSON.parse(e.data) as { type?: string; items?: AppMatch[]; spends?: AppSpend[] };
      if (msg.type === "matches" && Array.isArray(msg.items)) fn({ type: "matches", items: msg.items, spends: Array.isArray(msg.spends) ? msg.spends : [] });
    } catch {}
  };
  b.addEventListener("message", h);
  return () => b.removeEventListener("message", h);
}

/** 이 앱이 그 일을 할 수 있나 — 앱이 user agent 에 OurMoneyCan/… 로 알린다 (예전 앱에는 없다) */
export function appCan(feature: "ics" | "match" | "widget" | "remind"): boolean {
  return typeof navigator !== "undefined" && new RegExp(`\\bOurMoneyCan/\\S*\\b${feature}\\b`).test(navigator.userAgent);
}

const noSubscribe = () => () => {};

/** 화면용 inApp — 미리 그린 HTML(앱 밖으로 본다)과 첫 그림이 어긋나지 않게 */
export function useInApp(): boolean {
  return useSyncExternalStore(noSubscribe, inApp, () => false);
}
