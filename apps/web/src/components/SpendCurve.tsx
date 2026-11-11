"use client";

import { useRef, useState } from "react";
import type { Spending } from "@/lib/types";
import { periodOf } from "@/lib/calc";
import { num, parseYmd, ymd } from "@/lib/format";
import { TextTabs } from "./ui";

export interface CurveBucket {
  key: "living" | "allowance";
  name: string;
  budget: number;
  spent: number;
  note?: string;
}

const VW = 340;
const VH = 184;
const PAD = { l: 34, r: 10, t: 12, b: 24 };
const PW = VW - PAD.l - PAD.r;
const PH = VH - PAD.t - PAD.b;

/** 가계부 기간의 날짜들 (시작일부터 마지막 날까지) */
function daysOf(month: string, cycleStart: number): string[] {
  const p = periodOf(month, cycleStart);
  const out: string[] = [];
  for (let d = parseYmd(p.start); ymd(d) <= p.last; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(ymd(d));
  return out;
}

/** 날짜별 누적 합계 (날짜 순서대로) */
function cumulative(days: string[], rows: Pick<Spending, "date" | "amount">[]): number[] {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.amount);
  let acc = 0;
  return days.map((d) => (acc += byDay.get(d) ?? 0));
}

/** 축 눈금: 0 과 위쪽 두 칸 (만원 단위로 반올림) */
function ticks(max: number): number[] {
  if (max <= 0) return [0];
  const step = Math.max(10_000, Math.ceil(max / 2 / 100_000) * 100_000);
  return [0, step, step * 2];
}

const md = (d: string) => `${Number(d.slice(5, 7))}.${d.slice(8)}`;

/**
 * 가계부 머리 — 이번 달 누적 지출 (토스 "이번 달 누적 지출금액" 참고).
 * 이번 달은 Illuminating 면 + 진한 노랑 선, 지난달은 회색 비교 선. 오늘 자리에 세로 점선.
 * 그래프를 누르거나 끌면 그날의 두 달 누적이 말풍선으로 뜬다. 아래에는 생활비·용돈 예산 줄을 둔다.
 * daily 를 주면 "누적 / 하루별" 글자 탭이 생기고, 하루별에서는 그래프 자리에 daily 를 그린다.
 */
