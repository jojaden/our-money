// 앱 아이콘 후보 (2차: 깊이·질감이 있는 디자인).
// 각 디자인은 512x512 SVG 전체를 만든다. id 접두사로 그라데이션이 한 페이지에서 겹치지 않게 한다.

const tileClip = (p, r) => `<clipPath id="${p}c"><rect width="512" height="512" rx="${r}"/></clipPath>`;

// 한 지붕 두 동전 (파스텔) — 지붕 아래 두 사람의 동전이 겹치고, 겹친 곳은 흰색: 둘이 함께 관리하는 돈.
function roofCoins(a, b, tileTop, tileBottom) {
  return (p, { rounded = true, scale = 1 } = {}) => {
    const r = rounded ? 115 : 0;
    return `
<defs>
  ${tileClip(p, r)}
  <linearGradient id="${p}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tileTop}"/><stop offset="1" stop-color="${tileBottom}"/></linearGradient>
  <filter id="${p}sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity="0.22"/></filter>
</defs>
<g clip-path="url(#${p}c)">
  <rect width="512" height="512" fill="url(#${p}bg)"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)" filter="url(#${p}sh)">
    <path d="M150 200 256 120l106 80" fill="none" stroke="#fff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="212" cy="318" r="84" fill="${a}"/>
    <circle cx="300" cy="318" r="84" fill="${b}"/>
    <path d="M256 249.3a84 84 0 0 1 0 137.4 84 84 0 0 1 0-137.4Z" fill="#fff"/>
  </g>
</g>`;
  };
}

export const designs = {
  F1: {
    name: "살구 + 분홍",
    note: "현빈(살구)·예진(분홍) — 앱 안의 두 사람 색과 같은 계열이에요.",
    svg: roofCoins("#ffc29a", "#ffadc6", "#2c3a57", "#18213a"),
  },
  F2: {
    name: "살구 + 민트",
    note: "따뜻한 살구와 시원한 민트. 두 사람이 더 또렷하게 구분돼요.",
    svg: roofCoins("#ffc29a", "#9fe3cb", "#2c3a57", "#18213a"),
  },
  F3: {
    name: "라벤더 + 민트",
    note: "가장 차분한 파스텔. 남색 타일 위에서 은은하게 빛나요.",
    svg: roofCoins("#c9b8f7", "#9fe3cb", "#2c3a57", "#18213a"),
  },
};

/** 512 기준 아이콘 SVG 문서 */
export function iconSvg(key, opts = {}) {
  const d = designs[key];
  const size = opts.size ?? 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">${d.svg(`${key}${opts.id ?? ""}`, opts)}</svg>`;
}
