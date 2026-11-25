"use client";

import { useState, type ReactNode } from "react";
import type { Suggestion } from "@/lib/suggest";

/**
 * 입력 추천 (docs/design-system/components/Suggest) — 감싼 입력칸에 초점이 있는 동안, 친 글자에 맞는 지난 기록을 바로 아래 칩 한 줄로.
 * 칩을 눌러도 입력칸 초점(폰 키보드)이 그대로다. 키보드는 Tab 으로 칩에 들어가 Enter.
 * 고르면 글이 추천과 같아져 그 추천은 빠진다(suggest 가 친 글과 같은 글을 뺀다).
 */
export function Suggest<T>({ items, onPick, children, label = "입력 추천" }: { items: Suggestion<T>[]; onPick: (s: Suggestion<T>) => void; children: ReactNode; label?: string }) {
  const [focus, setFocus] = useState(false);
  return (
    <div
      className="suggest-wrap"
      onFocus={() => setFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false);
      }}
    >
      {children}
      {focus && items.length > 0 && (
        <div className="suggest" role="group" aria-label={label}>
          {items.map((s) => (
            <button key={s.text} type="button" className="suggest-chip" onPointerDown={(e) => e.preventDefault()} onClick={() => onPick(s)}>
              {s.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
