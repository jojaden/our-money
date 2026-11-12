"use client";

import { useEffect, useRef, useState } from "react";
import { still } from "./Morph";

/** 모아 보기를 한 번이라도 내려 본 기기 — 그 뒤로는 화살표·살짝 보여 주기를 하지 않는다 */
const SEEN_KEY = "our-money-cal-more-seen";
/** 폰·태블릿(하단 메뉴가 있는 폭) */
const PHONE = "(max-width: 1023px)";
/** 살짝 보여 주기는 앱을 켜 둔 동안 한 번만 */
let peeked = false;

/**
 * 달력 화면의 두 칸: 달력(첫 화면) ↔ 모아 보기(아래).
 * - `<html data-cal="focus|open">`: 달력만 보일 때 focus — 폰에서는 하단 메뉴가 숨고 일정 추가 버튼이 가운데로 커진다(shell.css).
 *   모아 보기 위쪽이 화면 가운데를 넘으면 open — 메뉴가 원래대로 돌아온다. 두 칸 사이는 스크롤 스냅이라 조금 끌면 되돌아온다(저항감).
 * - 아직 모아 보기를 내려 본 적 없는 기기: 아래 반투명 화살표를 두고, 처음 들어오면 화면을 살짝 올려 아래가 더 있다는 것을 보여 준 뒤 되돌린다.
 */
export function useCalendarStage() {
  const more = useRef<HTMLElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    const el = more.current;
    root.dataset.cal = "focus";
    if (!el) return () => void delete root.dataset.cal;
    const io = new IntersectionObserver(
      ([e]) => {
        root.dataset.cal = e.isIntersecting ? "open" : "focus";
        setOpen(e.isIntersecting);
        if (!e.isIntersecting) return;
        setSeen(true);
        try {
          localStorage.setItem(SEEN_KEY, "1");
        } catch {
          // 저장이 막혀도 이번에는 숨긴다
        }
      },
      // 모아 보기 위쪽이 화면 가운데보다 올라오면 "내려 봤다"
      { rootMargin: "0px 0px -50% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      delete root.dataset.cal;
    };
  }, []);

  // 처음 들어오면 아래가 더 있다는 것을 살짝 보여 준다: 화면이 올라가 모아 보기 머리가 비치고, 잠깐 머문 뒤 제자리로 (transform 만)
  useEffect(() => {
    if (seen || peeked || still() || !matchMedia(PHONE).matches) return;
    const t = window.setTimeout(() => {
      peeked = true;
      page.current?.animate(
        [
          { transform: "none" },
          { transform: "translateY(-96px)", offset: 0.4 },
          { transform: "translateY(-96px)", offset: 0.62 },
          { transform: "none" },
        ],
        { duration: 1500, easing: "cubic-bezier(0.45, 0, 0.2, 1)" },
      );
    }, 700);
    return () => window.clearTimeout(t);
  }, [seen]);

  const openMore = () => more.current?.scrollIntoView({ behavior: still() ? "auto" : "smooth", block: "start" });

  return { more, page, hint: !open && !seen, openMore };
}
