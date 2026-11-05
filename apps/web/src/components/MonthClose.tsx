"use client";

import { useState } from "react";
import { useData } from "@/lib/store";
import { monthRow } from "@/lib/calc";
import { monthLabel } from "@/lib/format";
import { haptic } from "@/lib/native";

/** DB 한도 (migrations/005 months_text_len) */
const MAX_NOTE = 500;

/**
 * 체크 화면 맨 아래 — 그달 메모와 마감. 마감은 표시만 하고 잠그지 않는다(고치기는 그대로, 다시 열 수 있다).
 * 메모 입력은 저장한 값과 다를 때만 저장 버튼이 나온다. 다른 폰에서 바뀐 메모는 입력 중이 아닐 때 따라온다.
 */
export function MonthClose({ month }: { month: string }) {
  const { data, upsert, toast } = useData();
  const m = monthRow(data, month);
  const saved = m?.note ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  if (!m) return null;
  const note = draft ?? saved;
  const dirty = draft !== null && draft.trim() !== saved;
  const label = monthLabel(month);
  const closed = m.closed_at ? new Date(m.closed_at) : null;

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
    toast(on ? `${label}을 마감했어요` : `${label}을 다시 열었어요`);
  };

  return (
    <section className="group" id="month-close" aria-labelledby="close-h">
      <div className="group-head">
        <h2 id="close-h">{label} 마무리</h2>
        {closed && <span className="aside">마감</span>}
      </div>
      <div className="card month-close">
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
          ) : (
            <button type="button" className="btn block" onClick={() => void setClosed(true)}>
              {label} 마감하기
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
