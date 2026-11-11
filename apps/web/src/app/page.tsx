"use client";

import Link from "next/link";
import { ArrowRightLeft, Banknote, CalendarClock, CircleAlert, CircleCheck, CircleHelp, TrendingUp } from "lucide-react";
import { useData } from "@/lib/store";
import type { Spending } from "@/lib/types";
import { allowanceStatus, cardBills, livingStatus, nameOf, spendingsIn } from "@/lib/calc";
import { PAY_KIND_LABEL } from "@/lib/types";
import { iga, num, ro } from "@/lib/format";
import { FirstRun, MonthHeader } from "@/components/MonthHeader";
import { CategoryIcon, Money } from "@/components/ui";
import { spendingVisual } from "@/lib/categories";
import { isFresh } from "@/lib/fresh";
import { BudgetCard, TaskMeter } from "@/components/BudgetCard";
import { asking, byUrgency, dueState, useTasks, waiting } from "@/components/tasks";
import { dDay, shortDate } from "@/lib/format";
import { TaskRow } from "@/components/TaskRow";
import { MiniCard } from "@/components/pass";
import { usePrimaryAction, useSheets } from "@/components/Shell";
import { ClosePrompt } from "@/components/ClosePrompt";
import { Morph } from "@/components/Morph";
import { Nudges, type Nudge } from "@/components/Nudges";

/** 홈에 보이는 할 일 수 — 급한 순으로 이만큼만, 나머지는 체크 화면에서 */
const HOME_TODOS = 3;

