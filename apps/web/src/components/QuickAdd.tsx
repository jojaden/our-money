"use client";

import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { Clock, X } from "lucide-react";
import { timeText } from "@/lib/calendar";
import { useBackToClose } from "./ui";

/** 바로 쓰기에 쓰던 것 — 제목과 시간(비면 하루 종일) */
export interface QuickDraft {
  title: string;
  time: string;
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
  const timeInput = useRef<HTMLInputElement>(null);
  useBackToClose(open, onOpenChange);

  // 막대 밖을 누르면 접기만 한다 — 그 누름이 뒤의 날짜를 고르거나 날짜 창을 열지 않게 바로 뒤 클릭 한 번을 삼킨다. 접히면 키보드도 내린다
  useEffect(() => {
    if (!open) {
      input.current?.blur();
      return;
    }
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
  }, [open, onOpenChange]);

  // 누른 그 순간에 입력칸으로 옮겨야 폰 키보드가 바로 올라온다 — 펼친 상태를 먼저 그리고(inert 해제) 바로 포커스
  const expand = () => {
    flushSync(() => onOpenChange(true));
    input.current?.focus({ preventScroll: true });
  };
  const title = draft.title.trim();

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
        <input
          ref={input}
          className="input"
          value={draft.title}
          onChange={(e) => onDraft({ ...draft, title: e.target.value })}
          placeholder={hint}
          aria-label="일정 제목"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={40}
        />
        <div className="fab-compose-row">
          {/* 시간 알약: 누르면 폰의 시간 고르기가 뜨고, 고르면 "오후 3:30" — × 로 지운다(비면 하루 종일) */}
          <div className={`fab-time ${draft.time ? "has" : ""}`}>
            <button
              type="button"
              className="fab-time-pick"
              onClick={() => {
                const t = timeInput.current;
                try {
                  t?.showPicker();
                } catch {
                  t?.focus();
                }
              }}
            >
              <Clock aria-hidden="true" />
              {draft.time ? timeText({ start_time: draft.time, end_time: null }) : "시간"}
            </button>
            {draft.time && (
              <button type="button" className="fab-time-clear" aria-label="시간 지우기" onClick={() => onDraft({ ...draft, time: "" })}>
                <X aria-hidden="true" />
              </button>
            )}
            <input ref={timeInput} type="time" tabIndex={-1} aria-label="시간" value={draft.time} onChange={(e) => onDraft({ ...draft, time: e.target.value })} />
          </div>
          <button type="button" className="btn ghost" onClick={onMore}>
            자세히
          </button>
          <button type="submit" className="btn sm" disabled={!title}>
            추가
          </button>
        </div>
      </form>
    </>
  );
}
