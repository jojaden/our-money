"use client";

import { useState } from "react";
import { useData } from "@/lib/store";
import { currentMonth, monthRow, periodOf } from "@/lib/calc";
import { addDays } from "@/lib/calendar";
import { monthLabel, parseYmd } from "@/lib/format";
import { Morph } from "./Morph";
import { haptic } from "@/lib/native";

/** DB 한도 (migrations/005 months_text_len) */
const MAX_NOTE = 500;

/**
 * 체크 화면 맨 아래 — 그달 메모와 마감. 마감은 표시만 하고 잠그지 않는다(고치기는 그대로, 다시 열 수 있다).
 * 마감은 그달이 끝난 뒤에만 한다 — 이번 달에는 언제부터 마감할 수 있는지만 알리고, 새 달이 되면 홈·종이 묻는다(ClosePrompt).
 * 메모 입력은 저장한 값과 다를 때만 저장 버튼이 나온다. 다른 폰에서 바뀐 메모는 입력 중이 아닐 때 따라온다.
 */
export function MonthClose({ month }: { month: string }) {
  const { data, today, upsert, toast } = useData();
  const m = monthRow(data, month);
  const saved = m?.note ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  if (!m) return null;
  const note = draft ?? saved;
  const dirty = draft !== null && draft.trim() !== saved;
  const label = monthLabel(month);
  const closed = m.closed_at ? new Date(m.closed_at) : null;
  const ended = month < currentMonth(data.settings.cycle_start, today);
  const opens = parseYmd(addDays(periodOf(month, data.settings.cycle_start).last, 1));

  const saveNote = async () => {
    const ok = await upsert("months", [{ ...m, note: note.trim() }]);
    if (ok) {
      setDraft(null);
      toast("메모를 저장했어요");
    }
  };

  const setClosed = async (on: boolean) => {
    haptic(on ? [12, 40, 12] : 8);
    // 적던 메모가 있으면 같이 저장한다
    const ok = await upsert("months", [{ ...m, note: note.trim(), closed_at: on ? new Date().toISOString() : null }]);
    if (!ok) return;
    setDraft(null);
    toast(on ? `${label}을 마감했어요` : `${label}을 다시 열었어요`, () => void upsert("months", [{ ...m, closed_at: m.closed_at ?? null }]));
  };

  return (
    <section className="group" id="month-close" aria-labelledby="close-h">
      <div className="group-head">
        <h2 id="close-h">{label} 마무리</h2>
        {closed && <span className="aside">마감</span>}
      </div>
      {/* 메모를 고치면 "메모 저장" 줄이 떠오르고 아래 줄이 미끄러져 내려간다 (Morph) */}
      <Morph className="card month-close" track=":scope > *">
        <div className="field">
          <label htmlFor="month-note">이번 달 메모</label>
          <textarea
            id="month-note"
            className="input"
            rows={3}
            maxLength={MAX_NOTE}
            placeholder="예: 결혼식 축의금 두 번, 이사 준비로 생활비가 넘쳤어요"
            value={note}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        {dirty && (
          <div className="card-foot">
            <span className="s num">
              {note.length} / {MAX_NOTE}
            </span>
            <button type="button" className="btn sm" onClick={() => void saveNote()}>
              메모 저장
            </button>
          </div>
        )}
        <div className="card-foot close-row">
          {closed ? (
            <>
              <span className="s">
                {closed.getMonth() + 1}월 {closed.getDate()}일에 마감했어요
              </span>
              <button type="button" className="btn ghost" onClick={() => void setClosed(false)}>
                다시 열기
              </button>
            </>
          ) : ended ? (
            <button type="button" className="btn block" onClick={() => void setClosed(true)}>
              {label} 마감하기
            </button>
          ) : (
            <span className="s">
              {opens.getMonth() + 1}월 {opens.getDate()}일부터 마감할 수 있어요
            </span>
          )}
        </div>
      </Morph>
    </section>
  );
}
