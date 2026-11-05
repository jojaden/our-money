"use client";

import { useData } from "@/lib/store";
import { currentMonth, itemsFromMonth, itemsOf, latestMonthBefore, monthRow, periodOf, periodProgress } from "@/lib/calc";
import { useState } from "react";
import { monthLabel, parseYmd } from "@/lib/format";
import { Toggle } from "./ui";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useSheets } from "./Shell";

function rangeText(month: string, cycle: number) {
  const p = periodOf(month, cycle);
  const s = parseYmd(p.start);
  const e = parseYmd(p.last);
  return `${s.getMonth() + 1}월 ${s.getDate()}일 – ${e.getMonth() + 1}월 ${e.getDate()}일`;
}

/** 페이지 머리 — 큰 제목, 기간 줄, 결론. 달 넘기기는 위쪽 막대에 있고, 다른 달을 보면 "이번 달로"가 붙는다. */
export function MonthHeader({ title, children }: { title?: (m: string) => string; children?: React.ReactNode }) {
  const { data, month, today, setMonth } = useData();
  const prog = periodProgress(month, data.settings.cycle_start, today);
  const tail = prog.state === "current" ? ` · ${prog.daysLeft}일 남음` : prog.state === "past" ? " · 지난 달" : " · 다가오는 달";
  const now = currentMonth(data.settings.cycle_start, today);
  return (
    <header className="page-head">
      <div style={{ minWidth: 0 }}>
        <div className="title-row">
          <h1>{title ? title(monthLabel(month)) : monthLabel(month)}</h1>
          {month !== now && (
            <button type="button" className="to-now" onClick={() => setMonth(now)}>
              이번 달로
            </button>
          )}
        </div>
        <p className="sub">
          {rangeText(month, data.settings.cycle_start)}
          {tail}
          {monthRow(data, month)?.closed_at ? " · 마감" : ""}
        </p>
        {children}
      </div>
      <HeadAction />
    </header>
  );
}

/** 데스크톱에서만 보이는 머리줄 "지출 기록" (폰은 하단 원형 버튼) */
function HeadAction() {
  const { openSpending } = useSheets();
  return (
    <button type="button" className="btn head-action" onClick={() => openSpending()}>
      <Plus aria-hidden="true" /> 지출 기록
    </button>
  );
}

/**
 * 아직 시작하지 않은 달. 지난 플랜(없으면 반복 항목)을 한 번에 가져오는 버튼 하나만 둔다.
 * 플랜 화면(inPlan)은 이 카드 아래에 빈 플랜을 그대로 보여서 하나씩 추가할 수 있고,
 * 홈·체크는 플랜으로 가는 길을 함께 보여 준다. 항목·월급을 처음 저장하면 그 달이 시작된다.
 */
export function FirstRun({ inPlan = false }: { inPlan?: boolean }) {
  const { data, month, startMonth, toast } = useData();
  const from = latestMonthBefore(data, month);
  const [oneOffs, setOneOffs] = useState(false);
  const activeCount = data.plan_items.filter((p) => p.active).length;
  const carried = from ? itemsFromMonth(data, from, month, { oneOffs }) : [];
  const oneOffCount = from ? itemsOf(data, from).filter((i) => !i.plan_item_id).length : 0;
  const label = monthLabel(month);

  const source = from ? `${monthLabel(from)} 플랜` : activeCount > 0 ? `반복 항목 ${activeCount}개` : null;
  const lead = from
    ? `${monthLabel(from)} 플랜을 가져오면 항목 ${carried.length}개와 월급, 그달에 바꾼 금액까지 그대로 이어져요. 체크는 새로 시작해요.`
    : activeCount > 0
      ? `플랜에서 "다음 달부터도 적용"으로 저장한 반복 항목 ${activeCount}개를 가져올 수 있어요.`
      : "설정에서 계좌·카드와 월급통장을 먼저 정하고, 플랜에 월세·보험·생활비·용돈·적금 항목을 추가하면 매달 이체 목록이 만들어져요.";

  return (
    <section className={`card firstrun ${inPlan ? "inplan" : ""}`}>
      <h2>{label} 플랜이 비어 있어요</h2>
      <p>
        {lead}
        {inPlan ? " 가져오지 않고 아래에서 하나씩 추가해도 돼요." : ""}
      </p>
      {from && oneOffCount > 0 && (
        <div className="switchrow" style={{ marginTop: 14 }}>
          <div>
            <div className="t">‘이번 달만’ 항목도 가져오기</div>
            <div className="s">{monthLabel(from)}에만 넣었던 항목 {oneOffCount}개</div>
          </div>
          <Toggle on={oneOffs} onChange={setOneOffs} label="이번 달만 항목도 가져오기" />
        </div>
      )}
      <div className="firstrun-actions">
        {source && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              if (!(await startMonth(month, { from, oneOffs }))) return;
              toast(from ? `${monthLabel(from)} 플랜을 가져왔어요` : `반복 항목 ${activeCount}개를 가져왔어요`);
            }}
          >
            {source} 가져오기
          </button>
        )}
        {!inPlan && (
          <Link className="btn secondary" href="/plan">
            플랜에서 하나씩 만들기
          </Link>
        )}
      </div>
    </section>
  );
}
