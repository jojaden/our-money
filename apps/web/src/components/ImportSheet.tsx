"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/store";
import { itemsOf, missingFromMonth } from "@/lib/calc";
import { GROUP_LABEL } from "@/lib/types";
import { monthLabel } from "@/lib/format";
import { Money, Sheet, Toggle, Who } from "./ui";

/** 다른 달 플랜에서 이 달에 빠진 항목만 골라 가져온다. 이미 있는 항목은 건드리지 않는다. */
export function ImportSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, month, upsert, remove, toast } = useData();
  const others = useMemo(() => data.months.map((m) => m.id).filter((id) => id !== month).sort().reverse(), [data.months, month]);
  const [from, setFrom] = useState<string | null>(null);
  const [oneOffs, setOneOffs] = useState(true);

  useEffect(() => {
    if (!open) return;
    setFrom(others.find((id) => id < month) ?? others[0] ?? null);
    setOneOffs(true);
  }, [open, others, month]);

  const missing = from ? missingFromMonth(data, from, month, { oneOffs }) : [];

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="다른 달에서 불러오기"
      footer={
        <button
          type="button"
          className="btn block"
          disabled={missing.length === 0}
          onClick={async () => {
            const added = missing;
            onOpenChange(false);
            await upsert("month_items", added, { ignoreDuplicates: true });
            toast(`${added.length}개 항목을 가져왔어요`, () => void remove("month_items", added.map((i) => i.id)));
          }}
        >
          {missing.length > 0 ? `${missing.length}개 항목 가져오기` : "가져올 항목이 없어요"}
        </button>
      }
    >
      {others.length === 0 ? (
        <p className="empty">아직 다른 달 플랜이 없어요.</p>
      ) : (
        <>
          <div className="field">
            <span className="label">어느 달에서 가져올까요</span>
            <div className="chips" role="radiogroup" aria-label="가져올 달">
              {others.map((id) => (
                <button key={id} type="button" className="chip" role="radio" aria-checked={from === id} onClick={() => setFrom(id)}>
                  {monthLabel(id)} <span className="count">{itemsOf(data, id).length}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <div className="switchrow">
              <div>
                <div className="t">‘이번 달만’ 항목도 포함</div>
                <div className="s">반복하지 않는 일회성 항목도 같이 가져와요</div>
              </div>
              <Toggle on={oneOffs} onChange={setOneOffs} label="이번 달만 항목도 포함" />
            </div>
          </div>
          <div className="field">
            <span className="label">{monthLabel(month)}에 없는 항목</span>
            {missing.length === 0 ? (
              <p className="empty">이미 모두 들어 있어요. 이미 있는 항목은 바꾸지 않아요.</p>
            ) : (
              <div className="rows" style={{ ["--inset" as string]: "40px" }}>
                {missing.map((i) => (
                  <div className="row" key={i.id}>
                    <Who owner={i.payer} s={data.settings} size="sm" />
                    <div style={{ minWidth: 0 }}>
                      <div className="t">{i.name}</div>
                      <div className="s">
                        {GROUP_LABEL[i.group]}
                        {i.plan_item_id ? "" : " · 이번 달만"}
                      </div>
                    </div>
                    <div className="r">
                      <Money value={i.amount} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
