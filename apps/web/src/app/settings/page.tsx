"use client";

import { useEffect, useState } from "react";
import { Plus, Download, LogOut, RotateCcw } from "lucide-react";
import type { Account, AccountKind, Category, Person, Settings } from "@/lib/types";
import { PAY_KIND_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { num } from "@/lib/format";
import { resetDemo, signOut } from "@/lib/repo";
import { AmountInput, Money, Seg, Who } from "@/components/ui";
import { AccountSheet, CategorySheet } from "@/components/SettingsSheets";

function csv(rows: (string | number)[][]) {
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export default function SettingsPage() {
  const { data, upsert, toast, auth, me, setMe, reload, exportSpendings, setMyName } = useData();
  const s = data.settings;
  const [draft, setDraft] = useState<Settings>(s);
  const myName = nameOf(s, me);
  const [nameDraft, setNameDraft] = useState(myName);
  useEffect(() => setNameDraft(myName), [myName]);
  const commitName = async () => {
    const next = nameDraft.trim();
    if (!next) return setNameDraft(myName);
    if (next === myName) return;
    try {
      await setMyName(next);
      toast("이름을 바꿨어요");
    } catch {
      setNameDraft(myName);
    }
  };
  const [acc, setAcc] = useState<{ open: boolean; account?: Account; kind?: AccountKind }>({ open: false });
  const [cat, setCat] = useState<{ open: boolean; category?: Category }>({ open: false });

  useEffect(() => setDraft(s), [s]);

  const save = async (patch: Partial<Settings>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    await upsert("settings", [next]);
    toast("저장했어요");
  };
  const commit = (key: keyof Settings) => {
    if (draft[key] !== s[key]) void save({});
  };

  const banks = data.accounts.filter((a) => a.kind === "bank" && !a.archived).sort((a, b) => a.sort - b.sort);
  const cards = data.accounts.filter((a) => a.kind === "card" && !a.archived).sort((a, b) => a.sort - b.sort);
  const cats = [...data.categories].sort((a, b) => a.sort - b.sort);
  const catTotal = cats.reduce((a, c) => a + c.budget, 0);

  const exportCsv = async () => {
    const all = await exportSpendings();
    const accName = (id: string | null) => data.accounts.find((a) => a.id === id)?.name ?? "";
    const catName = (id: string | null) => data.categories.find((c) => c.id === id)?.name ?? "";
    const body = csv([
      ["날짜", "금액", "분류", "결제수단", "카드·계좌", "비용귀속", "결제한 사람", "메모"],
      ...[...all]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => [r.date, r.amount, catName(r.category_id), PAY_KIND_LABEL[r.pay_kind], accName(r.account_id), nameOf(s, r.owner), nameOf(s, r.paid_by), r.memo]),
    ]);
    const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `우리집가계부-지출-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const accountRow = (a: Account) => (
    <button type="button" className="row" key={a.id} onClick={() => setAcc({ open: true, account: a })}>
      <span className={`tile card-${a.owner}`} aria-hidden="true">
        {(a.institution || a.name).slice(0, 2)}
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="t">{a.name}</div>
        <div className="s">
          {[a.institution, nameOf(s, a.owner), a.kind === "card" && a.pay_day ? `${a.pay_day}일 결제` : null, a.kind === "card" && a.billing_account_id ? data.accounts.find((x) => x.id === a.billing_account_id)?.name : null]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      <div className="r">
        {(s.salary_account_a === a.id || s.salary_account_b === a.id) && <span className="pill accent">월급통장</span>}
      </div>
    </button>
  );

  return (
    <>
      <header className="titlebar">
        <div>
          <h1>설정</h1>
          <p className="sub">{auth.state === "demo" ? "예시 데이터 · 이 브라우저에만 저장돼요" : auth.state === "member" ? auth.email : ""}</p>
        </div>
      </header>

      <div className="settings-wrap">
        <section className="set-sec" aria-labelledby="people-h">
          <div className="head">
            <h2 id="people-h">두 사람</h2>
            <p>이름은 각자 자기 계정에서 바꿔요. 평소 월급(실수령)과 월급통장은 새 달을 만들 때 기본값으로 써요.</p>
          </div>
          <div className="card">
            {(["a", "b"] as Person[]).map((p, idx) => {
              const salKey = p === "a" ? "salary_a" : "salary_b";
              const accKey = p === "a" ? "salary_account_a" : "salary_account_b";
              return (
                <div key={p} style={{ marginTop: idx ? 24 : 0 }}>
                  <div className="lane-head" style={{ marginBottom: 12 }}>
                    <Who owner={p} s={draft} size="sm" />
                    <span className="name">{p === me ? "나" : "배우자"}</span>
                    {p !== me && (
                      <span id={`n-${p}-hint`} className="help" style={{ marginLeft: "auto" }}>
                        {auth.state === "demo" ? "아래에서 사람을 바꿔 고쳐요" : "이름은 본인이 바꿔요"}
                      </span>
                    )}
                  </div>
                  <div className="inline-fields">
                    <div className="field">
                      <label htmlFor={`n-${p}`}>{p === me ? "내 이름" : "이름"}</label>
                      {p === me ? (
                        <input
                          id={`n-${p}`}
                          className="input"
                          value={nameDraft}
                          maxLength={10}
                          autoComplete="nickname"
                          onChange={(e) => setNameDraft(e.target.value)}
                          onBlur={() => void commitName()}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        />
                      ) : (
                        <input id={`n-${p}`} className="input" value={nameOf(s, p)} readOnly aria-describedby={`n-${p}-hint`} title="이름은 본인이 바꿔요" />
                      )}
                    </div>
                    <div className="field" style={{ marginTop: 0 }}>
                      <label htmlFor={`s-${p}`}>월급</label>
                      <AmountInput id={`s-${p}`} value={draft[salKey]} onChange={(v) => setDraft({ ...draft, [salKey]: v })} />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`a-${p}`}>월급통장</label>
                    <select id={`a-${p}`} className="select" value={draft[accKey] ?? ""} onChange={(e) => void save({ [accKey]: e.target.value || null })}>
                      <option value="">선택</option>
                      {banks
                        .filter((b) => b.owner === p)
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              );
            })}
            <div className="card-foot">
              <span />
              <button type="button" className="btn sm" disabled={draft.salary_a === s.salary_a && draft.salary_b === s.salary_b} onClick={() => void save({})}>
                저장
              </button>
            </div>
          </div>
        </section>

        <section className="set-sec" aria-labelledby="split-h">
          <div className="head">
            <h2 id="split-h">공동비용 나누기</h2>
            <p>‘공동’ 항목을 두 사람이 어떤 비율로 낼지 정해요. 이체 금액과 정산이 이 비율을 따라요.</p>
          </div>
          <div className="card">
            <Seg
              label="분담 방식"
              value={draft.split_mode}
              onChange={(v) => void save({ split_mode: v })}
              options={[
                { value: "fixed", label: "정한 비율" },
                { value: "income", label: "월급 비율" },
              ]}
            />
            {draft.split_mode === "fixed" ? (
              <div className="field" style={{ marginTop: 18 }}>
                <label htmlFor="ratio">
                  {nameOf(draft, "a")} {draft.ratio_a}% · {nameOf(draft, "b")} {100 - draft.ratio_a}%
                </label>
                <input
                  id="ratio"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={draft.ratio_a}
                  style={{ accentColor: "var(--text)" }}
                  onChange={(e) => setDraft({ ...draft, ratio_a: Number(e.target.value) })}
                  onPointerUp={() => commit("ratio_a")}
                  onKeyUp={() => commit("ratio_a")}
                />
              </div>
            ) : (
              <p className="kpi-sub" style={{ marginTop: 14 }}>
                그달 월급 기준으로 나눠요. 기본 월급이면 {nameOf(draft, "a")} {Math.round((draft.salary_a / Math.max(1, draft.salary_a + draft.salary_b)) * 100)}% · {nameOf(draft, "b")}{" "}
                {100 - Math.round((draft.salary_a / Math.max(1, draft.salary_a + draft.salary_b)) * 100)}%.
              </p>
            )}
          </div>
        </section>

        <section className="set-sec" aria-labelledby="cycle-h">
          <div className="head">
            <h2 id="cycle-h">한 달의 기준</h2>
            <p>월급날부터 다음 월급 전날까지를 한 달로 보면 생활비 계산이 편해요.</p>
          </div>
          <div className="card">
            <div className="inline-fields">
              <div className="field">
                <label htmlFor="payday">월급날</label>
                <select id="payday" className="select" value={draft.payday} onChange={(e) => void save({ payday: Number(e.target.value) })}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      매달 {d}일
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginTop: 0 }}>
                <label htmlFor="cycle">가계부 시작일</label>
                <select id="cycle" className="select" value={draft.cycle_start} onChange={(e) => void save({ cycle_start: Number(e.target.value) })}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d === 1 ? "1일 (달력 기준)" : `${d}일`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="help kpi-sub" style={{ marginTop: 12 }}>
              {draft.cycle_start === 1 ? "11월 = 11월 1일 ~ 11월 30일" : `11월 = 10월 ${draft.cycle_start}일 ~ 11월 ${draft.cycle_start - 1}일`}
            </p>
          </div>
        </section>

        <section className="set-sec" aria-labelledby="acc-h">
          <div className="head">
            <h2 id="acc-h">계좌와 카드</h2>
            <p>이체 목록과 카드값 계산에 써요. 잔액은 따로 관리하지 않아요.</p>
          </div>
          <div className="card">
            <div className="rows">{banks.map(accountRow)}</div>
            <div className="card-foot" style={{ justifyContent: "flex-start" }}>
              <button type="button" className="btn ghost" onClick={() => setAcc({ open: true, kind: "bank" })}>
                <Plus aria-hidden="true" /> 계좌 추가
              </button>
            </div>
            <div className="rows" style={{ marginTop: 8, borderTop: "1px solid var(--rule)" }}>
              {cards.map(accountRow)}
            </div>
            <div className="card-foot" style={{ justifyContent: "flex-start" }}>
              <button type="button" className="btn ghost" onClick={() => setAcc({ open: true, kind: "card" })}>
                <Plus aria-hidden="true" /> 카드 추가
              </button>
            </div>
          </div>
        </section>

        <section className="set-sec" aria-labelledby="cat-h">
          <div className="head">
            <h2 id="cat-h">생활비 분류와 예산</h2>
            <p>
              분류 예산 합계 <Money value={catTotal} />. 플랜의 공동 생활비와 맞추면 어디서 넘치는지 보기 쉬워요.
            </p>
          </div>
          <div className="card">
            <div className="rows">
              {cats.map((c) => (
                <button type="button" className="row no-lead" key={c.id} onClick={() => setCat({ open: true, category: c })}>
                  <div className="t">{c.name}</div>
                  <div className="r">{c.budget > 0 ? <Money value={c.budget} /> : <span className="s">예산 없음</span>}</div>
                </button>
              ))}
            </div>
            <div className="card-foot" style={{ justifyContent: "flex-start" }}>
              <button type="button" className="btn ghost" onClick={() => setCat({ open: true })}>
                <Plus aria-hidden="true" /> 분류 추가
              </button>
            </div>
          </div>
        </section>

        <section className="set-sec" aria-labelledby="me-h">
          <div className="head">
            <h2 id="me-h">{auth.state === "demo" ? "예시 데이터" : "계정"}</h2>
            <p>{auth.state === "demo" ? "아직 두 사람 계정을 연결하지 않아서 예시 데이터로 보여주고 있어요. 이 브라우저에만 저장되고, 체크·기록은 아래에서 고른 사람 이름으로 남아요." : "체크와 기록은 로그인한 사람 이름으로 남아요."}</p>
          </div>
          <div className="card">
            {auth.state === "demo" ? (
              <>
                <div className="field">
                  <span className="label">지금 사용하는 사람</span>
                  <Seg label="지금 사용하는 사람" value={me} onChange={setMe} options={[{ value: "a", label: nameOf(s, "a") }, { value: "b", label: nameOf(s, "b") }]} />
                </div>
                <div className="card-foot" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn secondary sm"
                    onClick={async () => {
                      resetDemo();
                      await reload();
                      toast("예시 데이터로 되돌렸어요");
                    }}
                  >
                    <RotateCcw aria-hidden="true" /> 예시 데이터로 초기화
                  </button>
                  <button type="button" className="btn secondary sm" onClick={() => void exportCsv()}>
                    <Download aria-hidden="true" /> 지출 CSV 내보내기
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="row" style={{ borderTop: 0 }}>
                  <Who owner={me} s={s} />
                  <div>
                    <div className="t">{nameOf(s, me)}</div>
                    <div className="s">{auth.state === "member" ? auth.email : ""}</div>
                  </div>
                  <div className="r" />
                </div>
                <div className="card-foot" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                  <button type="button" className="btn secondary sm" onClick={() => void exportCsv()}>
                    <Download aria-hidden="true" /> 지출 CSV 내보내기
                  </button>
                  <button type="button" className="btn danger sm" onClick={() => void signOut()}>
                    <LogOut aria-hidden="true" /> 로그아웃
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <AccountSheet open={acc.open} account={acc.account} kind={acc.kind} onOpenChange={(open) => setAcc((x) => ({ ...x, open }))} />
      <CategorySheet open={cat.open} category={cat.category} onOpenChange={(open) => setCat((x) => ({ ...x, open }))} />
    </>
  );
}