export default function Home() {
  const { data, month, today, me } = useData();
  const { tasks, paydays, started } = useTasks(month);
  const { openSpending } = useSheets();
  usePrimaryAction("지출 기록", "spending", () => openSpending());
  const s = data.settings;

  if (!started) {
    return (
      <>
        <MonthHeader />
        <FirstRun />
      </>
    );
  }

  const living = livingStatus(data, month, today);
  const allowance = allowanceStatus(data, month, me, today);
  const open = tasks.filter((t) => !t.done).sort(byUrgency);
  const doneCount = tasks.length - open.length;
  const overdue = open.filter((t) => dueState(t.due, today, false) === "overdue" && !asking(t, today));
  const asks = open.filter((t) => asking(t, today));
  // 월급날이 아직 안 온 사람의 이체는 지금 할 일로 재촉하지 않는다
  const pendingTransfers = open.filter((t) => t.kind === "transfer" && !waiting(t, today));
  const paydayToday = paydays.find((g) => g.date === today && g.transfers.some((t) => !t.done));
  const nextPayday = paydays.find((g) => g.date > today);
  const bills = cardBills(data, month).filter((b) => b.dueAmount > 0 || b.usingAmount > 0);
  const recent = spendingsIn(data, month).slice(0, 4);
  const catName = (id: string | null, owner: Spending["owner"] = "joint") =>
    data.categories.find((c) => c.id === id)?.name ?? (owner === "joint" ? "미분류" : `${nameOf(s, owner)} 용돈`);
  const accName = (id: string | null) => data.accounts.find((a) => a.id === id)?.name;

  // 지금 알아야 할 것들 — 화면 머리 문장 대신 맨 위 알림 카드(토스 알림처럼 하나씩 도착). 중요한 순, 최대 3개.
  // 할 일 카드와 겹치는 "남은 할 일 N건"뿐이면 알림을 두지 않는다
  const nudges: Nudge[] = [];
  if (overdue.length > 0) {
    nudges.push({
      key: "overdue",
      // 기한 넘긴 일은 끝낼 때까지 남는다. 나머지는 한 번 눌러 보면 사라진다(같은 일이 다시 생기면 키가 달라 다시 뜬다)
      sticky: true,
      tone: "negative",
      icon: CircleAlert,
      href: "/check",
      text: (
        <>
          <strong>{overdue[0].kind === "transfer" ? `${ro(overdue[0].to ?? "")} 옮길 돈` : overdue[0].title}</strong>
          {overdue.length > 1 ? ` 외 ${overdue.length - 1}건이` : iga(overdue[0].kind === "transfer" ? "돈" : overdue[0].title).slice(-1)} 기한을 넘겼어요
        </>
      ),
    });
  }
  if (asks.length > 0) {
    // 자동으로 나가는 돈은 다그치지 않고 확인만 부탁한다
    nudges.push({
      key: `asks:${asks.map((t) => t.key).join(",")}`,
      tone: "neutral",
      icon: CircleHelp,
      href: "/check",
      text: (
        <>
          <strong>{asks[0].title}</strong>
          {asks.length > 1 ? ` 외 ${asks.length - 1}건이` : iga(asks[0].title).slice(-1)} 잘 나갔는지 확인해 주세요
        </>
      ),
    });
  }
  if (paydayToday) {
    const left = paydayToday.transfers.filter((t) => !t.done);
    nudges.push({
      key: `payday:${paydayToday.date}:${paydayToday.person}`,
      tone: "positive",
      icon: Banknote,
      href: "/check",
      text: (
        <>
          오늘은 <strong>{nameOf(s, paydayToday.person)} 월급날</strong>이에요 · 옮길 돈 {left.length}건 <Money value={left.reduce((a, t) => a + t.amount, 0)} />
        </>
      ),
    });
  } else if (pendingTransfers.length > 0) {
    nudges.push({
      key: `transfers:${month}:${pendingTransfers.map((t) => t.key).join(",")}`,
      tone: "neutral",
      icon: ArrowRightLeft,
      href: "/check",
      text: (
        <>
          옮길 돈 <strong>{pendingTransfers.length}건</strong>이 남았어요 · <Money value={pendingTransfers.reduce((a, t) => a + t.amount, 0)} />
        </>
      ),
    });
  }
  if (open.length === 0 && tasks.length > 0) nudges.push({ key: `done:${month}`, tone: "positive", icon: CircleCheck, href: "/check", text: <>이번 달 이체와 납부를 모두 마쳤어요</> });
  if (living.pace !== null && living.spent > living.pace) {
    nudges.push({
      key: `pace:${month}`,
      tone: "warning",
      icon: TrendingUp,
      href: "/ledger",
      text: (
        <>
          생활비가 예상보다 <strong>{num(living.spent - living.pace)}원</strong> 빨리 나가고 있어요
        </>
      ),
    });
  }
  // 다음 월급날은 옮길 돈 알림이 없을 때만 (같은 이야기)
  if (!paydayToday && pendingTransfers.length === 0 && nextPayday && nextPayday.transfers.some((t) => !t.done)) {
    nudges.push({
      key: `next-payday:${nextPayday.date}:${nextPayday.person}`,
      tone: "neutral",
      icon: CalendarClock,
      href: "/check",
      text: (
        <>
          다음은 <strong>{nameOf(s, nextPayday.person)} 월급날</strong> {shortDate(nextPayday.date)} · {dDay(nextPayday.date, today)}
        </>
      ),
    });
  }

  return (
    <>
      <MonthHeader />

      <div className="grid">
        <div className="col span-7">
          {/* 새 달이 시작됐는데 지난달을 마감하지 않았으면 맨 위에 — 마감하거나 미루면 스르륵 빠진다 */}
          <Morph className="close-slot" track=":scope > *">
            <ClosePrompt />
          </Morph>
          <Nudges items={nudges.slice(0, 3)} />
          <BudgetCard id="living-h" className="o1" bucket="living" title="남은 공동 생활비" status={living} link={{ href: "/ledger", label: "가계부" }} />

          <BudgetCard
            id="allow-h"
            className="o2"
            bucket="allowance"
            compact
            title={`${nameOf(s, me)} 용돈`}
            status={allowance}
            link={{ href: "/plan", label: "플랜" }}
            empty={<>플랜에 {nameOf(s, me)} 용돈 항목이 없어요. 플랜 → 용돈 추가에서 금액을 정하면 내 지출이 여기서 빠져요.</>}
          />

          <section className="group o4" aria-labelledby="cards-h">
            <div className="group-head">
              <h2 id="cards-h">카드값</h2>
              <span className="aside">이번 달 결제 · 다음 달 예정</span>
            </div>
            <div className="card">
              {bills.length === 0 ? (
                <p className="empty">이번 달에 결제할 카드값이 없어요.</p>
              ) : (
                <div className="rows">
                  {bills.map((b) => (
                    <div className="row" key={b.card.id}>
                      <MiniCard account={b.card} />
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
            </div>
          </section>
        </div>

        <div className="col span-5">
          <section className="group o3" aria-labelledby="todo-h">
            <div className="group-head">
              <h2 id="todo-h">이번 달 할 일</h2>
            </div>
            <div className="card">
              {/* 체크 요약 카드와 같은 모양: 큰 숫자(남은 건수) ─ 끝낸 수, 막대, 기한 지난 일만 한 줄 */}
              <div className="todo-progress">
                <div className="todo-top">
                  <p className="big num">
                    {open.length === 0 ? (
                      "모두 끝냈어요"
                    ) : (
                      <>
                        {open.length}
                        <span>건 남았어요</span>
                      </>
                    )}
                  </p>
                  <span className="done num">{`${doneCount} / ${tasks.length}`}</span>
                </div>
                <TaskMeter done={doneCount} total={tasks.length} />
                {overdue.length > 0 && <p className="sub neg">기한 지난 일 {overdue.length}건</p>}
              </div>
              {open.length === 0 ? (
                <p className="empty">남은 이체·납부가 없어요.</p>
              ) : (
                <div className="rows" style={{ ["--inset" as string]: "40px" }}>
                  {open.slice(0, HOME_TODOS).map((t) => (
                    <TaskRow key={t.key} task={t} />
                  ))}
                </div>
              )}
              {/* 급한 순 3건만 — 나머지는 체크에서 (가계부 "모든 기록 N건 보기"와 같은 줄) */}
              <Link className="more-row" href="/check">
                {open.length > HOME_TODOS ? (
                  <>
                    남은 일 <b>{open.length}건</b> 모두 보기
                  </>
                ) : (
                  "체크에서 보기"
                )}
              </Link>
            </div>
          </section>

          <section className="group o5" aria-labelledby="recent-h">
            <div className="group-head">
              <h2 id="recent-h">최근 기록</h2>
              <Link className="aside" href="/ledger/all/?from=home">
                전체 보기
              </Link>
            </div>
            <div className="card">
              {recent.length === 0 ? (
                <p className="empty">이번 달 기록이 아직 없어요. 오른쪽 아래 + 버튼으로 첫 지출을 기록해 보세요.</p>
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
                          {r.inst ? ` · 할부 ${r.inst.no}/${r.inst.of}` : ""}
                        </div>
                      </div>
                      <div className="r">
                        <Money value={-r.amount} />
                        {r.review?.length ? (
                          <div style={{ marginTop: 2 }}>
                            <span className="pill warning">확인 필요</span>
                          </div>
                        ) : (
                          <div className="s">{Number(r.date.slice(5, 7))}/{Number(r.date.slice(8))}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

      </div>
    </>
  );
}
