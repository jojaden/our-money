"use client";

import { useState } from "react";
import { Plus, Pencil, Download } from "lucide-react";
import { ImportSheet } from "@/components/ImportSheet";
import type { Group, MonthItem } from "@/lib/types";
import { GROUP_LABEL, GROUP_ORDER, METHOD_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { goalProgress, groupTotals, incomeOf, itemsOf, lanes, monthRow, nameOf, ratioA, sum } from "@/lib/calc";
import { num } from "@/lib/format";
import { FirstRun, MonthHeader } from "@/components/MonthHeader";
import { Money, Who } from "@/components/ui";
import { PayFlow } from "@/components/PayFlow";
import { GoalBar } from "@/components/GoalBar";
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

  const pctOf = (v: number) => (income > 0 ? `${Math.round((v / income) * 100)}%` : "–");
  // 끝 금액이 있는 목표(적금·비상금)는 줄 안 막대 대신 아래 "모으는 목표" 카드로
  const goals = items.flatMap((i) => {
    const plan = i.plan_item_id ? data.plan_items.find((p) => p.id === i.plan_item_id) : undefined;
    const goal = plan ? goalProgress(data, plan) : null;
    return goal ? [{ item: i, ...goal }] : [];
  });

  const renderGroup = (g: Group) => {
    const rows = items.filter((i) => i.group === g);
    return (
      <section className={`group o${GROUP_ORDER.indexOf(g) + 3}`} key={g} aria-labelledby={`g-${g}`}>
        <div className="group-head">
          <h2 id={`g-${g}`}>
            <span className={`dot ${g}`} aria-hidden="true" />
            {GROUP_LABEL[g]}
          </h2>
          <span className="aside">
            <Money value={totals[g]} /> · {pctOf(totals[g])}
          </span>
        </div>
        <div className="card">
          {rows.length === 0 ? (
            <p className="empty">아직 항목이 없어요.</p>
          ) : (
            <div className="rows">
              {rows.map((i) => {
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
        </div>
      </section>
    );
  };

  return (
    <>
      <MonthHeader title={(l) => `${l} 플랜`}>
        <p className="finding">
          {income === 0 ? (
            "아직 이번 달 수입을 적지 않았어요."
          ) : left >= 0 ? (
            <>
              <span className="nw">
                수입 <Money value={income} /> 중 <strong>{pctOf(allocated)}</strong>를 나눴고
              </span>{" "}
              <span className="nw">
                <strong>
                  <Money value={left} />
                </strong>
                이 남아요.
              </span>
            </>
          ) : (
            <>
              수입보다{" "}
              <strong className="neg">
                <Money value={-left} />
              </strong>{" "}
              더 나눴어요.
            </>
          )}
        </p>
        {data.months.length > 1 && (
          <button type="button" className="btn secondary sm import-btn" onClick={() => setImportOpen(true)}>
            <Download aria-hidden="true" /> 다른 달에서 불러오기
          </button>
        )}
      </MonthHeader>

      <div className="grid">
        <div className="col span-7">
        <section className="group o1" aria-labelledby="flow-h">
          <div className="group-head">
            <h2 id="flow-h">월급이 나뉘는 곳</h2>
            <span className="aside">
              공동비용 {Math.round(rA * 100)} : {100 - Math.round(rA * 100)}
            </span>
          </div>
          <div className="card">
            <PayFlow lanes={ls} s={s} />
          </div>
        </section>
        {renderGroup("fixed")}
        {goals.length > 0 && (
          <section className="group o7" aria-labelledby="goals-h">
            <div className="group-head">
              <h2 id="goals-h">모으는 목표</h2>
            </div>
            <div className="stack">
              {goals.map((g) => (
                <GoalBar
                  key={g.item.id}
                  name={g.item.name}
                  desc={[accName(g.item.account_id), `매달 ${num(g.item.amount)}원`].filter(Boolean).join(" · ")}
                  saved={g.saved}
                  target={g.target}
                  onOpen={() => setSheet({ open: true, item: g.item })}
                />
              ))}
            </div>
          </section>
        )}
        </div>

        <div className="col span-5">
        <section className="group o2" aria-labelledby="income-h">
          <div className="group-head">
            <h2 id="income-h">수입</h2>
            <button type="button" className="aside head-btn" onClick={() => setIncomeOpen(true)}>
              <Pencil aria-hidden="true" /> 수정
            </button>
          </div>
          <div className="card">
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
