"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Pencil, Download } from "lucide-react";
import { ImportSheet } from "@/components/ImportSheet";
import type { Group, MonthItem, PlanItem } from "@/lib/types";
import { GROUP_LABEL, METHOD_LABEL } from "@/lib/types";
import { blankMonth, useData } from "@/lib/store";
import { goalProgress, groupTotals, incomeOf, itemsOf, lanes, monthRow, nameOf, ratioA } from "@/lib/calc";
import { monthLabel, num } from "@/lib/format";
import { FirstRun, MonthHeader } from "@/components/MonthHeader";
import { Money, Who } from "@/components/ui";
import { SplitBar } from "@/components/SplitBar";
import { GoalBar } from "@/components/GoalBar";
import { Arrange, Slot } from "@/components/Arrange";

/** 플랜에서 옮길 수 있는 카드와 처음 순서 (폰) */
const PLAN_CARDS = ["flow", "income", "fixed", "living", "allowance", "saving", "goals", "import"];
import { Morph } from "@/components/Morph";
import { useMatch } from "@/lib/media";
import { IncomeSheet, ItemSheet } from "@/components/ItemSheet";

export default function PlanPage() {
  const { data, month } = useData();
  const s = data.settings;
  // 아직 시작하지 않은 달도 빈 플랜을 그대로 보여 준다 (항목·월급을 처음 저장하면 그 달이 생긴다)
  const saved = monthRow(data, month);
  const m = saved ?? blankMonth(data, month);
  const [sheet, setSheet] = useState<{ open: boolean; item?: MonthItem; group?: Group }>({ open: false });
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // 폰에서 펼친 묶음 (처음엔 모두 접어 이름 몇 개만 보인다. 데스크톱은 CSS 가 늘 펼친다)
  const [unfolded, setUnfolded] = useState<Group[]>([]);
  // 폰(한 줄 화면)에서만 세 줄 넘는 묶음을 접는다
  const narrow = useMatch("(max-width: 1023px)");

  const items = itemsOf(data, month);
  const totals = groupTotals(items);
  const income = incomeOf(m);
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
    // 두 줄 이하는 접어도 줄어들지 않으니 그대로 둔다
    const open = rows.length <= 2 || unfolded.includes(g) || !narrow;
    const preview = rows.slice(0, 3).map((i) => i.name).join(" · ") + (rows.length > 3 ? ` 외 ${rows.length - 3}개` : "");
    return (
      <section className="group" aria-labelledby={`g-${g}`}>
        <div className="group-head">
          <h2 id={`g-${g}`}>
            <span className={`dot ${g}`} aria-hidden="true" />
            {GROUP_LABEL[g]}
          </h2>
          <span className="aside head-tail">
            <span>
              <Money value={totals[g]} /> · {pctOf(totals[g])}
            </span>
            <button type="button" className="head-add" aria-label={`${GROUP_LABEL[g]} 추가`} onClick={() => setSheet({ open: true, group: g })}>
              <Plus aria-hidden="true" />
            </button>
          </span>
        </div>
        {/* 펼치기·접기: 줄이 차례로 떠오르고 상자 높이가 따라간다 (Morph). 접는 것은 폰만 — 데스크톱은 늘 펼침 */}
        <Morph className="card" track=":scope > *, .rows > *" follow>
          {rows.length === 0 ? (
            <p className="empty">아직 항목이 없어요. 위 +로 더해요.</p>
          ) : (
            <>
            {rows.length > 2 && (
            <button
              type="button"
              className="fold-row plan-fold"
              aria-expanded={open}
              onClick={() => setUnfolded((u) => (open ? u.filter((x) => x !== g) : [...u, g]))}
            >
              <span className="fold-t">{open ? `항목 ${rows.length}개` : preview}</span>
              <span className="fold-a">
                {open ? "접기" : "펼치기"}
                <ChevronDown aria-hidden="true" />
              </span>
            </button>
            )}
            {open && (
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
                        {!i.plan_item_id ? " · 이번 달만" : periodText(data.plan_items.find((p) => p.id === i.plan_item_id))}
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
            </>
          )}
        </Morph>
      </section>
    );
  };

  return (
    <>
      <MonthHeader name="플랜" />

      {!saved && <FirstRun inPlan />}

      {/* 폰에서는 카드를 꾹 눌러 옮긴다 */}
      <Arrange page="plan" defaults={PLAN_CARDS}>
        <div className="col span-7">
        <Slot k="flow">
          <section className="group" aria-labelledby="flow-h">
            <div className="group-head">
              <h2 id="flow-h">월급이 나뉘는 곳</h2>
              <span className="aside">
                공동비용 {Math.round(rA * 100)} : {100 - Math.round(rA * 100)}
              </span>
            </div>
            <div className="card">
              <SplitBar s={s} lanes={ls} items={items} rA={rA} onOpenItem={(item) => setSheet({ open: true, item })} />
            </div>
          </section>
        </Slot>
        <Slot k="fixed">{renderGroup("fixed")}</Slot>
        {goals.length > 0 && (
          <Slot k="goals">
            <section className="group" aria-labelledby="goals-h">
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
          </Slot>
        )}
        {saved && data.months.length > 1 && (
          <Slot k="import">
            <button type="button" className="card import-row" onClick={() => setImportOpen(true)}>
              <Download aria-hidden="true" />
              <span>
                <strong>다른 달에서 항목 가져오기</strong>
                <small>지운 항목을 되살리거나 예전 달 항목을 다시 넣어요</small>
              </span>
              <ChevronRight aria-hidden="true" className="chev" />
            </button>
          </Slot>
        )}
        </div>

        <div className="col span-5">
        <Slot k="income">
          <section className="group" aria-labelledby="income-h">
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
        </Slot>
        <Slot k="living">{renderGroup("living")}</Slot>
        <Slot k="allowance">{renderGroup("allowance")}</Slot>
        <Slot k="saving">{renderGroup("saving")}</Slot>
        </div>
      </Arrange>

      <ItemSheet open={sheet.open} item={sheet.item} group={sheet.group} onOpenChange={(open) => setSheet((x) => ({ ...x, open }))} />
      <IncomeSheet open={incomeOpen} onOpenChange={setIncomeOpen} />
      <ImportSheet open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}

/** 플랜 항목의 기간 — " · 3월~8월", " · 12월까지", " · 3월부터" (정하지 않았으면 빈 글) */
function periodText(p: PlanItem | undefined): string {
  if (!p || (!p.start_month && !p.end_month)) return "";
  if (p.start_month && p.end_month) return ` · ${monthLabel(p.start_month)}~${monthLabel(p.end_month)}`;
  return p.end_month ? ` · ${monthLabel(p.end_month)}까지` : ` · ${monthLabel(p.start_month!)}부터`;
}
