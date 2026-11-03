"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Data, Owner, PayKind, Spending } from "@/lib/types";
import { useData } from "@/lib/store";
import { allowanceStatus, livingStatus, monthOf, nameOf } from "@/lib/calc";
import { categoryVisual, guessFromMemo, presetsOf, type Preset } from "@/lib/categories";
import { num, parseYmd, rase, ymd } from "@/lib/format";
import { haptic } from "@/lib/native";
import { CategoryIcon, Seg, Sheet } from "./ui";

const LAST_CARD = "our-money-last-card";
const MINE = "__mine";

function shiftDay(date: string, n: number) {
  const d = parseYmd(date);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `sp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SpendingSheet({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing?: Spending }) {
  const { data, me, today, upsert, remove, toast } = useData();
  const s = data.settings;
  const cards = useMemo(() => data.accounts.filter((a) => a.kind === "card" && !a.archived).sort((a, b) => a.sort - b.sort), [data.accounts]);
  const banks = useMemo(
    () => data.accounts.filter((a) => a.kind === "bank" && !a.archived && (a.owner === "joint" || a.owner === me)).sort((a, b) => a.sort - b.sort),
    [data.accounts, me],
  );
  const categories = useMemo(() => [...data.categories].sort((a, b) => a.sort - b.sort), [data.categories]);
  const presets = useMemo(() => presetsOf(data, today), [data, today]);

  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const [payKind, setPayKind] = useState<PayKind>("card");
  const [account, setAccount] = useState<string | null>(null);
  const [owner, setOwner] = useState<Owner>(me);
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState("");
  // 사용자가 직접 고른 항목은 자동으로 덮어쓰지 않는다
  const [touched, setTouched] = useState({ category: false, owner: false, pay: false });
  const [autoCat, setAutoCat] = useState(false);
  const [autoOwner, setAutoOwner] = useState(false);
  // 자주 쓰는 지출 버튼으로 시작한 기록인지 (spendings.source)
  const [fromPreset, setFromPreset] = useState(false);

  /** 결제수단으로 누구 돈인지 추측: 공동 카드·공동 통장이면 공동, 아니면 그 사람(내 지갑은 나) */
  const inferOwner = (kind: PayKind, acc: string | null): Owner => {
    if (!acc || acc === MINE) return me;
    const a = data.accounts.find((x) => x.id === acc);
    if (!a) return me;
    return a.owner;
  };

  const applyPay = (kind: PayKind, acc: string | null, ownerTouched = touched.owner) => {
    setPayKind(kind);
    setAccount(acc);
    if (!ownerTouched) {
      const o = inferOwner(kind, acc);
      setOwner(o);
      setAutoOwner(o !== me);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setAmount(editing.amount);
      setCategory(editing.category_id);
      setPayKind(editing.pay_kind);
      setAccount(editing.account_id ?? (editing.pay_kind === "cash" ? MINE : null));
      setOwner(editing.owner);
      setDate(editing.date);
      setMemo(editing.memo);
      setTouched({ category: true, owner: true, pay: true });
      setAutoCat(false);
      setAutoOwner(false);
      return;
    }
    // 새 기록: 기본은 '내가 내 카드로 쓴 돈'
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_CARD);
    } catch {}
    const mine = cards.find((c) => c.owner === me);
    const lastCard = cards.find((c) => c.id === last);
    const card = mine ?? lastCard ?? cards[0];
    setAmount(0);
    setCategory(null);
    setPayKind("card");
    setAccount(card?.id ?? null);
    setOwner(card && card.owner === "joint" ? "joint" : me);
    setDate(today);
    setMemo("");
    setTouched({ category: false, owner: false, pay: false });
    setAutoCat(false);
    setAutoOwner(Boolean(card && card.owner === "joint"));
    setFromPreset(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, cards, today, me]);

  const onMemo = (v: string) => {
    setMemo(v);
    const g = guessFromMemo(data, v);
    if (!touched.category) {
      setCategory(g.category_id);
      setAutoCat(Boolean(g.category_id));
    }
    // 같은 곳에서 쓴 적이 있으면 그때 결제수단을 따른다
    if (g.from && !touched.pay && g.from.memo.trim() === v.trim()) {
      applyPay(g.from.pay_kind, g.from.account_id ?? (g.from.pay_kind === "cash" ? MINE : null));
    }
  };

  const usePreset = (p: Preset) => {
    setFromPreset(true);
    setMemo(p.memo);
    setAmount(p.amount);
    setCategory(p.category_id);
    setAutoCat(Boolean(p.category_id));
    const acc = p.account_id ?? (p.pay_kind === "cash" ? MINE : null);
    setPayKind(p.pay_kind);
    setAccount(acc);
    // 상대방 용돈으로 쓴 기록이었으면 내 용돈으로 바꾼다
    const o: Owner = p.owner === "joint" ? "joint" : me;
    setOwner(o);
    setAutoOwner(o === "joint");
    setTouched({ category: false, owner: false, pay: false });
  };

  const changeKind = (k: PayKind) => {
    setTouched((t) => ({ ...t, pay: true }));
    if (k === "card") {
      const c = cards.find((x) => x.owner === (owner === "joint" ? "joint" : owner)) ?? cards[0];
      applyPay(k, c?.id ?? null);
    } else if (k === "cash") {
      applyPay(k, owner === "joint" ? banks.find((b) => b.owner === "joint")?.id ?? MINE : MINE);
    } else {
      applyPay(k, banks.find((b) => b.owner === (owner === "joint" ? "joint" : me))?.id ?? banks[0]?.id ?? null);
    }
  };

  const changeAccount = (acc: string) => {
    setTouched((t) => ({ ...t, pay: true }));
    applyPay(payKind, acc);
  };

  const changeOwner = (o: Owner) => {
    setOwner(o);
    setAutoOwner(false);
    setTouched((t) => ({ ...t, owner: true }));
    // 카드도 그 사람 것으로 맞춘다 (이미 맞으면 그대로)
    if (payKind === "card" && !touched.pay) {
      const current = cards.find((c) => c.id === account);
      if (!(current && current.owner === o)) {
        const match = cards.find((c) => c.owner === o);
        if (match) setAccount(match.id);
      }
    }
  };

  const accountOptions =
    payKind === "card"
      ? cards.map((c) => ({ value: c.id, label: c.name }))
      : [
          ...banks.map((b) => ({ value: b.id, label: payKind === "cash" ? `${b.name}에서 뽑은 현금` : b.name })),
          ...(payKind === "cash" ? [{ value: MINE, label: "내 지갑" }] : []),
        ];

  // 기록하면 남는 금액 미리보기
  const preview = useMemo(() => {
    if (amount <= 0) return null;
    const row = buildRow();
    return remainingText(data, row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, owner, date, data]);

  function buildRow(): Spending {
    const acc = account && account !== MINE ? data.accounts.find((a) => a.id === account) : null;
    const paidBy = acc && acc.owner !== "joint" ? acc.owner : me;
    return {
      id: editing?.id ?? newId(),
      date,
      amount,
      category_id: category,
      pay_kind: payKind,
      account_id: acc?.id ?? null,
      owner,
      paid_by: paidBy,
      memo: memo.trim(),
      created_at: editing?.created_at ?? new Date().toISOString(),
      // 고칠 때는 읽은 rev 를 그대로 (다른 폰이 그사이 고쳤으면 서버가 거절), 새 기록은 어떻게 시작했는지
      ...(editing ? { rev: editing.rev } : { source: fromPreset ? "preset" : "manual" }),
    };
  }

  const save = async () => {
    if (amount <= 0) return;
    const row = buildRow();
    if (payKind === "card" && row.account_id) {
      try {
        localStorage.setItem(LAST_CARD, row.account_id);
      } catch {}
    }
    haptic(14);
    onOpenChange(false);
    await upsert("spendings", [row]);
    toast(`${editing ? "수정했어요" : `${num(amount)}원 기록했어요`} · ${remainingText(data, row)}`);
  };

  const del = async () => {
    if (!editing) return;
    const backup = editing;
    haptic([8, 30, 8]);
    onOpenChange(false);
    await remove("spendings", [editing.id]);
    toast("기록을 지웠어요", () => void upsert("spendings", [backup]));
  };

  const dateChoice = date === today ? "today" : date === shiftDay(today, -1) ? "yesterday" : date === shiftDay(today, -2) ? "2days" : "other";
  const ownerAcc = account && account !== MINE ? data.accounts.find((a) => a.id === account) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "기록 수정" : "얼마 썼나요?"}
      headerAction={
        editing && (
          <button type="button" className="btn danger sm" onClick={() => void del()}>
            <Trash2 aria-hidden="true" /> 삭제
          </button>
        )
      }
      footer={
        <button type="button" className="btn block" disabled={amount <= 0} onClick={() => void save()}>
          {editing ? "저장" : amount > 0 ? `${num(amount)}원 기록하기` : "기록하기"}
        </button>
      }
    >
      <label className="sr-only" htmlFor="sp-amount">
        금액
      </label>
      <div className="bigamount">
        <input
          id="sp-amount"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          autoFocus={!editing}
          enterKeyHint="done"
          value={amount ? num(amount) : ""}
          onChange={(e) => setAmount(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
        />
        <span className="unit">원</span>
      </div>
      <div className="quick">
        {[10_000, 50_000, 100_000].map((v) => (
          <button key={v} type="button" onClick={() => setAmount((a) => a + v)}>
            +{v / 10_000}만
          </button>
        ))}
        {amount > 0 && (
          <button type="button" onClick={() => setAmount(0)}>
            지우기
          </button>
        )}
      </div>

      {!editing && presets.length > 0 && (
        <div className="field" style={{ marginTop: 22 }}>
          <span className="label">자주 쓰는 지출</span>
          <div className="presets">
            {presets.map((p) => {
              const cat = data.categories.find((c) => c.id === p.category_id);
              return (
                <button key={p.memo} type="button" className="preset" onClick={() => usePreset(p)}>
                  <CategoryIcon visual={categoryVisual(cat?.name)} size="sm" />
                  <span>
                    <span className="t" style={{ display: "block" }}>
                      {p.memo}
                    </span>
                    <span className="s" style={{ display: "block" }}>
                      {num(p.amount)}원
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="field" style={{ marginTop: 22 }}>
        <label htmlFor="sp-memo">어디에 썼나요</label>
        <input id="sp-memo" className="input" placeholder="예: 이마트, 배달의민족, 커피" value={memo} onChange={(e) => onMemo(e.target.value)} maxLength={60} autoComplete="off" enterKeyHint="done" />
      </div>

      <div className="field">
        <span className="label">
          분류
          {autoCat && category && <span className="auto-tag">메모 보고 자동으로 골랐어요</span>}
        </span>
        <div className="chips" role="radiogroup" aria-label="분류">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              role="radio"
              aria-checked={category === c.id}
              onClick={() => {
                setCategory(category === c.id ? null : c.id);
                setAutoCat(false);
                setTouched((t) => ({ ...t, category: true }));
              }}
              style={{ paddingLeft: 6 }}
            >
              <CategoryIcon visual={categoryVisual(c.name)} size="sm" />
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label">결제수단</span>
        <Seg
          label="결제수단"
          value={payKind}
          onChange={changeKind}
          options={[
            { value: "card", label: "카드" },
            { value: "cash", label: "현금" },
            { value: "transfer", label: "계좌이체" },
          ]}
        />
        {accountOptions.length > 0 && (
          <div className="chips" role="radiogroup" aria-label={payKind === "card" ? "카드" : "계좌"}>
            {accountOptions.map((o) => (
              <button key={o.value} type="button" className="chip" role="radio" aria-checked={(account ?? MINE) === o.value} onClick={() => changeAccount(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        )}
        {payKind === "card" && cards.length === 0 && <p className="help">설정에서 카드를 먼저 추가해 주세요.</p>}
      </div>

      <div className="field">
        <span className="label">
          누구 돈인가요
          {autoOwner && owner === "joint" && ownerAcc && <span className="auto-tag">{rase(ownerAcc.name)} 공동으로 골랐어요</span>}
        </span>
        <Seg
          label="누구 돈인가요"
          value={owner}
          onChange={changeOwner}
          options={[
            { value: me, label: `내 용돈` },
            { value: "joint", label: "공동 생활비" },
            { value: me === "a" ? "b" : "a", label: `${nameOf(s, me === "a" ? "b" : "a")} 용돈` },
          ]}
        />
        {preview && <p className="help">기록하면 {preview}</p>}
      </div>

      <div className="field">
        <span className="label">날짜</span>
        <div className="chips">
          {(
            [
              ["today", "오늘", today],
              ["yesterday", "어제", shiftDay(today, -1)],
              ["2days", "그제", shiftDay(today, -2)],
            ] as const
          ).map(([k, label, d]) => (
            <button key={k} type="button" className="chip" aria-pressed={dateChoice === k} onClick={() => setDate(d)}>
              {label}
            </button>
          ))}
          <input type="date" className="input" style={{ width: 168, height: 38 }} aria-label="날짜 직접 선택" value={date} max={shiftDay(today, 60)} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
      </div>
    </Sheet>
  );
}

/** 그 지출이 빠진 예산의 남은 금액 */
function remainingText(data: Data, row: Spending): string {
  const all = [...data.spendings.filter((x) => x.id !== row.id), row];
  const next = { ...data, spendings: all };
  const month = monthOf(row.date, data.settings.cycle_start);
  if (row.owner === "joint") {
    const st = livingStatus(next, month);
    return st.left >= 0 ? `생활비 ${num(st.left)}원 남아요` : `생활비가 ${num(-st.left)}원 넘어요`;
  }
  const st = allowanceStatus(next, month, row.owner);
  const who = `${nameOf(data.settings, row.owner)} 용돈`;
  if (st.budget === 0) return `${who}으로 들어가요`;
  return st.left >= 0 ? `${who} ${num(st.left)}원 남아요` : `${who}이 ${num(-st.left)}원 넘어요`;
}
