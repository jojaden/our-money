package com.jojaden.ourmoney.core.calc

// 한국 공휴일 — 월급날이 쉬는 날이면 앞 영업일로 당길 때 쓴다 (paydayHolidayA/B, migrations/018).
// 웹 apps/web/src/lib/holidays.ts 와 같은 표다(웹 holidays.test.mjs 가 둘을 맞춰 본다). 2025~2029 년만 있고, 그 밖의 해는 주말만 본다.
// 새 임시공휴일·선거일이 정해지면 두 곳에 같이 더한다.

/** 해마다 공휴일 MMDD (공백으로 나눔) */
val KR_HOLIDAYS: Map<Int, String> = mapOf(
    2025 to "0101 0127 0128 0129 0130 0301 0303 0505 0506 0603 0606 0815 1003 1005 1006 1007 1008 1009 1225",
    2026 to "0101 0216 0217 0218 0301 0302 0505 0524 0525 0603 0606 0815 0817 0924 0925 0926 1003 1005 1009 1225",
    2027 to "0101 0206 0207 0208 0209 0301 0505 0513 0606 0815 0816 0914 0915 0916 1003 1004 1009 1011 1225 1227",
    2028 to "0101 0126 0127 0128 0301 0412 0502 0505 0606 0815 1002 1003 1004 1005 1009 1225",
    2029 to "0101 0212 0213 0214 0301 0505 0507 0520 0521 0606 0815 0921 0922 0923 0924 1003 1009 1225",
)

private val holidaySets: Map<Int, Set<String>> = KR_HOLIDAYS.mapValues { (_, v) -> v.split(' ').filter { it.isNotEmpty() }.toSet() }

/** 그날(YYYY-MM-DD)이 공휴일인가 (주말은 따로 본다) */
fun isHoliday(date: String): Boolean =
    holidaySets[date.substring(0, 4).toInt()]?.contains(date.substring(5, 7) + date.substring(8, 10)) == true

// 쉬는 날은 아니지만 챙기는 날 — 달력·위젯에서 초록. 웹 holidays.ts SPECIAL_DAYS 와 같은 날짜다(holidays.test.mjs 가 맞춰 본다).
/** 해마다 같은 기념일 MMDD (공백으로 나눔) */
const val KR_SPECIAL_DAYS = "0214 0314 0508 0515 0521 1031 1111 1224"

private val specialSet: Set<String> = KR_SPECIAL_DAYS.split(' ').toSet()

/** 그날(YYYY-MM-DD)이 기념일인가 — 공휴일이면 공휴일이 먼저라 false */
fun isSpecialDay(date: String): Boolean =
    !isHoliday(date) && specialSet.contains(date.substring(5, 7) + date.substring(8, 10))
