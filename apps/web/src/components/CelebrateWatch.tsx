"use client";

import { useState } from "react";
import { useData } from "@/lib/store";
import { addMonths, currentMonth, monthRow } from "@/lib/calc";
import { monthLabel } from "@/lib/format";
import { useTasks } from "./tasks";
import { Celebrate } from "./Celebrate";

/**
 * 100% 축하를 어느 화면에서 끝내든 띄운다 (홈 할 일·체크·달력 날짜 창).
 * 보고 있는 달의 체크(옮길 돈·고정비·저축·카드값·정산)가 남은 1건 이상 → 0건이 되는 순간 — 달은 이번 달이 아니어도 된다(다음 달을 미리 끝내도).
 * 앱을 열었을 때 이미 이번 달을 다 끝냈으면(상대가 끝냈을 때 등) 이 기기에서 그달 한 번만.
 */
export function CelebrateWatch() {
  const { data, month, today, setMonth } = useData();
  const { tasks, transfers, pays, bills, started } = useTasks(month);
  const left = tasks.filter((t) => !t.done).length;
  // 그리기 중에 지난 값과 견준다 — 같은 달에서 남은 일이 0이 된 순간만 센다(달을 옮겨 이미 끝난 달을 봐도 띄우지 않는다)
  const [last, setLast] = useState({ month, left });
  const [play, setPlay] = useState(0);
  if (last.month !== month || last.left !== left) {
    if (last.month === month && last.left > 0 && left === 0 && tasks.length > 0) setPlay((n) => n + 1);
    setLast({ month, left });
  }
  if (!started) return null;

  const next = addMonths(month, 1);
  const nextReady = monthRow(data, next) !== null;
  const fixed = pays.filter((t) => t.item?.group === "fixed").length;
  const saving = pays.filter((t) => t.item?.group === "saving").length;
  return (
    <Celebrate
      done={tasks.length > 0 && left === 0 && month === currentMonth(data.settings.cycle_start, today)}
      play={play}
      month={month}
      label={monthLabel(month)}
      chips={[
        { name: "옮길 돈", count: transfers.length },
        { name: "고정비", count: fixed },
        { name: "저축", count: saving },
        { name: "카드값", count: bills.length },
      ].filter((c) => c.count > 0)}
      next={
        // 끝낸 달은 그 달이 끝난 뒤에 마감한다(새 달이 되면 홈·종이 묻는다) → 다음 달 플랜으로
        {
          title: `${monthLabel(next)} 플랜 ${nextReady ? "미리 보기" : "미리 만들기"}`,
          sub: nextReady ? "다음 달 배분을 미리 살펴봐요" : "이번 달 배분을 그대로 이어받아요",
          href: "/plan",
          onGo: () => setMonth(next),
        }
      }
    />
  );
}
