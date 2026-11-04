"use client";

import { useEffect, useState } from "react";

/** 키마다 이미 펼친 것 — 막대가 자라는 움직임은 앱에서 처음 한 번만 (탭을 다시 열 때마다 되풀이하지 않음) */
const revealed = new Set<string>();

/** false 인 동안 막대를 0 으로 두었다가, 두 프레임 뒤 true 로 바꿔 CSS 전환으로 자라게 한다 */
export function useRevealOnce(key: string): boolean {
  const [shown, setShown] = useState(() => revealed.has(key));
  useEffect(() => {
    if (shown) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        revealed.add(key);
        setShown(true);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [key, shown]);
  return shown;
}
