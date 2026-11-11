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
 * items 는 중요한 순(맨 위가 가장 중요). 덜 중요한 것부터 차례로 도착해, 새 알림은 맨 위에 작은 점으로 떠서 카드로 커지고
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

/** 점 → 알약 → 카드. 모양은 clip-path 로만 바꿔 안의 글자가 늘어나 보이지 않게 하고, 글자는 카드가 거의 다 펴졌을 때 떠오른다 */
function NudgeCard({ n, grow }: { n: Nudge; grow: boolean }) {
  const el = useRef<HTMLAnchorElement>(null);
  const once = useRef(grow);
  useLayoutEffect(() => {
    const card = el.current;
    if (!once.current || !card || still()) return;
    once.current = false;
    const cs = getComputedStyle(card);
    const r = cs.borderTopLeftRadius || "24px";
    const dot = "inset(calc(50% - 6px) calc(50% - 6px) round 999px)";
    // 점이 톡 나타나 잠깐 머물고 → 옆으로 펴져 알약 → 아래위로 펴져 카드
    card.animate(
      [
        { clipPath: dot, transform: "scale(0.6)", opacity: 0 },
        { clipPath: dot, transform: "scale(1)", opacity: 1, offset: 0.14 },
        { clipPath: dot, transform: "scale(1)", offset: 0.26 },
        { clipPath: "inset(calc(50% - 22px) 0 round 999px)", transform: "scale(0.985)", offset: 0.58 },
        { clipPath: `inset(0 round ${r})`, transform: "none" },
      ],
      { duration: 820, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
    );
    // 점은 알림 색(빨강·주황·초록·회색)으로 보이다가 카드가 펴지며 카드 바탕으로 바뀐다
    card.querySelector(".nudge-dot")?.animate([{ opacity: 1 }, { opacity: 1, offset: 0.3 }, { opacity: 0, offset: 0.62 }, { opacity: 0 }], { duration: 820, easing: "ease-out" });
    for (const c of card.querySelectorAll(":scope > :not(.nudge-dot)")) {
      (c as HTMLElement).animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 240, delay: 560, easing: "ease-out", fill: "backwards" });
    }
  }, []);
  const Icon = n.icon;
  return (
    <Link ref={el} href={n.href} className={`card nudge ${n.tone}`}>
      <span className="nudge-dot" aria-hidden="true" />
      <span className="ic" aria-hidden="true">
        <Icon />
      </span>
      <span className="t">{n.text}</span>
      <ChevronRight className="chev" aria-hidden="true" />
    </Link>
  );
}
