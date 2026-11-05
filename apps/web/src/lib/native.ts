// 폰 앱처럼 느끼게 하는 작은 도구들.

import { useSyncExternalStore } from "react";

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
 * - { type: "matches" }: 결제 알림으로 맞춘 것 보내 달라고 (답장은 onApp 으로 온다)
 * - { type: "applied", ids }: 체크를 마쳤으니 지우라고
 */
export function toApp(
  message:
    | "card-notice"
    | { type: "ics"; text: string }
    | { type: "expect"; items: AppExpect[] }
    | { type: "matches" }
    | { type: "applied"; ids: string[] },
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

interface Bridge {
  postMessage(m: string): void;
  addEventListener(type: "message", fn: (e: { data: string }) => void): void;
  removeEventListener(type: "message", fn: (e: { data: string }) => void): void;
}

function bridge(): Bridge | undefined {
  return typeof window === "undefined" ? undefined : (window as Window & { OurMoneyApp?: Bridge }).OurMoneyApp;
}

/** 앱이 보낸 답장 받기 (지금은 { type: "matches", items }). 앱 밖이면 아무것도 하지 않는다. 그만 받는 함수를 돌려준다 */
export function onApp(fn: (msg: { type: "matches"; items: AppMatch[] }) => void): () => void {
  const b = bridge();
  if (!b) return () => {};
  const h = (e: { data: string }) => {
    try {
      const msg = JSON.parse(e.data) as { type?: string; items?: AppMatch[] };
      if (msg.type === "matches" && Array.isArray(msg.items)) fn({ type: "matches", items: msg.items });
    } catch {}
  };
  b.addEventListener("message", h);
  return () => b.removeEventListener("message", h);
}

/** 이 앱이 그 일을 할 수 있나 — 앱이 user agent 에 OurMoneyCan/… 로 알린다 (예전 앱에는 없다) */
export function appCan(feature: "ics" | "match"): boolean {
  return typeof navigator !== "undefined" && new RegExp(`\\bOurMoneyCan/\\S*\\b${feature}\\b`).test(navigator.userAgent);
}

const noSubscribe = () => () => {};

/** 화면용 inApp — 미리 그린 HTML(앱 밖으로 본다)과 첫 그림이 어긋나지 않게 */
export function useInApp(): boolean {
  return useSyncExternalStore(noSubscribe, inApp, () => false);
}
