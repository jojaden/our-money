"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { House, Layers, ListChecks, ReceiptText, Settings2, Plus, X, ChevronLeft, ChevronRight } from "lucide-react";
import { isStandalone } from "@/lib/native";
import { StoreProvider, useStore } from "@/lib/store";
import { signInWithGoogle, signOut } from "@/lib/repo";
import { addMonths, nameOf } from "@/lib/calc";
import type { Spending } from "@/lib/types";
import { Mark, PersonGlyph, Toasts } from "./ui";
import { SpendingSheet } from "./SpendingSheet";
import { LoadingScreen, StageScreen } from "./Stage";

// 설정은 탭이 아니다 — 폰은 위쪽 막대의 내 동전 버튼, 데스크톱은 레일 맨 아래
const TABS = [
  { href: "/", label: "홈", icon: House },
  { href: "/plan", label: "플랜", icon: Layers },
  { href: "/check", label: "체크", icon: ListChecks },
  { href: "/ledger", label: "가계부", icon: ReceiptText },
];

interface SheetCtx {
  openSpending: (s?: Spending) => void;
}
const SheetContext = createContext<SheetCtx>({ openSpending: () => {} });
export const useSheets = () => useContext(SheetContext);

function norm(p: string) {
  return p !== "/" && p.endsWith("/") ? p.slice(0, -1) : p;
}

