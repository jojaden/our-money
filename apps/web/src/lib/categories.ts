// 분류 표시(아이콘·색)와 메모로 분류를 자동으로 고르는 규칙.

import type { Category, Data, Owner, PayKind, Spending } from "./types";

export type CatIcon = "basket" | "utensils" | "package" | "car" | "pill" | "gift" | "ticket" | "more" | "tag" | "wallet" | "receipt" | "coffee" | "home" | "baby" | "paw" | "bag" | "plane" | "transfer";

/** 분류 아이콘: 그림과 색. 바탕은 그 색을 옅게 푼 원(다크는 well) — bg 를 주면 그 색으로 꽉 채운 원 */
export interface CatVisual {
  icon: CatIcon;
  ink: string;
  bg?: string;
}

// 분류 색은 밝은·어두운 화면 모두에서 또렷한 중간 밝기로 (아이콘 옆에는 늘 분류 이름이 있다)
const RULES: { re: RegExp; icon: CatIcon; ink: string }[] = [
  { re: /장보|마트|식료|식재/, icon: "basket", ink: "#1db86b" },
  { re: /외식|배달|식비|식사/, icon: "utensils", ink: "#ff7043" },
  { re: /카페|커피|간식/, icon: "coffee", ink: "#c8822e" },
  { re: /생활|용품|살림/, icon: "package", ink: "#e9a80a" },
  { re: /교통|차량|주유|자동차/, icon: "car", ink: "#3d8bfd" },
  { re: /병원|약|의료|건강/, icon: "pill", ink: "#f04b52" },
  { re: /쇼핑|의류|패션|옷|잡화/, icon: "bag", ink: "#e64fa8" },
  { re: /경조|선물|축의/, icon: "gift", ink: "#9a6cf0" },
  { re: /여행|숙박|항공/, icon: "plane", ink: "#10ab9c" },
  { re: /문화|여가|취미/, icon: "ticket", ink: "#25a8d6" },
  { re: /이체|송금/, icon: "transfer", ink: "var(--kind-transfer)" },
  { re: /주거|집|관리/, icon: "home", ink: "#7f8a99" },
  { re: /육아|아이|아기/, icon: "baby", ink: "#ff9b3d" },
  { re: /반려|펫|강아지|고양이/, icon: "paw", ink: "#b9845a" },
  { re: /기타/, icon: "more", ink: "#9aa0a8" },
];

export function categoryVisual(name: string | undefined | null): CatVisual {
  if (!name) return { icon: "receipt", ink: "#9aa0a8" };
  const hit = RULES.find((r) => r.re.test(name));
  return hit ? { icon: hit.icon, ink: hit.ink } : { icon: "tag", ink: "#9aa0a8" };
}

/** 지출 한 건의 아이콘: 분류가 있으면 분류, 개인 용돈이면 지갑(사람 색), 아니면 영수증 */
export function spendingVisual(data: Data, s: Pick<Spending, "category_id" | "owner">): CatVisual {
  const cat = data.categories.find((c) => c.id === s.category_id);
  if (cat) return categoryVisual(cat.name);
  if (s.owner === "a") return { icon: "wallet", ink: "var(--a)" };
  if (s.owner === "b") return { icon: "wallet", ink: "var(--b)" };
  return categoryVisual(null);
}

/* ---------- 메모 → 분류 ---------- */

