"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Download, BellRing, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, FlaskConical, History, LogOut, RotateCcw, Scale, SunMoon, Tags, UserRound, Users, WalletCards } from "lucide-react";
import type { Account, AccountKind, Category, Person, Settings } from "@/lib/types";
import { PAY_KIND_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { nameOf, paydayOf } from "@/lib/calc";
import { num } from "@/lib/format";
import { resetDemo, signOut } from "@/lib/repo";
import { toApp, useInApp } from "@/lib/native";
import { AmountInput, Money, Seg, Who } from "@/components/ui";
import { CategorySheet } from "@/components/SettingsSheets";
import { AddPass } from "@/components/AddPass";
import { Wallet } from "@/components/Wallet";
import { MiniCard } from "@/components/pass";
import { HistorySheet } from "@/components/HistorySheet";
import { IcsSheet } from "@/components/IcsSheet";
import { leaveDetail } from "@/lib/navigationMotion";
import { setTheme, useTheme, type ThemeChoice } from "@/lib/theme";

/** 설정 묶음 — 폰은 목록(/settings/)에서 하나를 눌러 그 묶음만(/settings/?s=…) 보고, 데스크톱은 모두 한 화면에 둔다 */
type SecId = "people" | "split" | "cycle" | "wallet" | "categories" | "display" | "account";
const SEC_IDS: SecId[] = ["people", "split", "cycle", "wallet", "categories", "display", "account"];

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "밝게" },
  { value: "dark", label: "어둡게" },
  { value: "system", label: "기기 설정" },
];

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
  const router = useRouter();
  const q = useSearchParams().get("s");
  const sec = SEC_IDS.find((id) => id === q) ?? null;
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
  // 열 때마다 처음 상태(모든 일정)로
  const [ics, setIcs] = useState({ open: false, key: 0 });
  const openIcs = () => setIcs((x) => ({ open: true, key: x.key + 1 }));
  const app = useInApp();

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

  const openHistory = () => {
    setHistoryKey((n) => n + 1);
    setHistoryOpen(true);
  };
  const demo = auth.state === "demo";
  const theme = useTheme().choice;
  const SECS: Record<SecId, { title: string; desc: string; summary: string; icon: typeof Users }> = {
    people: {
      title: "두 사람",
      desc: "이름은 각자 자기 계정에서 바꿔요. 월급날에는 체크에서 각자 자기 월급통장에서 옮길 돈을 확인해요(그달에 없는 날이면 말일). 평소 월급(실수령)은 새 달을 만들 때 기본값으로 써요.",
      summary: `${nameOf(s, "a")} 매달 ${paydayOf(s, "a")}일 · ${nameOf(s, "b")} 매달 ${paydayOf(s, "b")}일`,
      icon: Users,
    },
    split: {
      title: "공동비용 나누기",
      desc: "‘공동’ 항목을 두 사람이 어떤 비율로 낼지 정해요. 이체 금액과 정산이 이 비율을 따라요.",
      summary: s.split_mode === "income" ? "월급 비율" : `${nameOf(s, "a")} ${s.ratio_a}% · ${nameOf(s, "b")} ${100 - s.ratio_a}%`,
      icon: Scale,
    },
    cycle: {
      title: "한 달의 기준",
      desc: "한 사람의 월급날부터 다음 월급 전날까지를 한 달로 보면 생활비 계산이 편해요. 두 사람 월급날이 다르면 보통 먼저 받는 사람의 월급날로 맞춰요.",
      summary: s.cycle_start === 1 ? "1일부터 (달력 기준)" : `매달 ${s.cycle_start}일부터`,
      icon: CalendarRange,
    },
    wallet: {
      title: "지갑",
      desc: "계좌와 카드예요. 이체 목록과 카드값 계산에 써요. 잔액은 따로 관리하지 않아요. 카드를 누르면 카드값·결제일·최근 사용이 나와요.",
      summary: `카드 ${data.accounts.filter((a) => a.kind === "card" && !a.archived).length}장 · 통장 ${banks.length}개`,
      icon: WalletCards,
    },
    categories: {
      title: "생활비 분류와 예산",
      desc: `분류 예산 합계 ${num(catTotal)}원. 플랜의 공동 생활비와 맞추면 어디서 넘치는지 보기 쉬워요.`,
      summary: `분류 ${cats.length}개 · 예산 ${num(catTotal)}원`,
      icon: Tags,
    },
    display: {
      title: "화면",
      desc: "밝은 화면과 어두운 화면 중에 골라요. 기기 설정을 고르면 폰의 다크 모드를 따라가요. 이 기기에만 저장돼요.",
      summary: THEMES.find((t) => t.value === theme)!.label,
      icon: SunMoon,
    },
    account: {
      title: demo ? "예시 데이터" : "계정",
      desc: demo ? "아직 두 사람 계정을 연결하지 않아서 예시 데이터로 보여주고 있어요. 이 브라우저에만 저장되고, 체크·기록은 아래에서 고른 사람 이름으로 남아요." : "체크와 기록은 로그인한 사람 이름으로 남아요.",
      summary: demo ? `지금 사용하는 사람 · ${nameOf(s, me)}` : auth.state === "member" ? auth.email : "",
      icon: demo ? FlaskConical : UserRound,
    },
  };
  const open = sec ? SECS[sec] : null;
  // 이 묶음을 그릴지 — 폰에서는 고른 묶음만, 데스크톱은 CSS 가 모두 보인다
  const on = (id: SecId) => `set-sec${sec === id ? " on" : ""}`;

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
          {open && (
            <button type="button" className="back-btn set-back" onClick={() => leaveDetail(router, "/settings/")}>
              <ChevronLeft aria-hidden="true" />
              설정
            </button>
          )}
          <h1>{open ? open.title : "설정"}</h1>
          <p className="sub">{open ? open.desc : demo ? "예시 데이터 · 이 브라우저에만 저장돼요" : auth.state === "member" ? auth.email : ""}</p>
        </div>
      </header>

      <div className="settings-wrap" data-sec={sec ?? undefined}>
        {/* 폰 목록: 묶음마다 한 줄, 누르면 그 묶음만 보는 화면으로 */}
        <nav className="set-list" aria-label="설정 묶음">
          <div className="card">
            <div className="rows" style={{ ["--inset" as string]: "48px" }}>
              {SEC_IDS.map((id) => {
                const { title, summary, icon: Icon } = SECS[id];
                return (
                  <Link key={id} className="row" href={`/settings/?s=${id}`}>
                    <span className="alert-ic" aria-hidden="true">
                      <Icon />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="t">{title}</div>
                      <div className="s">{summary}</div>
                    </div>
                    <ChevronRight className="chev" aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="card">
            <div className="rows" style={{ ["--inset" as string]: "48px" }}>
              <button type="button" className="row" onClick={openHistory}>
                <span className="alert-ic" aria-hidden="true"><History /></span>
                <div className="t">변경 이력</div>
                <ChevronRight className="chev" aria-hidden="true" />
              </button>
              <button type="button" className="row" onClick={() => void exportCsv()}>
                <span className="alert-ic" aria-hidden="true"><Download /></span>
                <div className="t">지출 CSV 내보내기</div>
                <span />
              </button>
              <button type="button" className="row" onClick={openIcs}>
                <span className="alert-ic" aria-hidden="true"><CalendarDays /></span>
                <div className="t">일정 내보내기</div>
                <ChevronRight className="chev" aria-hidden="true" />
              </button>
              {app && (
                <button type="button" className="row" onClick={() => toApp("card-notice")}>
                  <span className="alert-ic" aria-hidden="true"><BellRing /></span>
                  <div className="t">카드 알림</div>
                  <ChevronRight className="chev" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </nav>

        <section className={on("people")} aria-labelledby="people-h">
          <div className="head">
            <h2 id="people-h">{SECS.people.title}</h2>
            <p>{SECS.people.desc}</p>
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

        <section className={on("split")} aria-labelledby="split-h">
          <div className="head">
            <h2 id="split-h">{SECS.split.title}</h2>
            <p>{SECS.split.desc}</p>
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

        <section className={on("cycle")} aria-labelledby="cycle-h">
          <div className="head">
            <h2 id="cycle-h">{SECS.cycle.title}</h2>
            <p>{SECS.cycle.desc}</p>
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

        <section className={on("wallet")} aria-labelledby="acc-h">
          <div className="head">
            <h2 id="acc-h">{SECS.wallet.title}</h2>
            <p>{SECS.wallet.desc}</p>
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

        <section className={on("categories")} aria-labelledby="cat-h">
          <div className="head">
            <h2 id="cat-h">{SECS.categories.title}</h2>
            <p>{SECS.categories.desc}</p>
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

        <section className={on("display")} aria-labelledby="display-h">
          <div className="head">
            <h2 id="display-h">{SECS.display.title}</h2>
            <p>{SECS.display.desc}</p>
          </div>
          <div className="card">
            <div className="field" style={{ marginTop: 0 }}>
              <span className="label">테마</span>
              <Seg label="테마" value={theme} onChange={setTheme} options={THEMES} />
            </div>
          </div>
        </section>

        <section className={on("account")} aria-labelledby="me-h">
          <div className="head">
            <h2 id="me-h">{SECS.account.title}</h2>
            <p>{SECS.account.desc}</p>
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
                  <button type="button" className="btn secondary sm desk-only" onClick={() => void exportCsv()}>
                    <Download aria-hidden="true" /> 지출 CSV 내보내기
                  </button>
                  <button type="button" className="btn secondary sm desk-only" onClick={openIcs}>
                    <CalendarDays aria-hidden="true" /> 일정 내보내기
                  </button>
                  <button type="button" className="btn secondary sm desk-only" onClick={openHistory}>
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
                  <button type="button" className="btn secondary sm desk-only" onClick={() => void exportCsv()}>
                    <Download aria-hidden="true" /> 지출 CSV 내보내기
                  </button>
                  <button type="button" className="btn secondary sm desk-only" onClick={openIcs}>
                    <CalendarDays aria-hidden="true" /> 일정 내보내기
                  </button>
                  <button type="button" className="btn secondary sm desk-only" onClick={openHistory}>
                    <History aria-hidden="true" /> 변경 이력
                  </button>
                  {app && (
                    <button type="button" className="btn secondary sm desk-only" onClick={() => toApp("card-notice")}>
                      <BellRing aria-hidden="true" /> 카드 알림
                    </button>
                  )}
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
      <IcsSheet key={`ics-${ics.key}`} open={ics.open} onOpenChange={(open) => setIcs((x) => ({ ...x, open }))} />
    </>
  );
}
