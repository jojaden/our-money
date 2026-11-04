"use client";

import { useMemo, useState } from "react";
import { periodOf } from "@/lib/calc";
import { num, parseYmd, short, ymd } from "@/lib/format";
import { useRevealOnce } from "./reveal";

/** 스크린타임처럼 하루별 지출 막대 + 평균선. 막대를 누르면 그날 금액을 보여준다. */
export function DailyBars({ rows, month, cycleStart, today }: { rows: { date: string; amount: number }[]; month: string; cycleStart: number; today: string }) {
  const days = useMemo(() => {
    const p = periodOf(month, cycleStart);
    const out: { date: string; amount: number; future: boolean }[] = [];
    const d = parseYmd(p.start);
    const end = parseYmd(p.end);
    while (d < end) {
      const date = ymd(d);
      out.push({ date, amount: 0, future: date > today });
      d.setDate(d.getDate() + 1);
    }
    const idx = new Map(out.map((x, i) => [x.date, i]));
    for (const r of rows) {
      const i = idx.get(r.date);
      if (i !== undefined) out[i].amount += r.amount;
    }
    return out;
  }, [rows, month, cycleStart, today]);

  const past = days.filter((d) => !d.future);
  const total = past.reduce((a, d) => a + d.amount, 0);
  const avg = past.length ? Math.round(total / past.length) : 0;
  const peak = Math.max(1, ...days.map((d) => d.amount));
  // 깔끔한 눈금: 1·2·5 × 10^n
  const step = (() => {
    const raw = peak / 2;
    const p10 = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p10;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p10;
  })();
  const top = Math.ceil(peak / step) * step;
  const [sel, setSel] = useState<number | null>(null);
  const grown = useRevealOnce("daily");
  const shown = sel !== null ? days[sel] : null;
  const label = (s: string) => {
    const d = parseYmd(s);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const ticks = [0, Math.floor((days.length - 1) / 2), days.length - 1];

  return (
    <div className="daily">
      <div className="daily-head">
        {shown ? (
          <>
            <span className="k">{label(shown.date)}</span>
            <span className="v">{num(shown.amount)}원</span>
          </>
        ) : (
          <>
            <span className="k">하루 평균</span>
            <span className="v">{num(avg)}원</span>
          </>
        )}
      </div>
      <div className="daily-plot" onMouseLeave={() => setSel(null)}>
        <div className="daily-grid" aria-hidden="true">
          <span style={{ bottom: "100%" }}>
            <i>{short(top)}</i>
          </span>
          <span style={{ bottom: "50%" }}>
            <i>{short(top / 2)}</i>
          </span>
          <span style={{ bottom: 0 }}>
            <i>0</i>
          </span>
        </div>
        {avg > 0 && (
          <div className="daily-avg" style={{ bottom: `${(avg / top) * 100}%` }} aria-hidden="true">
            <i>평균</i>
          </div>
        )}
        <div className={`daily-bars ${grown ? "" : "flat"}`}>
          {days.map((d, i) => (
            <button
              key={d.date}
              type="button"
              className={`db ${d.future ? "future" : ""} ${d.date === today ? "today" : ""} ${sel === i ? "sel" : ""}`}
              aria-label={`${label(d.date)} ${num(d.amount)}원`}
              onMouseEnter={() => setSel(i)}
              onFocus={() => setSel(i)}
              onBlur={() => setSel(null)}
              onClick={() => setSel(sel === i ? null : i)}
            >
              <span style={{ height: d.amount > 0 ? `${Math.max(3, (d.amount / top) * 100)}%` : 0 }} />
            </button>
          ))}
        </div>
      </div>
      <div className="daily-x" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t}>{label(days[t].date)}</span>
        ))}
      </div>
    </div>
  );
}