export function SpendCurve({
  month,
  prevMonth,
  cycleStart,
  today,
  rows,
  prevRows,
  buckets,
  daily,
}: {
  month: string;
  prevMonth: string;
  cycleStart: number;
  today: string;
  rows: Pick<Spending, "date" | "amount">[];
  prevRows: Pick<Spending, "date" | "amount">[];
  buckets: CurveBucket[];
  /** 하루별 지출 막대 (가계부) */
  daily?: React.ReactNode;
}) {
  const days = daysOf(month, cycleStart);
  const prevDays = daysOf(prevMonth, cycleStart);
  const n = days.length;
  // 오늘이 기간 안이면 오늘까지, 지난 달이면 끝까지, 다가올 달이면 아직 없음
  const upto = today < days[0] ? -1 : today > days[n - 1] ? n - 1 : days.indexOf(today);
  const live = today >= days[0] && today <= days[n - 1];
  const now = cumulative(days, rows).slice(0, upto + 1);
  const then = cumulative(prevDays, prevRows).slice(0, n);
  const top = ticks(Math.max(1, ...now, ...then));
  const yMax = top[top.length - 1] || 1;
  const x = (i: number) => PAD.l + (n > 1 ? (i / (n - 1)) * PW : PW / 2);
  const y = (v: number) => PAD.t + PH - (v / yMax) * PH;
  const line = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = now.length ? `${line(now)} L${x(now.length - 1).toFixed(1)} ${y(0)} L${x(0)} ${y(0)} Z` : "";

  const spent = now.at(-1) ?? 0;
  const at = Math.max(0, upto);
  const prevAt = then[Math.min(at, then.length - 1)] ?? 0;
  const diff = spent - prevAt;

  const [view, setView] = useState<"sum" | "daily">("sum");
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const pick = (e: React.PointerEvent) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const vx = ((e.clientX - r.left) / r.width) * VW;
    setHover(Math.min(n - 1, Math.max(0, Math.round(((vx - PAD.l) / PW) * (n - 1)))));
  };
  const h = hover;
  const pctOf = (v: number, b: number) => (b > 0 ? Math.round((v / b) * 100) : 0);

  return (
    <section className="card curve" aria-labelledby="curve-h">
      <h2 id="curve-h" className="curve-title">
        이번 달 누적 지출은
        <br />
        <span className="hl">{num(spent)}원</span>이에요
      </h2>
      {upto >= 0 && then.length > 0 && (
        <p className="curve-sub">
          지난달 이맘때보다{" "}
          {diff === 0 ? "똑같이 썼어요" : (
            <>
              <b>{num(Math.abs(diff))}원</b> {diff > 0 ? "더" : "덜"} 썼어요
            </>
          )}
        </p>
      )}

      {daily && (
        <TextTabs
          label="그래프"
          value={view}
          onChange={setView}
          options={[
            { value: "sum", label: "누적" },
            { value: "daily", label: "하루별" },
          ]}
        />
      )}
      {daily && view === "daily" ? (
        <div className="curve-daily">{daily}</div>
      ) : (
      <>
      <div className="curve-legend" aria-hidden="true">
        <span className="then">지난달</span>
        <span className="now">이번 달</span>
      </div>
      <div className="curve-plot">
        <svg
          ref={svg}
          viewBox={`0 0 ${VW} ${VH}`}
          role="img"
          aria-label={`이번 달 누적 ${num(spent)}원, 지난달 같은 날 ${num(prevAt)}원`}
          onPointerDown={pick}
          onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons ? pick(e) : undefined)}
          onPointerLeave={() => setHover(null)}
          onPointerCancel={() => setHover(null)}
        >
          {top.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.l} x2={VW - PAD.r} y1={y(t)} y2={y(t)} />
              <text className="ax" x={PAD.l - 6} y={y(t) + 4} textAnchor="end">
                {t === 0 ? "0" : `${num(Math.round(t / 10_000))}`}
              </text>
            </g>
          ))}
          <text className="ax" x={PAD.l} y={VH - 6}>{md(days[0])}</text>
          <text className="ax" x={VW - PAD.r} y={VH - 6} textAnchor="end">{md(days[n - 1])}</text>
          {live && <line className="today" x1={x(upto)} x2={x(upto)} y1={PAD.t} y2={PAD.t + PH} />}
          {then.length > 1 && <path className="then" d={line(then)} />}
          {area && <path className="fill" d={area} />}
          {now.length > 1 && <path className="now" d={line(now)} />}
          {now.length > 0 && <circle className="end" cx={x(now.length - 1)} cy={y(spent)} r={4.5} />}
          {h !== null && (
            <g className="cross">
              <line x1={x(h)} x2={x(h)} y1={PAD.t} y2={PAD.t + PH} />
              {then[h] !== undefined && <circle className="then" cx={x(h)} cy={y(then[h])} r={4} />}
              {now[h] !== undefined && <circle className="now" cx={x(h)} cy={y(now[h])} r={4} />}
            </g>
          )}
        </svg>
        <span className="curve-unit" aria-hidden="true">만원</span>
        {h !== null && (
          <div className="curve-tip" style={{ left: `${Math.min(78, Math.max(22, (x(h) / VW) * 100))}%` }} aria-hidden="true">
            <b>{Number(days[h].slice(5, 7))}월 {Number(days[h].slice(8))}일</b>
            {now[h] !== undefined && <span className="now">이번 달 {num(now[h])}원</span>}
            {then[h] !== undefined && <span className="then">지난달 {num(then[h])}원</span>}
          </div>
        )}
      </div>

      {upto >= 0 && (
        <div className="curve-foot">
          <span>{Number(days[at].slice(5, 7))}월 {Number(days[at].slice(8))}일 기준</span>
          <span className="r">
            <b>{num(spent)}원</b>
            {then.length > 0 && <small>지난달 같은 날 {num(prevAt)}원</small>}
          </span>
        </div>
      )}

      <table className="sr-only">
        <caption>날짜별 누적 지출</caption>
        <thead>
          <tr><th>날짜</th><th>이번 달</th><th>지난달</th></tr>
        </thead>
        <tbody>
          {days.map((d, i) => (
            <tr key={d}><td>{md(d)}</td><td>{now[i] !== undefined ? `${num(now[i])}원` : "–"}</td><td>{then[i] !== undefined ? `${num(then[i])}원` : "–"}</td></tr>
          ))}
        </tbody>
      </table>
      </>
      )}

      <ul className="buckets">
        {buckets.map((b) => (
          <li key={b.key} className={b.key}>
            <i aria-hidden="true" />
            <div>
              <p className="n">{b.name}</p>
              <p className="v">{num(b.spent)} / {num(b.budget)}원</p>
              {b.note && <p className="v">{b.note}</p>}
            </div>
            <b className={b.spent > b.budget ? "neg" : undefined}>{pctOf(b.spent, b.budget)}%</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
