"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useData } from "@/lib/store";
import { currentMonth } from "@/lib/calc";
import { Sheet } from "./ui";

/**
 * 달 고르기 — 큰 제목·위쪽 막대의 "11월 ▾"를 누르면 열린다. 해를 넘기고 열두 달 중 하나를 누르면 그 달로 간다.
 * 보고 있는 달은 인디고로 채우고, 이번 달에는 "이번 달", 플랜을 시작한 달에는 작은 점을 단다.
 * 해를 넘기면 열두 칸이 겹쳐 바뀐다(Morph).
 */
export function MonthSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, month, today, setMonth } = useData();
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));
  const now = currentMonth(data.settings.cycle_start, today);
  const started = new Set(data.months.map((m) => m.id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="달 고르기">
      <div className="year-step">
        <button type="button" className="month-arrow" aria-label={`${year - 1}년`} onClick={() => setYear(year - 1)}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <span className="y num" key={year} aria-live="polite">
          {year}년
        </span>
        <button type="button" className="month-arrow" aria-label={`${year + 1}년`} onClick={() => setYear(year + 1)}>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="month-grid" key={year} role="group" aria-label={`${year}년`}>
        {Array.from({ length: 12 }, (_, i) => {
          const id = `${year}-${String(i + 1).padStart(2, "0")}`;
          return (
            <button
              key={id}
              type="button"
              className="month-cell"
              aria-pressed={id === month}
              aria-current={id === now ? "date" : undefined}
              onClick={() => {
                onOpenChange(false);
                setMonth(id);
              }}
            >
              <span className="num">{i + 1}월</span>
              {id === now ? <small>이번 달</small> : started.has(id) ? <i className="dot" aria-label="플랜 있음" /> : null}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
