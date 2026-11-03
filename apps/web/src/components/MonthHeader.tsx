"use client";

import { useData } from "@/lib/store";
import { itemsFromMonth, itemsOf, latestMonthBefore, periodOf, periodProgress } from "@/lib/calc";
import { useState } from "react";
import { monthLabel, parseYmd } from "@/lib/format";
import { MonthNav, Toggle } from "./ui";
import { Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSheets } from "./Shell";

function rangeText(month: string, cycle: number) {
  const p = periodOf(month, cycle);
  const s = parseYmd(p.start);
  const e = parseYmd(p.last);
  return `${s.getMonth() + 1}월 ${s.getDate()}일 – ${e.getMonth() + 1}월 ${e.getDate()}일`;
}

export function MonthHeader({ title, children }: { title?: (m: string) => string; children?: React.ReactNode }) {
  const { data, month, today } = useData();
  const prog = periodProgress(month, data.settings.cycle_start, today);
  const tail = prog.state === "current" ? ` · ${prog.daysLeft}일 남음` : prog.state === "past" ? " · 지난 달" : " · 다가오는 달";
  return (
    <header className="titlebar">
      <div style={{ minWidth: 0 }}>
        <h1>{title ? title(monthLabel(month)) : monthLabel(month)}</h1>
        <p className="sub">
          {rangeText(month, data.settings.cycle_start)}
          {tail}
        </p>
        {children}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
        <HeadAction />
        <MonthNav />
      </div>
    </header>
  );
}

function HeadAction() {
  const path = usePathname() ?? "/";
  const { openSpending } = useSheets();
  const p = path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
  if (p !== "/" && p !== "/ledger") return null;
  return (
    <button type="button" className="btn head-action" onClick={() => openSpending()}>
      <Plus aria-hidden="true" /> 지출 기록
    </button>
  );
}

export function FirstRun() {
  const { data, month, startMonth, toast } = useData();
  const from = latestMonthBefore(data, month);
  const [oneOffs, setOneOffs] = useState(false);
  const activeCount = data.plan_items.filter((p) => p.active).length;
  const carried = from ? itemsFromMonth(data, from, month, { oneOffs }) : [];
  const oneOffCount = from ? itemsOf(data, from).filter((i) => !i.plan_item_id).length : 0;

  if (!from && activeCount === 0) {
    return (
      <section className="card firstrun">
        <h2>{monthLabel(month)} 플랜이 아직 없어요</h2>
        <p>설정에서 계좌·카드와 월급통장을 먼저 정하고, 플랜에 월세·보험·생활비·용돈·적금 항목을 추가하면 매달 이체 목록이 자동으로 만들어져요.</p>
        <button type="button" className="btn" onClick={() => void startMonth(month)}>
          빈 플랜으로 시작하기
        </button>
      </section>
    );
  }

  return (
    <section className="card firstrun">
      <h2>{monthLabel(month)} 플랜이 아직 없어요</h2>
      {from ? (
        <>
          <p>
            {monthLabel(from)} 플랜을 그대로 가져와요. 항목 {carried.length}개, 그달에 바꾼 금액과 월급까지 이어져요. 체크는 새로 시작해요.
          </p>
          {oneOffCount > 0 && (
            <div className="switchrow" style={{ marginTop: 14 }}>
              <div>
                <div className="t">‘이번 달만’ 항목도 가져오기</div>
                <div className="s">{monthLabel(from)}에만 넣었던 항목 {oneOffCount}개</div>
              </div>
              <Toggle on={oneOffs} onChange={setOneOffs} label="이번 달만 항목도 가져오기" />
            </div>
          )}
          <div className="firstrun-actions">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                await startMonth(month, { from, oneOffs });
                toast(`${monthLabel(from)} 플랜을 그대로 가져왔어요`);
              }}
            >
              {monthLabel(from)} 플랜 그대로 가져오기
            </button>
            {activeCount > 0 && (
              <button
                type="button"
                className="btn secondary"
                onClick={async () => {
                  await startMonth(month);
                  toast(`반복 항목 ${activeCount}개로 만들었어요`);
                }}
              >
                반복 항목으로 새로
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p>반복 항목 {activeCount}개로 {monthLabel(month)} 플랜을 만들어요. 월급은 설정에 적은 금액으로 시작하고, 만든 뒤에 이번 달만 바꿀 수 있어요.</p>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await startMonth(month);
              toast(`${monthLabel(month)} 플랜을 만들었어요`);
            }}
          >
            {monthLabel(month)} 플랜 시작하기
          </button>
        </>
      )}
    </section>
  );
}
