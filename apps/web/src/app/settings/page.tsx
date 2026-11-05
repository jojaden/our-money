"use client";

import { useEffect, useState } from "react";
import { Plus, Download, History, LogOut, RotateCcw } from "lucide-react";
import type { Account, AccountKind, Category, Person, Settings } from "@/lib/types";
import { PAY_KIND_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { nameOf, paydayOf } from "@/lib/calc";
import { num } from "@/lib/format";
import { resetDemo, signOut } from "@/lib/repo";
import { AmountInput, Money, Seg, Who } from "@/components/ui";
import { CategorySheet } from "@/components/SettingsSheets";
import { AddPass } from "@/components/AddPass";
import { Wallet } from "@/components/Wallet";
import { MiniCard } from "@/components/pass";
import { HistorySheet } from "@/components/HistorySheet";

/** 스프레드시트가 수식으로 실행하지 않게 = + - @ 탭·줄바꿈으로 시작하는 글자 칸 앞에 ' 를 붙인다 */
function cell(v: string | number) {
  const t = String(v);
  return typeof v === "string" && /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
}

function csv(rows: (string | number)[][]) {
  return rows.map((r) => r.map((v) => `"${cell(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export default function SettingsPage() {
  const { data, upsert, toast, auth, me, setMe, reload, exportSpendings, setMyName, pending } = useData();
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => setDraft(s), [s]);

  const save = async (patch: Partial<Settings>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (!(await upsert("settings", [next]))) return;
    toast("저장했어요");
  };
  const commit = (key: keyof Settings) => {
    if (draft[key] !== s[key]) void save({});
  };

  const perPerson = s.payday_a != null && s.payday_b != null;
  const banks = data.accounts.filter((a) => a.kind === "bank" && !a.archived).sort((a, b) => a.sort - b.sort);
  const hidden = data.accounts.filter((a) => a.archived).sort((a, b) => a.sort - b.sort);
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

  // 로그아웃하면 이 기기에 보관한 저장이 지워지니, 남아 있으면 먼저 묻는다
  const logout = () => {
    if (pending > 0 && !window.confirm(`보내지 못한 저장 ${pending}건이 있어요. 로그아웃하면 이 기기에서 지워져요. 로그아웃할까요?`)) return;
    void signOut();
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>설정</h1>
          <p className="sub">{auth.state === "demo" ? "예시 데이터 · 이 브라우저에만 저장돼요" : auth.state === "member" ? auth.email : ""}</p>
        </div>
      </header>

      <div className="settings-wrap">
        <section className="set-sec" aria-labelledby="people-h">
          <div className="head">
            <h2 id="people-h">두 사람</h2>
            <p>이름은 각자 자기 계정에서 바꿔요. 월급날에는 체크에서 각자 자기 월급통장에서 옮길 돈을 확인해요(그달에 없는 날이면 말일). 평소 월급(실수령)은 새 달을 만들 때 기본값으로 써요.</p>
          </div>
          <div className="card">
            {(["a", "b"] as Person[]).map((p, idx) => {
              const salKey = p === "a" ? "salary_a" : "salary_b";
              const accKey = p === "a" ? "salary_account_a" : "salary_account_b";
              // 006 전 DB 에는 사람별 월급날 칸이 없다 → 공통 월급날을 고친다
              const payKey = !perPerson ? "payday" : p === "a" ? "payday_a" : "payday_b";
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
                  <div className="inline-fields" style={{ marginTop: 18 }}>
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
                    <div className="field" style={{ marginTop: 0 }}>
                      <label htmlFor={`pd-${p}`}>월급날</label>
                      <select id={`pd-${p}`} className="select" value={paydayOf(draft, p)} onChange={(e) => void save({ [payKey]: Number(e.target.value) })}>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={d}>
                            매달 {d}일
                          </option>
                        ))}
                      </select>
                    </div>
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
            <p>한 사람의 월급날부터 다음 월급 전날까지를 한 달로 보면 생활비 계산이 편해요. 두 사람 월급날이 다르면 보통 먼저 받는 사람의 월급날로 맞춰요.</p>
          </div>
          <div className="card">
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
            <p className="help kpi-sub" style={{ marginTop: 12 }}>
              {draft.cycle_start === 1 ? "11월 = 11월 1일 ~ 11월 30일" : `11월 = 10월 ${draft.cycle_start}일 ~ 11월 ${draft.cycle_start - 1}일`}
            </p>
          </div>
        </section>

        <section className="set-sec" aria-labelledby="acc-h">
          <div className="head">
            <h2 id="acc-h">지갑</h2>
            <p>계좌와 카드예요. 이체 목록과 카드값 계산에 써요. 잔액은 따로 관리하지 않아요. 카드를 누르면 카드값·결제일·최근 사용이 나와요.</p>
          </div>
          <div>
            <Wallet onAdd={() => setAcc({ open: true, kind: "card" })} onEdit={(a) => setAcc({ open: true, account: a })} />
            {hidden.length > 0 && (
              <section className="group hidden-passes" aria-labelledby="hidden-h">
                <div className="group-head">
                  <h3 id="hidden-h">숨긴 카드·통장</h3>
                </div>
                <div className="card">
                  <div className="rows">
                    {hidden.map((a) => (
                      <div className="row" key={a.id}>
                        <MiniCard account={a} />
                        <div style={{ minWidth: 0 }}>
                          <div className="t">{a.name}</div>
                          <div className="s">{[a.institution, nameOf(s, a.owner)].filter(Boolean).join(" · ")}</div>
                        </div>
                        <button type="button" className="btn secondary sm" onClick={() => void upsert("accounts", [{ ...a, archived: false }])}>
                          되살리기
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
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
                  <button
                    type="button"
                    className="btn secondary sm"
                    onClick={() => {
                      setHistoryKey((n) => n + 1);
                      setHistoryOpen(true);
                    }}
                  >
                    <History aria-hidden="true" /> 변경 이력
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
                  <button
                    type="button"
                    className="btn secondary sm"
                    onClick={() => {
                      setHistoryKey((n) => n + 1);
                      setHistoryOpen(true);
                    }}
                  >
                    <History aria-hidden="true" /> 변경 이력
                  </button>
                  <button type="button" className="btn danger sm" onClick={logout}>
                    <LogOut aria-hidden="true" /> 로그아웃
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <AddPass open={acc.open} account={acc.account} kind={acc.kind} onOpenChange={(open) => setAcc((x) => ({ ...x, open }))} />
      <CategorySheet open={cat.open} category={cat.category} onOpenChange={(open) => setCat((x) => ({ ...x, open }))} />
      <HistorySheet key={historyKey} open={historyOpen} onOpenChange={setHistoryOpen} />
    </>
  );
}
