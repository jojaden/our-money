"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Group, MonthItem, Person, Settings } from "@/lib/types";
import { GROUP_LABEL, GROUP_ORDER } from "@/lib/types";
import { nameOf, shareOf, type Lane } from "@/lib/calc";
import { num } from "@/lib/format";
import { Morph } from "./Morph";
import { Money, Seg } from "./ui";

type Bucket = Group | "left";
type Scope = "both" | Person;

/**
 * 월급이 나뉘는 곳 (docs/design-system/components/SplitBar) — 수입을 큰 숫자로, 남은 돈 한 줄, 그 아래 한 줄 쌓은 막대와 금액 목록.
 * 플랜 화면의 첫 카드라 화면 머리 대신 여기서 결론(남은 돈·나눈 비율)을 말한다.
 * 버킷 색은 이 막대와 목록 점에만 쓴다. 목록 줄을 누르면 그 조각만 남기고 나머지가 옅어지며, 줄 아래에 버킷 항목이 펼쳐진다.
 * 위 세그먼트로 두 사람·현빈·예진을 바꿔 본다.
 */
export function SplitBar({
  s,
  lanes,
  items,
  rA,
  onOpenItem,
}: {
  s: Settings;
  lanes: Lane[];
  items: MonthItem[];
  rA: number;
  onOpenItem: (item: MonthItem) => void;
}) {
  const [scope, setScope] = useState<Scope>("both");
  const [picked, setPicked] = useState<Bucket | null>(null);
  const [open, setOpen] = useState<Bucket | null>(null);

  const lane = scope === "both" ? null : lanes.find((l) => l.person === scope)!;
  const income = lane ? lane.income : lanes.reduce((a, l) => a + l.income, 0);
  const amountOf = (g: Group) => (lane ? lane.byGroup[g] : lanes.reduce((a, l) => a + l.byGroup[g], 0));
  const allocated = GROUP_ORDER.reduce((a, g) => a + amountOf(g), 0);
  const left = income - allocated;
  const rows: { key: Bucket; label: string; amount: number }[] = [
    ...GROUP_ORDER.map((g) => ({ key: g as Bucket, label: GROUP_LABEL[g], amount: amountOf(g) })),
    { key: "left", label: left < 0 ? "부족" : "남음", amount: left },
  ];
  // 배분이 수입보다 많으면 막대 한 줄은 배분 합계, 남음 조각은 그리지 않고 수입 자리에 눈금을 긋는다
  const base = Math.max(income, allocated);
  const pct = (v: number) => (base > 0 ? Math.round((Math.max(0, v) / base) * 100) : 0);
  const parts = rows.filter((r) => r.amount > 0);

  const changeScope = (v: Scope) => {
    setScope(v);
    setPicked(null);
    setOpen(null);
  };

  const detail = open && open !== "left" ? items.filter((i) => i.group === open).map((i) => ({ i, v: lane ? shareOf(i, lane.person, rA) : i.amount })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v) : [];

  return (
    <div className="split">
      <Seg label="누구 월급" value={scope} onChange={changeScope} options={[{ value: "both", label: "두 사람" }, { value: "a", label: nameOf(s, "a") }, { value: "b", label: nameOf(s, "b") }]} />
      <p className="split-total">
        <span className="hero-label">{lane ? `${nameOf(s, lane.person)} 수입` : "두 사람 수입"}</span>
        <span className="hero-amt">
          {num(income)}
          <small>원</small>
        </span>
      </p>
      <p className="split-sub">
        {income === 0 ? (
          "아직 이번 달 수입을 적지 않았어요."
        ) : left >= 0 ? (
          <>
            <b>{num(left)}원</b> 남았어요 · 수입의 {Math.round((allocated / income) * 100)}%를 나눴어요
          </>
        ) : (
          <>
            수입보다 <b className="neg">{num(-left)}원</b> 더 나눴어요
          </>
        )}
      </p>
      {/* 그림은 읽지 않는다 — 같은 내용을 아래 목록(이름·비율·금액)이 말한다 */}
      <div className="split-bar" aria-hidden="true">
        <div className="split-track">
          {base > 0 ? (
            parts.map((r) => <i key={r.key} className={`k-${r.key}${picked && picked !== r.key ? " dim" : ""}`} style={{ flexGrow: r.amount }} />)
          ) : (
            <i className="k-left" style={{ flexGrow: 1 }} />
          )}
        </div>
        {allocated > income && income > 0 && <i className="split-tick" style={{ left: `${(income / allocated) * 100}%` }} />}
      </div>

      {/* 이름을 누르면 항목이 차례로 떠오르고 아래 이름은 미끄러져 내려간다 (Morph). 누구 월급을 바꿔도 같은 박자 */}
      <Morph track=".split-legend > li, .split-detail, .split-detail > li">
      <ul className="split-legend">
        {rows.map((r) => {
          const expandable = r.key !== "left" && r.amount > 0;
          return (
            <li key={r.key}>
              <button
                type="button"
                className={`split-row ${picked === r.key ? "on" : ""}`}
                aria-expanded={expandable ? open === r.key : undefined}
                aria-pressed={expandable ? undefined : picked === r.key}
                onClick={() => {
                  if (expandable) {
                    const next = open === r.key ? null : r.key;
                    setOpen(next);
                    setPicked(next);
                  } else setPicked((p) => (p === r.key ? null : r.key));
                }}
              >
                <i className={`dot k-${r.key}`} aria-hidden="true" />
                <span className="n">
                  {r.label} <span className="p">{r.amount < 0 ? "" : `${pct(r.amount)}%`}</span>
                </span>
                <Money value={r.amount} className={r.amount < 0 ? "neg" : ""} />
                {expandable ? <ChevronDown className="chev" aria-hidden="true" /> : <span className="chev" aria-hidden="true" />}
              </button>
              {open === r.key && expandable && (
                <ul className="split-detail">
                  {detail.map(({ i, v }) => (
                    <li key={i.id}>
                      <button type="button" onClick={() => onOpenItem(i)}>
                        <span className="n">
                          {i.name}
                          <span className="s">{i.payer === "joint" ? (lane ? `공동 · ${nameOf(s, lane.person)} 몫` : "공동") : nameOf(s, i.payer)}</span>
                        </span>
                        <Money value={v} />
                      </button>
                    </li>
                  ))}
                  {detail.length === 0 && <li className="none">이 사람 몫으로 나가는 항목이 없어요.</li>}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      </Morph>
      <p className="split-note">
        {lane ? `${nameOf(s, lane.person)} 공동 부담 ${num(lane.jointShare)}원` : `공동비용은 ${Math.round(rA * 100)} : ${100 - Math.round(rA * 100)}로 나눠요`}
      </p>
    </div>
  );
}
