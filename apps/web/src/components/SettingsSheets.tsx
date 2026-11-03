"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Account, AccountKind, Category, Owner } from "@/lib/types";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { eul } from "@/lib/format";
import { AmountInput, Seg, Sheet } from "./ui";

function newId(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`;
}

export function AccountSheet({ open, onOpenChange, account, kind: initialKind }: { open: boolean; onOpenChange: (v: boolean) => void; account?: Account; kind?: AccountKind }) {
  const { data, upsert, toast } = useData();
  const s = data.settings;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("bank");
  const [owner, setOwner] = useState<Owner>("joint");
  const [institution, setInstitution] = useState("");
  const [billing, setBilling] = useState<string | null>(null);
  const [payDay, setPayDay] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setKind(account?.kind ?? initialKind ?? "bank");
    setOwner(account?.owner ?? "joint");
    setInstitution(account?.institution ?? "");
    setBilling(account?.billing_account_id ?? null);
    setPayDay(account?.pay_day ?? null);
  }, [open, account, initialKind]);

  const banks = data.accounts.filter((a) => a.kind === "bank" && !a.archived && a.id !== account?.id);
  const usedBy = account ? data.plan_items.filter((p) => p.active && (p.account_id === account.id || p.card_id === account.id)).length : 0;

  const save = async () => {
    if (!name.trim()) return;
    const row: Account = {
      id: account?.id ?? newId(kind === "card" ? "card" : "acc"),
      name: name.trim(),
      kind,
      owner,
      institution: institution.trim(),
      billing_account_id: kind === "card" ? billing : null,
      pay_day: kind === "card" ? payDay : null,
      sort: account?.sort ?? Math.max(0, ...data.accounts.map((a) => a.sort)) + 1,
      archived: false,
      rev: account?.rev,
    };
    onOpenChange(false);
    await upsert("accounts", [row]);
    toast("저장했어요");
  };

  const archive = async () => {
    if (!account) return;
    onOpenChange(false);
    await upsert("accounts", [{ ...account, archived: true }]);
    toast(`${eul(account.name)} 숨겼어요`, () => void upsert("accounts", [account]));
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={account ? account.name : kind === "card" ? "카드 추가" : "계좌 추가"}
      headerAction={
        account && (
          <button type="button" className="btn danger sm" onClick={() => void archive()}>
            <Trash2 aria-hidden="true" /> 숨기기
          </button>
        )
      }
      footer={
        <button type="button" className="btn block" disabled={!name.trim()} onClick={() => void save()}>
          저장
        </button>
      }
    >
      {!account && (
        <div className="field">
          <span className="label">종류</span>
          <Seg label="종류" value={kind} onChange={setKind} options={[{ value: "bank", label: "통장·계좌" }, { value: "card", label: "신용카드" }]} />
        </div>
      )}
      <div className="field">
        <label htmlFor="ac-name">이름</label>
        <input id="ac-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "card" ? "예: 공동 신용카드" : "예: 공동 생활비통장"} maxLength={30} />
      </div>
      <div className="field">
        <label htmlFor="ac-inst">{kind === "card" ? "카드사" : "은행·증권사"}</label>
        <input id="ac-inst" className="input" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder={kind === "card" ? "예: 삼성카드" : "예: 카카오뱅크"} maxLength={30} />
      </div>
      <div className="field">
        <span className="label">누구 것인가요</span>
        <Seg
          label="소유"
          value={owner}
          onChange={setOwner}
          options={[
            { value: "joint", label: "공동" },
            { value: "a", label: nameOf(s, "a") },
            { value: "b", label: nameOf(s, "b") },
          ]}
        />
        <p className="help">공동 지출을 개인 카드·계좌로 내면 정산 대상이 돼요.</p>
      </div>
      {kind === "card" && (
        <div className="inline-fields field">
          <div className="field">
            <label htmlFor="ac-bill">결제 계좌</label>
            <select id="ac-bill" className="select" value={billing ?? ""} onChange={(e) => setBilling(e.target.value || null)}>
              <option value="">선택</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="ac-day">결제일</label>
            <select id="ac-day" className="select" value={payDay ?? ""} onChange={(e) => setPayDay(e.target.value ? Number(e.target.value) : null)}>
              <option value="">선택</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  매달 {d}일
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {account && usedBy > 0 && <p className="help" style={{ marginTop: 16 }}>반복 항목 {usedBy}개가 이 {account.kind === "card" ? "카드" : "계좌"}를 쓰고 있어요.</p>}
    </Sheet>
  );
}

export function CategorySheet({ open, onOpenChange, category }: { open: boolean; onOpenChange: (v: boolean) => void; category?: Category }) {
  const { data, upsert, remove, toast } = useData();
  const [name, setName] = useState("");
  const [budget, setBudget] = useState(0);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setBudget(category?.budget ?? 0);
  }, [open, category]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={category ? category.name : "분류 추가"}
      headerAction={
        category && (
          <button
            type="button"
            className="btn danger sm"
            onClick={async () => {
              const backup = category;
              onOpenChange(false);
              await remove("categories", [category.id]);
              toast("분류를 지웠어요. 기존 기록은 미분류가 돼요.", () => void upsert("categories", [backup]));
            }}
          >
            <Trash2 aria-hidden="true" /> 삭제
          </button>
        )
      }
      footer={
        <button
          type="button"
          className="btn block"
          disabled={!name.trim()}
          onClick={async () => {
            onOpenChange(false);
            await upsert("categories", [
              { id: category?.id ?? newId("cat"), name: name.trim(), budget, sort: category?.sort ?? Math.max(0, ...data.categories.map((c) => c.sort)) + 1, rev: category?.rev },
            ]);
            toast("저장했어요");
          }}
        >
          저장
        </button>
      }
    >
      <div className="field">
        <label htmlFor="cat-name">이름</label>
        <input id="cat-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 장보기" maxLength={20} />
      </div>
      <div className="field">
        <label htmlFor="cat-budget">한 달 예산</label>
        <AmountInput id="cat-budget" value={budget} onChange={setBudget} />
        <p className="help">비워두면 예산 없이 사용액만 보여줘요.</p>
      </div>
    </Sheet>
  );
}
