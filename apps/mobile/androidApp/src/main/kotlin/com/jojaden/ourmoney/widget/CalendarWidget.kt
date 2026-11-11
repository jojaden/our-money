package com.jojaden.ourmoney.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import androidx.compose.runtime.remember
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.currentState
import androidx.glance.state.GlanceStateDefinition
import androidx.glance.state.PreferencesGlanceStateDefinition
import com.jojaden.ourmoney.core.calendar.WidgetCalendar
import com.jojaden.ourmoney.core.calendar.parseWidgetCalendar
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.datetime.toKotlinLocalDate
import java.io.File
import java.time.LocalDate
import java.time.ZoneId

// 홈 화면 달력 위젯 (애플 달력 위젯처럼: 작게 = 이번 달, 넓게 = 오늘 + 다가오는 것 + 이번 달, 크게 = 이번 달 + 다가오는 것).
// 로그인은 웹에만 있어서 위젯은 서버를 부르지 않는다 — 웹이 앱을 열어 둔 동안 넘긴 달력 요약(CalendarStore)과 폰의 오늘 날짜로 그린다.
// 누르면 앱의 달력 화면이 열린다(MainActivity EXTRA_OPEN). 자정에 한 번 다시 그려 오늘 표시를 옮긴다.

/** 웹이 넘긴 달력 요약 — 앱 전용 저장소의 파일 하나 (백업·기기 이전에서 빠진다, data_extraction_rules) */
object CalendarStore {
    private const val FILE = "widget-calendar.json"

    /** 검사를 통과한 것만 저장하고 위젯을 다시 그린다 */
    fun save(context: Context, json: String) {
        if (parseWidgetCalendar(json) == null) return
        synchronized(this) { File(context.filesDir, FILE).writeText(json) }
        CalendarWidget.refreshAsync(context)
    }

    /** 로그아웃: 다음 사람이 보지 않게 지운다 */
    fun clear(context: Context) {
        synchronized(this) { File(context.filesDir, FILE).delete() }
        CalendarWidget.refreshAsync(context)
    }

    fun read(context: Context): WidgetCalendar? = synchronized(this) {
        val f = File(context.filesDir, FILE)
        if (f.exists()) runCatching { parseWidgetCalendar(f.readText()) }.getOrNull() else null
    }
}

class CalendarWidget : GlanceAppWidget() {
    // 놓인 크기 그대로 그린다 (작게·넓게·크게를 LocalSize 로 고른다)
    override val sizeMode: SizeMode = SizeMode.Exact
    override val stateDefinition: GlanceStateDefinition<*> = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            // 그려 둔 동안(약 45초)은 provideGlance 가 다시 불리지 않는다 — 판(REV)이 바뀌면 요약과 오늘을 다시 읽는다
            val rev = currentState<Preferences>()[REV] ?: 0
            val cal = remember(rev) { CalendarStore.read(context) }
            val today = remember(rev) { LocalDate.now().toKotlinLocalDate() }
            CalendarContent(cal, today)
        }
    }

    companion object {
        private val REV = intPreferencesKey("rev")
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

        /** 놓인 위젯마다 판을 올리고 다시 그린 뒤 다음 자정을 예약한다 */
        suspend fun refresh(context: Context) {
            val widget = CalendarWidget()
            for (id in GlanceAppWidgetManager(context).getGlanceIds(CalendarWidget::class.java)) {
                updateAppWidgetState(context, id) { it[REV] = (it[REV] ?: 0) + 1 }
                widget.update(context, id)
            }
            Midnight.schedule(context)
        }

        fun refreshAsync(context: Context) {
            val app = context.applicationContext
            scope.launch { runCatching { refresh(app) } }
        }
    }
}

class CalendarWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CalendarWidget()

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        // 자정 예약, 사용자가 시간·시간대를 바꿨을 때 — 다시 그리기만 하므로 누가 보내도 해가 없다
        if (intent.action in REFRESH) {
            val pending = goAsync()
            CoroutineScope(Dispatchers.Default).launch {
                try {
                    runCatching { CalendarWidget.refresh(context.applicationContext) }
                } finally {
                    pending.finish()
                }
            }
        }
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        Midnight.schedule(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        Midnight.cancel(context)
    }

    companion object {
        const val ACTION_MIDNIGHT = "com.jojaden.ourmoney.widget.MIDNIGHT"
        private val REFRESH = setOf(ACTION_MIDNIGHT, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED)
    }
}

/** 자정이 지나면 위젯을 다시 그린다. 깨우지 않는 알람이라 화면이 꺼져 있으면 다음에 켤 때 그린다 (배터리를 쓰지 않는다) */
private object Midnight {
    private fun intent(context: Context) = PendingIntent.getBroadcast(
        context,
        0,
        Intent(context, CalendarWidgetReceiver::class.java).setAction(CalendarWidgetReceiver.ACTION_MIDNIGHT),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    fun schedule(context: Context) {
        val zone = ZoneId.systemDefault()
        val at = LocalDate.now(zone).plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli() + 1_000
        context.getSystemService(AlarmManager::class.java)?.set(AlarmManager.RTC, at, intent(context))
    }

    fun cancel(context: Context) {
        context.getSystemService(AlarmManager::class.java)?.cancel(intent(context))
    }
}
