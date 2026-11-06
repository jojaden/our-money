import { flushSync } from "react-dom";
import { cssTimeMs } from "./motion";

/** 월 데이터 교체 전후를 불투명도로 잇는다. 마지막 요청만 반영한다. */
export function createMonthMotion() {
  let animations: Animation[] = [];
  let generation = 0;
  const cancel = () => {
    generation++;
    animations.forEach((a) => a.cancel());
    animations = [];
  };
  const run = async (update: () => void) => {
    const box = document.querySelector(".page-enter");
    const opacity = box ? getComputedStyle(box).opacity : "1";
    cancel();
    const request = generation;
    if (!box || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      update();
      return;
    }
    const css = getComputedStyle(document.documentElement);
    const duration = cssTimeMs(css.getPropertyValue("--dur-swap"), 260);
    const easing = css.getPropertyValue("--ease-out").trim() || "ease-out";
    animations = [box.animate([{ opacity }, { opacity: 0 }], { duration: duration / 2, easing, fill: "forwards" })];
    await Promise.all(animations.map((a) => a.finished.catch(() => {})));
    if (request !== generation) return;
    if (!box.isConnected) { cancel(); return; }
    flushSync(update);
    animations.forEach((a) => a.cancel());
    const next = document.querySelector(".page-enter");
    animations = next ? [next.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing })] : [];
  };
  return { run, cancel };
}
