"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";
import { House, Layers, ListChecks, ReceiptText, CalendarDays, CalendarPlus, Settings, Plus, X, ChevronLeft, ChevronRight } from "lucide-react";
import { isStandalone, useInApp } from "@/lib/native";
import { StoreProvider, useStore } from "@/lib/store";
import { signInWithGoogle, signOut } from "@/lib/repo";
import { addMonths, type MonthSpending } from "@/lib/calc";
import { monthLabel } from "@/lib/format";
import type { Spending } from "@/lib/types";
import type { Range } from "@/lib/calendar";
import { Mark, Toasts } from "./ui";
import { SpendingSheet } from "./SpendingSheet";
import { MonthSheet } from "./MonthSheet";
import { BellButton } from "./Bell";
import { NoticeSync } from "./NoticeSync";
import { PageTransition } from "./PageTransition";
import { LoadingScreen, StageScreen } from "./Stage";

// 설정은 탭이 아니다 — 폰은 위쪽 막대의 내 동전 버튼, 데스크톱은 레일 맨 아래
const onTab = (path: string, href: string) => path === href || (href !== "/" && path.startsWith(`${href}/`));

const TABS = [
  { href: "/", label: "홈", icon: House },
  { href: "/plan", label: "플랜", icon: Layers },
  { href: "/check", label: "체크", icon: ListChecks },
  { href: "/ledger", label: "가계부", icon: ReceiptText },
  { href: "/calendar", label: "달력", icon: CalendarDays },
];

interface SheetCtx {
  openSpending: (s?: Spending) => void;
  /** 달 고르기 — 큰 제목·위쪽 막대의 "11월". 모아 보기에서 열면 그 기간으로 "기간"이 열린다 */
  openMonths: (o?: { range?: Range }) => void;
}
const SheetContext = createContext<SheetCtx>({ openSpending: () => {}, openMonths: () => {} });
export const useSheets = () => useContext(SheetContext);

/** 화면마다 주된 버튼 하나 — 폰은 아래 원형 버튼, 데스크톱은 머리줄 버튼. 없는 화면(플랜·체크·설정)은 원형 버튼이 빠지고 캡슐이 넓어진다 */
export interface Primary {
  label: string;
  icon: "spending" | "event";
  run: () => void;
}
const PrimarySet = createContext<(p: Primary | null) => void>(() => {});
const PrimaryNow = createContext<Primary | null>(null);
export const usePrimary = () => useContext(PrimaryNow);
const ICON = { spending: Plus, event: CalendarPlus };
export function PrimaryIcon({ icon }: { icon: Primary["icon"] }) {
  const Icon = ICON[icon];
  return <Icon aria-hidden="true" />;
}

/** 그 화면의 주된 버튼을 정한다. 화면이 사라지면 같이 없어진다 (run 은 늘 마지막 것을 부른다) */
export function usePrimaryAction(label: string, icon: Primary["icon"], run: () => void) {
  const set = useContext(PrimarySet);
  const ref = useRef(run);
  useEffect(() => {
    ref.current = run;
  });
  useEffect(() => {
    set({ label, icon, run: () => ref.current() });
    return () => set(null);
  }, [set, label, icon]);
}

function norm(p: string) {
  return p !== "/" && p.endsWith("/") ? p.slice(0, -1) : p;
}

