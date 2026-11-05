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
 */
export function toApp(message: "card-notice" | { type: "ics"; text: string }) {
  (window as Window & { OurMoneyApp?: { postMessage(m: string): void } }).OurMoneyApp?.postMessage(typeof message === "string" ? message : JSON.stringify(message));
}

/** 이 앱이 그 일을 할 수 있나 — 앱이 user agent 에 OurMoneyCan/… 로 알린다 (예전 앱에는 없다) */
export function appCan(feature: "ics"): boolean {
  return typeof navigator !== "undefined" && new RegExp(`\\bOurMoneyCan/\\S*\\b${feature}\\b`).test(navigator.userAgent);
}

const noSubscribe = () => () => {};

/** 화면용 inApp — 미리 그린 HTML(앱 밖으로 본다)과 첫 그림이 어긋나지 않게 */
export function useInApp(): boolean {
  return useSyncExternalStore(noSubscribe, inApp, () => false);
}
