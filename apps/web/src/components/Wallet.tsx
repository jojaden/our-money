"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, Check, ChevronRight, Pencil, Plus, X } from "lucide-react";
import type { Account, Data, Group, Spending } from "@/lib/types";
import { BUCKET, PERSON, cardMix, passArt } from "./pass";
import { useData } from "@/lib/store";
import { cardBills, checkId, findCheck, monthRow, nameOf, paydayDate, salaryAccount, spendingsIn } from "@/lib/calc";
import { dDay, monthLabel, num, parseYmd, shortDate, ymd } from "@/lib/format";
import { haptic } from "@/lib/native";
import { spendingVisual } from "@/lib/categories";
import { CategoryIcon, PersonGlyph, useBackToClose } from "./ui";
import { useSheets } from "./Shell";
import { useTasks } from "./tasks";

/** 손가락·마우스를 따라 빛이 옮겨 가고, tilt 면 최대 5°까지 기운다 */
function follow(tilt: boolean) {
  const reduce = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return {
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (reduce()) return;
      const face = e.currentTarget.querySelector<HTMLElement>(".face");
      if (!face) return;
      const r = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      face.style.setProperty("--mx", `${x * 100}%`);
      face.style.setProperty("--my", `${y * 100}%`);
      if (tilt) {
        face.style.setProperty("--ry", `${(x - 0.5) * 10}deg`);
        face.style.setProperty("--rx", `${(0.5 - y) * 8}deg`);
      }
    },
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
      const face = e.currentTarget.querySelector<HTMLElement>(".face");
      for (const k of ["--mx", "--my", "--rx", "--ry"]) face?.style.removeProperty(k);
    },
  };
}

interface PassInfo {
  account: Account;
  mix: Group[];
  /** 위 띠 오른쪽: 신용카드는 이번 달 카드값, 통장은 하는 일 */
  right: string;
  amount: boolean;
}

function Face({ p }: { p: PassInfo }) {
  const a = p.account;
  return (
    <span className="face">
      <span className="sheen" />
      <span className="top">
        <span className="who-dot">
          <PersonGlyph owner={a.owner} />
        </span>
        <span className="nm">{a.name}</span>
        <span className={p.amount ? "amt" : "amt soft"}>{p.right}</span>
      </span>
      <span className="bot">
        <span>{a.institution}</span>
        <span className="num">{a.kind === "card" ? (a.last4 ? `•••• ${a.last4}` : "카드") : "통장"}</span>
      </span>
    </span>
  );
}

/**
 * 지갑 — 계좌와 카드를 위 띠만 보이게 쌓은 실물 카드 묶음 (docs/design-system/components/Wallet).
 * 카드를 누르면 그 카드가 화면 맨 위로 날아가며 상세(카드값·결제일·이번 주 사용·최근 사용)가 펼쳐진다.
 */
export function Wallet({ onAdd, onEdit }: { onAdd: () => void; onEdit: (a: Account) => void }) {
  const { data, month } = useData();
  const s = data.settings;
  const bills = new Map(cardBills(data, month).map((b) => [b.card.id, b]));
  const live = data.accounts.filter((a) => !a.archived);
  const cards = live.filter((a) => a.kind === "card").sort((a, b) => a.sort - b.sort);
  const banks = live.filter((a) => a.kind === "bank").sort((a, b) => a.sort - b.sort);

  const role = (a: Account) => {
    const pays = (["a", "b"] as const).filter((p) => salaryAccount(s, p) === a.id);
    if (pays.length) return pays.map((p) => `${pays.length > 1 ? `${nameOf(s, p)} ` : ""}월급 ${paydayDate(month, s, p).slice(8).replace(/^0/, "")}일`).join(" · ");
    const n = cards.filter((c) => c.billing_account_id === a.id).length;
    return n ? `카드 ${n}장 결제` : "옮겨 두는 통장";
  };
  const passes: PassInfo[] = [
    ...cards.map((a) => ({ account: a, mix: cardMix(data, month, a.id), right: `${num(bills.get(a.id)?.dueAmount ?? 0)}원`, amount: true })),
    ...banks.map((a) => ({ account: a, mix: [], right: role(a), amount: false })),
  ];

  const [open, setOpen] = useState<{ id: string; from: DOMRect } | null>(null);
  const shown = open ? passes.find((p) => p.account.id === open.id) : undefined;

  return (
    <div className="wallet">
      <div className="wallet-head">
        <p>
          카드 {cards.length}장 · 통장 {banks.length}개
        </p>
        <button type="button" className="glass-btn" aria-label="카드·통장 추가" onClick={onAdd}>
          <Plus aria-hidden="true" />
        </button>
      </div>
      <ul className="pass-stack" style={{ ["--n" as string]: passes.length }}>
        {passes.map((p, i) => {
          const art = passArt(p.account, p.mix);
          return (
            <li key={p.account.id} style={{ ["--i" as string]: i }}>
              <button
                type="button"
                className={`pass ${art.className}`}
                style={art.style}
                data-pass={p.account.id}
                aria-label={`${p.account.name}, ${p.account.institution || nameOf(s, p.account.owner)}, ${p.amount ? `이번 달 ${p.right}` : p.right}`}
                onClick={(e) => setOpen({ id: p.account.id, from: e.currentTarget.getBoundingClientRect() })}
                {...follow(false)}
              >
                <Face p={p} />
              </button>
            </li>
          );
        })}
      </ul>
      {shown && open && <PassDetail p={shown} from={open.from} onClose={() => setOpen(null)} onEdit={() => onEdit(shown.account)} />}
    </div>
  );
}

