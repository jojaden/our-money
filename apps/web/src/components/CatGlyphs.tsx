// 분류 아이콘 — 채운 모양 하나(분류 색, currentColor)에 흰 디테일(.d)만 얹는 두 톤 그림.
// 얇은 선 아이콘은 작은 원 안에서 흐리고 찌그러져 보여서, 굵은 실루엣으로 한눈에 읽히게 직접 그렸다 (24×24).
// 규칙: docs/design-system/components/CategoryIcon/README.md

import type { CatIcon } from "@/lib/categories";

/** 분류 그림 + 가계부 "이번 달 기록" 타일 그림 */
export type GlyphName = CatIcon | "trend" | "flame" | "piggy";

type Glyph = () => React.ReactElement;

const G: Record<GlyphName, Glyph> = {
  // 장보기 — 손잡이 달린 바구니, 흰 살
  basket: () => (
    <>
      <path d="M7.2 10.5 10 4.6M16.8 10.5 14 4.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M3.6 9.6h16.8a1.1 1.1 0 0 1 1.07 1.37l-1.86 7.45A3.4 3.4 0 0 1 16.31 21H7.69a3.4 3.4 0 0 1-3.3-2.58l-1.86-7.45A1.1 1.1 0 0 1 3.6 9.6z" />
      <rect className="d" x="8.1" y="12.8" width="1.7" height="5.4" rx=".85" />
      <rect className="d" x="11.15" y="12.8" width="1.7" height="5.4" rx=".85" />
      <rect className="d" x="14.2" y="12.8" width="1.7" height="5.4" rx=".85" />
    </>
  ),
  // 외식·배달 — 포크와 숟가락
  utensils: () => (
    <>
      <path d="M4 3.8a.8.8 0 0 1 1.6 0v4.7h1.15V3.8a.8.8 0 0 1 1.6 0v4.7H9.5V3.8a.8.8 0 0 1 1.6 0v5.7a3.1 3.1 0 0 1-2.3 3V20.4a1.3 1.3 0 0 1-2.6 0v-7.9A3.1 3.1 0 0 1 4 9.5z" />
      <path d="M16.6 3c1.99 0 3.6 2.3 3.6 5.1 0 2.25-1.04 4.16-2.3 4.8v7.5a1.3 1.3 0 0 1-2.6 0v-7.5c-1.26-.64-2.3-2.55-2.3-4.8C13 5.3 14.61 3 16.6 3z" />
      <ellipse className="d" cx="15.7" cy="6.6" rx=".9" ry="1.5" opacity=".55" />
    </>
  ),
  // 카페·간식 — 뚜껑 덮인 테이크아웃 컵, 흰 슬리브
  coffee: () => (
    <>
      <rect x="4.6" y="3.6" width="14.8" height="3.4" rx="1.7" />
      <path d="M5.8 8.2h12.4l-1.24 11.06A2 2 0 0 1 14.97 21H9.03a2 2 0 0 1-1.99-1.74z" />
      <path className="d" d="M6.5 12.2h11l-.4 3.6H6.9z" />
    </>
  ),
  // 생활용품 — 날개가 열린 택배 상자, 흰 송장
  package: () => (
    <>
      <path d="M4.2 10.2h15.6V18a3 3 0 0 1-3 3H7.2a3 3 0 0 1-3-3z" />
      <path d="M4.2 9.2 2.6 5.9A.8.8 0 0 1 3.32 4.8h7.5L12 9.2zM19.8 9.2l1.6-3.3a.8.8 0 0 0-.72-1.1h-7.5L12 9.2z" />
      <rect className="d" x="6.6" y="13.4" width="5.6" height="3.6" rx="1" />
    </>
  ),
  // 교통·차량 — 앞에서 본 자동차, 흰 유리창과 전조등
  car: () => (
    <>
      <path d="M5.3 9.1 6.7 5.5A2.4 2.4 0 0 1 8.94 4h6.12a2.4 2.4 0 0 1 2.24 1.5l1.4 3.6A3 3 0 0 1 21 12v4.2a1 1 0 0 1-1 1h-1v1.3a1.5 1.5 0 0 1-3 0v-1.3H8v1.3a1.5 1.5 0 0 1-3 0v-1.3H4a1 1 0 0 1-1-1V12a3 3 0 0 1 2.3-2.9z" />
      <path className="d" d="M8.4 6.3a1 1 0 0 1 .94-.65h5.32a1 1 0 0 1 .94.65l.94 2.6H7.46z" />
      <circle className="d" cx="7" cy="13.2" r="1.3" />
      <circle className="d" cx="17" cy="13.2" r="1.3" />
    </>
  ),
  // 병원·약 — 반은 흰 캡슐
  pill: () => (
    <g transform="rotate(-45 12 12)">
      <rect x="1.8" y="7" width="20.4" height="10" rx="5" />
      <path className="d" d="M12 7h5.2a5 5 0 0 1 0 10H12z" opacity=".92" />
      <rect className="d" x="4.8" y="9.1" width="4.2" height="1.6" rx=".8" opacity=".5" />
    </g>
  ),
  // 경조사·선물 — 리본 묶은 상자
  gift: () => (
    <>
      <path d="M12 8C10.6 4.9 6.8 3.9 6.8 6.3c0 1.3 1.5 1.7 5.2 1.7zM12 8c1.4-3.1 5.2-4.1 5.2-1.7 0 1.3-1.5 1.7-5.2 1.7z" />
      <rect x="3" y="8" width="18" height="4.4" rx="1.4" />
      <path d="M4.2 13.4h15.6V19a2 2 0 0 1-2 2H6.2a2 2 0 0 1-2-2z" />
      <rect className="d" x="10.8" y="8" width="2.4" height="13" />
    </>
  ),
  // 문화·여가 — 양옆이 파인 티켓, 흰 별
  ticket: () => (
    <>
      <path d="M4.1 5.5h15.8a1.6 1.6 0 0 1 1.6 1.6v2.6a2.4 2.4 0 0 0 0 4.6v2.6a1.6 1.6 0 0 1-1.6 1.6H4.1a1.6 1.6 0 0 1-1.6-1.6v-2.6a2.4 2.4 0 0 0 0-4.6V7.1a1.6 1.6 0 0 1 1.6-1.6z" />
      <path className="d" d="m12 8.4 1.12 2.27 2.5.36-1.81 1.77.43 2.49L12 14.12l-2.24 1.17.43-2.49-1.81-1.77 2.5-.36z" />
    </>
  ),
  // 주거·관리비 — 집, 흰 문
  home: () => (
    <>
      <path d="M12 3a1.6 1.6 0 0 1 1.02.37l7.4 6.07A1.6 1.6 0 0 1 21 10.68V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8.32a1.6 1.6 0 0 1 .58-1.24l7.4-6.07A1.6 1.6 0 0 1 12 3z" />
      <rect className="d" x="9.6" y="14" width="4.8" height="7" rx="1.2" />
    </>
  ),
  // 육아 — 젖병, 흰 눈금
  baby: () => (
    <>
      <path d="M10.4 3.6a1.6 1.6 0 0 1 3.2 0V5h-3.2z" />
      <rect x="8.2" y="5" width="7.6" height="2.6" rx="1.1" />
      <rect x="7.2" y="8.2" width="9.6" height="12.8" rx="3.2" />
      <rect className="d" x="12" y="11.4" width="3" height="1.3" rx=".65" />
      <rect className="d" x="12" y="14.2" width="3" height="1.3" rx=".65" />
      <rect className="d" x="12" y="17" width="3" height="1.3" rx=".65" />
    </>
  ),
  // 반려동물 — 발바닥
  paw: () => (
    <>
      <path d="M12 12.3c2.9 0 5.3 2.2 5.3 4.6 0 1.9-1.4 3.1-3.1 3.1-.9 0-1.5-.4-2.2-.4s-1.3.4-2.2.4c-1.7 0-3.1-1.2-3.1-3.1 0-2.4 2.4-4.6 5.3-4.6z" />
      <ellipse cx="5.6" cy="11.2" rx="2" ry="2.4" transform="rotate(-18 5.6 11.2)" />
      <ellipse cx="9.4" cy="6.8" rx="2" ry="2.5" transform="rotate(-8 9.4 6.8)" />
      <ellipse cx="14.6" cy="6.8" rx="2" ry="2.5" transform="rotate(8 14.6 6.8)" />
      <ellipse cx="18.4" cy="11.2" rx="2" ry="2.4" transform="rotate(18 18.4 11.2)" />
    </>
  ),
  // 기타 — 점 셋
  more: () => (
    <>
      <circle cx="5.8" cy="12" r="2.3" />
      <circle cx="12" cy="12" r="2.3" />
      <circle cx="18.2" cy="12" r="2.3" />
    </>
  ),
  // 분류 없음(그 밖) — 꼬리표, 흰 구멍
  tag: () => (
    <>
      <path d="M3 4.6A1.6 1.6 0 0 1 4.6 3h6.3a2 2 0 0 1 1.42.59l8.1 8.1a2 2 0 0 1 0 2.83l-6.38 6.38a2 2 0 0 1-2.83 0l-8.1-8.1A2 2 0 0 1 3 10.9z" />
      <circle className="d" cx="7.6" cy="7.6" r="1.7" />
    </>
  ),
  // 개인 용돈 — 지갑, 흰 똑딱이
  wallet: () => (
    <>
      <path d="M5.2 6.2 14.6 3.4a1.5 1.5 0 0 1 1.92 1.24l.2 1.56z" />
      <rect x="3" y="6.2" width="18" height="14.3" rx="3" />
      <rect className="d" x="14.3" y="11" width="6.7" height="4.4" rx="2.2" />
      <circle cx="16.6" cy="13.2" r="1" />
    </>
  ),
  // 미분류 — 아래가 톱니인 영수증, 흰 줄
  receipt: () => (
    <>
      <path d="M6 3h12a1.2 1.2 0 0 1 1.2 1.2v16.4l-2.4-1.3-2.4 1.3-2.4-1.3-2.4 1.3-2.4-1.3-2.4 1.3V4.2A1.2 1.2 0 0 1 6 3z" />
      <rect className="d" x="8.3" y="7.4" width="7.4" height="1.7" rx=".85" />
      <rect className="d" x="8.3" y="11" width="4.8" height="1.7" rx=".85" />
    </>
  ),
  // 쇼핑·의류 — 손잡이 달린 쇼핑백, 흰 손잡이 구멍
  bag: () => (
    <>
      <path d="M8.4 9.2V7.4a3.6 3.6 0 0 1 7.2 0v1.8" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M5.4 8.2h13.2a1 1 0 0 1 1 .92l.86 10.08A2 2 0 0 1 18.47 21.4H5.53a2 2 0 0 1-1.99-2.2l.86-10.08a1 1 0 0 1 1-.92z" />
      <circle className="d" cx="8.4" cy="11.6" r="1.05" />
      <circle className="d" cx="15.6" cy="11.6" r="1.05" />
    </>
  ),
  // 여행·숙박 — 오른쪽 위로 나는 비행기
  plane: () => (
    <g transform="translate(12 12) rotate(45) scale(1.1) translate(-12 -12)">
      <rect x="10.4" y="1.6" width="3.2" height="19.4" rx="1.6" />
      <path d="M12 8.2 21.2 13.4v2.2L12 12.6l-9.2 3v-2.2z" />
      <path d="M12 17.4l3.8 2.2v1.7L12 20.4l-3.8.9v-1.7z" />
      <rect className="d" x="11.3" y="4.2" width="1.4" height="2.6" rx=".7" opacity=".85" />
    </g>
  ),
  // 이체·송금 — 주고받는 두 화살표 (돌아오는 쪽은 옅게)
  transfer: () => (
    <>
      <path d="M3 8.4A1.4 1.4 0 0 1 4.4 7H15V4.9a.8.8 0 0 1 1.31-.62l4.5 3.6a.8.8 0 0 1 0 1.24l-4.5 3.6A.8.8 0 0 1 15 12.1V9.8H4.4A1.4 1.4 0 0 1 3 8.4z" />
      <path d="M21 15.6a1.4 1.4 0 0 1-1.4 1.4H9v2.1a.8.8 0 0 1-1.31.62l-4.5-3.6a.8.8 0 0 1 0-1.24l4.5-3.6A.8.8 0 0 1 9 11.9v2.3h10.6a1.4 1.4 0 0 1 1.4 1.4z" opacity=".55" />
    </>
  ),
  // 이번 달 기록 — 가장 많이 쓴 날: 오르는 막대 셋, 가장 높은 막대만 진하게
  trend: () => (
    <>
      <rect x="3" y="13" width="4.6" height="8" rx="1.6" opacity=".45" />
      <rect x="9.7" y="8.6" width="4.6" height="12.4" rx="1.6" opacity=".7" />
      <rect x="16.4" y="3.6" width="4.6" height="17.4" rx="1.6" />
      <rect className="d" x="17.5" y="6" width="2.4" height="1.4" rx=".7" opacity=".7" />
    </>
  ),
  // 무지출 연속: 불꽃, 흰 속불
  flame: () => (
    <>
      <path d="M12.6 2.2c.4 3 3.1 4.6 4.9 7.1A7.6 7.6 0 0 1 19 13.8 7 7 0 0 1 5 13.8c0-2.4 1-4.3 2.6-5.8.3 1.6 1.1 2.7 2.3 3.2-.6-3.6.6-6.9 2.7-9z" />
      <path className="d" d="M12 21a3.3 3.3 0 0 1-3.3-3.3c0-1.7 1.2-2.7 2.3-3.9.2 1 .8 1.6 1.5 1.8.1-1.3.6-2.3 1.4-3 .3 1.6 1.4 2.5 1.4 4.6A3.3 3.3 0 0 1 12 21z" />
    </>
  ),
  // 이번 달 저축: 동전이 들어가는 돼지 저금통, 흰 구멍과 눈
  piggy: () => (
    <>
      <path d="M10.6 5.2h3.2a7.2 7.2 0 0 1 5.5 2.6l1.3-.4a.8.8 0 0 1 1 .9l-.3 2.3c.4.7.6 1.4.7 2.2h.3a.8.8 0 0 1 .8.8v1.8a.8.8 0 0 1-.8.8h-.9a7 7 0 0 1-2.4 2.6v1.8a1.4 1.4 0 0 1-1.4 1.4h-1.3a1.4 1.4 0 0 1-1.4-1.3l-.1-.6h-3.2l-.1.6a1.4 1.4 0 0 1-1.4 1.3H7.8a1.4 1.4 0 0 1-1.4-1.4v-2.2A7 7 0 0 1 3.4 12.3c0-3.9 3.2-7.1 7.2-7.1z" />
      <rect className="d" x="9.4" y="7.4" width="4.6" height="1.6" rx=".8" />
      <circle className="d" cx="17.6" cy="11" r=".95" />
      <circle cx="11.7" cy="2.6" r="2" />
    </>
  ),
};

export function CatGlyph({ icon }: { icon: GlyphName }) {
  const Glyph = G[icon];
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <Glyph />
    </svg>
  );
}
