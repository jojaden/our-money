"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, BellRing, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, FlaskConical, History, LogOut, RotateCcw, Receipt, Scale, Smartphone, SunMoon, Tags, UserRound, Users, Wallet as Wallet2, WalletCards } from "lucide-react";
import type { Account, AccountKind, Category, Person, Settings } from "@/lib/types";
import { PAY_KIND_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { cycleOf, holidayShiftOf, nameOf, paydayDate, paydayOf } from "@/lib/calc";
import { dateWithDay, num } from "@/lib/format";
import { resetDemo, signOut } from "@/lib/repo";
import { appCan, toApp, useInApp, useNotifyOn } from "@/lib/native";
import { AmountInput, Money, Seg, Toggle, Who } from "@/components/ui";
import { CategorySheet } from "@/components/SettingsSheets";
import { AddPass } from "@/components/AddPass";
import { Wallet } from "@/components/Wallet";
import { MiniCard } from "@/components/pass";
import { HistorySheet } from "@/components/HistorySheet";
import { IcsSheet } from "@/components/IcsSheet";
import { leaveDetail } from "@/lib/navigationMotion";
import { Morph } from "@/components/Morph";
import { setTheme, useTheme, type ThemeChoice } from "@/lib/theme";

/** 설정 묶음 — 폰은 목록(/settings/)에서 하나를 눌러 그 묶음만(/settings/?s=…) 보고, 데스크톱은 모두 한 화면에 둔다 */
type SecId = "people" | "split" | "cycle" | "wallet" | "categories" | "display" | "notify" | "account";
// notify(폰 알림)는 안드로이드 앱 안에서만
const SEC_IDS: SecId[] = ["people", "split", "cycle", "wallet", "categories", "display", "notify", "account"];

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
  const { data, month, upsert, toast, auth, me, setMe, reload, exportSpendings, setMyName, unsent } = useData();
  const s = data.settings;
  const router = useRouter();
  const q = useSearchParams().get("s");
  const app = useInApp();
  const canRemind = app && appCan("remind");
  const secIds = SEC_IDS.filter((id) => id !== "notify" || canRemind);
  const sec = secIds.find((id) => id === q) ?? null;
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
  // 예시 데이터 초기화는 바꿔 둔 것을 되돌릴 수 없게 지우므로 한 번 묻는다 (질문 한 줄 + 닫기 · 초기화)
  const [askReset, setAskReset] = useState(false);
  const resetBtn = useRef<HTMLButtonElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  // 열 때마다 처음 상태(모든 일정)로
  const [ics, setIcs] = useState({ open: false, key: 0 });
  const openIcs = () => setIcs((x) => ({ open: true, key: x.key + 1 }));

  // 새로 불러온 설정을 받되, 고치던 칸(저장 전이라 불러오기 전 값과 다른 칸)은 적던 값 그대로 둔다
  const prevS = useRef(s);
  useEffect(() => {
    const before = prevS.current;
    prevS.current = s;
    setDraft((d) => {
      const next: Record<string, unknown> = { ...s };
      for (const k of Object.keys(d) as (keyof Settings)[]) if (d[k] !== before[k]) next[k] = d[k];
      return next as unknown as Settings;
    });
  }, [s]);

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
  // 017 전 DB 에는 사람별 한 달 시작일 칸이 없다(없는 칸을 보내면 저장이 거절된다) → 공동 기준만 보인다
  const perCycle = s.cycle_start_a !== undefined;
  /** 11월이 며칠부터 며칠까지인지 */
  const rangeText = (c: number) => (c === 1 ? "11월 1일 ~ 11월 30일" : `10월 ${c}일 ~ 11월 ${c - 1}일`);
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
  // 폰 알림 허용 여부 (열 때·돌아올 때마다 다시 묻는다)
  const notifyOn = useNotifyOn(canRemind);
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
      desc: "공동 생활비·정산·플랜의 한 달은 공동 기준 하나예요. 용돈과 내 지출은 사람마다 자기 월급날부터 다음 월급 전날까지로 따로 셀 수 있어요.",
      summary:
        (s.cycle_start === 1 ? "1일부터 (달력 기준)" : `매달 ${s.cycle_start}일부터`) +
        ((["a", "b"] as Person[]).some((p) => cycleOf(s, p) !== s.cycle_start) ? " · 사람마다 따로" : ""),
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
    notify: {
      title: "폰 알림",
      desc: "앱을 마지막으로 연 때의 일정으로 이 폰에 미리 알려요. 종류마다 폰 설정에서 끌 수 있어요.",
      summary: notifyOn === null ? "" : notifyOn ? "켜져 있어요" : "꺼져 있어요",
      icon: Smartphone,
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
    // 웹뷰는 a.download 내려받기를 못 한다 — 앱이 파일로 만들어 공유 창을 연다(MainActivity, 첫 줄로 확인)
    if (app) {
      if (appCan("csv")) toApp({ type: "csv", text: "﻿" + body });
      else toast("이 앱 버전에서는 파일로 내보낼 수 없어요. 앱을 새로 받거나 브라우저에서 내보내 주세요", undefined, { error: true });
      return;
    }
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
    // pending 은 몇 번 실패한 뒤에야 오르므로, 보내는 중인 것까지 센다 (방금 저장하고 바로 로그아웃해도 묻게)
    const n = unsent();
    if (n > 0 && !window.confirm(`아직 보내지 못한 저장 ${n}건이 있어요. 로그아웃하면 이 기기에서 지워져요. 로그아웃할까요?`)) return;
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
              {secIds.map((id) => {
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
                  {/* 018 전 DB 에는 칸이 없다(보내면 저장이 거절된다) → 스위치를 숨기고 공휴일이면 앞 영업일로 본다 */}
                  {s.payday_holiday_a !== undefined && (
                    <div className="switchrow" style={{ marginTop: 12 }}>
                      <div>
                        <div className="t">공휴일이면 앞 영업일에 받아요</div>
                        <div className="s">
                          {holidayShiftOf(draft, p) ? "주말·공휴일이면 그 전 영업일에 들어와요" : "공휴일엔 그날, 주말이면 앞 금요일에 들어와요"} · 이번 달 {dateWithDay(paydayDate(month, draft, p))}
                        </div>
                      </div>
                      <Toggle on={holidayShiftOf(draft, p)} onChange={(v) => void save({ [p === "a" ? "payday_holiday_a" : "payday_holiday_b"]: v })} label={`${nameOf(s, p)} 공휴일이면 앞 영업일에 받기`} />
                    </div>
                  )}
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
          {/* 정한 비율 ↔ 월급 비율: 바뀌는 칸이 겹쳐 바뀌고 높이가 따라간다 (Morph) */}
          <Morph className="card" track=":scope > *">
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
          </Morph>
        </section>

        <section className={on("cycle")} aria-labelledby="cycle-h">
          <div className="head">
            <h2 id="cycle-h">{SECS.cycle.title}</h2>
            <p>{SECS.cycle.desc}</p>
          </div>
          <div className="card">
            <div className="field" style={{ marginTop: 0 }}>
                <label htmlFor="cycle">공동 기준 (공동 생활비·정산·플랜)</label>
                <select id="cycle" className="select" value={draft.cycle_start} onChange={(e) => void save({ cycle_start: Number(e.target.value) })}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d === 1 ? "1일 (달력 기준)" : `${d}일`}
                    </option>
                  ))}
                </select>
            </div>
            <p className="help kpi-sub" style={{ marginTop: 12 }}>
              11월 = {rangeText(draft.cycle_start)}
            </p>
            {perCycle &&
              (["a", "b"] as Person[]).map((p) => {
                const key = p === "a" ? "cycle_start_a" : "cycle_start_b";
                const own = draft[key] ?? null;
                const pay = paydayOf(draft, p);
                return (
                  <div className="field cycle-own" key={p}>
                    <label htmlFor={`cycle-${p}`}>{nameOf(s, p)} 용돈·내 지출</label>
                    <div className="cycle-row">
                      <select id={`cycle-${p}`} className="select" value={own ?? ""} onChange={(e) => void save({ [key]: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">공동 기준과 같게</option>
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={d}>
                            {d === 1 ? "1일 (달력 기준)" : `${d}일`}
                          </option>
                        ))}
                      </select>
                      {/* 월급날이 29~31일이면 달마다 없는 날이 있어 시작일로 쓸 수 없다 */}
                      {pay <= 28 && cycleOf(draft, p) !== pay && (
                        <button type="button" className="chip" onClick={() => void save({ [key]: pay })}>
                          월급날({pay}일)로
                        </button>
                      )}
                    </div>
                    <p className="help">{own === null ? "공동 기준과 같아요" : own === 1 ? "매달 1일 ~ 말일" : `매달 ${own}일 ~ 다음 달 ${own - 1}일`}</p>
                  </div>
                );
              })}
          </div>
        </section>

        <section className={on("wallet")} aria-labelledby="acc-h">
          <div className="head">
            <h2 id="acc-h">{SECS.wallet.title}</h2>
            <p>{SECS.wallet.desc}</p>
          </div>
          <div>
            <Wallet onAdd={() => setAcc({ open: true })} onEdit={(a) => setAcc({ open: true, account: a })} />
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
                분류 추가
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

        {canRemind && (
          <section className={on("notify")} aria-labelledby="notify-h">
            <div className="head">
              <h2 id="notify-h">{SECS.notify.title}</h2>
              <p>{SECS.notify.desc}</p>
            </div>
            <div className="card">
              <div className="rows" style={{ ["--inset" as string]: "48px", marginBottom: 14 }}>
                {[
                  { icon: CalendarDays, t: "일정 미리 알림", s: "일정에서 고른 날 아침 9시" },
                  { icon: Wallet2, t: "월급날", s: "내 월급날 아침 9시 · 그날 옮길 돈" },
                  { icon: Receipt, t: "내일 나갈 돈", s: "고정비 · 카드값 전날 저녁 8시" },
                ].map(({ icon: Icon, t, s: sub }) => (
                  <div className="row" key={t}>
                    <span className="alert-ic" aria-hidden="true"><Icon /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="t">{t}</div>
                      <div className="s">{sub}</div>
                    </div>
                    <span />
                  </div>
                ))}
              </div>
              {/* 앱이 아직 답하지 않았으면(null) 켜짐·꺼짐을 말하지 않고 줄을 두지 않는다 (위 요약 글과 같게) */}
              {notifyOn !== null && (
                <div className="card-head" style={{ marginBottom: 0, alignItems: "center" }}>
                  <span>{notifyOn ? "폰 알림이 켜져 있어요" : "폰 알림이 꺼져 있어요"}</span>
                  {notifyOn ? (
                    <button type="button" className="btn secondary sm" onClick={() => toApp({ type: "notify-settings" })}>
                      알림 종류 고르기
                    </button>
                  ) : (
                    <button type="button" className="btn sm" onClick={() => toApp({ type: "notify-ask" })}>
                      알림 켜기
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

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
                  <button ref={resetBtn} type="button" className="btn secondary sm" aria-expanded={askReset} onClick={() => setAskReset(true)}>
                    <RotateCcw aria-hidden="true" /> 예시 데이터로 초기화
                  </button>
                  {askReset && (
                    <div role="group" aria-labelledby="reset-q" style={{ display: "flex", flexBasis: "100%", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                      <p id="reset-q" className="help" style={{ flexBasis: "100%", margin: 0 }}>
                        이 브라우저에서 바꿔 둔 예시 데이터를 모두 지우고 처음 예시로 되돌릴까요? 되돌릴 수 없어요.
                      </p>
                      <button
                        type="button"
                        className="btn ghost sm"
                        autoFocus
                        onClick={() => {
                          setAskReset(false);
                          resetBtn.current?.focus();
                        }}
                      >
                        닫기
                      </button>
                      <button
                        type="button"
                        className="btn danger sm"
                        onClick={async () => {
                          setAskReset(false);
                          resetDemo();
                          await reload();
                          toast("예시 데이터로 되돌렸어요");
                          resetBtn.current?.focus();
                        }}
                      >
                        예시 데이터로 초기화
                      </button>
                    </div>
                  )}
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
