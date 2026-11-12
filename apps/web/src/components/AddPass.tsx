"use client";

import { useEffect, useState } from "react";
import { EyeOff } from "lucide-react";
import type { Account, AccountKind, Owner, PassColor } from "@/lib/types";
import { PASS_COLORS, PASS_COLOR_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { eul } from "@/lib/format";
import { haptic } from "@/lib/native";
import { canonicalInstitution, logoOf, suggestInstitutions } from "@/lib/institutions";
import { InstMark, passArt } from "./pass";
import { PersonGlyph, Seg, Sheet } from "./ui";

function newId(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`;
}

/**
 * 카드·통장을 지갑에 넣는 시트 (docs/design-system/components/AddPass).
 * 맨 위 카드 그림이 적는 대로 바뀌고, 종류를 바꾸면 뒤집힌다. 넣는 순간 카드가 지갑 쪽으로 내려간다.
 * 이미 있는 카드는 같은 시트를 "고치기"로 연다(종류는 바꾸지 않고, 머리에 "숨기기").
 */
export function AddPass({ open, onOpenChange, account, kind: initialKind }: { open: boolean; onOpenChange: (v: boolean) => void; account?: Account; kind?: AccountKind }) {
  const { data, upsert, toast } = useData();
  const s = data.settings;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("card");
  const [owner, setOwner] = useState<Owner>("joint");
  const [institution, setInstitution] = useState("");
  const [last4, setLast4] = useState("");
  const [billing, setBilling] = useState<string | null>(null);
  const [payDay, setPayDay] = useState<number | null>(null);
  const [dropping, setDropping] = useState(false);
  const [color, setColor] = useState<PassColor | null>(null);
  const [instFocus, setInstFocus] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setKind(account?.kind ?? initialKind ?? "card");
    setOwner(account?.owner ?? "joint");
    setInstitution(account?.institution ?? "");
    setLast4(account?.last4 ?? "");
    setBilling(account?.billing_account_id ?? null);
    setPayDay(account?.pay_day ?? null);
    setColor(account?.color ?? null);
    setNote(account?.note ?? "");
    setDropping(false);
  }, [open, account, initialKind]);

  const banks = data.accounts.filter((a) => a.kind === "bank" && !a.archived && a.id !== account?.id);
  const usedBy = account ? data.plan_items.filter((p) => p.active && (p.account_id === account.id || p.card_id === account.id)).length : 0;
  const card = kind === "card";

  const save = async () => {
    if (!name.trim() || dropping) return;
    const row: Account = {
      id: account?.id ?? newId(card ? "card" : "acc"),
      name: name.trim(),
      kind,
      owner,
      institution: canonicalInstitution(institution),
      billing_account_id: card ? billing : null,
      pay_day: card ? payDay : null,
      last4: card && last4.length === 4 ? last4 : null,
      note: note.trim(),
      // 색은 고르거나 지울 때만 보낸다: 한 건 저장은 PostgREST upsert 라, 008 전에는 없는 칸이면 저장이 실패한다
      ...(card && color ? { color } : account?.color ? { color: null } : {}),
      sort: account?.sort ?? Math.max(0, ...data.accounts.map((a) => a.sort)) + 1,
      archived: false,
      rev: account?.rev,
    };
    if (account) {
      onOpenChange(false);
      if (await upsert("accounts", [row])) toast("저장했어요");
      return;
    }
    // 카드가 지갑 쪽으로 내려간 다음 시트를 닫는다
    setDropping(true);
    haptic(15);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    await new Promise((r) => setTimeout(r, reduce ? 0 : 420));
    onOpenChange(false);
    if (await upsert("accounts", [row])) toast(`${eul(row.name)} 지갑에 넣었어요`);
  };

  const archive = async () => {
    if (!account) return;
    onOpenChange(false);
    if (!(await upsert("accounts", [{ ...account, archived: true }]))) return;
    toast(`${eul(account.name)} 숨겼어요`, () => void upsert("accounts", [account]));
  };

  const owners: Owner[] = ["joint", "a", "b"];
  const suggestions = instFocus ? suggestInstitutions(kind, institution) : [];
  const front = passArt({ kind: "card", owner, color }, []);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      className="add-pass"
      title={account ? `${account.name} 고치기` : card ? "카드 추가" : "통장 추가"}
      headerAction={
        account && (
          <button type="button" className="btn danger sm" onClick={() => void archive()}>
            <EyeOff aria-hidden="true" /> 숨기기
          </button>
        )
      }
      footer={
        <button type="button" className="btn block" disabled={!name.trim()} onClick={() => void save()}>
          {account ? "저장" : dropping ? "지갑에 넣었어요" : "지갑에 넣기"}
        </button>
      }
    >
      {/* 미리보기: 앞면 신용카드, 뒷면 통장. 비어 있는 칸은 자리 글자를 옅게 */}
      <div className={`pass-preview ${dropping ? "dropping" : ""}`} aria-hidden="true">
        <div className={`flipper ${card ? "" : "flipped"}`}>
          {(["card", "bank"] as const).map((side) => (
            <span
              key={side}
              className={`pass ${side === "card" ? `${front.className} front` : "bank back"}`}
              style={{ ...front.style, ["--dot" as string]: owner === "a" ? "var(--a)" : owner === "b" ? "var(--b)" : "var(--joint)" }}
            >
              <span className="face">
                <span className="sheen" />
                <span className="top">
                  <InstMark institution={institution} owner={owner} />
                  <span className={`nm ${name ? "" : "ph"}`}>{name || (side === "card" ? "카드 이름" : "통장 이름")}</span>
                </span>
                <span className="bot">
                  <span className={institution ? "" : "ph"}>{institution || (side === "card" ? "카드사" : "은행")}</span>
                  <span className={`num ${side === "card" && last4.length !== 4 ? "ph" : ""}`}>{side === "card" ? `•••• ${last4.padEnd(4, "·")}` : "통장"}</span>
                </span>
              </span>
            </span>
          ))}
        </div>
      </div>

      {!account && (
        <div className="field">
          <Seg label="종류" value={kind} onChange={setKind} options={[{ value: "card", label: "신용카드" }, { value: "bank", label: "통장" }]} />
        </div>
      )}

      <div className="form-group">
        <label className="form-row">
          <span>이름</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={card ? "공동 신용카드" : "공동 생활비통장"} maxLength={30} />
        </label>
        <label className="form-row">
          <span>{card ? "카드사" : "은행"}</span>
          <input
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            onFocus={() => setInstFocus(true)}
            onBlur={() => {
              setInstFocus(false);
              setInstitution((v) => canonicalInstitution(v));
            }}
            placeholder={card ? "몇 글자만 쳐도 골라져요" : "은행·증권사"}
            maxLength={30}
            autoComplete="off"
          />
        </label>
        {suggestions.length > 0 && (
          <div className="form-suggest" role="listbox" aria-label={card ? "카드사 고르기" : "은행 고르기"}>
            {suggestions.map((n) => (
              <button
                key={n}
                type="button"
                role="option"
                aria-selected={false}
                className="chip"
                // 입력칸의 blur 보다 먼저 고른다
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  setInstitution(n);
                  setInstFocus(false);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logoOf(n) && <img className="chip-logo" src={logoOf(n)!} alt="" width={18} height={18} />}
                {n}
              </button>
            ))}
          </div>
        )}
        {card && (
          <label className="form-row">
            <span>끝 4자리</span>
            <input value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" placeholder="선택" />
          </label>
        )}
      </div>

      <div className="form-group">
        <div className="form-row">
          <span id="ap-owner">누구 것</span>
          <div className="owner-pills" role="radiogroup" aria-labelledby="ap-owner">
            {owners.map((o) => (
              <button key={o} type="button" role="radio" aria-checked={owner === o} className="chip" onClick={() => setOwner(o)}>
                <PersonGlyph owner={o} />
                {nameOf(s, o)}
              </button>
            ))}
          </div>
        </div>
        {card && (
          <>
            <div className="form-row wide">
              <span id="ap-color">색</span>
              <div className="swatches" role="radiogroup" aria-labelledby="ap-color">
                <button type="button" role="radio" aria-checked={color === null} className="swatch auto" aria-label="자동: 이번 달 쓴 버킷 색" onClick={() => setColor(null)}>
                  자동
                </button>
                {PASS_COLORS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={color === c} className="swatch" aria-label={PASS_COLOR_LABEL[c]} style={{ ["--pt" as string]: `var(--pass-${c})` }} onClick={() => setColor(c)} />
                ))}
              </div>
            </div>
            <label className="form-row">
              <span>결제 계좌</span>
              <select value={billing ?? ""} onChange={(e) => setBilling(e.target.value || null)}>
                <option value="">선택 안 함</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-row">
              <span>결제일</span>
              <select value={payDay ?? ""} onChange={(e) => setPayDay(e.target.value ? Number(e.target.value) : null)}>
                <option value="">없음 (체크카드)</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    매달 {d}일
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <div className="form-group">
        <label className="form-row wide">
          <span>메모</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={card ? "예: 전월 실적 30만 원, 통신비 할인" : "예: 비상금은 여기서 꺼내 쓰지 않기"}
          />
        </label>
      </div>
      <p className="help">
        공동 지출을 개인 카드·통장으로 내면 정산 대상이 돼요.{card ? " 끝 4자리는 카드 알림에서 카드를 찾는 데만 써요. 색은 내 카드와 비슷하게 고르면 돼요(자동은 이번 달 쓴 버킷 색)." : ""}
      </p>
      {account && usedBy > 0 && <p className="help">반복 항목 {usedBy}개가 이 {card ? "카드" : "통장"}를 쓰고 있어요.</p>}
    </Sheet>
  );
}
