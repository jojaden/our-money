"use client";

import { useEffect, useState } from "react";
import { ChevronRight, CreditCard, EyeOff, Landmark, Search } from "lucide-react";
import type { Account, AccountKind, Owner, PassColor } from "@/lib/types";
import { PASS_COLORS, PASS_COLOR_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { eul } from "@/lib/format";
import { haptic } from "@/lib/native";
import { BANKS, CARD_ISSUERS, canonicalInstitution, logoOf, suggestInstitutions } from "@/lib/institutions";
import { InstLogo, InstMark, passArt } from "./pass";
import { PersonGlyph, Sheet, useBackToClose } from "./ui";

function newId(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`;
}

/**
 * 카드·통장을 지갑에 넣는 시트 (docs/design-system/components/AddPass).
 * 처음 넣을 때는 한 시트 안에서 한 번에 하나씩 묻는다(토스 1 thing for 1 page): 무엇을 넣을까요? → 어느 은행·카드사? → 확인.
 * 단계마다 뒤로 가기 기록을 한 칸씩 쌓아, 뒤로 가기를 하면 한 단계씩 돌아간다. 확인 단계에서는 누구 것을 고르면 이름이 저절로 채워진다.
 * 맨 위 카드 그림이 적는 대로 바뀌고, 넣는 순간 카드가 지갑 쪽으로 내려간다.
 * 이미 있는 카드는 같은 시트를 "고치기"로 연다(종류는 바꾸지 않고, 머리에 "숨기기").
 */
export function AddPass({
  open,
  onOpenChange,
  account,
  kind: initialKind,
  owner: initialOwner,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account?: Account;
  kind?: AccountKind;
  /** 새로 넣을 때 처음 골라 둘 주인 (플랜 항목에서 그 사람 몫의 나가는 곳을 넣을 때) */
  owner?: Owner;
  /** 새로 넣고 저장까지 끝나면 — 넣은 자리(플랜 항목)에서 방금 넣은 것을 골라 두게 */
  onSaved?: (a: Account) => void;
}) {
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
  // 처음 넣을 때의 단계, 이름을 직접 고쳤는지(안 고쳤으면 추천 이름이 저절로), 기관 찾기 글자
  type Step = "kind" | "inst" | "detail";
  const [step, setStep] = useState<Step>("kind");
  const [nameTouched, setNameTouched] = useState(false);
  const [instQuery, setInstQuery] = useState("");
  // 열 때마다 처음 단계로 — 그리는 도중에 바꿔, 지난번에 닫힌 단계가 남아 뒤로 가기 기록이 잘못 쌓이지 않게 한다
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep(account ? "detail" : initialKind ? "inst" : "kind");
      setNameTouched(Boolean(account));
      setInstQuery("");
    }
  }
  // 단계마다 뒤로 가기 한 칸: 확인 → 기관 → 종류 → (시트가) 닫힘
  useBackToClose(open && !account && step !== "kind", (v) => !v && setStep("kind"));
  useBackToClose(open && !account && step === "detail", (v) => !v && setStep("inst"));

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setKind(account?.kind ?? initialKind ?? "card");
    setOwner(account?.owner ?? initialOwner ?? "joint");
    setInstitution(account?.institution ?? "");
    setLast4(account?.last4 ?? "");
    setBilling(account?.billing_account_id ?? null);
    setPayDay(account?.pay_day ?? null);
    setColor(account?.color ?? null);
    setNote(account?.note ?? "");
    setDropping(false);
  }, [open, account, initialKind, initialOwner]);

  const banks = data.accounts.filter((a) => a.kind === "bank" && !a.archived && a.id !== account?.id);
  // 나눠 내는 공동 항목의 두 사람 몫이 같은 곳을 쓰면 한 항목으로 센다
  const usedBy = account ? new Set(data.plan_items.filter((p) => p.active && (p.account_id === account.id || p.card_id === account.id)).map((p) => p.pair_id ?? p.id)).size : 0;
  const card = kind === "card";

  const owners: Owner[] = ["joint", "a", "b"];
  // 이름 추천: 누구 것·종류에 맞춰 흔한 이름, 이미 지갑에 있는 이름은 뺀다
  const who = owner === "joint" ? "공동" : nameOf(s, owner);
  const used = new Set(data.accounts.filter((a) => !a.archived).map((a) => a.name));
  const nameIdeas = (
    card
      ? owner === "joint"
        ? ["공동 신용카드", "공동 체크카드", "생활비 카드"]
        : [`${who} 카드`, `${who} 체크카드`]
      : owner === "joint"
        ? ["공동 생활비통장", "고정비 통장", "비상금 통장", "공동 적금"]
        : [`${who} 급여통장`, `${who} 용돈통장`, `${who} 적금`]
  ).filter((n) => !used.has(n));
  // 이름을 직접 고치기 전에는 첫 추천 이름이 저절로 들어가 있다(확인만 누르면 되게)
  const autoName = nameIdeas[0] ?? `${who} ${card ? "카드" : "통장"}`;
  const shownName = nameTouched ? name : autoName;
  const finalName = shownName.trim();
  const save = async () => {
    if (!finalName || dropping) return;
    const row: Account = {
      id: account?.id ?? newId(card ? "card" : "acc"),
      name: finalName,
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
    if (!(await upsert("accounts", [row]))) return;
    toast(`${eul(row.name)} 지갑에 넣었어요`);
    onSaved?.(row);
  };

  const archive = async () => {
    if (!account) return;
    onOpenChange(false);
    if (!(await upsert("accounts", [{ ...account, archived: true }]))) return;
    toast(`${eul(account.name)} 숨겼어요`, () => void upsert("accounts", [account]));
  };

  const suggestions = instFocus ? suggestInstitutions(kind, institution) : [];
  const front = passArt({ kind: "card", owner, color }, []);
  const isNew = !account;

  // 기관 고르기: 통장은 은행·증권 두 묶음, 카드는 카드사. 몇 글자로 찾고, 없으면 적은 이름 그대로
  const q = instQuery.replace(/\s+/g, "").toLowerCase();
  const hit = (n: string) => !q || n.replace(/\s+/g, "").toLowerCase().includes(q);
  const instGroups: [string, string[]][] = card
    ? [["카드사", CARD_ISSUERS.filter(hit)]]
    : [
        ["은행", BANKS.filter((n) => !n.endsWith("증권")).filter(hit)],
        ["증권", BANKS.filter((n) => n.endsWith("증권")).filter(hit)],
      ];
  const exact = [...CARD_ISSUERS, ...BANKS].some((n) => n.replace(/\s+/g, "").toLowerCase() === q);
  const pickInst = (n: string) => {
    setInstitution(canonicalInstitution(n));
    setStep("detail");
  };

  const title = account
    ? `${account.name} 고치기`
    : step === "kind"
      ? "무엇을 넣을까요?"
      : step === "inst"
        ? card
          ? "어느 카드사 카드예요?"
          : "어느 은행·증권사 계좌예요?"
        : "이렇게 넣을게요";

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      className="add-pass"
      title={title}
      headerAction={
        account && (
          <button type="button" className="btn danger sm" onClick={() => void archive()}>
            <EyeOff aria-hidden="true" /> 숨기기
          </button>
        )
      }
      footer={
        step === "detail" && (
          <button type="button" className="btn block" disabled={!finalName} onClick={() => void save()}>
            {account ? "저장" : dropping ? "지갑에 넣었어요" : "지갑에 넣기"}
          </button>
        )
      }
    >
      {/* 1. 무엇을 넣을까요 — 큰 선택지 둘, 각각 앱에서 하는 일 한 줄 */}
      {step === "kind" && (
        <div className="ap-choices" key="kind">
          {(
            [
              ["card", CreditCard, "신용·체크카드", "지출을 적을 때 어느 카드로 냈는지 고르고, 결제일이 되면 카드값을 챙겨 줘요."],
              ["bank", Landmark, "통장·증권 계좌", "월급이 들어오고 이체·카드값이 빠져나가는 계좌예요. 플랜에서 어디서 어디로 옮길지 고를 때 써요."],
            ] as const
          ).map(([k, Icon, label, desc]) => (
            <button
              key={k}
              type="button"
              className="ap-choice"
              onClick={() => {
                setKind(k);
                setInstitution("");
                setInstQuery("");
                setStep("inst");
              }}
            >
              <span className="ap-choice-icon" aria-hidden="true">
                <Icon />
              </span>
              <span className="ap-choice-text">
                <span className="t">{label}</span>
                <span className="s">{desc}</span>
              </span>
              <ChevronRight className="ap-chev" aria-hidden="true" />
            </button>
          ))}
          <p className="help">잔액은 관리하지 않아요. 계좌번호·카드번호 전체도 받지 않아요.</p>
        </div>
      )}

      {/* 2. 어느 은행·카드사 — 로고를 눌러 고른다 */}
      {step === "inst" && (
        <div className="ap-inst" key="inst">
          <label className="ap-search">
            <Search aria-hidden="true" />
            <input
              value={instQuery}
              onChange={(e) => setInstQuery(e.target.value)}
              placeholder={card ? "카드사 이름 찾기" : "은행·증권사 이름 찾기"}
              aria-label={card ? "카드사 이름 찾기" : "은행·증권사 이름 찾기"}
              autoComplete="off"
              maxLength={30}
            />
          </label>
          {instGroups.map(
            ([group, list]) =>
              list.length > 0 && (
                <div key={group} role="group" aria-label={group}>
                  {!card && <p className="ap-group">{group}</p>}
                  <div className="ap-grid">
                    {list.map((n) => (
                      <button key={n} type="button" className="ap-tile" onClick={() => pickInst(n)}>
                        <InstLogo name={n} />
                        <span>{n}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ),
          )}
          {q && !exact && (
            <button type="button" className="ap-own" onClick={() => pickInst(instQuery.trim())}>
              ‘{instQuery.trim()}’ 그대로 쓰기
            </button>
          )}
          <button type="button" className="ap-skip" onClick={() => pickInst("")}>
            고르지 않고 넘어가기
          </button>
        </div>
      )}

      {/* 3. 확인 — 미리보기, 누구 것 → 이름(저절로 채움), 나머지는 선택 */}
      {step === "detail" && (
        <div key="detail">
          {isNew && (
            <button type="button" className="ap-summary" onClick={() => setStep("inst")}>
              <InstLogo name={institution || (card ? "카드" : "통장")} />
              <span className="t">
                {institution || "기관 없음"} · {card ? "신용·체크카드" : "통장·증권 계좌"}
              </span>
              <span className="r">바꾸기</span>
            </button>
          )}
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
                      <span className={`nm ${shownName ? "" : "ph"}`}>{shownName || (side === "card" ? "카드 이름" : "통장 이름")}</span>
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
            <label className="form-row">
              <span>이름</span>
              <input
                value={shownName}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameTouched(true);
                }}
                placeholder={card ? "공동 신용카드" : "공동 생활비통장"}
                maxLength={30}
                aria-describedby="ap-name-help"
              />
            </label>
            <p className="help form-help" id="ap-name-help">
              {card ? "지출을 적을 때·카드값 목록에 이 이름으로 나와요." : "이체 목록에 “어디 → 어디”로 이 이름이 나와요."}
              {!nameTouched && isNew ? " 누구 것을 바꾸면 이름도 따라 바뀌어요." : ""}
            </p>
            {nameIdeas.filter((n) => n !== shownName).length > 0 && (
              <div className="form-suggest" role="listbox" aria-label="다른 이름 고르기">
                {nameIdeas
                  .filter((n) => n !== shownName)
                  .map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="chip"
                      onClick={() => {
                        setName(n);
                        setNameTouched(true);
                      }}
                    >
                      {n}
                    </button>
                  ))}
              </div>
            )}
            {/* 고칠 때는 기관을 여기서 바꾼다(처음 넣을 때는 위 요약 줄의 '바꾸기') */}
            {!isNew && (
              <>
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
              </>
            )}
          </div>

          {/* 카드값을 챙기는 데 쓰는 것 — 몰라도 넣을 수 있다 */}
          {card && (
            <>
              <p className="ap-group">카드값 정보 (선택)</p>
              <div className="form-group ap-tight">
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
                  <span>끝 4자리</span>
                  <input value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" placeholder="카드번호 끝 4자리" />
                </label>
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
              </div>
            </>
          )}
          <div className="form-group">
            <label className="form-row wide">
              <span>메모 (선택)</span>
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
            공동 지출을 개인 카드·통장으로 내면 정산 대상이 돼요.
            {card ? " 끝 4자리는 카드 알림에서 카드를 찾는 데만 써요. 색은 내 카드와 비슷하게 고르면 돼요(자동은 이번 달 쓴 버킷 색)." : ""}
          </p>
          {account && usedBy > 0 && <p className="help">반복 항목 {usedBy}개가 이 {card ? "카드" : "통장"}를 쓰고 있어요.</p>}
        </div>
      )}
    </Sheet>
  );
}
