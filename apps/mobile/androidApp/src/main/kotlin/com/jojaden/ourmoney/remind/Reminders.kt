package com.jojaden.ourmoney.remind

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.jojaden.ourmoney.MainActivity
import com.jojaden.ourmoney.R
import com.jojaden.ourmoney.widget.CalendarWidget
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDateTime
import java.time.ZoneId

// 앱이 스스로 띄우는 폰 알림 (일정 미리 알림 · 월급날 아침 · 나갈 돈 전날).
// 로그인은 웹에만 있어서, 웹이 앱을 열어 둔 동안 앞으로 35일의 알림 목록을 넘기고(apps/web lib/reminders.ts) 폰이 그 시각에 띄운다.
// 알람은 늘 하나 — 가장 이른 알림 시각에 깨우지 않는 정확하지 않은 알람(정확 알람 권한 없이)을 걸고, 울리면 그때까지 온 것을 띄우고 다음 것을 건다.
// 파일은 앱 전용 저장소에만 있고 백업·기기 이전에서 빠진다(data_extraction_rules). 로그아웃하면 웹이 빈 목록을 보낸다.

/** 알림 하나 — id 가 같으면 한 번만 띄운다 */
data class Reminder(val id: String, val at: LocalDateTime, val ch: String, val title: String, val body: String, val open: String)

object Reminders {
    private const val FILE = "reminders.json"
    private const val SHOWN = "reminders-shown.json"
    private const val MAX = 80
    /** 폰이 꺼져 있었거나 알람이 늦게 와도 이만큼 지난 알림까지는 띄운다 (그보다 오래되면 조용히 넘긴다) */
    private const val LATE_HOURS = 6L
    private val ID = Regex("""^[\w:@.-]{1,120}$""")
    val CHANNELS = mapOf("event" to R.string.remind_event, "payday" to R.string.remind_payday, "due" to R.string.remind_due)
    val OPENS = setOf(MainActivity.OPEN_CALENDAR, MainActivity.OPEN_CHECK)

    /** 웹이 보낸 목록을 검사해서 저장하고 다음 알람을 건다. 이미 지난 시각의 알림은 띄우지 않는다(앱을 보고 있으니) */
    @Synchronized
    fun save(context: Context, items: JSONArray?) {
        val now = LocalDateTime.now()
        val list = (0 until minOf(items?.length() ?: 0, MAX)).mapNotNull { i -> parse(items!!.optJSONObject(i)) }
        File(context.filesDir, FILE).writeText(JSONArray(list.map(::toJson)).toString())
        markShown(context, list.filter { !it.at.isAfter(now) }.map { it.id })
        schedule(context)
    }

    private fun parse(o: JSONObject?): Reminder? {
        o ?: return null
        val id = o.optString("id").takeIf { ID.matches(it) } ?: return null
        val at = runCatching { LocalDateTime.parse(o.optString("at")) }.getOrNull() ?: return null
        val ch = o.optString("ch").takeIf { it in CHANNELS } ?: return null
        val title = clean(o.optString("title"), 60).takeIf { it.isNotEmpty() } ?: return null
        val open = o.optString("open").takeIf { it in OPENS } ?: return null
        return Reminder(id, at, ch, title, clean(o.optString("body"), 120), open)
    }

    private fun clean(s: String, max: Int) = s.filter { !it.isISOControl() }.trim().take(max)

    private fun toJson(r: Reminder) =
        JSONObject().put("id", r.id).put("at", r.at.toString()).put("ch", r.ch).put("title", r.title).put("body", r.body).put("open", r.open)

    @Synchronized
    fun list(context: Context): List<Reminder> {
        val f = File(context.filesDir, FILE)
        if (!f.exists()) return emptyList()
        return runCatching {
            val arr = JSONArray(f.readText())
            (0 until arr.length()).mapNotNull { parse(arr.optJSONObject(it)) }
        }.getOrDefault(emptyList())
    }

    private fun shown(context: Context): Set<String> {
        val f = File(context.filesDir, SHOWN)
        return if (f.exists()) runCatching { JSONArray(f.readText()).let { a -> (0 until a.length()).map { a.getString(it) }.toSet() } }.getOrDefault(emptySet()) else emptySet()
    }

    /** 띄운 id 를 적어 둔다 — 지금 목록에 있는 것만 남겨 파일이 자라지 않게 */
    private fun markShown(context: Context, ids: Collection<String>) {
        val keep = list(context).map { it.id }.toSet()
        val next = (shown(context) + ids).filter { it in keep }
        File(context.filesDir, SHOWN).writeText(JSONArray(next).toString())
    }

    /** 시각이 된 알림을 띄우고 다음 알람을 건다 */
    @Synchronized
    fun fire(context: Context) {
        val now = LocalDateTime.now()
        val done = shown(context)
        val due = list(context).filter { !it.at.isAfter(now) && it.id !in done }
        due.filter { it.at.isAfter(now.minusHours(LATE_HOURS)) }.forEach { notify(context, it) }
        markShown(context, due.map { it.id })
        schedule(context)
    }

    /** 아직 띄우지 않은 것 중 가장 이른 시각에 알람 하나 (없으면 거둔다) */
    fun schedule(context: Context) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val pi = PendingIntent.getBroadcast(
            context, 0,
            Intent(context, ReminderReceiver::class.java).setAction(ReminderReceiver.FIRE),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val done = shown(context)
        val next = list(context).filter { it.id !in done }.minByOrNull { it.at }
        if (next == null) {
            am.cancel(pi)
            return
        }
        val ms = next.at.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        // 정확하지 않아도 되는 알림이라 정확 알람 권한을 쓰지 않는다. 절전(Doze) 중에도 몇 분 안에 울린다
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ms, pi)
    }

    fun canNotify(context: Context): Boolean =
        NotificationManagerCompat.from(context).areNotificationsEnabled() &&
            (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)

    /** 종류마다 채널 하나 — 사람이 폰 설정에서 종류별로 끌 수 있다 */
    fun ensureChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        CHANNELS.forEach { (id, name) -> nm.createNotificationChannel(NotificationChannel("remind-$id", context.getString(name), NotificationManager.IMPORTANCE_DEFAULT)) }
    }

    private fun notify(context: Context, r: Reminder) {
        if (!canNotify(context)) return
        ensureChannels(context)
        val open = PendingIntent.getActivity(
            context, r.id.hashCode(),
            Intent(context, MainActivity::class.java).putExtra(MainActivity.OPEN, r.open).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(context, "remind-${r.ch}")
            .setSmallIcon(R.drawable.ic_notice)
            .setContentTitle(r.title)
            .setContentText(r.body)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        // 허용을 막 거둔 경우
        try {
            NotificationManagerCompat.from(context).notify(r.id.hashCode(), n)
        } catch (_: SecurityException) {
        }
    }
}

/** 알람이 울리면 — 이 앱의 PendingIntent 만 부른다 (내보내지 않음) */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == FIRE) Reminders.fire(context)
    }

    companion object {
        const val FIRE = "com.jojaden.ourmoney.remind.FIRE"
    }
}

/** 재부팅·앱 업데이트·시간 바뀜: 알람이 지워지거나 어긋나서 다시 건다 (시스템만 보낸다, 내보내지 않음) */
class RescheduleReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED -> {
                Reminders.fire(context)
                CalendarWidget.refreshAsync(context)
            }
        }
    }
}
