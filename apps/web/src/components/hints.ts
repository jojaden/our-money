"use client";

import { useEffect } from "react";
import { useData } from "@/lib/store";

/**
 * 숨은 몸짓(꾹 누르기)을 처음 한 번만 알려 준다 — 그 화면을 처음 쓸 때 토스트 하나, 기기에 본 것을 남긴다.
 * 꾹 누르기가 그 일의 유일한 길은 아니지만(HoldMenu·Arrange README), 모르면 쓰지 못한다.
 */
export function useFirstHint(key: "hold" | "arrange", text: string, when = true) {
  const { toast } = useData();
  useEffect(() => {
    if (!when) return;
    const k = `our-money-hint:${key}`;
    try {
      if (localStorage.getItem(k) === "1") return;
    } catch {
      return;
    }
    // 화면이 자리 잡고 사람이 둘러본 뒤에
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(k, "1");
      } catch {}
      toast(text);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [key, text, when, toast]);
}
