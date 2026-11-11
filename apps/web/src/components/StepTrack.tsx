/** 칸으로 나눠 그릴 수 있는 가장 많은 단계. 넘으면 진행 막대를 그리지 않는다 (docs/design-system/components/StepTrack) */
export const MAX_STEPS = 8;

/**
 * 칸 나눈 진행 막대 — 할 일 하나가 한 칸, 끝낸 수만큼 왼쪽부터 accent 로 채운다(Meter 와 같은 색·높이).
 * 칸 채움은 translateX 만 바꾸는 CSS 전환이라 레이아웃 없이 움직인다.
 */
export function StepTrack({ done, total }: { done: number; total: number }) {
  return (
    <div className="step-track" role="img" aria-label={`${total}건 중 ${done}건 끝남`}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < done ? "done" : undefined} />
      ))}
    </div>
  );
}
