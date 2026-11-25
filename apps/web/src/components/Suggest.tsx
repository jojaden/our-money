"use client";

import { useState, type ReactNode } from "react";
import type { Suggestion } from "@/lib/suggest";

/**
 * 입력 추천 (docs/design-system/components/Suggest) — 감싼 입력칸에 초점이 있는 동안, 친 글자에 맞는 지난 기록을 바로 아래 칩 한 줄로.
 * 칩을 눌러도 입력칸 초점(폰 키보드)이 그대로다(mousedown 기본 동작 막기). 키보드는 Tab 으로 칩에 들어가 Enter.
 * 고른 칩은 다시 보이지 않는다(끝까지 친 글과 같은 칩은 keepExact 일 때 남아 있다가 고르면 빠진다).
 */
export function Suggest<T>({ items, onPick, children, label = "입력 추천" }: { items: Suggestion<T>[]; onPick: (s: Suggestion<T>) => void; children: ReactNode; label?: string }) {
  const [focus, setFocus] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  // 글을 바꿔 고른 칩이 추천에서 빠지면 잊는다 (다시 그 글을 치면 또 보인다)
  if (picked !== null && !items.some((s) => s.text === picked)) setPicked(null);
  const shown = items.filter((s) => s.text !== picked);
  return (
    <div
      className="suggest-wrap"
      onFocus={() => setFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false);
      }}
    >
      {children}
      {focus && shown.length > 0 && (
        <div className="suggest" role="group" aria-label={label}>
          {shown.map((s) => (
            <button
              key={s.text}
              type="button"
              className="suggest-chip"
              // 초점을 입력칸에 둔다 (pointerdown 을 막으면 WebKit 터치에서 click 까지 사라진다)
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setPicked(s.text);
                onPick(s);
              }}
            >
              {s.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
