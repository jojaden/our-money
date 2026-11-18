"use client";

import { useEffect, useState } from "react";
import { useData } from "@/lib/store";
import { addMonths, currentMonth, nameOf, paydayDate } from "@/lib/calc";
import { haptic } from "@/lib/native";
import { still } from "./Morph";

/** 위로 흩어지는 동전 알갱이 — 각도·거리·지연·크기 (100% 축하의 bead 와 같은 모양, 더 작고 짧게) */
const COINS = Array.from({ length: 12 }, (_, i) => {
  const a = Math.PI * (1.08 + (i / 11) * 0.84);
  const j = ((i * 7) % 12) / 12;
  const r = 70 + j * 60;
  return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r), d: Math.round(j * 140), s: 8 + Math.round(j * 6) };
});

const KEY = "our-money-payday-cheer";
const SHOW_MS = 1400;

/**
 * 내 월급날, 그날 앱을 처음 열면 한 번만 — 위쪽에서 동전 알갱이가 터지고 짧은 진동과 토스트.
 * 토스가 월급날·생일 같은 순간에만 축하를 쓰는 것처럼, 매일 보는 화면에는 두지 않는다.
 * 본 날은 기기에 남겨(our-money-payday-cheer) 다시 열거나 다른 화면으로 가도 또 뜨지 않는다.
 */
export function PaydayCheer() {
  const { data, me, today, toast } = useData();
  const s = data.settings;
  const m = currentMonth(s.cycle_start, today);
  const payday = [m, addMonths(m, 1), addMonths(m, -1)].some((x) => paydayDate(x, s, me) === today);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!payday) return;
    const mark = `${me}:${today}`;
    try {
      if (localStorage.getItem(KEY) === mark) return;
      localStorage.setItem(KEY, mark);
    } catch {
      return;
    }
    // 화면이 자리 잡은 뒤에 (첫 그림과 겹치지 않게)
    const t = window.setTimeout(() => {
      haptic([12, 40, 12]);
      toast(`${nameOf(s, me)} 월급날이에요 · 체크에서 오늘 옮길 돈을 확인해요`);
      if (!still()) setShow(true);
    }, 500);
    return () => window.clearTimeout(t);
  }, [payday, me, today, s, toast]);

  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(() => setShow(false), SHOW_MS);
    return () => window.clearTimeout(t);
  }, [show]);

  if (!show) return null;
  return (
    <div className="payday-cheer" aria-hidden="true">
      {COINS.map((c, i) => (
        <i key={i} style={{ ["--x" as string]: `${c.x}px`, ["--y" as string]: `${c.y}px`, ["--d" as string]: `${c.d}ms`, width: c.s, height: c.s }} />
      ))}
    </div>
  );
}
