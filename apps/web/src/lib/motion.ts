/** CSS 최적화로 ms가 s로 바뀌어도 JS 애니메이션에는 밀리초로 전달한다. */
export function cssTimeMs(value: string, fallback: number): number {
  const time = value.trim();
  return parseFloat(time) * (time.endsWith("ms") ? 1 : 1000) || fallback;
}
