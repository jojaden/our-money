"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Category } from "@/lib/types";
import { useData } from "@/lib/store";
import { AmountInput, MAX_SPENDING, Sheet } from "./ui";

function newId(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`;
}

export function CategorySheet({ open, onOpenChange, category }: { open: boolean; onOpenChange: (v: boolean) => void; category?: Category }) {
  const { data, upsert, remove, toast } = useData();
  const [name, setName] = useState("");
  const [budget, setBudget] = useState(0);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setBudget(category?.budget ?? 0);
  }, [open, category]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={category ? category.name : "분류 추가"}
      headerAction={
        category && (
          <button
            type="button"
            className="btn danger sm"
            onClick={async () => {
              const backup = category;
              onOpenChange(false);
              if (!(await remove("categories", [category.id]))) return;
              toast("분류를 지웠어요. 기존 기록은 미분류가 돼요.", () => void upsert("categories", [backup]));
            }}
          >
            <Trash2 aria-hidden="true" /> 삭제
          </button>
        )
      }
      footer={
        <button
          type="button"
          className="btn block"
          disabled={!name.trim()}
          onClick={async () => {
            onOpenChange(false);
            const ok = await upsert("categories", [
              { id: category?.id ?? newId("cat"), name: name.trim(), budget, sort: category?.sort ?? Math.max(0, ...data.categories.map((c) => c.sort)) + 1, rev: category?.rev },
            ]);
            if (ok) toast("저장했어요");
          }}
        >
          저장
        </button>
      }
    >
      <div className="field">
        <label htmlFor="cat-name">이름</label>
        <input id="cat-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 장보기" maxLength={20} />
      </div>
      <div className="field">
        <label htmlFor="cat-budget">한 달 예산</label>
        <AmountInput id="cat-budget" value={budget} onChange={setBudget} max={MAX_SPENDING} />
        <p className="help">비워두면 예산 없이 사용액만 보여줘요.</p>
      </div>
    </Sheet>
  );
}
