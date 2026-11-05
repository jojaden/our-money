import { Money } from "./ui";

/** 한 화면에서 가장 중요한 소식 하나 — 제목, 금액, 한 줄 설명 (docs/design-system/components/HighlightCard) */
export function HighlightCard({ title, amount, note }: { title: string; amount: number; note: string }) {
  return (
    <section className="highlight" aria-label={title}>
      <h3>{title}</h3>
      <div className="reward">
        <b>
          <Money value={amount} animate />
        </b>
        <span>· {note}</span>
      </div>
    </section>
  );
}
