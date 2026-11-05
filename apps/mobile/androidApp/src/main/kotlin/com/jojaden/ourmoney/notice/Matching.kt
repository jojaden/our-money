package com.jojaden.ourmoney.notice

import android.Manifest
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
import com.jojaden.ourmoney.core.notice.Expect
import com.jojaden.ourmoney.core.notice.Match
import com.jojaden.ourmoney.core.notice.Payment
import com.jojaden.ourmoney.core.notice.Sureness
import com.jojaden.ourmoney.core.notice.matchPayment
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

// 결제 알림 ↔ 이번 달 할 일 맞추기의 폰 쪽.
// 웹이 앱을 열어 둔 동안 넘긴 "남은 할 일"(Expects)을 폰에만 두고, 알림이 맞으면 대기열(MatchQueue)에 넣어 폰 알림으로 알린다.
// 체크는 웹이 한다(로그인은 웹에만 있다) — 앱을 열면 웹이 대기열에서 확실한 것·사람이 확인한 것을 가져가 체크하고 되돌리기를 보인다.
// 두 파일 모두 앱 전용 저장소에만 있고 백업·기기 이전에서 빠진다(data_extraction_rules).

/** 웹이 넘긴 이번 달 남은 할 일 — 맞출 때만 쓴다 */
object Expects {
    private const val FILE = "notice-expect.json"
    private const val MAX = 300

    /** 웹이 보낸 목록을 검사해서 저장 (모양이 틀린 줄은 버린다) */
    @Synchronized
    fun save(context: Context, items: JSONArray?) {
        val out = JSONArray()
        for (i in 0 until minOf(items?.length() ?: 0, MAX)) {
            val o = items!!.optJSONObject(i) ?: continue
            val key = o.optString("key").takeIf { it.length in 1..120 } ?: continue
            val title = o.optString("title").take(60).takeIf { it.isNotBlank() } ?: continue
            val amount = o.optLong("amount", -1).takeIf { it in 1..MAX_AMOUNT } ?: continue
            val due = o.optString("due").takeIf { DATE.matches(it) }
            out.put(
                JSONObject().put("key", key).put("kind", o.optString("kind").take(10)).put("title", title).put("amount", amount)
                    .put("due", due ?: JSONObject.NULL).put("method", o.optString("method").take(20))
                    .put("last4", o.optString("last4").takeIf { LAST4.matches(it) } ?: JSONObject.NULL),
            )
        }
        File(context.filesDir, FILE).writeText(out.toString())
    }

    @Synchronized
    fun list(context: Context): List<Expect> {
        val f = File(context.filesDir, FILE)
        if (!f.exists()) return emptyList()
        return runCatching {
            val arr = JSONArray(f.readText())
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                Expect(
                    key = o.getString("key"),
                    kind = o.getString("kind"),
                    title = o.getString("title"),
                    amount = o.getLong("amount"),
                    due = o.optString("due").takeIf { !o.isNull("due") && it.isNotEmpty() },
                    method = o.optString("method").ifEmpty { null },
                    last4 = o.optString("last4").takeIf { !o.isNull("last4") && it.isNotEmpty() },
                )
            }
        }.getOrDefault(emptyList())
    }

    private val DATE = Regex("""^\d{4}-\d{2}-\d{2}$""")
    private val LAST4 = Regex("""^\d{4}$""")
    /** DB 의 금액 한도(migrations/005)보다 넉넉하게 */
    private const val MAX_AMOUNT = 100_000_000_000L
}

/** 맞춘 것 대기열 — new(방금 맞춤) · confirmed(사람이 "체크하기") · dismissed("아니에요") */
object MatchQueue {
    private const val FILE = "notice-matches.json"
    private const val MAX = 50
    /** 오래된 것은 버린다 (그달이 지나면 쓸모없다) */
    private const val KEEP_MS = 40L * 24 * 60 * 60 * 1000
    /** 같은 알림이 고쳐 올라오면 한 번만 (같은 할 일·같은 금액이 이 안에 또 오면 건너뜀) */
    private const val SAME_MS = 10L * 60 * 1000

    data class Entry(val id: String, val key: String, val title: String, val amount: Long, val sure: Boolean, val state: String, val at: Long, val what: String)

    private fun file(context: Context) = File(context.filesDir, FILE)

