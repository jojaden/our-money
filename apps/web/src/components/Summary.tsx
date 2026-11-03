"use client";

import { Money } from "./ui";

export interface Stat {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
}

/** 애플 건강 요약처럼: 작은 라벨 + 큰 숫자 하나, 그 아래 구분선으로 나눈 칸들 */
export function Summary({ label, value, stats }: { label: string; value: number; stats: Stat[] }) {
  return (
    <section className="summary" aria-label={label}>
      <div className="summary-lbl">{label}</div>
      <div className="summary-hero">
        <Money value={value} animate />
      </div>
      <dl className="summary-stats" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
        {stats.map((s) => (
          <div key={s.label}>
            <dt>{s.label}</dt>
            <dd>{s.value}</dd>
            {s.note && <dd className="note">{s.note}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
