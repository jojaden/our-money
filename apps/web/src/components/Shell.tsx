"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { House, Layers, ListChecks, ReceiptText, Settings2, Plus, LogIn, X } from "lucide-react";
import { isStandalone } from "@/lib/native";
import { StoreProvider, useStore } from "@/lib/store";
import { signInWithGoogle, signOut } from "@/lib/repo";
import type { Spending } from "@/lib/types";
import { Mark, Toasts } from "./ui";
import { SpendingSheet } from "./SpendingSheet";

const NAV = [
  { href: "/", label: "홈", icon: House },
  { href: "/plan", label: "플랜", icon: Layers },
  { href: "/check", label: "체크", icon: ListChecks },
  { href: "/ledger", label: "가계부", icon: ReceiptText },
  { href: "/settings", label: "설정", icon: Settings2 },
];

interface SheetCtx {
  openSpending: (s?: Spending) => void;
}
const SheetContext = createContext<SheetCtx>({ openSpending: () => {} });
export const useSheets = () => useContext(SheetContext);

function norm(p: string) {
  return p !== "/" && p.endsWith("/") ? p.slice(0, -1) : p;
}

function Nav() {
  const path = norm(usePathname() ?? "/");
  return (
    <>
      <nav className="rail" aria-label="주요 메뉴">
        <Mark size={32} />
        {NAV.slice(0, 4).map(({ href, label, icon: Icon }) => (
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
      <nav className="tabbar" aria-label="주요 메뉴">
        {NAV.map(({ href, label, icon: Icon }) => (
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
    </>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { auth, data, error, reload } = useStore();

  if (auth.state === "signed-out") {
    return (
      <main className="gate">
        <div className="box">
          <Mark size={48} />
          <h1>우리 집 가계부</h1>
          <p>두 사람만 들어올 수 있어요. 등록된 구글 계정으로 로그인해 주세요.</p>
          <button type="button" className="btn block" onClick={() => void signInWithGoogle()}>
            <LogIn aria-hidden="true" /> 구글 계정으로 로그인
          </button>
        </div>
      </main>
    );
  }
  if (auth.state === "not-member") {
    return (
      <main className="gate">
        <div className="box">
          <Mark size={48} />
          <h1>등록되지 않은 계정이에요</h1>
          <p>
            {auth.email} 계정은 이 가계부에 연결되어 있지 않아요. 멤버로 등록된 구글 계정으로 로그인해 주세요. 계정을 바꿨다면 Supabase 의 members 에서 이메일을 새 계정으로 바꿔야 해요.
          </p>
          <button type="button" className="btn block secondary" onClick={() => void signOut()}>
            다른 계정으로 로그인
          </button>
        </div>
      </main>
    );
  }
  if (error && !data) {
    return (
      <main className="gate">
        <div className="box">
          <Mark size={48} />
          <h1>{auth.state === "loading" ? "연결할 수 없어요" : "데이터를 불러오지 못했어요"}</h1>
          <p>{error}</p>
          <button type="button" className="btn block" onClick={() => (auth.state === "loading" ? window.location.reload() : void reload())}>
            다시 시도
          </button>
        </div>
      </main>
    );
  }
  if (!data) return <Loading />;
  return <>{children}</>;
}

function Loading() {
  return (
    <div className="canvas" aria-busy="true" aria-label="불러오는 중">
      <span className="skeleton" style={{ width: 120, height: 34, marginBottom: 8 }} />
      <span className="skeleton" style={{ width: 220, height: 18, marginBottom: 24 }} />
      <div className="stack">
        <div className="card">
          <span className="skeleton" style={{ width: 90, height: 16 }} />
          <span className="skeleton" style={{ width: 200, height: 36, marginTop: 10 }} />
          <span className="skeleton" style={{ width: "100%", height: 10, marginTop: 20 }} />
        </div>
        <div className="card">
          <span className="skeleton" style={{ width: 140, height: 20 }} />
          {[0, 1, 2].map((i) => (
            <span key={i} className="skeleton" style={{ width: "100%", height: 44, marginTop: 14 }} />
          ))}
        </div>
      </div>
    </div>
  );
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
      el.style.transition = "transform 420ms cubic-bezier(0.32, 0.72, 0, 1), opacity 300ms ease";
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

/** 스크롤하면 큰 제목이 접히고, 위에 작은 반투명 제목 바가 나타난다 (iOS 큰 제목처럼) */
function CompactBar() {
  const [title, setTitle] = useState("");
  const [shown, setShown] = useState(false);
  const path = usePathname();
  useEffect(() => {
    const onScroll = () => {
      const h1 = document.querySelector(".titlebar h1") as HTMLElement | null;
      if (!h1) return setShown(false);
      const bottom = h1.getBoundingClientRect().bottom;
      setShown(bottom < 8);
      setTitle(h1.textContent ?? "");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [path]);
  return (
    <div className={`compactbar ${shown ? "on" : ""}`} aria-hidden="true">
      <span>{title}</span>
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

function AppBar() {
  const { auth } = useStore();
  const demo = auth.state === "demo";
  return (
    <div className={`appbar ${demo ? "demo" : ""}`}>
      <Mark size={20} />
      <span className="name">우리 집</span>
      {demo && (
        <Link href="/settings" className="pill warning">
          예시 데이터로 보는 중
        </Link>
      )}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const [sheet, setSheet] = useState<{ open: boolean; editing?: Spending }>({ open: false });
  const openSpending = useCallback((s?: Spending) => setSheet({ open: true, editing: s }), []);
  const path = norm(usePathname() ?? "/");
  const showFab = path === "/" || path === "/ledger";
  const { data } = useStore();

  return (
    <SheetContext.Provider value={{ openSpending }}>
      <div className={data ? "shell" : undefined}>
        {data && <Nav />}
        <Gate>
          <CompactBar />
          <main className="canvas">
            <AppBar />
            <InstallPrompt />
            <PageMotion path={path}>{children}</PageMotion>
          </main>
          {showFab && data && (
            <button type="button" className="btn fab" onClick={() => openSpending()}>
              <Plus aria-hidden="true" /> 지출 기록
            </button>
          )}
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
