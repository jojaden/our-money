/** CSS 최적화로 ms가 s로 바뀌어도 JS 애니메이션에는 밀리초로 전달한다. */
/** 달 교체 중(monthMotion 이 새 달을 그리는 그리기) — Morph 가 이 바뀜을 칸 넣고 빼기로 움직이지 않게 */
export const monthSwap = { now: false };

export function cssTimeMs(value: string, fallback: number): number {
  const time = value.trim();
  return parseFloat(time) * (time.endsWith("ms") ? 1 : 1000) || fallback;
}
