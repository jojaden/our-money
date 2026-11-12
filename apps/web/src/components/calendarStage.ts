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
 *   모아 보기 위쪽이 화면 가운데를 넘으면 open — 메뉴가 원래대로 돌아온다.
 * - 달력만 보일 때 위로 끌면 고무줄처럼 버틴다: 손가락의 일부만 따라 올라가고, 놓을 때 충분히 끌었거나 빠르게 튕겼으면
 *   모아 보기로 넘어가고 아니면 제자리로 돌아온다. 끄는 동안은 translate 만 바꾸고 React 상태는 건드리지 않는다.
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

  // 고무줄 끌기 (폰·태블릿, 달력만 보일 때. 세로 굴리기는 CSS touch-action 으로 브라우저가 하지 않는다)
  useEffect(() => {
    const el = page.current;
    const target = more.current;
    if (!el || !target || !matchMedia(PHONE).matches) return;
    const root = document.documentElement;
    let g: { x0: number; y0: number; y: number; t: number; v: number; on: boolean | null } | null = null;
    // 애플 고무줄: 끈 거리 d 가 커질수록 덜 따라온다 (화면 높이에 다가갈 뿐 넘지 않음)
    const band = (d: number) => (1 - 1 / ((d * 0.55) / innerHeight + 1)) * innerHeight;
    const settle = (to: number, done: () => void) => {
      // 이미 그 자리면 transitionend 가 오지 않는다
      if (still() || Math.abs((parseFloat(el.style.translate.split(" ")[1]) || 0) - to) < 0.5) return done();
      el.style.transition = "translate var(--dur-tab) var(--ease-drawer)";
      el.style.translate = `0 ${to}px`;
      const end = () => {
        el.removeEventListener("transitionend", end);
        el.style.transition = "";
        done();
      };
      el.addEventListener("transitionend", end);
    };
    const start = (e: TouchEvent) => {
      g = null;
      if (e.touches.length !== 1 || root.dataset.cal !== "focus" || scrollY > 2 || root.hasAttribute("data-arranging") || document.querySelector(".fab.composing")) return;
      const t = e.touches[0];
      g = { x0: t.clientX, y0: t.clientY, y: t.clientY, t: e.timeStamp, v: 0, on: null };
    };
    const move = (e: TouchEvent) => {
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;
      if (g.on === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // 위로(손가락이 올라가는) 세로 끌기만 받는다. 옆으로는 달 넘기기
        g.on = Math.abs(dy) > Math.abs(dx);
        if (!g.on) return void (g = null);
      }
      if (e.cancelable) e.preventDefault();
      const dt = e.timeStamp - g.t;
      if (dt > 0) g.v = 0.7 * ((t.clientY - g.y) / dt) + 0.3 * g.v;
      g.y = t.clientY;
      g.t = e.timeStamp;
      el.style.translate = `0 ${-band(Math.max(0, -dy))}px`;
    };
    const end = () => {
      if (!g?.on) return void (g = null);
      const pulled = g.y0 - g.y;
      const fling = g.v < -0.5; // 위로 0.5px/ms 보다 빠르게 튕김
      g = null;
      if (pulled < 140 && !fling) return settle(0, () => void (el.style.translate = ""));
      // 넘어가기: 메뉴를 같은 박자로 돌려 놓고, 모아 보기 위쪽까지 올린 뒤 그 자리를 실제 스크롤로 바꾼다
      const pad = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
      const top = Math.min(target.getBoundingClientRect().top - (parseFloat(el.style.translate.split(" ")[1]) || 0) + scrollY - pad, root.scrollHeight - innerHeight);
      root.dataset.cal = "open";
      settle(-top, () => {
        el.style.translate = "";
        scrollTo({ top, behavior: "instant" });
      });
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
      el.style.translate = "";
    };
  }, []);

  const openMore = () => more.current?.scrollIntoView({ behavior: still() ? "auto" : "smooth", block: "start" });

  return { more, page, hint: !open && !seen, openMore };
}
