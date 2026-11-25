"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Clock, X } from "lucide-react";
import { cutTime, findTime, timeText, type TimeHit } from "@/lib/calendar";
import { nextHour, toMin } from "@/lib/clock";
import { Sheet, useBackToClose } from "./ui";
import { TimePanel } from "./TimeWheel";
import { Suggest } from "./Suggest";
import type { CalEvent } from "@/lib/types";
import { useData } from "@/lib/store";
import { eventTitles, suggest } from "@/lib/suggest";

/** 바로 쓰기에 쓰던 것 — 제목과 시간(비면 하루 종일), 제목에서 "3시~5시"처럼 뗀 끝 시간 */
export interface QuickDraft {
  title: string;
  time: string;
  end?: string;
  /** 제목 추천에서 고른 지난 일정 — 제목이 그대로면 종류·누구·알림·금액을 따른다 (quickEvent, 일정 시트) */
  from?: CalEvent;
}

/**
 * 달력 첫 화면(폰) 아래 막대의 바로 쓰기 (docs/design-system/components/Calendar).
 * 접힌 막대: "11월 17일에 추가" 글자(누르면 펼침) — 오른쪽 + 는 Shell 의 원형 버튼 그대로.
 * 펼친 막대: 막대가 하단 메뉴 폭까지 서서히 커지고, 입력칸이 작게 생겨 커진다. 아래 줄은 시간 · 자세히 · 추가.
 * 추가는 시트 없이 바로 더하고, 자세히는 쓰던 것으로 원래 일정 시트를 연다(onMore).
 * 막대 밖을 누르거나 뒤로 가기·Esc 면 접는다(쓰던 글은 남는다).
 */
