"use client";

import { useData } from "@/lib/store";
import { addMonths, currentMonth, itemsFromMonth, itemsOf, latestMonthBefore, monthRow, periodOf, periodProgress } from "@/lib/calc";
import { useState } from "react";
import { monthLabel, parseYmd } from "@/lib/format";
import { Toggle } from "./ui";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PrimaryIcon, usePrimary, useSheets } from "./Shell";

function rangeText(month: string, cycle: number) {
  const p = periodOf(month, cycle);
  const s = parseYmd(p.start);
  const e = parseYmd(p.last);
  return `${s.getMonth() + 1}월 ${s.getDate()}일 – ${e.getMonth() + 1}월 ${e.getDate()}일`;
}

/**
 * 페이지 머리 — 큰 제목 "‹ 11월 ›", 기간 줄, 결론. 화면 이름은 읽는 제목에만 둔다.
 * 화살표는 달만 감싸서 늘 같은 자리에 있다. "11월"을 누르면 달 고르기 (따로 ▾ 표시는 두지 않는다 — 제목을 누르면 열리는 것은 다들 안다).
 * 달을 넘겨도 이 줄은 제자리에 있고 달 이름만 그 방향에서 밀려 들어온다. 다른 달을 보면 "이번 달로"가 붙는다.
 */
export function MonthHeader({ name, sub, leading, children }: { /** 탭 이름 (홈은 없음) */ name?: string; /** 기간 줄 대신 (달력은 1일~말일) */ sub?: string; leading?: React.ReactNode; children?: React.ReactNode }) {
  const { data, month, today, setMonth } = useData();
  const { openMonths } = useSheets();
  const prog = periodProgress(month, data.settings.cycle_start, today);
  const tail = prog.state === "current" ? ` · ${prog.daysLeft}일 남음` : prog.state === "past" ? " · 지난 달" : " · 다가오는 달";
  const now = currentMonth(data.settings.cycle_start, today);
  const label = monthLabel(month);
  return (
    <header className="page-head">
      <div style={{ minWidth: 0 }}>
        <div className="title-row">
          {leading}
          <div className="month-step">
            <button type="button" className="month-arrow" aria-label={`지난달 (${monthLabel(addMonths(month, -1))})`} onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <button type="button" className="month-btn" aria-haspopup="dialog" aria-label={`${label}, 다른 달 고르기`} onClick={() => openMonths()}>
              <span className="m num">{label}</span>
            </button>
            <button type="button" className="month-arrow" aria-label={`다음 달 (${monthLabel(addMonths(month, 1))})`} onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          {/* 화면에는 월만 보이고, 읽는 이름과 달 고르기 접근성 이름에는 화면 이름을 남긴다 */}
          <h1 className="sr-only">
            <span className="sr-only">{name ? `${label} ` : label}</span>
            {name}
          </h1>
          {month !== now && (
            <button type="button" className="to-now" onClick={() => setMonth(now)}>
              이번 달로
            </button>
          )}
        </div>
        <p className="sub">
          {sub ?? rangeText(month, data.settings.cycle_start)}
          {sub ? "" : tail}
          {monthRow(data, month)?.closed_at ? " · 마감" : ""}
        </p>
        {children}
      </div>
      <HeadAction />
    </header>
  );
}

/** 데스크톱에서만 보이는 머리줄 버튼 — 그 화면의 주된 일 (폰은 아래 원형 버튼). 없는 화면은 비운다 */
function HeadAction() {
  const p = usePrimary();
  if (!p) return null;
  return (
    <button type="button" className="btn head-action" onClick={p.run}>
      <PrimaryIcon icon={p.icon} /> {p.label}
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
