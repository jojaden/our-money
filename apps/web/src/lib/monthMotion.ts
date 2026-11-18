import { flushSync } from "react-dom";
import { cssTimeMs } from "./motion";

/**
 * 달을 넘길 때 움직이는 것 — 머리(.page-head)는 제자리에 두고 그 아래 내용만.
 * 화면이 [data-month-slide] 로 따로 정해 두면 그것만 (달력: 요일 줄은 두고 날짜 칸만).
 * 손가락 끌기(Shell 의 PageMotion)와 넘기기 모션이 같은 대상을 쓴다.
 */
export function monthTargets(box: Element | null): HTMLElement[] {
  if (!box) return [];
  const marked = box.querySelectorAll<HTMLElement>("[data-month-slide]");
  if (marked.length) return [...marked];
  return ([...box.children] as HTMLElement[]).filter((c) => !c.classList.contains("page-head"));
}

/**
 * 달 교체: 지금 내용이 넘기는 쪽으로 빠지며 옅어짐 → 교체 → 새 내용이 반대쪽에서 밀려 들어옴 (transform·opacity 만).
 * dir 1 = 다음 달(왼쪽으로 빠지고 오른쪽에서 들어옴), -1 = 지난달, 0 = 제자리에서 옅어졌다 나타남. 마지막 요청만 반영한다.
 * 손가락으로 끌던 중이면 그 자리(인라인 transform)에서 이어서 빠진다.
 */
export function createMonthMotion() {
  let animations: Animation[] = [];
  let generation = 0;
  const cancel = () => {
    generation++;
    animations.forEach((a) => a.cancel());
    animations = [];
  };
  const run = async (update: () => void, dir: -1 | 0 | 1) => {
    const box = document.querySelector(".page-enter");
    const olds = monthTargets(box);
    // 끌던 자리·빠지던 자리에서 이어 가려고 취소 전에 읽는다
    const from = olds.map((el) => {
      const cs = getComputedStyle(el);
      return { transform: cs.transform === "none" ? "translateX(0)" : cs.transform, opacity: cs.opacity };
    });
    cancel();
    const request = generation;
    if (!box || !olds.length || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      update();
      return;
    }
    const css = getComputedStyle(document.documentElement);
    const duration = cssTimeMs(css.getPropertyValue("--dur-swap"), 260);
    const easing = css.getPropertyValue("--ease-out").trim() || "ease-out";
    const shift = Math.min(120, (box as HTMLElement).offsetWidth * 0.3) * dir;
    animations = olds.map((el, i) =>
      el.animate([from[i], { transform: `translateX(${-shift}px)`, opacity: 0 }], { duration: duration / 2, easing: "ease-in", fill: "forwards" }),
    );
    await Promise.all(animations.map((a) => a.finished.catch(() => {})));
    if (request !== generation) return;
    if (!box.isConnected) { cancel(); return; }
    flushSync(update);
    animations.forEach((a) => a.cancel());
    animations = monthTargets(document.querySelector(".page-enter")).map((el) =>
      el.animate([{ transform: `translateX(${shift}px)`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], { duration, easing }),
    );
  };
  return { run, cancel };
}
