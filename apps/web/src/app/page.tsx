"use client";

import Link from "next/link";
import { useData } from "@/lib/store";
import type { Spending } from "@/lib/types";
import { allowanceStatus, cardBills, itemsOf, lanes, livingStatus, monthRow, nameOf, spendingsIn } from "@/lib/calc";
import { PAY_KIND_LABEL } from "@/lib/types";
import { iga, num, ro } from "@/lib/format";
import { FirstRun, MonthHeader } from "@/components/MonthHeader";
import { CategoryIcon, LaneBar, LaneKey, Money, Ring } from "@/components/ui";
import { spendingVisual } from "@/lib/categories";
import { isFresh } from "@/lib/fresh";
import { BudgetCard } from "@/components/BudgetCard";
import { byUrgency, dueState, useTasks } from "@/components/tasks";
import { TaskRow } from "@/components/TaskRow";
import { useSheets } from "@/components/Shell";

export default function Home() {
  const { data, month, today, me } = useData();
  const { tasks, started } = useTasks(month);
  const { openSpending } = useSheets();
  const s = data.settings;

  if (!started) {
    return (
      <>
        <MonthHeader />
        <FirstRun />
      </>
    );
  }

  const m = monthRow(data, month);
  const items = itemsOf(data, month);
  const living = livingStatus(data, month, today);
  const allowance = allowanceStatus(data, month, me, today);
  const ls = lanes(s, m, items);
  const scale = Math.max(...ls.map((l) => Math.max(l.income, l.allocated)), 1);
  const open = tasks.filter((t) => !t.done).sort(byUrgency);
  const doneCount = tasks.length - open.length;
  const overdue = open.filter((t) => dueState(t.due, today, false) === "overdue");
  const pendingTransfers = open.filter((t) => t.kind === "transfer");
  const bills = cardBills(data, month).filter((b) => b.dueAmount > 0 || b.usingAmount > 0);
  const recent = spendingsIn(data, month).slice(0, 4);
  const catName = (id: string | null, owner: Spending["owner"] = "joint") =>
    data.categories.find((c) => c.id === id)?.name ?? (owner === "joint" ? "미분류" : `${nameOf(s, owner)} 용돈`);
  const accName = (id: string | null) => data.accounts.find((a) => a.id === id)?.name;

  // 이번 달에 가장 먼저 알아야 할 것 한 줄
  let finding: React.ReactNode;
  if (overdue.length > 0) {
    finding = (
      <>
        <strong>{overdue[0].kind === "transfer" ? `${ro(overdue[0].to ?? "")} 옮길 돈` : overdue[0].title}</strong>
        {overdue.length > 1 ? ` 외 ${overdue.length - 1}건이` : iga(overdue[0].kind === "transfer" ? "돈" : overdue[0].title).slice(-1)} 기한을 넘겼어요.
      </>
    );
  } else if (pendingTransfers.length > 0) {
    finding = (
      <>
        <span className="nw">
          옮길 돈 <strong>{pendingTransfers.length}건</strong>이 남았어요
        </span>{" "}
        <span className="nw clause">
          <span className="sep">· </span><Money value={pendingTransfers.reduce((a, t) => a + t.amount, 0)} />
        </span>
      </>
    );
  } else if (open.length === 0 && tasks.length > 0) {
    finding = <>이번 달 이체와 납부를 모두 마쳤어요.</>;
  } else if (living.pace !== null && living.spent > living.pace) {
    finding = (
      <>
        생활비가 예상보다 <strong>{num(living.spent - living.pace)}원</strong> 빨리 나가고 있어요.
      </>
    );
  } else {
    finding = (
      <>
        남은 할 일 <strong>{open.length}건</strong>
      </>
    );
  }

  return (
    <>
      <MonthHeader>
        <p className="finding">{finding}</p>
      </MonthHeader>

      <div className="grid">
        <div className="col span-7">
          <BudgetCard id="living-h" className="o1" title="남은 공동 생활비" status={living} link={{ href: "/ledger", label: "가계부" }} />

          <BudgetCard
            id="allow-h"
            className="o2"
            compact
            title={`${nameOf(s, me)} 용돈`}
            status={allowance}
            color="var(--g-allowance)"
            link={{ href: "/plan", label: "플랜" }}
            empty={<>플랜에 {nameOf(s, me)} 용돈 항목이 없어요. 플랜 → 용돈 추가에서 금액을 정하면 내 지출이 여기서 빠져요.</>}
          />


          <section className="card o4" aria-labelledby="cards-h">
            <div className="card-head">
              <h2 id="cards-h">카드값</h2>
              <span className="aside">이번 달 결제 · 다음 달 예정</span>
            </div>
            {bills.length === 0 ? (
              <p className="empty">이번 달에 결제할 카드값이 없어요.</p>
            ) : (
              <div className="rows">
                {bills.map((b) => (
                  <div className="row" key={b.card.id}>
                    <span className={`tile card-${b.card.owner}`} aria-hidden="true">
                      {b.card.institution.slice(0, 2)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="t">{b.card.name}</div>
                      <div className="s">
                        {b.dueDate ? `${Number(b.dueDate.slice(5, 7))}/${Number(b.dueDate.slice(8))} 결제` : "결제일 미지정"}
                        {b.billing ? ` · ${b.billing.name}` : ""}
                      </div>
                    </div>
                    <div className="r">
                      <Money value={b.dueAmount} />
                      <div className="s">
                        쓰는 중 <Money value={b.usingAmount} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="col span-5">
          <section className="card o3" aria-labelledby="todo-h">
            <div className="card-head">
              <h2 id="todo-h">이번 달 할 일</h2>
              <Link className="aside" href="/check">
                체크
              </Link>
            </div>
            <div className="todo-progress">
              <Ring
                value={doneCount}
                max={Math.max(1, tasks.length)}
                size={64}
                stroke={9}
                color="var(--accent)"
                label={`${tasks.length}건 중 ${doneCount}건 완료`}
                center={<b className="num">{tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0}%</b>}
              />
              <div>
                <div className="big num">
                  {doneCount}
                  <span> / {tasks.length} 완료</span>
                </div>
                <div className="sub">
                  {overdue.length > 0 ? <span className="neg">기한 지난 일 {overdue.length}건</span> : open.length > 0 ? `남은 일 ${open.length}건` : "모두 마쳤어요"}
                  {overdue.length > 0 && open.length > overdue.length ? ` · 남은 일 ${open.length}건` : ""}
                </div>
              </div>
            </div>
            {open.length === 0 ? (
              <p className="empty">남은 이체·납부가 없어요.</p>
            ) : (
              <div className="rows" style={{ ["--inset" as string]: "40px" }}>
                {open.slice(0, 6).map((t) => (
                  <TaskRow key={t.key} task={t} />
                ))}
              </div>
            )}
            <div className="card-foot">
              <span className="kpi-sub" style={{ margin: 0 }}>
                {open.length > 6 ? `외 ${open.length - 6}건` : ""}
              </span>
              <Link href="/check" className="btn secondary sm">
                전체 체크리스트
              </Link>
            </div>
          </section>

          <section className="card o6" aria-labelledby="recent-h">
            <div className="card-head">
              <h2 id="recent-h">최근 기록</h2>
              <Link className="aside" href="/ledger">
                전체 보기
              </Link>
            </div>
            {recent.length === 0 ? (
              <p className="empty">이번 달 기록이 아직 없어요. 오른쪽 아래 ‘지출 기록’으로 시작하세요.</p>
            ) : (
              <div className="rows">
                {recent.map((r) => (
                  <button type="button" className={`row ${isFresh(r) ? "fresh" : ""}`} key={r.id} onClick={() => openSpending(r)}>
                    <CategoryIcon visual={spendingVisual(data, r)} />
                    <div style={{ minWidth: 0 }}>
                      <div className="t">{r.memo || catName(r.category_id, r.owner)}</div>
                      <div className="s">
                        {catName(r.category_id, r.owner)} · {PAY_KIND_LABEL[r.pay_kind]}
                        {accName(r.account_id) && r.pay_kind === "card" ? ` · ${accName(r.account_id)}` : ""}
                      </div>
                    </div>
                    <div className="r">
                      <Money value={r.amount} />
                      <div className="s">{Number(r.date.slice(5, 7))}/{Number(r.date.slice(8))}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="card o5 span-12" aria-labelledby="lanes-h">
          <div className="card-head">
            <h2 id="lanes-h">두 사람 월급의 흐름</h2>
            <Link className="aside" href="/plan">
              플랜 보기
            </Link>
          </div>
          <div className="lanes-grid">
            {ls.map((l) => (
              <LaneBar key={l.person} lane={l} s={s} scale={scale} />
            ))}
          </div>
          <LaneKey />
        </section>
      </div>
    </>
  );
}
