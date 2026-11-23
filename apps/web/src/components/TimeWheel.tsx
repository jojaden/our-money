"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { clockText } from "@/lib/calendar";
import { clockParts, durationText, followEnd, fromMin, joinClock, minuteSteps, toMin } from "@/lib/clock";
import { radioKeys, radioTab } from "./ui";
import { still } from "./Morph";

/**
 * 돌리는 바퀴 한 줄 (docs/design-system/components/TimeWheel).
 * 세로로 밀면 칸이 가운데 띠에 딱 멈추고(scroll-snap), 손가락을 떼고 멈춘 칸이 값이 된다. 칸을 누르면 그 칸으로 굴러가고,
 * 가운데 칸을 누르면 그 칸을 그대로 고른다(끝 칸의 제안 시각을 받아들이기).
 * 키보드: 위·아래 화살표 한 칸, Page Up·Down 다섯 칸, Home·End 처음·끝 (spinbutton). 키로 옮길 때는 굴리지 않고 바로 간다.
 * 밖에서 값이 바뀌면(제목 속 "3시", 길이 칩) 그 칸으로 바로 옮긴다. 시트를 끌어내리는 몸짓과 겹치지 않게 data-vaul-no-drag.
 */
function Wheel({ label, items, index, onPick, unit }: { label: string; items: string[]; index: number; onPick: (i: number) => void; unit?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  /** 손가락이 닿아 있는 동안은 값을 정하지도, 밖의 값으로 되돌리지도 않는다 */
  const finger = useRef(false);
  /** 굴러가는 중(마지막 scroll 뒤 멈춤을 기다리는 중) */
  const moving = useRef(false);
  /** 밖의 값에 맞춰 코드가 옮긴 scroll — 사람이 굴린 것으로 치지 않는다 */
  const placed = useRef(false);
  const timer = useRef(0);
  const last = items.length - 1;
  const row = () => (ref.current?.firstElementChild as HTMLElement | null)?.offsetHeight || 40;
  const at = () => Math.max(0, Math.min(last, Math.round((ref.current?.scrollTop ?? 0) / row())));

  // 고른 칸이 가운데 띠에 오게 — 밖에서 값이 바뀌거나 칸 수가 바뀌면(사이 분이 빠지면) 바로 맞춘다
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || finger.current || moving.current) return;
    const top = index * row();
    if (Math.abs(el.scrollTop - top) > 1) {
      placed.current = true;
      el.scrollTop = top;
    }
  }, [index, items.length]);

  /** 멈추면 그 칸을 값으로 — 손가락이 아직 닿아 있으면(끌다 잠깐 멈춤) 떼기를 기다린다 */
  const settle = () => {
    window.clearTimeout(timer.current);
    if (finger.current) return;
    moving.current = false;
    const i = at();
    if (i !== index) onPick(i);
  };
  // scrollend 를 모르는 브라우저, 또는 떼었는데 더 구르지 않을 때: scroll 이 160ms 없으면 멈춘 것으로 본다(scroll 마다 다시 센다 — 관성 중에는 기다린다)
  const idle = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(settle, 160);
  };
  // 도는 동안 가운데 칸만 진하게 — 칸마다 다시 그리지 않고 속성만 바꾼다(스크롤마다 React 를 돌리지 않게)
  const onScroll = () => {
    const i = at();
    ref.current?.querySelectorAll<HTMLElement>(".wheel-item").forEach((c, k) => c.toggleAttribute("data-on", k === i));
    if (placed.current) {
      placed.current = false;
      return;
    }
    moving.current = true;
    idle();
  };
  const go = (i: number) => {
    const el = ref.current;
    if (!el) return;
    // 이미 가운데인 칸이나 움직임 줄이기: 굴리지 않고 바로 고른다
    if (still() || i === at()) onPick(i);
    else el.scrollTo({ top: i * row(), behavior: "smooth" });
  };

  return (
    <div className="wheel-col">
      <div
        ref={ref}
        className="wheel"
        data-vaul-no-drag=""
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={index}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuetext={`${items[index]}${unit ?? ""}`}
        onScroll={onScroll}
        onScrollEnd={() => moving.current && settle()}
        onTouchStart={() => (finger.current = true)}
        onTouchEnd={() => {
          finger.current = false;
          idle();
        }}
        onTouchCancel={() => {
          finger.current = false;
          idle();
        }}
        onKeyDown={(e) => {
          const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[e.key];
          const next = e.key === "Home" ? 0 : e.key === "End" ? last : step !== undefined ? index + step : null;
          if (next === null) return;
          e.preventDefault();
          onPick(Math.max(0, Math.min(last, next)));
        }}
      >
        {items.map((t, k) => (
          <div key={t} className="wheel-item" aria-hidden="true" data-on={k === index || undefined} onClick={() => go(k)}>
            {t}
          </div>
        ))}
      </div>
      {unit && (
        <span className="wheel-unit" aria-hidden="true">
          {unit}
        </span>
      )}
    </div>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const LENGTHS = [0, 30, 60, 90, 120, 180];

/** 바퀴 세 줄(오전·오후 | 시 | 분)로 시각 하나 — 오전·오후가 늘 같이 보인다 */
function ClockWheels({ value, onChange, label }: { value: string; onChange: (hm: string) => void; label: string }) {
  const { pm, h12, m } = clockParts(value);
  const mins = minuteSteps(m);
  return (
    <div className="wheels" role="group" aria-label={label}>
      <Wheel label="오전 오후" items={["오전", "오후"]} index={pm ? 1 : 0} onPick={(i) => onChange(joinClock(i === 1, h12, m))} />
      <Wheel label="시" unit="시" items={HOURS.map(String)} index={h12 - 1} onPick={(i) => onChange(joinClock(pm, HOURS[i], m))} />
      <Wheel label="분" unit="분" items={mins.map((x) => String(x).padStart(2, "0"))} index={mins.indexOf(m)} onPick={(i) => onChange(joinClock(pm, h12, mins[i]))} />
    </div>
  );
}

/**
 * 시간 고르기 (docs/design-system/components/TimeWheel) — 바로 쓰기의 시간 시트와 일정 시트의 시간 줄이 함께 쓴다.
 * 위: 시작 → 끝 두 칸(고른 칸을 바퀴가 고친다). 가운데: 바퀴 세 줄. 아래: "얼마나" 칩(없음·30분·1시간…)이 끝을 정한다.
 * 시작을 옮기면 끝도 같은 길이로 따라간다. 기간 일정(ranged)이면 끝은 마지막 날의 시각이라 길이 칩을 두지 않고 앞뒤도 따지지 않는다.
 * 시작이 비어 있으면 바퀴는 fallback(제안 시각)을 흐리게 보여 주고, 돌리거나 가운데 칸·길이 칩을 누르면 값이 된다.
 */
export function TimePanel({ start, end, onChange, fallback, ranged = false }: { start: string; end: string; onChange: (start: string, end: string) => void; fallback: string; ranged?: boolean }) {
  const [field, setField] = useState<"start" | "end">(start || !end ? "start" : "end");
  const lenId = useId();
  const len = start && end ? toMin(end) - toMin(start) : 0;
  const bad = !ranged && len < 0;
  const shown = field === "start" ? start || fallback : end || (start ? fromMin(Math.min(toMin(start) + 60, 1435)) : fallback);
  /** 길이 칩의 기준 — 시작을 아직 안 정했으면 바퀴의 제안 시각(칩을 누르면 시작도 함께 정해진다) */
  const base = start || fallback;
  const pick = (hm: string) => (field === "start" ? onChange(hm, ranged ? end : followEnd(start, hm, end)) : onChange(start, hm));
  const ends = [
    { key: "start" as const, label: ranged ? "첫날 시작" : "시작", value: start },
    { key: "end" as const, label: ranged ? "끝 날 끝" : "끝", value: end },
  ];

  return (
    <div className="time-panel">
      <div className="time-ends" role="radiogroup" aria-label="고칠 시각" onKeyDown={radioKeys}>
        {ends.map((x, i) => (
          <button key={x.key} type="button" role="radio" aria-checked={field === x.key} tabIndex={radioTab(field === x.key, i, true)} onClick={() => setField(x.key)}>
            <span className="k">{x.label}</span>
            {x.value ? <span className="v">{clockText(x.value)}</span> : <span className="v none">{field === x.key ? clockText(shown) : "없음"}</span>}
            {x.key === "end" && len > 0 && <span className="d">{durationText(len)}</span>}
          </button>
        ))}
        <ArrowRight className="time-ends-arrow" aria-hidden="true" />
      </div>
      <ClockWheels key={field} value={shown} onChange={pick} label={field === "start" ? ends[0].label : ends[1].label} />
      {bad && (
        <p className="help error" role="alert">
          끝 시간은 시작 시간보다 앞일 수 없어요
        </p>
      )}
      {!ranged && (
        <div className="time-lengths">
          <span className="label" id={lenId}>
            얼마나
          </span>
          <div className="chips scroll" role="radiogroup" aria-labelledby={lenId} onKeyDown={radioKeys}>
            {LENGTHS.map((d, i) => {
              const on = d === 0 ? !end : len === d;
              return (
                <button
                  key={d}
                  type="button"
                  className="chip"
                  role="radio"
                  aria-checked={on}
                  tabIndex={radioTab(on, i, LENGTHS.some((x) => (x === 0 ? !end : len === x)))}
                  disabled={d > 0 && toMin(base) + d > 1439}
                  onClick={() => {
                    onChange(base, d ? fromMin(toMin(base) + d) : "");
                    if (!d) setField("start");
                  }}
                >
                  {d ? durationText(d) : "끝 없음"}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
