package com.jojaden.ourmoney.widget

import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.jojaden.ourmoney.MainActivity
import com.jojaden.ourmoney.R
import com.jojaden.ourmoney.core.calendar.Dot
import com.jojaden.ourmoney.core.calendar.UpItem
import com.jojaden.ourmoney.core.calendar.WidgetCalendar
import com.jojaden.ourmoney.core.calendar.isSaturday
import com.jojaden.ourmoney.core.calendar.isSunday
import com.jojaden.ourmoney.core.calendar.monthCells
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.LocalDate
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.number
import kotlinx.datetime.plus

// 달력 위젯 화면. 색은 docs/design-system/tokens.json 의 값을 옮겼다 (위젯은 CSS 변수를 못 읽는다) — 토큰을 바꾸면 여기도.
// 테마는 웹 설정 › 화면을 따른다: 밝게·어둡게는 그 색으로, 기기 설정은 폰의 다크 모드에 맞춰 런처가 고른다(낮·밤 색 둘 다 넘김).

/** 사람·버킷 색 — 테마와 상관없이 같다 */
private object C {
    val a = Color(0xFFFF9359) // a
    val b = Color(0xFFFF709B) // b
    val joint = Color(0xFFF5DF4D) // joint = primary
    val out = Color(0xFFFF6D39) // g-fixed
    val onPrimary = ColorProvider(Color(0xFF222326)) // on-primary (노란 오늘 위)
}

/** 테마를 따르는 색 (라이트 값, 다크 값) */
private class Pal(private val theme: String) {
    private fun c(day: Long, night: Long): ColorProvider = when (theme) {
        "dark" -> ColorProvider(Color(night))
        "system" -> androidx.glance.color.ColorProvider(Color(day), Color(night))
        else -> ColorProvider(Color(day))
    }
    val text = c(0xFF222326, 0xFFECECEE) // text
    val faint = c(0xFF66676B, 0xFF9E9EA4) // faint
    val muted = c(0xFF45464A, 0xFFC3C3C6) // muted
    val accentInk = c(0xFF5C5000, 0xFFF2DC6A) // accent-ink
    val sunday = c(0xFFC9202E, 0xFFFF5B63) // negative
    val saturday = c(0xFF3563C9, 0xFF6F9BFF) // saturday
    val positive = c(0xFF367940, 0xFF5FC77A) // positive
    /** 바탕(surface)·나눔선(rule) — 모서리·밤 색을 런처가 고르도록 drawable 로 */
    val bg = when (theme) {
        "dark" -> R.drawable.widget_bg_dark
        "system" -> R.drawable.widget_bg_auto
        else -> R.drawable.widget_bg
    }
    val rule = when (theme) {
        "dark" -> R.drawable.widget_rule_dark
        "system" -> R.drawable.widget_rule_auto
        else -> R.drawable.widget_rule
    }
}

private val LocalPal = staticCompositionLocalOf { Pal("light") }

private fun Dot.color() = when (this) {
    Dot.A -> C.a
    Dot.B -> C.b
    Dot.JOINT -> C.joint
    Dot.OUT -> C.out
}

private val WEEK = listOf("일", "월", "화", "수", "목", "금", "토")
private val WEEKDAY = listOf("월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일")

private fun style(size: TextUnit, color: ColorProvider, bold: Boolean = false) =
    TextStyle(color = color, fontSize = size, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)

/** 위젯 한 장 — 어디를 눌러도 앱의 달력 화면. theme 은 light · dark · system */
@Composable
fun CalendarContent(cal: WidgetCalendar?, today: LocalDate, theme: String) {
    val pal = Pal(theme)
    val size = LocalSize.current
    val wide = size.width >= 250.dp
    val tall = size.height >= 260.dp
    val open = actionStartActivity<MainActivity>(actionParametersOf(ActionParameters.Key<String>(MainActivity.OPEN) to MainActivity.OPEN_CALENDAR))
    val rounded = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        GlanceModifier.cornerRadius(android.R.dimen.system_app_widget_background_radius)
    } else {
        GlanceModifier
    }
    CompositionLocalProvider(LocalPal provides pal) {
        Box(
            GlanceModifier.fillMaxSize().appWidgetBackground().background(ImageProvider(pal.bg)).then(rounded)
                .clickable(open).padding(if (wide) 16.dp else 12.dp),
        ) {
            when {
                wide && tall -> Large(cal, today)
                wide -> Medium(cal, today)
                else -> MonthGrid(cal, today, dots = false, header = true)
            }
        }
    }
}

/** 넓게(4×2): 왼쪽 오늘 + 다가오는 두 개, 오른쪽 이번 달 */
@Composable
private fun Medium(cal: WidgetCalendar?, today: LocalDate) {
    val pal = LocalPal.current
    Row(GlanceModifier.fillMaxSize()) {
        Column(GlanceModifier.defaultWeight().fillMaxHeight()) {
            Text(WEEKDAY[today.dayOfWeek.isoDayNumber - 1], style = style(12.sp, pal.accentInk, bold = true))
            Text("${today.day}", style = style(34.sp, pal.text, bold = true))
            Spacer(GlanceModifier.height(4.dp))
            UpList(cal, today, 2)
        }
        Spacer(GlanceModifier.width(14.dp))
        Box(GlanceModifier.width(LocalSize.current.width * 0.46f).fillMaxHeight()) {
            MonthGrid(cal, today, dots = false, header = true)
        }
    }
}