    @Synchronized
    fun list(context: Context): List<Entry> {
        val f = file(context)
        if (!f.exists()) return emptyList()
        return runCatching {
            val arr = JSONArray(f.readText())
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                Entry(o.getString("id"), o.getString("key"), o.getString("title"), o.getLong("amount"), o.getBoolean("sure"), o.getString("state"), o.getLong("at"), o.optString("what"))
            }
        }.getOrDefault(emptyList())
    }

    private fun write(context: Context, all: List<Entry>) {
        val arr = JSONArray()
        all.forEach {
            arr.put(
                JSONObject().put("id", it.id).put("key", it.key).put("title", it.title).put("amount", it.amount)
                    .put("sure", it.sure).put("state", it.state).put("at", it.at).put("what", it.what),
            )
        }
        file(context).writeText(arr.toString())
    }

    /**
     * 새로 맞춘 것을 넣는다. 그 할 일이 이미 체크될 차례(확실 또는 확인함)이거나 같은 알림이 고쳐 올라온 것이면 null.
     * 아직 답하지 않은 "나간 것 같아요"는 새로 맞춘 것으로 바꾼다 (같은 금액의 다른 결제였을 수 있다).
     */
    @Synchronized
    fun add(context: Context, m: Match, what: String, at: Long): Entry? {
        val key = m.expect.key
        val now = list(context).filter { at - it.at < KEEP_MS }
        val waiting = now.any { it.key == key && ((it.sure && it.state == "new") || it.state == "confirmed") }
        val repost = now.any { it.key == key && kotlin.math.abs(at - it.at) < SAME_MS }
        if (waiting || repost) return null
        val e = Entry(UUID.randomUUID().toString(), key, m.expect.title, m.expect.amount, m.sureness == Sureness.SURE, "new", at, what)
        write(context, (listOf(e) + now.filterNot { it.key == key && it.state == "new" }).take(MAX))
        return e
    }

    /** 사람이 알림에서 고른 것: confirmed 또는 dismissed */
    @Synchronized
    fun mark(context: Context, id: String, state: String) {
        write(context, list(context).map { if (it.id == id && it.state == "new") it.copy(state = state) else it })
    }

    /** 웹이 체크할 것 — 확실하게 맞은 것과 사람이 "체크하기"를 고른 것 */
    @Synchronized
    fun forWeb(context: Context): JSONArray {
        val arr = JSONArray()
        list(context).filter { (it.sure && it.state == "new") || it.state == "confirmed" }.forEach {
            arr.put(JSONObject().put("id", it.id).put("key", it.key).put("title", it.title).put("amount", it.amount))
        }
        return arr
    }

    /** 웹이 체크를 마친 것은 지운다 */
    @Synchronized
    fun remove(context: Context, ids: Set<String>) {
        if (ids.isNotEmpty()) write(context, list(context).filterNot { it.id in ids })
    }
}

/**
 * 폰 알림 — 확실하면 "관리비 230,000원이 나갔어요 · 앱을 열면 체크돼요", 애매하면 "나간 것 같아요" + [체크하기] [아니에요].
 * 눌렀을 때 여는 것은 모두 이 앱의 정해진 화면·받는 곳이고(명시적 컴포넌트), PendingIntent 는 바꿀 수 없게(IMMUTABLE) 만든다.
 * 알림 권한이 없으면 띄우지 않는다 — 확실한 것은 앱을 열 때 그대로 체크되고, 애매한 것은 기한이 지나면 종에서 묻는다.
 */
object MatchNotifier {
    private const val CHANNEL = "pay-match"

    fun canNotify(context: Context): Boolean =
        NotificationManagerCompat.from(context).areNotificationsEnabled() &&
            (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)

    fun show(context: Context, e: MatchQueue.Entry) {
        if (!canNotify(context)) return
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, context.getString(R.string.match_channel), NotificationManager.IMPORTANCE_DEFAULT))
        val money = "${e.title} ${"%,d".format(e.amount)}원"
        val open = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val b = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notice)
            .setContentIntent(open)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
        if (e.sure) {
            b.setContentTitle("${money}이 나갔어요").setContentText("앱을 열면 체크돼요")
        } else {
            b.setContentTitle("${money}이 나간 것 같아요")
                .setContentText(listOf(e.what, "체크할까요?").filter { it.isNotBlank() }.joinToString(" · "))
                .addAction(0, "체크하기", action(context, e.id, MatchActionReceiver.CONFIRM))
                .addAction(0, "아니에요", action(context, e.id, MatchActionReceiver.DISMISS))
        }
        runCatching { NotificationManagerCompat.from(context).notify(e.id.hashCode(), b.build()) }
    }

    private fun action(context: Context, id: String, what: String): PendingIntent = PendingIntent.getBroadcast(
        context,
        "$what:$id".hashCode(),
        Intent(context, MatchActionReceiver::class.java).setAction(what).putExtra(MatchActionReceiver.ID, id),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    fun cancel(context: Context, id: String) = NotificationManagerCompat.from(context).cancel(id.hashCode())
}

/** 알림의 [체크하기]·[아니에요] — 이 앱의 PendingIntent 만 부를 수 있다(매니페스트 exported=false). 대기열에 있는 id 만 바꾼다 */
class MatchActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(ID)?.takeIf { UUID_RE.matches(it) } ?: return
        val state = when (intent.action) {
            CONFIRM -> "confirmed"
            DISMISS -> "dismissed"
            else -> return
        }
        MatchQueue.mark(context, id, state)
        MatchNotifier.cancel(context, id)
    }

    companion object {
        const val CONFIRM = "confirm"
        const val DISMISS = "dismiss"
        const val ID = "id"
        private val UUID_RE = Regex("""^[0-9a-f-]{36}$""")
    }
}

/** 결제 알림을 이번 달 남은 할 일과 맞춰 보고, 맞으면 대기열에 넣고 알린다 (CardNoticeListener 에서) */
fun onPayment(context: Context, p: Payment, at: Long) {
    val on = Instant.ofEpochMilli(at).atZone(ZoneId.systemDefault()).toLocalDate().toString()
    val m = matchPayment(p, on, Expects.list(context)) ?: return
    val what = listOfNotNull(p.counterpart, if (p.isCard) "카드" else "계좌").joinToString(" · ")
    MatchQueue.add(context, m, what, at)?.let { MatchNotifier.show(context, it) }
}
