"use client";

import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";

/**
 * 따뜻한 무대 — 로그인·로딩·연결 실패가 같이 쓰는 화면 (docs/design-system/components/Login·Loading).
 * 앱 아이콘을 입체로 옮긴 지붕과 두 사람의 동전, 바닥 그림자, 곁의 금빛 동전 둘.
 * motion: "bob" 은 브랜드가 떠올랐다 내려오고(로그인), "meet" 는 두 동전이 다가갔다 멀어진다(로딩). 둘 다 transform 만 움직인다.
 */
function Scene({ motion }: { motion: "bob" | "meet" }) {
  return (
    <div className={`scene ${motion}`} aria-hidden="true">
      <span className="obj far" />
      <span className="obj near" />
      <span className="floor" />
      <div className="brand">
        <svg className="roof" viewBox="0 0 124 48">
          <polyline points="12 40 62 10 112 40" />
        </svg>
        <div className="pair">
          <span className="coin a" />
          <span className="coin b">
            <span className="lens" />
          </span>
        </div>
      </div>
    </div>
  );
}

/** 상태 막대 색을 무대 가장자리색(warm-100)에 맞춘다 — 홈 화면 앱에서 무대가 상태 막대까지 이어지게 */
function useWarmBar() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const before = meta?.getAttribute("content");
    meta?.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--warm-100").trim());
    return () => {
      if (before) meta?.setAttribute("content", before);
    };
  }, []);
}

/** 로그인 전·등록 안 된 계정·연결 실패: 무대 + 인사 + 엄지가 닿는 아래쪽 버튼 하나 */
export function StageScreen({
  title,
  body,
  action,
  onAction,
  primary = true,
  fine,
  login = false,
}: {
  title: string;
  body: React.ReactNode;
  action: string;
  onAction: () => void;
  primary?: boolean;
  fine?: string;
  login?: boolean;
}) {
  useWarmBar();
  return (
    <main className="stage-screen">
      <Scene motion="bob" />
      <div className="copy">
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
      <div className="actions">
        <button type="button" className={`btn block ${primary ? "" : "stage-secondary"}`} onClick={onAction}>
          {login && <LogIn aria-hidden="true" />}
          {action}
        </button>
        {fine && <p className="fine">{fine}</p>}
      </div>
    </main>
  );
}

/**
 * 처음 데이터를 받는 동안. 1초 안에 끝나면 무대만 보이고 동전·글은 뜨지 않는다(깜빡임 방지, CSS 지연).
 * 8초가 넘으면 설명을 "연결이 느려요"로 바꾼다.
 */
export function LoadingScreen() {
  useWarmBar();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <main className="stage-screen loading" role="status" aria-live="polite">
      <Scene motion="meet" />
      <div className="copy">
        <h1>가계부를 펼치는 중이에요</h1>
        <p>{slow ? "연결이 느려요. 조금만 기다려 주세요" : "두 사람의 기록을 맞추고 있어요"}</p>
      </div>
    </main>
  );
}
