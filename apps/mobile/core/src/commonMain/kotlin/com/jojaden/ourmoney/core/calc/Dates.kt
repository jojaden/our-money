package com.jojaden.ourmoney.core.calc

import kotlinx.datetime.DatePeriod
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.daysUntil
import kotlinx.datetime.number
import kotlinx.datetime.plus
import kotlinx.datetime.todayIn
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

// 가계부 '한 달' 계산. 날짜는 DB 와 같은 "YYYY-MM-DD", 달은 "YYYY-MM" 문자열로 다룬다.

@OptIn(ExperimentalTime::class)
fun todayString(): String = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()

private fun pad(n: Int) = n.toString().padStart(2, '0')

fun parseDate(s: String): LocalDate = LocalDate.parse(s)

fun monthKey(year: Int, month: Int): String = "$year-${pad(month)}"

/** 그 달 1일에서 (day-1)일 더한 날 — 31일이 없는 달은 다음 달로 넘어간다 (웹의 JS Date 와 같은 동작) */
fun dayOf(year: Int, month: Int, day: Int): LocalDate = LocalDate(year, month, 1).plus(DatePeriod(days = day - 1))

private fun ym(key: String): Pair<Int, Int> = key.split("-").let { it[0].toInt() to it[1].toInt() }

fun addMonths(key: String, n: Int): String {
    val (y, m) = ym(key)
    val d = LocalDate(y, m, 1).plus(DatePeriod(months = n))
    return monthKey(d.year, d.month.number)
}

/** key 달이 from 달보다 몇 달 뒤인지 */
fun monthsBetween(from: String, key: String): Int {
    val (fy, fm) = ym(from)
    val (ky, km) = ym(key)
    return (ky - fy) * 12 + km - fm
}

/** 날짜가 속한 가계부 월. cycleStart 가 25면 10/25 은 11월이다. */
fun monthOf(date: String, cycleStart: Int): String {
    val d = parseDate(date)
    val key = monthKey(d.year, d.month.number)
    return if (cycleStart > 1 && d.day >= cycleStart) addMonths(key, 1) else key
}

fun currentMonth(cycleStart: Int, today: String = todayString()): String = monthOf(today, cycleStart)

/** [start, end) — end 는 다음 기간의 첫날, last 는 마지막 날 */
data class Period(val start: String, val end: String, val last: String) {
    operator fun contains(date: String): Boolean = date >= start && date < end
}

fun periodOf(key: String, cycleStart: Int): Period {
    val (y, m) = ym(key)
    val first = LocalDate(y, m, 1)
    val start = if (cycleStart > 1) first.plus(DatePeriod(months = -1, days = cycleStart - 1)) else first
    val end = if (cycleStart > 1) first.plus(DatePeriod(days = cycleStart - 1)) else first.plus(DatePeriod(months = 1))
    val last = end.plus(DatePeriod(days = -1))
    return Period(start.toString(), end.toString(), last.toString())
}

enum class PeriodState { FUTURE, CURRENT, PAST }

data class PeriodProgress(val ratio: Double, val daysLeft: Int, val total: Int, val state: PeriodState)

/** 기간 중 오늘까지 지난 비율 (0~1) 과 남은 일수 */
fun periodProgress(key: String, cycleStart: Int, today: String = todayString()): PeriodProgress {
    val p = periodOf(key, cycleStart)
    val s = parseDate(p.start)
    val e = parseDate(p.end)
    val t = parseDate(today)
    val total = s.daysUntil(e)
    if (t < s) return PeriodProgress(0.0, total, total, PeriodState.FUTURE)
    if (t >= e) return PeriodProgress(1.0, 0, total, PeriodState.PAST)
    val elapsed = s.daysUntil(t) + 1
    return PeriodProgress(elapsed.toDouble() / total, total - elapsed + 1, total, PeriodState.CURRENT)
}

/** 그 달의 특정 일자 (결제일 등). 기간 안의 날짜로 맞춘다. */
fun dateInMonth(key: String, day: Int, cycleStart: Int): String {
    val p = periodOf(key, cycleStart)
    val (y, m) = ym(key)
    // 31일처럼 그달에 없는 날은 그달 마지막 날 (11월 31일 → 11월 30일)
    fun on(year: Int, month: Int): String {
        val last = LocalDate(year, month, 1).plus(DatePeriod(months = 1)).plus(DatePeriod(days = -1)).day
        return dayOf(year, month, minOf(day, last)).toString()
    }
    val inThis = on(y, m)
    if (inThis in p) return inThis
    val prev = LocalDate(y, m, 1).plus(DatePeriod(months = -1))
    val inPrev = on(prev.year, prev.month.number)
    if (inPrev in p) return inPrev
    return inThis
}

/** 오늘이 이 달 기간의 며칠째인지 (0부터). 지난 달이면 마지막 날. */
fun dayIndexOf(month: String, cycleStart: Int, today: String): Int {
    val p = periodOf(month, cycleStart)
    val s = parseDate(p.start)
    val e = parseDate(p.last)
    val t = parseDate(today).coerceIn(s, e)
    return s.daysUntil(t)
}

fun shiftDays(date: String, n: Int): String = parseDate(date).plus(DatePeriod(days = n)).toString()

internal fun Double.roundHalfUp(): Long = kotlin.math.floor(this + 0.5).toLong()
