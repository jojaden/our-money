"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useData } from "@/lib/store";
import { addMonths, currentMonth } from "@/lib/calc";
import { calendarMonth, monthGrid, rangeDays, rangeText, summaryHref, weekOf, type Range } from "@/lib/calendar";
import { monthLabel } from "@/lib/format";
import { enterSummary, leaveSummary } from "@/lib/summaryNav";
import { Seg, Sheet, TextTabs } from "./ui";

type Tab = "month" | "period";
type Preset = "week" | "month" | "three" | "year" | "custom";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 달 고르기 — 큰 제목·위쪽 막대의 "11월"을 누르면 열린다. 해를 넘기고 열두 달 중 하나를 누르면 그 달로 간다.
 * 보고 있는 달은 인디고로 채우고, 이번 달에는 "이번 달", 플랜을 시작한 달에는 작은 점을 단다. 해를 넘기면 열두 칸이 겹쳐 바뀐다(Morph).
 * 달력에서는 맨 위에서 [달 | 기간]을 고른다. 기간은 이번 주·그 달·석 달·그 해 중에 고르거나, "직접"에서 시작 날과 끝 날을 차례로 누른다.
 * "모아 보기"를 누르면 달력 자리가 그 기간 모아 보기로 바뀐다(주소 ?from=…&to=…, 뒤로가기로 돌아온다).
 */
export function MonthSheet({ open, onOpenChange, range }: { open: boolean; onOpenChange: (v: boolean) => void; /** 모아 보기에서 열었으면 지금 기간 */ range?: Range }) {
  const { data, month, today, setMonth } = useData();
  const router = useRouter();
  const onCalendar = usePathname()?.startsWith("/calendar") ?? false;
  const [tab, setTab] = useState<Tab>(range ? "period" : "month");
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));
  const now = currentMonth(data.settings.cycle_start, today);
  const started = new Set(data.months.map((m) => m.id));

  // 기간: 보고 있는 달을 기준으로 (이번 주만 오늘 기준)
  const y = month.slice(0, 4);
  const presets: Record<Exclude<Preset, "custom">, { label: string; range: Range }> = {
    week: { label: "이번 주", range: weekOf(today) },
    month: { label: monthLabel(month), range: calendarMonth(month) },
    three: { label: `${monthLabel(addMonths(month, -2))}–${monthLabel(month)}`, range: { from: calendarMonth(addMonths(month, -2)).from, to: calendarMonth(month).to } },
    year: { label: `${y}년`, range: { from: `${y}-01-01`, to: `${y}-12-31` } },
  };
  const keys = Object.keys(presets) as (keyof typeof presets)[];
  const matched = range && keys.find((k) => presets[k].range.from === range.from && presets[k].range.to === range.to);
  const [preset, setPreset] = useState<Preset>(range ? (matched ?? "custom") : "month");
  const [pick, setPick] = useState<{ from: string; to: string | null }>(() => range ?? calendarMonth(month));
  const chosen: Range | null = preset === "custom" ? (pick.to ? { from: pick.from, to: pick.to } : null) : presets[preset].range;
  const thisYear = Number(today.slice(0, 4));

  // 시트가 쌓은 뒤로가기 기록이 빠진 다음에 화면을 옮긴다 (먼저 옮기면 그 뒤로가기가 새 화면을 되돌린다)
  const go = (fn: () => void) => {
    if (window.history.state?.sheet) window.addEventListener("popstate", () => setTimeout(fn), { once: true });
    else fn();
    onOpenChange(false);
  };
  const pickMonth = (id: string) => {
    setMonth(id);
    if (range) go(() => leaveSummary(router));
    else onOpenChange(false);
  };
  const show = (r: Range) => go(() => enterSummary(router, summaryHref(r), Boolean(range)));

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={tab === "month" ? "달 고르기" : "기간 모아 보기"}
      footer={
        tab === "period" && (
          <button type="button" className="btn block" disabled={!chosen} onClick={() => chosen && show(chosen)}>
            {chosen ? "모아 보기" : "끝 날을 골라 주세요"}
          </button>
        )
      }
    >
      {onCalendar && (
        <div className="field" style={{ marginTop: 0 }}>
          <Seg
            label="달 또는 기간"
            value={tab}
            onChange={setTab}
            options={[
              { value: "month", label: "달" },
              { value: "period", label: "기간" },
            ]}
          />
        </div>
      )}

      {tab === "month" ? (
        <div className="field">
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
                <button key={id} type="button" className="month-cell" aria-pressed={id === month && !range} aria-current={id === now ? "date" : undefined} onClick={() => pickMonth(id)}>
                  <span className="num">{i + 1}월</span>
                  {id === now ? <small>이번 달</small> : started.has(id) ? <i className="dot" aria-label="플랜 있음" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="field">
          <TextTabs label="기간" value={preset} onChange={setPreset} options={[...keys.map((k) => ({ value: k as Preset, label: presets[k].label })), { value: "custom" as Preset, label: "직접" }]} />
          <p className="range-now" key={chosen ? `${chosen.from}${chosen.to}` : "none"} aria-live="polite">
            {chosen ? `${rangeText(chosen, thisYear)} · ${rangeDays(chosen)}일` : `${rangeText({ from: pick.from, to: pick.from }, thisYear)}부터 · 끝 날을 눌러 주세요`}
          </p>
          {preset === "custom" && <RangeCalendar pick={pick} onPick={setPick} today={today} />}
        </div>
      )}
    </Sheet>
  );
}

/** 직접 고르기 — 처음 누른 날이 시작, 다음에 누른 날이 끝(앞 날을 누르면 둘을 바꾼다). 끝까지 고른 뒤 다시 누르면 새로 시작 */
function RangeCalendar({ pick, onPick, today }: { pick: { from: string; to: string | null }; onPick: (p: { from: string; to: string | null }) => void; today: string }) {
  const [view, setView] = useState(pick.from.slice(0, 7));
  const tap = (d: string) => {
    if (pick.to !== null) onPick({ from: d, to: null });
    else onPick(d < pick.from ? { from: d, to: pick.from } : { from: pick.from, to: d });
  };
  const end = pick.to ?? pick.from;
  const [vy, vm] = view.split("-").map(Number);
  return (
    <div className="range-cal">
      <div className="year-step">
        <button type="button" className="month-arrow" aria-label="지난달" onClick={() => setView(addMonths(view, -1))}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <span className="y num" key={view}>
          {vy}년 {vm}월
        </span>
        <button type="button" className="month-arrow" aria-label="다음 달" onClick={() => setView(addMonths(view, 1))}>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="range-week" aria-hidden="true">
        {WEEK.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="range-days" key={view} role="group" aria-label={`${vy}년 ${vm}월`}>
        {monthGrid(view).map((d) => {
          const out = d.slice(0, 7) !== view;
          const edge = d === pick.from || d === end;
          const inside = d > pick.from && d < end;
          return (
            <button
              key={d}
              type="button"
              className={[out && "out", edge && "edge", inside && "in", d === pick.from && "first", d === end && "last", d === today && "today"].filter(Boolean).join(" ")}
              aria-pressed={edge || inside}
              aria-label={d}
              onClick={() => tap(d)}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
