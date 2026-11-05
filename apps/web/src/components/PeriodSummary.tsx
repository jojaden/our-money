"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { calendarMonth, ddayText, summarize, timeText, weekOf, type Range } from "@/lib/calendar";
import { categoryName, categoryVisual, spendingVisual } from "@/lib/categories";
import { dateWithDay, monthLabel, num, parseYmd, shortDate } from "@/lib/format";
import { CategoryIcon, Money, TextTabs, Who } from "./ui";
import { HighlightCard } from "./HighlightCard";
import { Morph } from "./Morph";
import { useSheets } from "./Shell";

type Kind = "week" | "month" | "year" | "custom";
type Part = "spent" | "done" | "events";

const DAY = 86_400_000;
/** 접었을 때 보이는 줄 수 */
const BRIEF = 5;

function md(d: Date) {
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** "11월 1일 – 30일", "11월 30일 – 12월 6일", 다른 해면 해까지 */
function rangeText({ from, to }: Range, thisYear: number): string {
  if (from === to) return dateWithDay(from);
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (a.getFullYear() !== b.getFullYear() || a.getFullYear() !== thisYear) return `${a.getFullYear()}년 ${md(a)} – ${b.getFullYear()}년 ${md(b)}`;
  return a.getMonth() === b.getMonth() ? `${md(a)} – ${b.getDate()}일` : `${md(a)} – ${md(b)}`;
}

/**
 * 달력 아래 "모아 보기" — 기간(그 주·그 달·그 해·직접)을 TextTabs 로 고르고, 무엇을 모을지(쓴 돈·한 일·일정) 칩으로 고른다.
 * 쓴 돈은 산 날 기준(할부도 전액, 달력 칸과 같다), 한 일은 끝낸 날 기준. 불러온 범위보다 앞이면 그 기간 지출을 더 불러온다.
 */
export function PeriodSummary({ month, day, className = "" }: { month: string; day: string; className?: string }) {
  const { data, today, loadSpendingsFrom } = useData();
  const s = data.settings;
  const { openSpending } = useSheets();
  const [kind, setKind] = useState<Kind>("month");
  const [custom, setCustom] = useState<Range>(() => calendarMonth(month));
  const [parts, setParts] = useState<Set<Part>>(() => new Set<Part>(["spent", "done", "events"]));
  const [open, setOpen] = useState<Set<Part>>(() => new Set());

  const week = weekOf(day);
  const year = month.slice(0, 4);
  const range: Range = kind === "week" ? week : kind === "month" ? calendarMonth(month) : kind === "year" ? { from: `${year}-01-01`, to: `${year}-12-31` } : custom;
  const sum = useMemo(() => summarize(data, range.from, range.to), [data, range.from, range.to]);

  useEffect(() => {
    loadSpendingsFrom(range.from);
  }, [range.from, loadSpendingsFrom]);

  const toggle = (p: Part) =>
    setParts((cur) => {
      const next = new Set(cur);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next.size === 0 ? cur : next; // 하나는 남긴다
    });
  const expand = (p: Part) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  const setFrom = (from: string) => from && setCustom((r) => ({ from, to: r.to < from ? from : r.to }));
  const setTo = (to: string) => to && setCustom((r) => ({ from: r.from > to ? to : r.from, to }));

  // 하루 평균은 오늘까지 지난 날로 나눈다 (앞으로 올 날은 빼고)
  const elapsedTo = range.to < today ? range.to : today;
  const elapsed = range.from > today ? 0 : Math.round((parseYmd(elapsedTo).getTime() - parseYmd(range.from).getTime()) / DAY) + 1;
  const title = rangeText(range, Number(today.slice(0, 4)));
  const maxCat = Math.max(1, ...sum.byCategory.map((c) => c.amount));
  const biggest = [...sum.spendings].sort((a, b) => b.amount - a.amount).slice(0, 3);
  const done = open.has("done") ? sum.done : sum.done.slice(0, BRIEF);
  const events = open.has("events") ? sum.events : sum.events.slice(0, BRIEF);

  const more = (p: Part, total: number) =>
    total > BRIEF && (
      <div className="card-foot">
        <button type="button" className="btn ghost sm" aria-expanded={open.has(p)} onClick={() => expand(p)}>
          {open.has(p) ? "접기" : `모두 보기 (${total})`}
        </button>
      </div>
    );

  return (
    <section className={`group sum ${className}`} aria-labelledby="sum-h">
      <div className="group-head">
        <h2 id="sum-h">모아 보기</h2>
      </div>
      <div className="sum-controls">
        <TextTabs
          label="기간"
          value={kind}
          onChange={setKind}
          options={[
            { value: "week", label: week.from <= today && today <= week.to ? "이번 주" : "그 주" },
            { value: "month", label: monthLabel(month) },
            { value: "year", label: `${year}년` },
            { value: "custom", label: "직접" },
          ]}
        />
        {kind === "custom" && (
          <div className="inline-fields">
            <div className="field" style={{ marginTop: 0 }}>
              <label htmlFor="sum-from">시작</label>
              <input id="sum-from" type="date" className="input" value={custom.from} max={custom.to} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field" style={{ marginTop: 0 }}>
              <label htmlFor="sum-to">끝 (그날까지)</label>
              <input id="sum-to" type="date" className="input" value={custom.to} min={custom.from} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        )}
        <div className="chips" role="group" aria-label="모을 것">
          {(
            [
              ["spent", "쓴 돈", sum.spendings.length],
              ["done", "한 일", sum.done.length],
              ["events", "일정", sum.events.length],
            ] as const
          ).map(([p, label, n]) => (
            <button key={p} type="button" className="chip" aria-pressed={parts.has(p)} onClick={() => toggle(p)}>
              {label} <span className="count">{n}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 기간·모을 것·모두 보기를 바꾸면 카드와 줄이 겹쳐 바뀐다 */}
      <Morph className="sum-stack" track=":scope > *, :scope > * > *, .rows > *">
        {parts.has("spent") && (
          <>
            <HighlightCard title={`${title} 쓴 돈`} amount={sum.spent} note={elapsed > 0 ? `하루 평균 ${num(Math.round(sum.spent / elapsed))}원 · ${sum.spendings.length}건` : "아직 오지 않은 기간이에요"} />
            {sum.spendings.length > 0 && (
              <div className="card">
                <ul className="sum-owners" aria-label="누구 돈">
                  {(["joint", "a", "b"] as const).map((o) => (
                    <li key={o}>
                      <Who owner={o} s={s} size="sm" />
                      <span className="s">{o === "joint" ? "공동" : `${nameOf(s, o)} 용돈`}</span>
                      <Money value={sum.byOwner[o]} />
                    </li>
                  ))}
                </ul>
                <h3 className="sum-h">분류</h3>
                <div className="rows" style={{ ["--inset" as string]: "44px" }}>
                  {sum.byCategory.slice(0, open.has("spent") ? undefined : BRIEF).map((c) => {
                    const name = categoryName(data.categories, c.categoryId) ?? (c.owner === "joint" ? "분류 없음" : `${nameOf(s, c.owner)} 용돈`);
                    return (
                      <div className="row catrow icon" key={`${c.categoryId}:${c.owner}`}>
                        <CategoryIcon visual={c.categoryId ? categoryVisual(name) : spendingVisual(data, { category_id: null, owner: c.owner })} size="sm" />
                        <div style={{ minWidth: 0 }}>
                          <div className="t">{name}</div>
                          <div className="catbar" role="img" aria-label={`${name} ${num(c.amount)}원`}>
                            <span style={{ width: `${(c.amount / maxCat) * 100}%` }} />
                          </div>
                        </div>
                        <div className="r">
                          <Money value={c.amount} />
                          <div className="s">{`${c.count}건 · ${Math.round((c.amount / Math.max(1, sum.spent)) * 100)}%`}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {more("spent", sum.byCategory.length)}
                <h3 className="sum-h">큰 지출</h3>
                <div className="rows" style={{ ["--inset" as string]: "52px" }}>
                  {biggest.map((x) => (
                    <button type="button" className="row" key={x.id} onClick={() => openSpending(x)}>
                      <CategoryIcon visual={spendingVisual(data, x)} />
                      <div style={{ minWidth: 0 }}>
                        <div className="t">{x.memo || "지출"}</div>
                        <div className="s">{`${shortDate(x.date)} · ${x.owner === "joint" ? "공동" : `${nameOf(s, x.owner)} 용돈`}`}</div>
                      </div>
                      <div className="r">
                        <Money value={x.amount} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {parts.has("done") && (
          <div className="card">
            <div className="card-head">
              <h3>한 일</h3>
              <span className="aside num">{sum.done.length}건</span>
            </div>
            {sum.done.length === 0 ? (
              <p className="empty">이 기간에 끝낸 이체·납부·할 일이 없어요.</p>
            ) : (
              <div className="rows" style={{ ["--inset" as string]: "40px" }}>
                {done.map((d, i) => (
                  <div className="row" key={`${d.date}${d.title}${i}`}>
                    <Who owner={d.by ?? "joint"} s={s} size="sm" />
                    <div style={{ minWidth: 0 }}>
                      <div className="t">{d.title}</div>
                      <div className="s">{`${shortDate(d.date)}${d.by ? ` · ${nameOf(s, d.by)} 완료` : ""}`}</div>
                    </div>
                    <div className="r">{d.amount > 0 ? <Money value={d.amount} /> : null}</div>
                  </div>
                ))}
              </div>
            )}
            {more("done", sum.done.length)}
          </div>
        )}

        {parts.has("events") && (
          <div className="card">
            <div className="card-head">
              <h3>일정</h3>
              <span className="aside num">{sum.events.length}개</span>
            </div>
            {sum.events.length === 0 ? (
              <p className="empty">이 기간에 걸친 일정이 없어요.</p>
            ) : (
              <div className="rows">
                {events.map((o) => (
                  <div className="row no-lead cal-mark" key={`${o.event.id}${o.start}`}>
                    <div style={{ minWidth: 0 }}>
                      <div className="t">
                        <i className={`mark-dot k-event ${o.event.owner}`} aria-hidden="true" />
                        {o.event.title}
                      </div>
                      <div className="s">{[o.start === o.end ? dateWithDay(o.start) : `${shortDate(o.start)} ~ ${shortDate(o.end)}`, timeText(o.event)].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div className="r">
                      {o.event.amount ? <Money value={o.event.amount} /> : null}
                      {o.end >= today && <div className="s">{ddayText(o, today)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {more("events", sum.events.length)}
          </div>
        )}
      </Morph>
    </section>
  );
}
