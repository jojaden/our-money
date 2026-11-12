import { useSyncExternalStore } from "react";

/** CSS 미디어 쿼리가 지금 맞는지 — 창 크기가 바뀌면 다시 그린다. 정적 내보내기(서버 그리기)에서는 false */
export function useMatch(query: string): boolean {
  return useSyncExternalStore(
    (on) => {
      const m = matchMedia(query);
      m.addEventListener("change", on);
      return () => m.removeEventListener("change", on);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}