function Nav() {
  const path = norm(usePathname() ?? "/");
  // 탭 아래 상세 화면(/ledger/all)도 그 탭에 있다
  const at = TABS.findIndex((t) => onTab(path, t.href));
  const primary = usePrimary();
  // 버튼이 빠질 때도 줄어드는 동안은 마지막 아이콘을 보여 준다
  const [last, setLast] = useState<Primary | null>(null);
  if (primary && primary !== last) setLast(primary);
  const shown = primary ?? last;
  return (
    <>
      <nav className="rail" aria-label="주요 메뉴">
        <Mark size={32} />
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={onTab(path, href) ? "page" : undefined} aria-label={label}>
            <Icon aria-hidden="true" />
            <span className="tip">{label}</span>
          </Link>
        ))}
        <span className="spacer" />
        <BellButton rail />
        <Link href="/settings" aria-current={path === "/settings" ? "page" : undefined} aria-label="설정">
          <Settings aria-hidden="true" />
          <span className="tip">설정</span>
        </Link>
      </nav>
      {/* 폰: 떠 있는 다섯 칸 캡슐 + 따로 뜬 원형 버튼(그 화면의 주된 일). 버튼이 없는 화면은 버튼이 줄어들며 캡슐이 그 자리까지 넓어진다 */}
      <div className={`navbar ${primary ? "" : "solo"}`}>
        <nav className={`tabbar ${at < 0 ? "none" : ""}`} aria-label="주요 메뉴" style={{ ["--i" as string]: Math.max(0, at) }}>
          <span className="tab-pill" aria-hidden="true" />
          {TABS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="tab"
              aria-current={onTab(path, href) ? "page" : undefined}
              onClick={(e) => {
                if (path === href) {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
            >
              <Icon aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <button type="button" className="fab" aria-label={shown?.label} inert={!primary} onClick={() => primary?.run()}>
          {shown && (
            <span className="fab-icon" key={shown.icon}>
              <PrimaryIcon icon={shown.icon} />
            </span>
          )}
        </button>
      </div>
    </>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { auth, data, error, reload } = useStore();

  if (auth.state === "signed-out") {
    return (
      <StageScreen
        login
        title="반가워요!"
        body="우리 집 가계부에서 두 사람의 한 달 돈을 함께 챙겨요"
        action="구글 계정으로 로그인"
        onAction={() => void signInWithGoogle()}
        fine="등록된 두 사람의 구글 계정만 들어올 수 있어요"
      />
    );
  }
  if (auth.state === "not-member") {
    // 관리자용 안내(members 표 바꾸기)는 README 로 — 이 화면은 두 사람이 보는 곳
    return (
      <StageScreen
        title="등록되지 않은 계정이에요"
        body={
          <>
            <span className="mail">{auth.email}</span> 계정은 이 가계부에 연결되어 있지 않아요
          </>
        }
        action="다른 계정으로 로그인"
        primary={false}
        onAction={() => void signOut()}
        fine="멤버로 등록된 구글 계정으로 다시 로그인해 주세요"
      />
    );
  }
  if (error && !data) {
    return (
      <StageScreen
        title={auth.state === "loading" ? "연결할 수 없어요" : "데이터를 불러오지 못했어요"}
        body={error}
        action="다시 시도"
        onAction={() => (auth.state === "loading" ? window.location.reload() : void reload())}
      />
    );
  }
  if (!data) return <LoadingScreen />;
  return <>{children}</>;
}

/**
 * 월 교체는 store의 monthMotion이 사라짐 → 교체 → 나타남 순서로 잇는다.
 * 좌우로 쓸면 손가락을 따라 움직이다가 충분히 끌거나 빠르게 튕기면 달이 넘어간다.
 */
function PageMotion({ path, children }: { path: string; children: React.ReactNode }) {
  const { month, setMonth } = useStore();
  const box = useRef<HTMLDivElement>(null);

  const swipeable = path !== "/settings";
  const g = useRef<{ x: number; y: number; t: number; id: number; lock: "x" | "y" | null; dx: number } | null>(null);

  // 달을 넘길 때 큰 제목 줄(‹ 11월 ›)은 제자리에 두고 아래 내용만 움직인다 — 화살표가 손가락 밑에서 달아나지 않게
  const parts = () => [...(box.current?.children ?? [])].filter((c) => !c.classList.contains("page-head")) as HTMLElement[];
  const slide = (transform: string, opacity: string, transition: string) => {
    for (const c of parts()) Object.assign(c.style, { transform, opacity, transition });
  };

  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const onDown = (e: React.PointerEvent) => {
    // 달 넘기기가 있는 화면에서만 (모아 보기·설정은 아님)
    if (!swipeable || e.pointerType === "mouse" || !box.current?.querySelector(".page-head .month-step")) return;
    const t = e.target as HTMLElement;
    // 가로로 스크롤되는 줄, 차트, 입력, 시트 위에서는 넘기지 않는다
    if (t.closest(".chips.scroll, .presets, .daily-plot, input, textarea, select, .sheet, [data-no-swipe]")) return;
    g.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, lock: null, dx: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    const s0 = g.current;
    if (!s0 || s0.id !== e.pointerId) return;
    const dx = e.clientX - s0.x;
    const dy = e.clientY - s0.y;
    if (!s0.lock) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      s0.lock = Math.abs(dx) > Math.abs(dy) * 1.3 ? "x" : "y";
      if (s0.lock === "x") (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (s0.lock !== "x") return;
    s0.dx = dx;
    // 손가락을 따라가되 멀리 갈수록 무거워진다 (러버밴드)
    const w = box.current?.offsetWidth || 360;
    const r = (dx * w * 0.55) / (w + 0.55 * Math.abs(dx));
    slide(`translateX(${r}px)`, String(1 - Math.min(0.35, Math.abs(r) / w)), "none");
  };
  const onUp = (e: React.PointerEvent) => {
    const s0 = g.current;
    g.current = null;
    if (!s0 || s0.id !== e.pointerId || s0.lock !== "x") return;
    const dt = Math.max(1, performance.now() - s0.t);
    const v = s0.dx / dt; // px/ms
    const commit = Math.abs(s0.dx) > 80 || Math.abs(v) > 0.45;
    if (commit) {
      slide("", "", "");
      shift(s0.dx < 0 ? 1 : -1);
    } else {
      slide("translateX(0)", "1", "transform var(--dur-tab) var(--ease-drawer), opacity 300ms ease");
    }
  };

  return (
    <div
      ref={box}
      key={`${path}|${month}`}
      className="page-enter"
      style={{ touchAction: "pan-y" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {children}
    </div>
  );
}

/**
 * 위쪽 막대 — 굴렸을 때 가운데에 뜨는 작은 제목, 오른쪽에 종(알림 모음)과 톱니(설정). 화면 위에 붙어 있다.
 * 데스크톱은 종·톱니가 레일 아래에 있어 막대에서는 뺀다.
 * 달 넘기기는 큰 제목 줄(‹ 11월 ›)에 있고, 큰 제목 줄이 막대 밑으로 지나가면 막대가 유리 바탕이 되며
 * 가운데에 ‹ 11월 체크 › 가 작게 떠오른다 (굴릴 때마다가 아니라 지나갈 때 한 번). 작은 제목을 누르면 달 고르기.
 */
function TopBar({ path }: { path: string }) {
  const { auth, month, setMonth } = useStore();
  const { openMonths } = useSheets();
  const q = useSearchParams();
  const search = q.toString();
  // 모아 보기(달력 + 기간 주소)는 작은 제목에 화살표 없이 기간 제목만
  const summary = path === "/calendar" && q.has("from");
  const bar = useRef<HTMLDivElement>(null);
  const [glass, setGlass] = useState(false);
  const [title, setTitle] = useState({ lead: "", name: "" });
  useEffect(() => {
    const h1 = document.querySelector<HTMLElement>(".page-head h1");
    const row = document.querySelector<HTMLElement>(".page-head .title-row") ?? h1;
    if (!h1 || !row) return;
    const h = bar.current?.offsetHeight ?? 64;
    // 처음 한 번은 바로 불린다. 막대 아래 선을 지나 위로 올라갔을 때만 유리 (화면 아래로 벗어난 것은 아님)
    const io = new IntersectionObserver(
      ([e]) => {
        // 달(제목 앞의 가려 둔 글)과 화면 이름을 나눠 둔다 — 좁은 폰의 작은 제목에는 달만 (shell.css)
        const text = h1.textContent ?? "";
        const lead = h1.querySelector(".sr-only")?.textContent ?? text;
        setTitle({ lead: lead.trim(), name: text.slice(lead.length).trim() });
        setGlass(!e.isIntersecting && e.boundingClientRect.top < h);
      },
      { rootMargin: `-${h}px 0px 0px 0px` },
    );
    io.observe(row);
    return () => io.disconnect();
  }, [path, month, search]);
  const settings = path === "/settings";
  const full = [title.lead, title.name].filter(Boolean).join(" ");
  return (
    <div ref={bar} className={`topbar ${glass ? "glass" : ""}`}>
      {/* 왼쪽은 오른쪽 두 버튼만큼 비워 작은 제목을 가운데에 둔다 (예시 데이터 알약만 여기에) */}
      <div className="bar-lead">
        {auth.state === "demo" && (
          <Link href="/settings" className="pill warning">
            예시 데이터
          </Link>
        )}
      </div>
      {!settings && month && !summary ? (
        // 큰 제목이 보일 때는 숨기고 누를 수도 없게 (같은 버튼이 큰 제목 줄에 있다)
        <div className="bar-mini" inert={!glass}>
          <button type="button" className="mini-step" aria-label={`지난달 (${monthLabel(addMonths(month, -1))})`} onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" className="mini-title" aria-haspopup="dialog" aria-label={`${full}, 다른 달 고르기`} onClick={() => openMonths()}>
            {title.lead}
          </button>
          <button type="button" className="mini-step" aria-label={`다음 달 (${monthLabel(addMonths(month, 1))})`} onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      ) : (
        <span className="bar-mini" aria-hidden="true">
          {full}
        </span>
      )}
      <div className="bar-actions">
        <BellButton />
        <Link href="/settings" className="sq gear" aria-label="설정" aria-current={settings ? "page" : undefined}>
          <Settings aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/** 브라우저로 열었을 때만, 홈 화면에 앱으로 설치하라고 한 번 권한다 */
function InstallPrompt() {
  const [evt, setEvt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    if (isStandalone()) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("our-money-install-dismissed") === "1";
    } catch {}
    if (dismissed) return;
    const on = (e: Event) => {
      e.preventDefault();
      setEvt(e as Event & { prompt: () => Promise<void> });
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);
  if (hidden || !evt) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem("our-money-install-dismissed", "1");
    } catch {}
  };
  return (
    <div className="install" role="region" aria-label="앱 설치">
      <Mark size={36} />
      <div style={{ minWidth: 0 }}>
        <div className="t">홈 화면에 앱으로 설치</div>
        <div className="s">주소창 없이 앱처럼 바로 열려요</div>
      </div>
      <button
        type="button"
        className="btn sm"
        onClick={async () => {
          await evt.prompt();
          dismiss();
        }}
      >
        설치
      </button>
      <button type="button" className="iconbtn" aria-label="닫기" onClick={dismiss}>
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const [sheet, setSheet] = useState<{ open: boolean; editing?: Spending }>({ open: false });
  // 할부의 2회차 줄을 눌러도 원래 기록을 고친다
  const openSpending = useCallback((s?: Spending) => setSheet({ open: true, editing: (s as MonthSpending | undefined)?.inst?.orig ?? s }), []);
  // 열 때마다 보고 있는 달의 해에서 시작하도록 key 를 바꾼다
  const [months, setMonths] = useState<{ open: boolean; key: number; range?: Range }>({ open: false, key: 0 });
  const [primary, setPrimary] = useState<Primary | null>(null);
  const openMonths = useCallback((o?: { range?: Range }) => setMonths((x) => ({ open: true, key: x.key + 1, range: o?.range })), []);
  const path = norm(usePathname() ?? "/");
  const { data } = useStore();
  const app = useInApp();

  // 상태 막대 색을 화면 위쪽 색에 맞춘다 (홈은 따뜻한 띠, 나머지는 바탕)
  useEffect(() => {
    if (!data) return;
    const color = getComputedStyle(document.documentElement).getPropertyValue(path === "/" ? "--warm-100" : "--ground").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  }, [path, data]);

  return (
    <SheetContext.Provider value={{ openSpending, openMonths }}>
      <PrimarySet.Provider value={setPrimary}>
        <PrimaryNow.Provider value={primary}>
          <div className={data ? "shell" : undefined}>
            {data && <Nav />}
            <Gate>
              <main className={`canvas ${path === "/" ? "home" : ""}`}>
                {/* 위쪽 막대가 주소의 기간을 읽어서 Suspense 안에 둔다 (정적 내보내기) */}
                <Suspense fallback={null}>
                  <TopBar path={path} />
                </Suspense>
                <InstallPrompt />
                <Suspense fallback={null}>
                  <PageTransition><PageMotion path={path}>{children}</PageMotion></PageTransition>
                </Suspense>
              </main>
              {data && <SpendingSheet open={sheet.open} editing={sheet.editing} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} />}
              {data && <MonthSheet key={months.key} open={months.open} range={months.range} onOpenChange={(open) => setMonths((x) => ({ ...x, open }))} />}
              {/* 안드로이드 앱: 결제 알림으로 맞춘 고정비·이체를 체크 */}
              {data && app && <NoticeSync />}
            </Gate>
          </div>
          <Toasts />
        </PrimaryNow.Provider>
      </PrimarySet.Provider>
    </SheetContext.Provider>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <Frame>{children}</Frame>
    </StoreProvider>
  );
}
