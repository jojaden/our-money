// 화면 테마 — 밝게 · 어둡게 · 기기 설정. 기기마다 따로(localStorage) 저장하고, <html data-theme> 로 tokens.css 의 다크 값을 고른다.
// 첫 그림 전에 고르는 것은 app/layout.tsx 의 THEME_SCRIPT (같은 키·같은 규칙).

import { useSyncExternalStore } from "react";

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_KEY = "our-money-theme";
const listeners = new Set<() => void>();

const isChoice = (v: unknown): v is ThemeChoice => v === "light" || v === "dark" || v === "system";

export function themeChoice(): ThemeChoice {
  if (typeof document === "undefined") return "light";
  const t = document.documentElement.dataset.theme;
  return isChoice(t) ? t : "light";
}

const systemDark = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;

/** 지금 어두운 화면인가 (기기 설정이면 기기를 따른다) */
export function isDark(): boolean {
  const t = themeChoice();
  return t === "dark" || (t === "system" && systemDark());
}

export function setTheme(t: ThemeChoice) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {}
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  mq?.addEventListener("change", fn);
  return () => {
    listeners.delete(fn);
    mq?.removeEventListener("change", fn);
  };
}

/** 고른 테마와 지금 어두운지 — 미리 그린 HTML 은 밝게로 본다 */
export function useTheme(): { choice: ThemeChoice; dark: boolean } {
  const choice = useSyncExternalStore(subscribe, themeChoice, () => "light" as const);
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  return { choice, dark };
}
