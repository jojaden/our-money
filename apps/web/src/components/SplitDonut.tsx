"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Group, MonthItem, Person, Settings } from "@/lib/types";
import { GROUP_LABEL, GROUP_ORDER } from "@/lib/types";
import { nameOf, shareOf, type Lane } from "@/lib/calc";
import { num } from "@/lib/format";
import { Money, Seg } from "./ui";

type Bucket = Group | "left";
type Scope = "both" | Person;

const SIZE = 240;
const C = SIZE / 2;
const R = 84;
const W = 34;
const POP = 8;
const GAP = 2.5;
const CIRC = 2 * Math.PI * R;

/**
 * 월급이 나뉘는 곳 — 원형 그래프 (토스·뱅크샐러드 소비 분석처럼).
 * 조각을 누르면 그 조각이 바깥으로 튀어나오며 "고정비 30%" 말풍선이 뜨고,
 * 아래 이름 줄을 누르면 그 아래에 버킷의 항목이 펼쳐진다. 위 세그먼트로 두 사람·현빈·예진을 바꿔 본다.
 */
export function SplitDonut({
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
  // 배분이 수입보다 많으면 원 한 바퀴는 배분 합계, 남음 조각은 그리지 않는다
  const base = Math.max(income, allocated);
  const pct = (v: number) => (base > 0 ? Math.round((Math.max(0, v) / base) * 100) : 0);

  let at = 0;
  const arcs = rows
    .filter((r) => r.amount > 0)
    .map((r) => {
      const f = r.amount / base;
      const start = at;
      at += f;
      const mid = (start + f / 2) * 2 * Math.PI - Math.PI / 2;
      return { ...r, f, start, mid };
    });
  const sel = arcs.find((a) => a.key === picked) ?? null;
  const selRow = rows.find((r) => r.key === picked) ?? null;

  const toggle = (k: Bucket) => setPicked((p) => (p === k ? null : k));
  const changeScope = (v: Scope) => {
    setScope(v);
    setPicked(null);
    setOpen(null);
  };

  const detail = open && open !== "left" ? items.filter((i) => i.group === open).map((i) => ({ i, v: lane ? shareOf(i, lane.person, rA) : i.amount })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v) : [];

  return (
    <div className="donut-wrap">
      <Seg label="누구 월급" value={scope} onChange={changeScope} options={[{ value: "both", label: "두 사람" }, { value: "a", label: nameOf(s, "a") }, { value: "b", label: nameOf(s, "b") }]} />
      <div className="donut-stage">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="donut" aria-hidden="true">
          {base > 0 ? (
            arcs.map((a) => {
              const len = Math.max(0.5, a.f * CIRC - (arcs.length > 1 ? GAP : 0));
              const on = picked === a.key;
              return (
                <g
                  key={a.key}
                  className={`donut-seg ${on ? "on" : ""} ${picked && !on ? "dim" : ""}`}
                  style={{ transform: on ? `translate(${(Math.cos(a.mid) * POP).toFixed(2)}px, ${(Math.sin(a.mid) * POP).toFixed(2)}px)` : undefined }}
                  onClick={() => toggle(a.key)}
                >
                  <circle
                    cx={C}
                    cy={C}
                    r={R}
                    className={`k-${a.key}`}
                    strokeWidth={on ? W + 8 : W}
                    strokeDasharray={`${len} ${CIRC}`}
                    strokeDashoffset={-a.start * CIRC}
                    transform={`rotate(-90 ${C} ${C})`}
                  />
                </g>
              );
            })
          ) : (
            <circle cx={C} cy={C} r={R} className="k-empty" strokeWidth={W} />
          )}
        </svg>
        <div className="donut-center" aria-live="polite">
          {selRow ? (
            <>
              <span className="l">{selRow.label}</span>
              <Money value={Math.abs(selRow.amount)} className={selRow.amount < 0 ? "neg" : ""} />
            </>
          ) : (
            <>
              <span className="l">{lane ? `${nameOf(s, lane.person)} 수입` : "두 사람 수입"}</span>
              <Money value={income} />
            </>
          )}
        </div>
        {sel && (
          <span
            key={`${scope}-${sel.key}`}
            className={`donut-tip k-${sel.key}`}
            style={{ left: `${((C + Math.cos(sel.mid) * (R + W / 2 + 22)) / SIZE) * 100}%`, top: `${((C + Math.sin(sel.mid) * (R + W / 2 + 22)) / SIZE) * 100}%` }}
            aria-hidden="true"
          >
            {sel.label} <b>{pct(sel.amount)}%</b>
          </span>
        )}
      </div>

      <ul className="donut-legend">
        {rows.map((r) => {
          const expandable = r.key !== "left" && r.amount > 0;
          return (
            <li key={r.key}>
              <button
                type="button"
                className={`donut-row ${picked === r.key ? "on" : ""}`}
                aria-expanded={expandable ? open === r.key : undefined}
                aria-pressed={expandable ? undefined : picked === r.key}
                onClick={() => {
                  setPicked(r.key);
                  if (expandable) setOpen((o) => (o === r.key ? null : r.key));
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
                <ul className="donut-detail">
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
      <p className="donut-note">
        {lane ? `${nameOf(s, lane.person)} 공동 부담 ${num(lane.jointShare)}원` : `공동비용은 ${Math.round(rA * 100)} : ${100 - Math.round(rA * 100)}로 나눠요`}
      </p>
    </div>
  );
}
