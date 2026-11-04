"use client";

import { Flame, PiggyBank, ReceiptText, TrendingUp } from "lucide-react";
import { num, parseYmd, short, shortDate, ymd } from "@/lib/format";

/**
 * 이번 달 기록 2×2 타일 — 아이콘 하나, 큰 숫자 하나, 한 줄 설명 (docs/design-system/components/StatTiles).
 * rows 는 그달 기록 전부(필터 전), saving 은 그달 플랜의 저축 합계.
 */
export function StatTiles({ rows, period, today, saving }: { rows: { date: string; amount: number }[]; period: { start: string; last: string }; today: string; saving: number }) {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.amount);
  const peak = [...byDay.entries()].reduce<[string, number] | null>((a, e) => (!a || e[1] > a[1] ? e : a), null);

  // 무지출 연속: 오늘(지난 달이면 마지막 날)부터 거꾸로, 기록이 없는 날을 센다
  let streak = 0;
  const end = today < period.last ? today : period.last;
  for (const d = parseYmd(end); ymd(d) >= period.start; d.setDate(d.getDate() - 1)) {
    if (byDay.has(ymd(d))) break;
    streak++;
  }

  // 타일 폭(폰에서 약 110px)에 맞게 백만 원부터는 "200만"처럼 줄인다
  const won = (n: number) => (n >= 1_000_000 ? short(n) : num(n));
  const tiles = [
    { icon: <TrendingUp />, tone: "t1", value: peak ? won(peak[1]) : "–", unit: peak ? "원" : "", text: peak ? `가장 많이 쓴 날 · ${shortDate(peak[0])}` : "가장 많이 쓴 날" },
    { icon: <Flame />, tone: "t2", value: String(streak), unit: "일", text: "무지출 연속" },
    { icon: <ReceiptText />, tone: "t3", value: num(rows.length), unit: "건", text: "이번 달 기록" },
    { icon: <PiggyBank />, tone: "t4", value: won(saving), unit: "원", text: "이번 달 저축" },
  ];
  return (
    <ul className="stat-tiles">
      {tiles.map((t) => (
        <li key={t.text} className="stat">
          <span className={`ic ${t.tone}`} aria-hidden="true">
            {t.icon}
          </span>
          <div>
            <b>
              {t.value}
              {t.unit && <span>{t.unit}</span>}
            </b>
            <small>{t.text}</small>
          </div>
        </li>
      ))}
    </ul>
  );
}
