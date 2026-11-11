"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Morph, still } from "./Morph";

/** 홈 맨 위 알림 하나 — 색은 상태 알약과 같은 네 가지 (docs/design-system/components/Nudges) */
export interface Nudge {
  /** 알림 종류 — 앱에서 한 번 뜬 종류는 탭을 다시 열어도 다시 뜨는 움직임 없이 그대로 있다 */
  key: string;
  tone: "negative" | "warning" | "positive" | "neutral";
  icon: LucideIcon;
  href: string;
  text: React.ReactNode;
}

/** 이미 뜬 알림 종류 (앱을 켜 둔 동안) */
const played = new Set<string>();

/** 알림이 하나씩 도착하는 간격과 첫 알림까지의 기다림 (ms) */
const FIRST = 250;
const NEXT = 700;

/**
 * 토스 알림처럼 하나씩 도착하는 알림 카드들.
 * items 는 중요한 순(맨 위가 가장 중요). 덜 중요한 것부터 차례로 도착해, 새 알림은 맨 위에 작은 크기에서 커지며 나타나고
 * 먼저 와 있던 알림은 그만큼 아래로 내려간다(Morph 의 FLIP). 그래서 다 도착하면 가장 중요한 알림이 맨 위에 있다.
 * 움직임 줄이기면 모두 바로 보인다.
 */
export function Nudges({ items }: { items: Nudge[] }) {
  const [fresh, setFresh] = useState<string[]>([]);
  const sig = items.map((n) => n.key).join("|");

  useEffect(() => {
    const queue = (sig ? sig.split("|") : []).reverse().filter((k) => !played.has(k));
    if (queue.length === 0) return;
    const calm = still();
    const timers = queue.map((k, i) =>
      window.setTimeout(
        () => {
          played.add(k);
          setFresh((f) => [...f, k]);
        },
        calm ? 0 : FIRST + i * NEXT,
      ),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [sig]);

  const shown = items.filter((n) => played.has(n.key) || fresh.includes(n.key));
  return (
    <Morph className="nudges" track=":scope > *" enter={false}>
      {shown.map((n) => (
        <NudgeCard key={n.key} n={n} grow={fresh.includes(n.key)} />
      ))}
    </Morph>
  );
}

/** 작게 → 크게: 카드와 글이 한 덩어리로 작은 크기에서 커지며 나타난다(살짝 넘쳤다가 제자리). transform·opacity 만 움직여 합성만 한다 */
function NudgeCard({ n, grow }: { n: Nudge; grow: boolean }) {
  const el = useRef<HTMLAnchorElement>(null);
  const once = useRef(grow);
  useLayoutEffect(() => {
    const card = el.current;
    if (!once.current || !card || still()) return;
    once.current = false;
    card.animate(
      [
        { transform: "scale(0.2)", opacity: 0 },
        { transform: "scale(1.03)", opacity: 1, offset: 0.65 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 520, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
    );
  }, []);
  const Icon = n.icon;
  return (
    <Link ref={el} href={n.href} className={`card nudge ${n.tone}`}>
      <span className="ic" aria-hidden="true">
        <Icon />
      </span>
      <span className="t">{n.text}</span>
      <ChevronRight className="chev" aria-hidden="true" />
    </Link>
  );
}