export function QuickAdd({
  hint,
  draft,
  onDraft,
  open,
  onOpenChange,
  onAdd,
  onMore,
}: {
  hint: string;
  draft: QuickDraft;
  onDraft: (d: QuickDraft) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (d: QuickDraft) => void;
  onMore: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  /** 시간 시트: 열렸나, 그 안에서 고르는 중인 값(완료를 눌러야 알약에 들어간다) */
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState({ start: "", end: "" });
  const mirror = useRef<HTMLSpanElement>(null);
  const caret = useRef<number | null>(null);
  /** 오전·오후를 안 쓴 시간을 정할 기준 (막대를 그린 때) */
  const [now] = useState(() => new Date());
  useBackToClose(open, onOpenChange);

  // 제목 속 시간 — 일정 시트와 같은 규칙: 카드로 감싸 보여 주고, 띄어 쓰거나 카드를 누르면 제목에서 떼어 시간 알약으로
  const live = findTime(draft.title, now);
  const takeTime = (title: string, hit: TimeHit) => {
    const cut = cutTime(title, hit);
    caret.current = cut.at;
    // "9시까지"처럼 끝만 쓰면 시작 시간이 없어 알약에 넣지 않는다(추가할 때 제목에서 뗀다)
    onDraft({ ...draft, title: cut.text, time: hit.start ?? draft.time, end: hit.start ? (hit.until ?? "") : draft.end });
  };
  const change = (el: HTMLInputElement, composing: boolean) => {
    const hit = composing ? null : findTime(el.value, now);
    if (hit?.closed && hit.start) takeTime(el.value, hit);
    else onDraft({ ...draft, title: el.value });
  };
  const syncMirror = () => {
    if (mirror.current && input.current) mirror.current.style.transform = `translateX(${-input.current.scrollLeft}px)`;
  };
  useLayoutEffect(() => {
    const el = input.current;
    if (el && caret.current !== null) el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
    syncMirror();
  }, [draft.title]);

  // 막대 밖을 누르면 접기만 한다 — 그 누름이 뒤의 날짜를 고르거나 날짜 창을 열지 않게 바로 뒤 클릭 한 번을 삼킨다. 접히면 키보드도 내린다
  useEffect(() => {
    if (!open) {
      input.current?.blur();
      return;
    }
    // 시간 시트가 떠 있는 동안은 시트 안 누름이 막대 밖 누름이라 접지 않는다
    if (picking) return;
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest(".fab")) return;
      const swallow = (c: MouseEvent) => {
        c.preventDefault();
        c.stopPropagation();
      };
      document.addEventListener("click", swallow, { capture: true, once: true });
      // 끌기처럼 클릭이 뒤따르지 않으면 다음 누름을 삼키지 않게 곧 뗀다
      window.setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 600);
      onOpenChange(false);
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open, onOpenChange, picking]);

  // 누른 그 순간에 입력칸으로 옮겨야 폰 키보드가 바로 올라온다 — 펼친 상태를 먼저 그리고(inert 해제) 바로 포커스
  const expand = () => {
    flushSync(() => onOpenChange(true));
    input.current?.focus({ preventScroll: true });
  };
  const title = draft.title.trim();
  // 제목 추천: 고르면 그 일정의 시간까지 (없으면 고른 시간 그대로)
  const { data } = useData();
  const ideas = suggest(eventTitles(data), draft.title, { limit: 4, keepExact: true });
  const pickIdea = (e: CalEvent) => {
    caret.current = e.title.length;
    onDraft({ title: e.title, time: e.start_time ?? draft.time, end: e.start_time ? (e.end_time ?? "") : draft.end, from: e });
  };

  return (
    <>
      <button type="button" className={`fab-prompt ${draft.title ? "has" : ""}`} tabIndex={open ? -1 : 0} onClick={expand}>
        {draft.title || hint}
      </button>
      <form
        className="fab-compose"
        inert={!open}
        aria-label={hint}
        onSubmit={(e) => {
          e.preventDefault();
          if (title) onAdd(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onOpenChange(false);
        }}
      >
        <Suggest items={ideas} onPick={(x) => pickIdea(x.item)} label="제목 추천">
        <div className={`time-title ${live?.start ? "has-time" : ""}`}>
          {live?.start && (
            <span className="title-mirror" aria-hidden="true">
              <span ref={mirror}>
                <span>{draft.title.slice(0, live.index)}</span>
                {/* 누르면 시간 알약으로 (포인터 전용 — 키보드는 띄어 쓰기). 입력칸 초점은 그대로 */}
                <mark onPointerDown={(e) => e.preventDefault()} onClick={() => takeTime(draft.title, live)}>
                  {live.text}
                </mark>
                <span>{draft.title.slice(live.end)}</span>
              </span>
            </span>
          )}
          <input
            ref={input}
            className="input"
            value={draft.title}
            onChange={(e) => change(e.target, (e.nativeEvent as InputEvent).isComposing)}
            onCompositionEnd={(e) => change(e.currentTarget, false)}
            onScroll={syncMirror}
            onSelect={syncMirror}
            placeholder={hint}
            aria-label="일정 제목"
            enterKeyHint="done"
            autoComplete="off"
            maxLength={40}
          />
        </div>
        </Suggest>
        <div className="fab-compose-row">
          {/* 시간 알약: 누르면 시간 시트(바퀴 + 얼마나)가 뜨고, 고르면 "오후 3시~4시" — × 로 지운다(비면 하루 종일) */}
          <div className={`fab-time ${draft.time ? "has" : ""}`}>
            <button
              type="button"
              className="fab-time-pick"
              onClick={() => {
                setPick({ start: draft.time || nextHour(new Date()), end: draft.end ?? "" });
                setPicking(true);
              }}
            >
              <Clock aria-hidden="true" />
              {draft.time ? timeText({ start_time: draft.time, end_time: draft.end || null }) : "시간"}
            </button>
            {draft.time && (
              <button type="button" className="fab-time-clear" aria-label="시간 지우기" onClick={() => onDraft({ ...draft, time: "", end: "" })}>
                <X aria-hidden="true" />
              </button>
            )}
          </div>
          <button type="button" className="btn ghost" onClick={onMore}>
            자세히
          </button>
          <button type="submit" className="btn sm" disabled={!title}>
            추가
          </button>
        </div>
      </form>
      <Sheet
        open={picking}
        onOpenChange={setPicking}
        title="시간"
        footer={
          <>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                onDraft({ ...draft, time: "", end: "" });
                setPicking(false);
              }}
            >
              하루 종일
            </button>
            <button
              type="button"
              className="btn block"
              disabled={Boolean(pick.end) && toMin(pick.end) < toMin(pick.start)}
              onClick={() => {
                onDraft({ ...draft, time: pick.start, end: pick.end });
                setPicking(false);
              }}
            >
              완료
            </button>
          </>
        }
      >
        <TimePanel start={pick.start} end={pick.end} fallback={pick.start} onChange={(start, end) => setPick({ start, end })} />
      </Sheet>
    </>
  );
}
