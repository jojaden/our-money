"use client";

import { useState } from "react";
import { Plus, Pencil, Download } from "lucide-react";
import { ImportSheet } from "@/components/ImportSheet";
import type { Group, MonthItem } from "@/lib/types";
import { GROUP_LABEL, GROUP_ORDER, METHOD_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { goalProgress, groupTotals, incomeOf, itemsOf, lanes, monthRow, nameOf, ratioA, sum } from "@/lib/calc";
import { num, short } from "@/lib/format";
import { FirstRun, MonthHeader } from "@/components/MonthHeader";
import { GroupLegend, Money, ThinTrack, Who } from "@/components/ui";
import { FlowLanes } from "@/components/PayFlow";
import { Summary } from "@/components/Summary";
import { IncomeSheet, ItemSheet } from "@/components/ItemSheet";

export default function PlanPage() {
  const { data, month } = useData();
  const s = data.settings;
  const m = monthRow(data, month);
  const [sheet, setSheet] = useState<{ open: boolean; item?: MonthItem; group?: Group }>({ open: false });
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  if (!m) {
    return (
      <>
        <MonthHeader title={(l) => `${l} 플랜`} />
        <FirstRun />
      </>
    );
  }

  const items = itemsOf(data, month);
  const totals = groupTotals(items);
  const income = incomeOf(m);
  const allocated = sum(GROUP_ORDER, (g) => totals[g]);
  const left = income - allocated;
  const ls = lanes(s, m, items);
  const rA = ratioA(s, m);
  const accName = (id: string | null) => (id ? data.accounts.find((a) => a.id === id)?.name ?? "삭제된 계좌" : null);

  const renderGroup = (g: Group) => {
          const rows = items.filter((i) => i.group === g);
          return (
            <section className={`card o${GROUP_ORDER.indexOf(g) + 3}`} key={g} aria-labelledby={`g-${g}`}>
              <div className="card-head">
                <h2 id={`g-${g}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`dot ${g}`} style={{ width: 10, height: 10, borderRadius: 3, display: "inline-block" }} aria-hidden="true" />
                  {GROUP_LABEL[g]}
                </h2>
                <span className="aside">
                  <Money value={totals[g]} />
                </span>
              </div>
              {rows.length === 0 ? (
                <p className="empty">아직 항목이 없어요.</p>
              ) : (
                <div className="rows">
                  {rows.map((i) => {
                    const plan = i.plan_item_id ? data.plan_items.find((p) => p.id === i.plan_item_id) : undefined;
                    const goal = plan ? goalProgress(data, plan) : null;
                    const where = i.method === "card_auto" ? accName(i.card_id) : accName(i.account_id);
                    return (
                      <button type="button" className="row" key={i.id} onClick={() => setSheet({ open: true, item: i })}>
                        <Who owner={i.payer} s={s} size="sm" />
                        <div style={{ minWidth: 0 }}>
                          <div className="t">{i.name}</div>
                          <div className="s">
                            {[i.due_day ? `${i.due_day}일` : null, METHOD_LABEL[i.method], where].filter(Boolean).join(" · ")}
                            {!i.plan_item_id ? " · 이번 달만" : ""}
                          </div>
                          {goal && (
                            <div style={{ marginTop: 8 }}>
                              <ThinTrack value={goal.saved} max={goal.target} />
                              <div className="s" style={{ marginTop: 4 }}>
                                {short(goal.saved)} / {short(goal.target)} · {Math.floor((goal.saved / goal.target) * 100)}%
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="r">
                          <Money value={i.amount} />
                          {i.payer === "joint" && <div className="s split-note">각자 {num(Math.round(i.amount * rA))} / {num(i.amount - Math.round(i.amount * rA))}</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="card-foot">
                <button type="button" className="btn ghost" onClick={() => setSheet({ open: true, group: g })}>
                  <Plus aria-hidden="true" /> {GROUP_LABEL[g]} 추가
                </button>
              </div>
            </section>
          );
  };

  return (
    <>
      <MonthHeader title={(l) => `${l} 플랜`} />
      <Summary
        label="이번 달 두 사람 수입"
        value={income}
        stats={[
          { label: "배분", value: <Money value={allocated} />, note: income > 0 ? `${Math.round((allocated / income) * 100)}%` : undefined },
          {
            label: left >= 0 ? "남는 돈" : "초과 배분",
            value: <Money value={Math.abs(left)} className={left < 0 ? "neg" : ""} />,
          },
          {
            label: "저축률",
            value: income > 0 ? `${Math.round((totals.saving / income) * 100)}%` : "–",
            note: <Money value={totals.saving} />,
          },
        ]}
      />
      {data.months.length > 1 && (
        <div style={{ margin: "-8px 0 20px" }}>
          <button type="button" className="btn secondary sm" onClick={() => setImportOpen(true)}>
            <Download aria-hidden="true" /> 다른 달에서 불러오기
          </button>
        </div>
      )}

      <div className="grid">
        <div className="col span-7">
        <section className="card o1" aria-labelledby="flow-h">
          <div className="card-head">
            <h2 id="flow-h">월급이 나뉘는 곳</h2>
            <span className="aside">
              공동비용 {Math.round(rA * 100)} : {100 - Math.round(rA * 100)}
            </span>
          </div>
          <FlowLanes lanes={ls} s={s} />
          <GroupLegend totals={totals} income={income} />
        </section>
        {renderGroup("fixed")}
        </div>

        <div className="col span-5">
        <section className="card o2" aria-labelledby="income-h">
          <div className="card-head">
            <h2 id="income-h">수입 내역</h2>
            <button type="button" className="btn ghost" onClick={() => setIncomeOpen(true)}>
              <Pencil aria-hidden="true" /> 수정
            </button>
          </div>
          <div className="rows">
            {(["a", "b"] as const).map((p) => (
              <div className="row" key={p}>
                <Who owner={p} s={s} />
                <div>
                  <div className="t">{nameOf(s, p)} 월급</div>
                  <div className="s">{accName(p === "a" ? s.salary_account_a : s.salary_account_b) ?? "월급통장 미지정"}</div>
                </div>
                <div className="r">
                  <Money value={p === "a" ? m.income_a : m.income_b} />
                </div>
              </div>
            ))}
            <div className="row no-lead">
              <div>
                <div className="t">기타 수입</div>
                <div className="s">{m.extra_note || "상여금·부수입 등"}</div>
              </div>
              <div className="r">
                <Money value={m.extra_income} />
              </div>
            </div>
          </div>
        </section>
        {renderGroup("living")}
        {renderGroup("allowance")}
        {renderGroup("saving")}
        </div>

      </div>

      <ItemSheet open={sheet.open} item={sheet.item} group={sheet.group} onOpenChange={(open) => setSheet((x) => ({ ...x, open }))} />
      <IncomeSheet open={incomeOpen} onOpenChange={setIncomeOpen} />
      <ImportSheet open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}
