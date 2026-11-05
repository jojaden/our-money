"use client";

import Link from "next/link";
import { useState } from "react";
import { useData } from "@/lib/store";
import { addMonths, currentMonth, livingStatus, monthRow } from "@/lib/calc";
import { addDays } from "@/lib/calendar";
import { monthLabel } from "@/lib/format";
import { haptic } from "@/lib/native";
import { useTasks } from "./tasks";

const LATER_KEY = "our-money-close-later";
/** "나중에"를 누르면 홈 카드를 며칠 숨기나 (종에는 그대로 남는다) */
const LATER_DAYS = 3;

/**
 * 지난달 마감 묻기 — 새 가계부 달이 시작됐는데 바로 앞 달을 아직 마감하지 않았으면.
 * 마감은 그달이 끝난 뒤에만 한다(이번 달에는 묻지 않는다). 누르면 바로 마감하고 토스트로 알리며 되돌릴 수 있다.
 */
export function usePendingClose() {
  const { data, today, upsert, toast } = useData();
  const prev = addMonths(currentMonth(data.settings.cycle_start, today), -1);
  const m = monthRow(data, prev);
  const { tasks } = useTasks(prev);
  if (!m || m.closed_at) return null;
  const label = monthLabel(prev);
  const left = tasks.filter((t) => !t.done).length;
  const living = livingStatus(data, prev, today);
  const pct = living.budget > 0 ? Math.round((living.spent / living.budget) * 100) : null;
  const summary = [pct !== null ? `생활비 ${pct}% 썼어요` : "", left > 0 ? `체크 ${left}건 남았어요` : "체크를 모두 끝냈어요"].filter(Boolean).join(" · ");
  const close = async () => {
    haptic([12, 40, 12]);
    const ok = await upsert("months", [{ ...m, closed_at: new Date().toISOString() }]);
    // 되돌리기는 빈 칸도 null 로 보낸다 (칸이 없던 줄이면 "바뀐 것 없음"으로 건너뛰어진다)
    if (ok) toast(`${label}을 마감했어요`, () => void upsert("months", [{ ...m, closed_at: null }]));
  };
  return { month: prev, label, summary, close };
}

function readLater(): { month: string; until: string } | null {
  try {
    return JSON.parse(localStorage.getItem(LATER_KEY) ?? "null") as { month: string; until: string } | null;
  } catch {
    return null;
  }
}

/**
 * 홈 맨 위 카드 "10월이 끝났어요" — 화면을 막는 시트 대신 제자리에 둔다(토스 UX: 들어오자마자 가리지 않기).
 * [10월 마감하기]는 바로 마감, [나중에]는 이 기기에서 3일 숨김, "돌아보기"는 그달 체크 화면 맨 아래(메모)로.
 */
export function ClosePrompt() {
  const { today, setMonth } = useData();
  const c = usePendingClose();
  const [later, setLater] = useState(readLater);
  if (!c || (later && later.month === c.month && today < later.until)) return null;

  const snooze = () => {
    const v = { month: c.month, until: addDays(today, LATER_DAYS) };
    setLater(v);
    try {
      localStorage.setItem(LATER_KEY, JSON.stringify(v));
    } catch {}
  };

  return (
    <section className="card close-prompt" aria-labelledby="close-prompt-h">
      <div className="card-head">
        <h2 id="close-prompt-h">{c.label}이 끝났어요</h2>
        <Link className="aside" href="/check#month-close" onClick={() => setMonth(c.month)}>
          돌아보기
        </Link>
      </div>
      <p className="s">{c.summary}</p>
      <div className="close-prompt-actions">
        <button type="button" className="btn secondary" onClick={snooze}>
          나중에
        </button>
        <button type="button" className="btn" onClick={() => void c.close()}>
          {c.label} 마감하기
        </button>
      </div>
    </section>
  );
}
