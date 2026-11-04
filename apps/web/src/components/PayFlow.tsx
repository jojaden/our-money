"use client";

import { useEffect, useState } from "react";
import { nameOf, type Lane } from "@/lib/calc";
import { GROUP_LABEL, GROUP_ORDER, type Group, type Settings } from "@/lib/types";
import { num } from "@/lib/format";
import { Money, Who } from "./ui";

/**
 * 두 사람 월급의 흐름 (docs/design-system/components/PayFlow).
 * 한 사람에 이어 붙인 튜브 막대 하나. 두 막대는 같은 자(둘 중 큰 금액)로 재고,
 * 배분이 월급보다 많으면 덧붙인 빨간 조각 대신 월급 자리에 눈금을 긋는다.
 */
type Part = Group | "left";
const PARTS: Part[] = [...GROUP_ORDER, "left"];
const COLOR: Record<Part, string> = {
  fixed: "var(--g-fixed)",
  living: "var(--g-living)",
  allowance: "var(--g-allowance)",
  saving: "var(--g-saving)",
  left: "var(--g-left)",
};
const label = (p: Part) => (p === "left" ? "남음" : p === "living" ? "생활비" : GROUP_LABEL[p]);
const valueOf = (l: Lane, p: Part) => (p === "left" ? Math.max(0, l.left) : l.byGroup[p]);
const scaleOf = (lanes: Lane[]) => Math.max(1, ...lanes.map((l) => Math.max(l.income, l.allocated)));

/** 처음 한 번만 막대를 왼쪽에서 펼친다 (탭을 다시 열 때마다 되풀이하지 않음) */
let revealed = false;

export function FlowLanes({ lanes, s, picked = null, onPick }: { lanes: Lane[]; s: Settings; picked?: Part | null; onPick?: (p: Part) => void }) {
  const [shown, setShown] = useState(revealed);
  useEffect(() => {
    if (shown) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        revealed = true;
        setShown(true);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [shown]);
  const scale = scaleOf(lanes);
  return (
    <div className={`flow-lanes ${shown ? "shown" : ""} ${picked ? "focus" : ""}`}>
      {lanes.map((l) => {
        const name = nameOf(s, l.person);
        const parts = PARTS.map((p) => ({ p, v: valueOf(l, p) })).filter((x) => x.v > 0);
        return (
          <div className="flow-lane" key={l.person}>
            <div className="flow-who">
              <Who owner={l.person} s={s} size="sm" />
              <span className="name">{name}</span>
              <Money value={l.income} className="inc" />
            </div>
            <div className="flow-track">
              <div
                className="flow-bar"
                style={{ width: `${(Math.max(l.income, l.allocated) / scale) * 100}%` }}
                role="img"
                aria-label={`${name} 월급 ${num(l.income)}원: ${parts.map((x) => `${label(x.p)} ${num(x.v)}원`).join(", ")}${l.left < 0 ? `, 부족 ${num(-l.left)}원` : ""}`}
              >
                {parts.map((x) => (
                  <span
                    key={x.p}
                    className={`seg ${picked === x.p ? "on" : ""}`}
                    style={{ ["--k" as string]: COLOR[x.p], flexGrow: x.v }}
                    onClick={onPick ? () => onPick(x.p) : undefined}
                  />
                ))}
              </div>
              {l.allocated > l.income && <i className="flow-tick" style={{ left: `${(l.income / scale) * 100}%` }} aria-hidden="true" />}
            </div>
            <p className="flow-foot" aria-live="polite">
              {picked ? (
                <span>
                  <i style={{ ["--k" as string]: COLOR[picked] }} />
                  {label(picked)} <b>{num(valueOf(l, picked))}원</b>
                  {l.income > 0 && ` · 월급의 ${Math.round((valueOf(l, picked) / l.income) * 100)}%`}
                </span>
              ) : (
                <>
                  <span>
                    공동 부담 <b>{num(l.jointShare)}원</b>
                  </span>
                  <span>
                    {l.left >= 0 ? "남음" : "부족"} <b className={l.left < 0 ? "neg" : ""}>{num(Math.abs(l.left))}원</b>
                  </span>
                </>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** 홈 카드 본문: 막대 + 고르기 범례 + 자 설명. 범례나 조각을 누르면 그 버킷만 남고 아래 줄에 금액이 나온다 */
export function PayFlow({ lanes, s }: { lanes: Lane[]; s: Settings }) {
  const [picked, setPicked] = useState<Part | null>(null);
  const pick = (p: Part) => setPicked((cur) => (cur === p ? null : p));
  return (
    <>
      <FlowLanes lanes={lanes} s={s} picked={picked} onPick={pick} />
      <div className="flow-key" role="group" aria-label="버킷 골라 보기">
        {PARTS.map((p) => (
          <button key={p} type="button" aria-pressed={picked === p} onClick={() => pick(p)}>
            <i className={p} style={{ ["--k" as string]: COLOR[p] }} />
            {label(p)}
          </button>
        ))}
      </div>
      <p className="flow-note">막대 길이는 두 사람 중 큰 금액({num(scaleOf(lanes))}원)에 맞춰요</p>
    </>
  );
}
