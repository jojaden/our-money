"use client";

import { useState } from "react";
import type { MonthItem } from "@/lib/types";
import { useData } from "@/lib/store";
import { actualAmount } from "@/lib/calc";
import { num } from "@/lib/format";
import { MAX_AMOUNT, Sheet } from "./ui";

/**
 * 납부한 항목이 플랜 금액과 다르게 나갔을 때(관리비·통신비 등) 실제 금액을 적는다.
 * 열 때마다 새 key 로 그려서 입력값이 그때의 금액에서 시작한다.
 */
export function PaidAmountSheet({ open, onOpenChange, item }: { open: boolean; onOpenChange: (v: boolean) => void; item: MonthItem }) {
  const { upsert, toast } = useData();
  const [amount, setAmount] = useState(() => actualAmount(item));

  const save = async () => {
    onOpenChange(false);
    // 플랜과 같으면 비워 둔다 (플랜 금액을 나중에 고쳐도 따라가게)
    const ok = await upsert("month_items", [{ ...item, paid_amount: amount === item.amount ? null : amount }]);
    if (ok) toast("저장했어요");
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="실제로 낸 금액"
      footer={
        <button type="button" className="btn block" onClick={() => void save()}>
          저장
        </button>
      }
    >
      <p className="sheet-lead">
        {item.name} · 플랜 <span className="num">{num(item.amount)}원</span>
      </p>
      <label className="sr-only" htmlFor="paid-amount">
        실제로 낸 금액
      </label>
      <div className="bigamount">
        <input
          id="paid-amount"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          enterKeyHint="done"
          value={amount ? num(amount) : ""}
          onChange={(e) => setAmount(Math.min(MAX_AMOUNT, Number(e.target.value.replace(/[^\d]/g, "")) || 0))}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
        />
        <span className="unit">원</span>
      </div>
      {amount !== item.amount && (
        <div className="quick">
          <button type="button" onClick={() => setAmount(item.amount)}>
            플랜대로
          </button>
        </div>
      )}
    </Sheet>
  );
}
