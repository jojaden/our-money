package com.jojaden.ourmoney.core

import com.jojaden.ourmoney.core.calendar.Dot
import com.jojaden.ourmoney.core.calendar.monthCells
import com.jojaden.ourmoney.core.calendar.parseWidgetCalendar
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

// 홈 화면 달력 위젯 — 웹이 넘긴 요약 읽기, 달 칸 (값은 지어냈다)

class WidgetCalendarTest {
    private val json = """
        {"type":"calendar","from":"2026-11-01","to":"2026-12-31",
         "days":{"2026-11-05":["a","out","a","b","joint"],"2026-11-07":["zz"],"2027-01-02":["a"],"bad":["a"]},
         "up":[
           {"s":"2026-11-25","e":"2026-11-25","t":"현빈 월급날","c":"a","n":"+380만","in":true},
           {"s":"2026-11-09","e":"2026-11-12","t":"제주\n여행","c":"b","n":""},
           {"s":"2026-11-10","t":"지난 일","c":"joint"},
           {"s":"2026-11-30","t":"   "},
           {"t":"날짜 없음"}
         ]}
    """.trimIndent()

    @Test
    fun 점은_아는_색만_세_개까지_범위_안_날짜만() {
        val cal = parseWidgetCalendar(json)!!
        assertEquals(listOf(Dot.A, Dot.OUT, Dot.B), cal.dots[LocalDate(2026, 11, 5)])
        assertEquals(setOf(LocalDate(2026, 11, 5)), cal.dots.keys)
    }

    @Test
    fun 다가오는_것은_진행_중을_포함해_가까운_순서로() {
        val cal = parseWidgetCalendar(json)!!
        val up = cal.upcoming(LocalDate(2026, 11, 11), 5)
        assertEquals(listOf("제주여행", "현빈 월급날"), up.map { it.title })
        assertTrue(up[1].income)
        assertEquals(Dot.B, up[0].dot)
    }

    @Test
    fun 틀린_글이나_너무_긴_범위는_버린다() {
        assertNull(parseWidgetCalendar("not json"))
        assertNull(parseWidgetCalendar("""{"from":"2026-11-01"}"""))
        assertNull(parseWidgetCalendar("""{"from":"2026-01-01","to":"2026-12-31"}"""))
        assertNull(parseWidgetCalendar("""{"from":"2026-12-01","to":"2026-11-01"}"""))
    }

    @Test
    fun 범위_밖_달은_담지_않는다() {
        val cal = parseWidgetCalendar(json)!!
        assertTrue(LocalDate(2026, 12, 31) in cal)
        assertFalse(LocalDate(2027, 1, 1) in cal)
    }

    @Test
    fun 달_칸은_일요일부터_그_달이_아닌_칸은_비운다() {
        // 2026-11-01 은 일요일 → 앞 칸 없음, 30일 → 5주
        val nov = monthCells(2026, 11)
        assertEquals(35, nov.size)
        assertEquals(LocalDate(2026, 11, 1), nov[0])
        assertNull(nov[34])
        // 2026-08-01 은 토요일 → 앞 6칸 비움, 31일 → 6주
        val aug = monthCells(2026, 8)
        assertEquals(42, aug.size)
        assertNull(aug[5])
        assertEquals(LocalDate(2026, 8, 1), aug[6])
        assertEquals(LocalDate(2026, 8, 31), aug[36])
    }
}
