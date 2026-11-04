"use client";

import { useEffect, useState } from "react";
import { EyeOff } from "lucide-react";
import type { Account, AccountKind, Owner } from "@/lib/types";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { eul } from "@/lib/format";
import { haptic } from "@/lib/native";
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

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setKind(account?.kind ?? initialKind ?? "card");
    setOwner(account?.owner ?? "joint");
    setInstitution(account?.institution ?? "");
    setLast4(account?.last4 ?? "");
    setBilling(account?.billing_account_id ?? null);
    setPayDay(account?.pay_day ?? null);
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
      institution: institution.trim(),
      billing_account_id: card ? billing : null,
      pay_day: card ? payDay : null,
      last4: card && last4.length === 4 ? last4 : null,
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
            <span key={side} className={`pass ${side === "card" ? "credit blank front" : "bank back"}`} style={{ ["--dot" as string]: owner === "a" ? "var(--a)" : owner === "b" ? "var(--b)" : "var(--joint)" }}>
              <span className="face">
                <span className="sheen" />
                <span className="top">
                  <span className="who-dot">
                    <PersonGlyph owner={owner} />
                  </span>
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
          <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder={card ? "모아카드" : "도토리은행"} maxLength={30} />
        </label>
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
      <p className="help">공동 지출을 개인 카드·통장으로 내면 정산 대상이 돼요.{card ? " 끝 4자리는 카드 알림에서 카드를 찾는 데만 써요." : ""}</p>
      {account && usedBy > 0 && <p className="help">반복 항목 {usedBy}개가 이 {card ? "카드" : "통장"}를 쓰고 있어요.</p>}
    </Sheet>
  );
}
