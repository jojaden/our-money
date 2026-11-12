"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { ddayText, summarize, timeText, type Range } from "@/lib/calendar";
import { categoryName, categoryVisual, spendingVisual } from "@/lib/categories";
import { dateWithDay, num, parseYmd, shortDate } from "@/lib/format";
import { CategoryIcon, Money, Who } from "./ui";
import { HighlightCard } from "./HighlightCard";
import { Meter } from "./Meter";
import { Morph } from "./Morph";
import { useSheets } from "./Shell";

type Part = "spent" | "done" | "events";

const DAY = 86_400_000;
/** 접었을 때 보이는 줄 수 */
const BRIEF = 5;

/**
 * 모아 보기 화면의 본문 — 기간은 달력의 달 고르기 시트에서 정해 주소(?from=…&to=…)로 온다. 무엇을 모을지(쓴 돈·한 일·일정) 칩으로 고른다.
 * 쓴 돈은 산 날 기준(할부도 전액, 달력 칸과 같다), 한 일은 끝낸 날 기준. 불러온 범위보다 앞이면 그 기간 지출을 더 불러온다.
 * 넓은 화면에서는 쓴 돈(왼쪽)과 한 일·일정(오른쪽) 두 열.
 */
export function PeriodSummary({ range, className = "" }: { range: Range; className?: string }) {
  const { data, today, loadSpendingsFrom } = useData();
  const s = data.settings;
  const { openSpending } = useSheets();
  const [parts, setParts] = useState<Set<Part>>(() => new Set<Part>(["spent", "done", "events"]));
  const [open, setOpen] = useState<Set<Part>>(() => new Set());

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

  // 하루 평균은 오늘까지 지난 날로 나눈다 (앞으로 올 날은 빼고)
  const elapsedTo = range.to < today ? range.to : today;
  const elapsed = range.from > today ? 0 : Math.round((parseYmd(elapsedTo).getTime() - parseYmd(range.from).getTime()) / DAY) + 1;
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
    <section className={`sum ${className}`} aria-label="모아 보기">
      <div className="sum-controls">
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
      <Morph className="sum-stack" track=":scope > *, :scope > * > *, .rows > *" follow>
        <div className="sum-col">
          {parts.has("spent") && (
            <>
              <HighlightCard title="이 기간 쓴 돈" amount={sum.spent} note={elapsed > 0 ? `하루 평균 ${num(Math.round(sum.spent / elapsed))}원 · ${sum.spendings.length}건` : "아직 오지 않은 기간이에요"} />
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
                            <Meter thin value={c.amount / maxCat} label={`${name} ${num(c.amount)}원`} />
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
                          <Money value={-x.amount} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="sum-col">
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
        </div>
      </Morph>
    </section>
  );
}
