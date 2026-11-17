// 한국 공휴일 — 월급날이 쉬는 날이면 앞 영업일로 당길 때 쓴다 (payday_holiday_a/b, migrations/018).
// 설·추석·부처님오신날(음력), 대체공휴일, 선거일·임시공휴일을 포함한다. 2025~2029 년만 있고, 그 밖의 해는 주말만 본다.
// 새 임시공휴일·선거일이 정해지면 여기와 apps/mobile/core/.../calc/Holidays.kt 에 같이 더한다(holidays.test.mjs 가 둘을 맞춰 본다).
// 처음 값은 python holidays 0.83 의 KR 로 만들고 2025~2027 은 공고된 달력과 맞춰 봤다.

/** 해마다 공휴일 MMDD (공백으로 나눔) */
export const KR_HOLIDAYS: Record<number, string> = {
  2025: "0101 0127 0128 0129 0130 0301 0303 0505 0506 0603 0606 0815 1003 1005 1006 1007 1008 1009 1225",
  2026: "0101 0216 0217 0218 0301 0302 0505 0524 0525 0603 0606 0815 0817 0924 0925 0926 1003 1005 1009 1225",
  2027: "0101 0206 0207 0208 0209 0301 0505 0513 0606 0815 0816 0914 0915 0916 1003 1004 1009 1011 1225 1227",
  2028: "0101 0126 0127 0128 0301 0412 0502 0505 0606 0815 1002 1003 1004 1005 1009 1225",
  2029: "0101 0212 0213 0214 0301 0505 0507 0520 0521 0606 0815 0921 0922 0923 0924 1003 1009 1225",
};

const sets = new Map<number, Set<string>>();

/** 그날(YYYY-MM-DD)이 공휴일인가 (주말은 따로 본다) */
export function isHoliday(date: string): boolean {
  const y = Number(date.slice(0, 4));
  let set = sets.get(y);
  if (!set) {
    set = new Set((KR_HOLIDAYS[y] ?? "").split(" ").filter(Boolean));
    sets.set(y, set);
  }
  return set.has(date.slice(5, 7) + date.slice(8, 10));
}