/** 이번 주(월~일) 날짜 7개 */
function weekDays(today: string): string[] {
  const d = parseYmd(today);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return ymd(x);
  });
}

function PassDetail({ p, from, onClose, onEdit }: { p: PassInfo; from: DOMRect; onClose: () => void; onEdit: () => void }) {
  const { data, month, today, toggleCheck } = useData();
  const { openSpending } = useSheets();
  const { transfers } = useTasks(month);
  const s = data.settings;
  const a = p.account;
  const card = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [leaving, setLeaving] = useState(false);
  const reduce = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // 누른 카드 자리에서 화면 맨 위로 날아온다 (FLIP)
  useLayoutEffect(() => {
    closeBtn.current?.focus({ preventScroll: true });
    const el = card.current;
    if (!el || reduce()) return;
    const to = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    el.animate(
      [{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})` }, { transform: "none" }],
      { duration: parseFloat(cs.getPropertyValue("--dur-tab")) || 420, easing: cs.getPropertyValue("--ease-drawer").trim() || "ease-out" },
    );
  }, [from]);

  // 닫으면 카드가 묶음의 제자리로 돌아가고 포커스도 그 카드로.
  // 뒤로 가기가 아닌 길(닫기·Esc)로 닫으면 열 때 넣은 기록 한 칸을 되돌린다
  const popped = useRef(false);
  const close = () => {
    if (leaving) return;
    const back = document.querySelector<HTMLElement>(`[data-pass="${a.id}"]`);
    const done = () => {
      if (!popped.current && window.history.state?.sheet) window.history.back();
      onClose();
      back?.focus({ preventScroll: true });
    };
    const el = card.current;
    if (!el || !back || reduce()) return done();
    setLeaving(true);
    const to = el.getBoundingClientRect();
    const at = back.getBoundingClientRect();
    const cs = getComputedStyle(el);
    el.animate([{ transform: "none" }, { transform: `translate(${at.left - to.left}px, ${at.top - to.top}px) scale(${at.width / to.width})` }], {
      duration: parseFloat(cs.getPropertyValue("--dur-tab")) || 420,
      easing: cs.getPropertyValue("--ease-drawer").trim() || "ease-out",
      fill: "forwards",
    }).onfinish = done;
  };
  const closeRef = useRef(close);
  useLayoutEffect(() => {
    closeRef.current = close;
  });
  useBackToClose(true, () => {
    popped.current = true;
    closeRef.current();
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // 이번 주 사용: 월~일 캡슐, 쓴 날만 카드 그림의 두 색으로 차오른다
  const rows = data.spendings.filter((r) => r.account_id === a.id);
  const week = weekDays(today).map((d) => rows.filter((r) => r.date === d).reduce((x, r) => x + r.amount, 0));
  const peak = Math.max(1, ...week);
  const weekSum = week.reduce((x, v) => x + v, 0);
  const tint = a.kind === "card" && a.color ? `var(--pass-${a.color})` : null;
  const k1 = a.kind === "bank" ? PERSON[a.owner] : tint ?? BUCKET[p.mix[0]] ?? "var(--control)";
  const k2 = a.kind === "bank" ? PERSON[a.owner] : tint ?? BUCKET[p.mix[1] ?? p.mix[0]] ?? "var(--control)";
  const recent = spendingsIn(data, month)
    .filter((r) => r.account_id === a.id)
    .slice(0, 5);

  let tiles: React.ReactNode;
  let list: React.ReactNode;
  if (a.kind === "card") {
    const bill = cardBills(data, month).find((b) => b.card.id === a.id);
    const isCheck = !a.pay_day;
    const id = checkId("card", month, a.id);
    const paid = Boolean(findCheck(data.checks, id));
    const due = bill?.dueAmount ?? 0;
    const pay = () => {
      haptic(15);
      void toggleCheck({ id, month, kind: "card", amount: due }, !paid);
    };
    const billing = bill?.billing?.name;
    tiles = (
      <>
        <div className="ptile">
          <small>{isCheck ? "이번 달 쓴 돈" : "이번 달 카드값"}</small>
          <b>{num(isCheck ? bill?.usingAmount ?? 0 : due)}원</b>
          <span>{isCheck ? "체크카드라 바로 빠져요" : `다음 달 예정 ${num(bill?.usingAmount ?? 0)}원`}</span>
        </div>
        <div className={`ptile tall ${paid ? "paid" : ""}`}>
          {isCheck ? (
            <>
              <small>빠지는 통장</small>
              <b className="sm">{billing ?? "지정 안 됨"}</b>
              <span>쓸 때마다 바로</span>
            </>
          ) : paid ? (
            <>
              <small>{monthLabel(month)} 카드값</small>
              <b>다 냈어요</b>
              <span>{billing ? `${billing}에서 ` : ""}{num(due)}원</span>
              <button type="button" className="done-mark" aria-pressed="true" aria-label="결제 완료 취소" onClick={pay}>
                <Check aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <small>결제일</small>
              <b>{bill?.dueDate ? dateLong(bill.dueDate) : "–"}</b>
              <span>
                {bill?.dueDate ? dDay(bill.dueDate, today) : ""}
                {billing ? <><br />{billing}에서</> : null}
              </span>
              {due > 0 ? (
                <button type="button" className="tonal" aria-pressed="false" onClick={pay}>
                  결제했어요
                </button>
              ) : (
                <span className="quiet">낼 돈이 없어요</span>
              )}
            </>
          )}
        </div>
        <WeekTile label="이번 주 사용" sum={weekSum} week={week} peak={peak} k1={k1} k2={k2} />
      </>
    );
    list = (
      <>
        <h3 className="pass-sec">최근 사용</h3>
        {recent.length ? (
          <ul className="pass-rows">
            {recent.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => openSpending(r)}>
                  <SpendIcon data={data} r={r} />
                  <span className="mid">
                    <span className="t">{r.memo || catName(data, r)}</span>
                    <span className="s">
                      {catName(data, r)} · {shortDate(r.date)}
                    </span>
                  </span>
                  <span className="r">
                    <b>{num(r.amount)}원</b>
                    <em>{nameOf(s, r.owner)}</em>
                  </span>
                  <ChevronRight className="chev" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pass-empty">이번 달 기록이 아직 없어요.</p>
        )}
      </>
    );
  } else {
    // 통장: 잔액은 관리하지 않으므로 하는 일(월급·옮겨 올 돈)과 이체만 보여 준다
    const m = monthRow(data, month);
    const pays = (["a", "b"] as const).filter((x) => salaryAccount(s, x) === a.id);
    const into = transfers.filter((t) => t.transfer?.to === a.id);
    const out = transfers.filter((t) => t.transfer?.from === a.id);
    const intoDone = into.filter((t) => t.done).length;
    const income = m ? pays.reduce((x, q) => x + (q === "a" ? m.income_a : m.income_b), 0) : 0;
    const moves = [...into, ...out];
    tiles = (
      <>
        {pays.length ? (
          <div className="ptile">
            <small>이번 달 월급</small>
            <b>{num(income)}원</b>
            <span>{pays.map((q) => `${shortDate(paydayDate(month, s, q))} 월급날`).join(" · ")}</span>
          </div>
        ) : (
          <div className="ptile">
            <small>이번 달 옮겨 올 돈</small>
            <b>{num(into.reduce((x, t) => x + t.amount, 0))}원</b>
            <span>{into.length ? `${into.length}건 중 ${intoDone}건 옮겼어요` : "옮겨 올 돈이 없어요"}</span>
          </div>
        )}
        <div className="ptile tall">
          <small>{out.length ? "이번 달 옮길 돈" : "카드값이 빠져요"}</small>
          <b>{out.length ? `${num(out.reduce((x, t) => x + t.amount, 0))}원` : `${data.accounts.filter((c) => !c.archived && c.billing_account_id === a.id).length}장`}</b>
          <span>{out.length ? `${out.length}건 중 ${out.filter((t) => t.done).length}건 옮겼어요` : "결제일에 이 통장에서"}</span>
          <span className="quiet">체크 화면에서 하나씩 표시해요</span>
        </div>
        <WeekTile label="이번 주 나간 돈" sum={weekSum} week={week} peak={peak} k1={k1} k2={k2} />
      </>
    );
    list = (
      <>
        <h3 className="pass-sec">이번 달 오가는 돈</h3>
        {moves.length ? (
          <ul className="pass-rows">
            {moves.map((t) => (
              <li key={t.key}>
                <div>
                  <span className="cat sq" style={{ background: t.done ? "var(--g-saving)" : "var(--control)", color: "var(--on-primary)" }} aria-hidden="true">
                    {t.done ? <Check /> : <ArrowLeftRight />}
                  </span>
                  <span className="mid">
                    <span className="t">{t.transfer?.to === a.id ? `${t.from} → 여기` : `여기 → ${t.to}`}</span>
                    <span className="s">{t.done ? "옮겼어요" : t.sub}</span>
                  </span>
                  <span className="r">
                    <b>{num(t.amount)}원</b>
                    <em>{nameOf(s, t.person)}</em>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pass-empty">이번 달에 이 통장으로 오가는 이체가 없어요.</p>
        )}
      </>
    );
  }

  const art = passArt(a, p.mix);
  return createPortal(
    <div className={`pass-detail ${leaving ? "leaving" : ""}`} role="dialog" aria-modal="true" aria-label={`${a.name} 자세히`}>
      <div className="pass-bar">
        <button ref={closeBtn} type="button" className="glass-btn" aria-label="지갑으로 돌아가기" onClick={close}>
          <X aria-hidden="true" />
        </button>
        <button type="button" className="glass-btn" aria-label={`${a.name} 고치기`} onClick={onEdit}>
          <Pencil aria-hidden="true" />
        </button>
      </div>
      <div className="pass-body">
        <button ref={card} type="button" className={`pass open ${art.className}`} style={art.style} tabIndex={-1} aria-hidden="true" {...follow(true)}>
          <Face p={p} />
        </button>
        <div className="pass-more">
          <div className="ptiles">{tiles}</div>
          {list}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function WeekTile({ label, sum, week, peak, k1, k2 }: { label: string; sum: number; week: number[]; peak: number; k1: string; k2: string }) {
  const days = ["월", "화", "수", "목", "금", "토", "일"];
  return (
    <div className="ptile">
      <small>{label}</small>
      <span>+{num(sum)}원</span>
      <div className="week" role="img" aria-label={`${label}: ${week.map((v, i) => `${days[i]} ${num(v)}원`).join(", ")}`} style={{ ["--k1" as string]: `color-mix(in srgb, ${k1} 70%, var(--surface))`, ["--k2" as string]: k2 }}>
        {week.map((v, i) => (
          <i key={i} style={{ ["--h" as string]: `${Math.round((v / peak) * 100)}%` }} />
        ))}
      </div>
    </div>
  );
}

function SpendIcon({ data, r }: { data: Data; r: Spending }) {
  // 버킷 색으로 채운 둥근 사각에 흰 아이콘
  const v = spendingVisual(data, r);
  return <CategoryIcon visual={{ ...v, bg: r.owner === "joint" ? "var(--g-living)" : "var(--g-allowance)", ink: "var(--on-primary)" }} />;
}

function catName(data: Data, r: Spending) {
  return data.categories.find((c) => c.id === r.category_id)?.name ?? (r.owner === "joint" ? "미분류" : `${nameOf(data.settings, r.owner)} 용돈`);
}

function dateLong(d: string) {
  const x = parseYmd(d);
  return `${x.getMonth() + 1}월 ${x.getDate()}일`;
}