function Nav({ onRecord }: { onRecord: () => void }) {
  const path = norm(usePathname() ?? "/");
  const at = TABS.findIndex((t) => t.href === path);
  return (
    <>
      <nav className="rail" aria-label="주요 메뉴">
        <Mark size={32} />
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={path === href ? "page" : undefined} aria-label={label}>
            <Icon aria-hidden="true" />
            <span className="tip">{label}</span>
          </Link>
        ))}
        <span className="spacer" />
        <Link href="/settings" aria-current={path === "/settings" ? "page" : undefined} aria-label="설정">
          <Settings2 aria-hidden="true" />
          <span className="tip">설정</span>
        </Link>
      </nav>
      {/* 폰: 떠 있는 네 칸 캡슐 + 따로 뜬 원형 기록 버튼. 버튼은 어느 탭에서나 같은 자리라 캡슐 폭이 그대로다 */}
      <div className="navbar">
        <nav className={`tabbar ${at < 0 ? "none" : ""}`} aria-label="주요 메뉴" style={{ ["--i" as string]: Math.max(0, at) }}>
          <span className="tab-pill" aria-hidden="true" />
          {TABS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="tab"
              aria-current={path === href ? "page" : undefined}
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
        <button type="button" className="fab" aria-label="지출 기록" onClick={onRecord}>
          <Plus aria-hidden="true" />
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

/** 탭을 바꾸면 아래에서, 달을 바꾸면 그 방향에서 화면이 이어서 들어온다. */
/**
 * 탭을 바꾸면 짧게 교차 페이드, 달을 바꾸면 그 방향에서 밀려 들어온다.
 * 좌우로 쓸면 손가락을 따라 움직이다가 충분히 끌거나 빠르게 튕기면 달이 넘어간다.
 */
function PageMotion({ path, children }: { path: string; children: React.ReactNode }) {
  const { month, setMonth } = useStore();
  const prev = useRef({ path, month });
  const box = useRef<HTMLDivElement>(null);
  let dir = "fade";
  if (prev.current.path === path && prev.current.month !== month && prev.current.month && month) {
    dir = month > prev.current.month ? "from-right" : "from-left";
  }
  useEffect(() => {
    prev.current = { path, month };
  }, [path, month]);

  const swipeable = path !== "/settings";
  const g = useRef<{ x: number; y: number; t: number; id: number; lock: "x" | "y" | null; dx: number } | null>(null);

  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const onDown = (e: React.PointerEvent) => {
    if (!swipeable || e.pointerType === "mouse") return;
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
    const el = box.current;
    if (el) {
      // 손가락을 따라가되 멀리 갈수록 무거워진다 (러버밴드)
      const w = el.offsetWidth || 360;
      const r = (dx * w * 0.55) / (w + 0.55 * Math.abs(dx));
      el.style.transition = "none";
      el.style.transform = `translateX(${r}px)`;
      el.style.opacity = String(1 - Math.min(0.35, Math.abs(r) / w));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const s0 = g.current;
    g.current = null;
    if (!s0 || s0.id !== e.pointerId || s0.lock !== "x") return;
    const dt = Math.max(1, performance.now() - s0.t);
    const v = s0.dx / dt; // px/ms
    const el = box.current;
    const commit = Math.abs(s0.dx) > 80 || Math.abs(v) > 0.45;
    if (commit) {
      if (el) {
        el.style.transition = "";
        el.style.transform = "";
        el.style.opacity = "";
      }
      shift(s0.dx < 0 ? 1 : -1);
    } else if (el) {
      el.style.transition = "transform var(--dur-tab) var(--ease-drawer), opacity 300ms ease";
      el.style.transform = "translateX(0)";
      el.style.opacity = "1";
    }
  };

  return (
    <div
      ref={box}
      key={`${path}|${month}`}
      className={`page-enter ${dir}`}
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
 * 위쪽 막대 — 내 동전 반쪽(설정), 가운데 작은 제목, 달 넘기기. 화면 위에 붙어 있다.
 * 페이지 큰 제목이 막대 밑으로 지나가면 유리 바탕이 되고 작은 제목이 떠오른다 (굴릴 때마다가 아니라 지나갈 때 한 번).
 */
function TopBar({ path }: { path: string }) {
  const { auth, data, me, month, setMonth } = useStore();
  const bar = useRef<HTMLDivElement>(null);
  const [glass, setGlass] = useState(false);
  const [title, setTitle] = useState("");
  useEffect(() => {
    const h1 = document.querySelector<HTMLElement>(".page-head h1");
    if (!h1) return;
    const h = bar.current?.offsetHeight ?? 64;
    // 처음 한 번은 바로 불린다. 막대 아래 선을 지나 위로 올라갔을 때만 유리 (화면 아래로 벗어난 것은 아님)
    const io = new IntersectionObserver(
      ([e]) => {
        setTitle(h1.textContent ?? "");
        setGlass(!e.isIntersecting && e.boundingClientRect.top < h);
      },
      { rootMargin: `-${h}px 0px 0px 0px` },
    );
    io.observe(h1);
    return () => io.disconnect();
  }, [path, month]);
  const settings = path === "/settings";
  const name = data ? nameOf(data.settings, me) : "";
  return (
    <div ref={bar} className={`topbar ${glass ? "glass" : ""}`}>
      <Link href="/settings" className={`sq me ${me}`} aria-label={`설정 (${name})`} aria-current={settings ? "page" : undefined}>
        <PersonGlyph owner={me} />
      </Link>
      {auth.state === "demo" && (
        <Link href="/settings" className="pill warning">
          예시 데이터
        </Link>
      )}
      <span className="mini" aria-hidden="true">
        {title}
      </span>
      {!settings && month && (
        <>
          <button type="button" className="sq" aria-label="지난달" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" className="sq" aria-label="다음 달" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight aria-hidden="true" />
          </button>
        </>
      )}
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
  const openSpending = useCallback((s?: Spending) => setSheet({ open: true, editing: s }), []);
  const path = norm(usePathname() ?? "/");
  const { data } = useStore();

  // 상태 막대 색을 화면 위쪽 색에 맞춘다 (홈은 따뜻한 띠, 나머지는 바탕)
  useEffect(() => {
    if (!data) return;
    const color = getComputedStyle(document.documentElement).getPropertyValue(path === "/" ? "--warm-100" : "--ground").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  }, [path, data]);

  return (
    <SheetContext.Provider value={{ openSpending }}>
      <div className={data ? "shell" : undefined}>
        {data && <Nav onRecord={() => openSpending()} />}
        <Gate>
          <main className={`canvas ${path === "/" ? "home" : ""}`}>
            <TopBar path={path} />
            <InstallPrompt />
            <PageMotion path={path}>{children}</PageMotion>
          </main>
          {data && <SpendingSheet open={sheet.open} editing={sheet.editing} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} />}
        </Gate>
      </div>
      <Toasts />
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