const MEMO_RULES: { re: RegExp; key: RegExp }[] = [
  { re: /이마트|홈플러스|롯데마트|코스트코|쿠팡|컬리|시장|마트|정육|과일|채소|장보|노브랜드|트레이더스|GS더프레시|하나로/i, key: /장보|마트|식료/ },
  { re: /커피|카페|스타벅스|스벅|투썸|메가(?!박스)|빽다방|이디야|컴포즈|베이커리|빵/i, key: /카페|커피/ },
  { re: /커피|카페|스타벅스|스벅|투썸|메가(?!박스)|빽다방|이디야|컴포즈|베이커리|빵/i, key: /외식|배달/ },
  { re: /배민|배달|요기요|쿠팡이츠|식당|외식|치킨|피자|저녁|점심|브런치|맛집|술|고기|회식|버거/i, key: /외식|배달|식비/ },
  { re: /다이소|세제|휴지|올리브영|생활|이케아|무인양품/i, key: /생활|용품/ },
  { re: /무신사|지그재그|에이블리|29cm|W컨셉|쇼핑|옷|의류|신발|가방|백화점|아울렛|유니클로|자라/i, key: /쇼핑|의류|패션/ },
  { re: /주유|기름|택시|카카오\s?T|주차|톨게이트|하이패스|지하철|버스|기차|KTX|SRT|세차|타이어|정비/i, key: /교통|차량|주유/ },
  { re: /병원|약국|의원|치과|한의원|안과|피부과|검진/i, key: /병원|약|의료/ },
  { re: /축의|부의|조의|경조|돌잔치|선물|생일/i, key: /경조|선물/ },
  { re: /항공|비행기|공항|호텔|숙소|에어비앤비|야놀자|여기어때|트립|면세|여행/i, key: /여행|숙박/ },
  { re: /영화|CGV|메가박스|롯데시네마|공연|전시|여행|숙소|호텔|에어비앤비|티켓|넷플릭스/i, key: /문화|여가|취미/ },
  { re: /송금|이체|계좌로/i, key: /이체|송금/ },
];

export interface Guess {
  category_id: string | null;
  /** 이전에 같은 메모로 쓴 기록 */
  from: Spending | null;
}

/** 메모로 분류를 추측한다. 같은 메모의 지난 기록이 있으면 그걸 따른다. */
export function guessFromMemo(data: Data, memo: string): Guess {
  const m = memo.trim();
  if (!m) return { category_id: null, from: null };
  const past = [...data.spendings]
    .filter((s) => s.memo.trim() && (s.memo.trim() === m || s.memo.trim().startsWith(m) || m.startsWith(s.memo.trim())))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const exact = past.find((s) => s.memo.trim() === m) ?? past[0] ?? null;
  if (exact?.category_id) return { category_id: exact.category_id, from: exact };
  // 맞는 규칙을 차례로 보고, 그 분류가 있는 첫 규칙을 따른다 (여행 분류가 없으면 호텔·숙소는 문화·여가로)
  for (const rule of MEMO_RULES.filter((r) => r.re.test(m))) {
    const cat = data.categories.find((c) => rule.key.test(c.name));
    if (cat) return { category_id: cat.id, from: exact };
  }
  return { category_id: null, from: exact };
}

/* ---------- 자주 쓰는 지출 ---------- */

export interface Preset {
  memo: string;
  category_id: string | null;
  pay_kind: PayKind;
  account_id: string | null;
  owner: Owner;
  amount: number;
  count: number;
}

/** 최근 90일 동안 자주 쓴 메모 (같은 메모끼리 묶고 많이·최근 순) */
export function presetsOf(data: Data, today: string, limit = 6): Preset[] {
  const since = new Date(today);
  since.setDate(since.getDate() - 90);
  const from = since.toISOString().slice(0, 10);
  const map = new Map<string, { last: Spending; count: number }>();
  for (const s of data.spendings) {
    const memo = s.memo.trim();
    if (!memo || s.date < from) continue;
    const cur = map.get(memo);
    if (!cur) map.set(memo, { last: s, count: 1 });
    else {
      cur.count += 1;
      if (s.created_at > cur.last.created_at) cur.last = s;
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].last.created_at.localeCompare(a[1].last.created_at))
    .slice(0, limit)
    .map(([memo, { last, count }]) => ({
      memo,
      category_id: last.category_id,
      pay_kind: last.pay_kind,
      account_id: last.account_id,
      owner: last.owner,
      amount: last.amount,
      count,
    }));
}

export function categoryName(categories: Category[], id: string | null): string | null {
  return categories.find((c) => c.id === id)?.name ?? null;
}
