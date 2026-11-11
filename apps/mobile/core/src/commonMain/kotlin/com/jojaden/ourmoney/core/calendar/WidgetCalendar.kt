package com.jojaden.ourmoney.core.calendar

import kotlinx.datetime.DatePeriod
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.daysUntil
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.plus
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

// 홈 화면 달력 위젯의 데이터. 로그인은 웹에만 있어서, 웹이 앱을 열어 둔 동안 달력 요약을 넘기고(type "calendar")
// 위젯은 그 요약과 폰의 오늘 날짜로 그린다. 웹 쪽은 apps/web/src/lib/calendar.ts widgetCalendar().

/** 날짜 칸 아래 점 — 일정은 입력한 사람, 월급날은 그 사람, 카드값·이체는 나갈 돈 (웹 달력과 같은 색) */
enum class Dot { A, B, JOINT, OUT }

/** 다가오는 것 하나. note 는 웹이 만든 시간·금액 글("오후 7시", "+380만"), income 이면 초록 */
data class UpItem(val start: LocalDate, val end: LocalDate, val title: String, val dot: Dot, val note: String, val income: Boolean)

/** 웹이 넘긴 달력 요약 — [from, to] 날짜의 점과 다가오는 것 */
data class WidgetCalendar(val from: LocalDate, val to: LocalDate, val dots: Map<LocalDate, List<Dot>>, val up: List<UpItem>) {
    /** 요약이 그 날짜를 담고 있나 (오래 앱을 안 열면 이번 달이 범위 밖일 수 있다) */
    operator fun contains(date: LocalDate): Boolean = date >= from && date <= to

    /** 오늘 이후(진행 중 포함) 가까운 순서로 n 개 */
    fun upcoming(today: LocalDate, n: Int): List<UpItem> = up.filter { it.end >= today }.sortedBy { it.start }.take(n)
}

private const val MAX_JSON = 200_000
private const val MAX_SPAN_DAYS = 120
private const val MAX_UP = 20
private val DOTS = mapOf("a" to Dot.A, "b" to Dot.B, "joint" to Dot.JOINT, "out" to Dot.OUT)

/** 웹이 보낸 글을 검사해서 읽는다. 모양이 틀린 칸·줄은 버리고, 전체가 틀리면 null */
fun parseWidgetCalendar(json: String): WidgetCalendar? {
    if (json.length > MAX_JSON) return null
    val o = runCatching { Json.parseToJsonElement(json) as? JsonObject }.getOrNull() ?: return null
    val from = o.date("from") ?: return null
    val to = o.date("to") ?: return null
    if (to < from || from.daysUntil(to) > MAX_SPAN_DAYS) return null
    val dots = (o["days"] as? JsonObject).orEmpty().mapNotNull { (k, v) ->
        val d = date(k)?.takeIf { it >= from && it <= to } ?: return@mapNotNull null
        val list = (v as? JsonArray).orEmpty().mapNotNull { DOTS[(it as? JsonPrimitive)?.content] }.distinct().take(3)
        if (list.isEmpty()) null else d to list
    }.toMap()
    val up = (o["up"] as? JsonArray).orEmpty().take(MAX_UP).mapNotNull { e ->
        val x = e as? JsonObject ?: return@mapNotNull null
        val s = x.date("s") ?: return@mapNotNull null
        val end = x.date("e")?.takeIf { it >= s } ?: s
        val title = x.text("t", 40).takeIf { it.isNotBlank() } ?: return@mapNotNull null
        UpItem(s, end, title, DOTS[x.text("c", 8)] ?: Dot.JOINT, x.text("n", 20), (x["in"] as? JsonPrimitive)?.booleanOrNull == true)
    }
    return WidgetCalendar(from, to, dots, up)
}

private fun date(s: String?): LocalDate? = s?.takeIf { it.length == 10 }?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

private fun JsonObject.date(key: String): LocalDate? = date((this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content)

/** 글 칸 — 줄바꿈 같은 제어 문자는 빼고 max 글자까지 */
private fun JsonObject.text(key: String, max: Int): String =
    ((this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: "").filter { !it.isISOControl() }.trim().take(max)

/** 그 달의 칸: 일요일부터 시작하는 주 단위, 그 달이 아닌 칸은 null (애플 달력 위젯처럼 비워 둔다) */
fun monthCells(year: Int, month: Int): List<LocalDate?> {
    val first = LocalDate(year, month, 1)
    val lead = first.dayOfWeek.isoDayNumber % 7 // 일요일 0
    val length = first.daysUntil(first.plus(DatePeriod(months = 1)))
    val cells = (lead + length + 6) / 7 * 7
    return List(cells) { i -> (i - lead).takeIf { it in 0 until length }?.let { first.plus(DatePeriod(days = it)) } }
}

/** 일요일·토요일 (칸 글자 색) */
fun isSunday(d: LocalDate) = d.dayOfWeek == DayOfWeek.SUNDAY
fun isSaturday(d: LocalDate) = d.dayOfWeek == DayOfWeek.SATURDAY
