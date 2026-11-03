// 폰 앱처럼 느끼게 하는 작은 도구들.

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