/** 크게(4×4): 이번 달(점 포함) + 다가오는 세 개 */
@Composable
private fun Large(cal: WidgetCalendar?, today: LocalDate) {
    Column(GlanceModifier.fillMaxSize()) {
        Box(GlanceModifier.defaultWeight().fillMaxWidth()) {
            MonthGrid(cal, today, dots = true, header = true)
        }
        Spacer(GlanceModifier.height(8.dp))
        Box(GlanceModifier.fillMaxWidth().height(1.dp).background(ImageProvider(LocalPal.current.rule))) {}
        Spacer(GlanceModifier.height(8.dp))
        UpList(cal, today, 3)
    }
}

/** 이번 달 칸 — 오늘은 노란 동그라미, 일요일 빨강·토요일 파랑, 그 달이 아닌 칸은 비운다 */
@Composable
private fun MonthGrid(cal: WidgetCalendar?, today: LocalDate, dots: Boolean, header: Boolean) {
    val pal = LocalPal.current
    val cells = monthCells(today.year, today.month.number)
    val small = !dots
    val num = if (small) 10.sp else 13.sp
    val circle: Dp = if (small) 16.dp else 24.dp
    Column(GlanceModifier.fillMaxSize()) {
        if (header) {
            Text("${today.month.number}월", style = style(if (small) 12.sp else 15.sp, pal.accentInk, bold = true))
            Spacer(GlanceModifier.height(if (small) 2.dp else 6.dp))
        }
        Row(GlanceModifier.fillMaxWidth()) {
            WEEK.forEachIndexed { i, w ->
                Box(GlanceModifier.defaultWeight(), contentAlignment = Alignment.Center) {
                    Text(w, style = style(if (small) 9.sp else 11.sp, dayColor(i, pal.faint, pal)))
                }
            }
        }
        cells.chunked(7).forEach { week ->
            Row(GlanceModifier.fillMaxWidth().defaultWeight(), verticalAlignment = Alignment.CenterVertically) {
                week.forEach { d ->
                    Box(GlanceModifier.defaultWeight().fillMaxHeight(), contentAlignment = Alignment.Center) {
                        if (d != null) Day(d, d == today, num, circle, if (dots) cal?.dots?.get(d).orEmpty() else emptyList())
                    }
                }
            }
        }
    }
}

private fun dayColor(index: Int, base: ColorProvider, pal: Pal) = when (index) {
    0 -> pal.sunday
    6 -> pal.saturday
    else -> base
}

@Composable
private fun Day(d: LocalDate, isToday: Boolean, num: TextUnit, circle: Dp, dots: List<Dot>) {
    val pal = LocalPal.current
    val color = when {
        isSunday(d) -> pal.sunday
        isSaturday(d) -> pal.saturday
        else -> pal.text
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            (if (isToday) GlanceModifier.background(ImageProvider(R.drawable.widget_today)) else GlanceModifier).size(circle),
            contentAlignment = Alignment.Center,
        ) {
            Text("${d.day}", style = style(num, if (isToday) C.onPrimary else color, bold = isToday))
        }
        if (dots.isNotEmpty()) {
            Row {
                dots.forEachIndexed { i, dot ->
                    if (i > 0) Spacer(GlanceModifier.width(2.dp))
                    Image(ImageProvider(R.drawable.widget_dot), null, GlanceModifier.size(4.dp), colorFilter = ColorFilter.tint(ColorProvider(dot.color())))
                }
            }
        }
    }
}

/** 다가오는 것 — 왼쪽 색 막대(누구), 이름, 언제 · 금액/시간 */
@Composable
private fun UpList(cal: WidgetCalendar?, today: LocalDate, n: Int) {
    val pal = LocalPal.current
    val items = cal?.upcoming(today, n).orEmpty()
    if (items.isEmpty()) {
        Text(if (cal == null) "앱을 열면 일정이 보여요" else "다가오는 일정이 없어요", style = style(12.sp, pal.faint), maxLines = 2)
        return
    }
    Column(GlanceModifier.fillMaxWidth()) {
        items.forEachIndexed { i, item ->
            if (i > 0) Spacer(GlanceModifier.height(6.dp))
            UpRow(item, today)
        }
    }
}

@Composable
private fun UpRow(item: UpItem, today: LocalDate) {
    val pal = LocalPal.current
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(GlanceModifier.width(3.dp).height(30.dp).background(item.dot.color())) {}
        Spacer(GlanceModifier.width(8.dp))
        Column(GlanceModifier.defaultWeight()) {
            Text(item.title, style = style(13.sp, pal.text, bold = true), maxLines = 1)
            Text(whenText(item, today), style = style(11.sp, pal.faint), maxLines = 1)
        }
        if (item.note.isNotEmpty()) {
            Spacer(GlanceModifier.width(6.dp))
            Text(item.note, style = style(12.sp, if (item.income) pal.positive else pal.muted, bold = item.income), maxLines = 1)
        }
    }
}

/** "오늘", "내일", "진행 중", "11월 25일 (수)" */
private fun whenText(item: UpItem, today: LocalDate): String = when {
    item.start <= today && item.end > today && item.start != item.end -> "진행 중"
    item.start <= today -> "오늘"
    item.start == today.plus(DatePeriod(days = 1)) -> "내일"
    else -> "${item.start.month.number}월 ${item.start.day}일 (${WEEK[item.start.dayOfWeek.isoDayNumber % 7]})"
}
