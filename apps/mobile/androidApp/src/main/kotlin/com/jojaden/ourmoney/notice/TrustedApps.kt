package com.jojaden.ourmoney.notice

import android.content.Context
import android.provider.Telephony
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * 결제 알림을 가계부에 쓰는 앱 — 카드 알림 화면에서 앱마다 켜고 끈다(폰 안에만 저장).
 * 알림 글은 아무 앱이나 올릴 수 있어서, 보낸 앱(sbn.packageName, 시스템이 채움)을 믿는 앱만 지출로 적고 할 일을 체크한다.
 * 문자·메신저 앱은 누구나 글을 보낼 수 있어서(스미싱) 켜도 맞는 할 일을 "체크할까요?"로 묻기만 한다.
 * 처음에는 알려진 카드사·은행 앱만 켜져 있고, 나머지는 모으기만 한다.
 */
object TrustedApps {
    enum class Level {
        /** 지출로 적고, 확실하면 체크 */
        WRITE,

        /** 맞는 할 일만 폰 알림으로 묻는다 */
        ASK,

        /** 모으기만 */
        OFF,
    }

    private const val FILE = "notice-apps.json"

    /** 문자·메신저 앱 (기본 문자 앱은 따로 묻는다) */
    private val MESSENGERS = setOf(
        "com.samsung.android.messaging",
        "com.google.android.apps.messaging",
        "com.android.mms",
        "com.android.messaging",
        "com.kakao.talk",
    )

    private fun file(context: Context) = File(context.filesDir, FILE)

    /** 사람이 고른 것: 켬·끔 (고르지 않은 앱은 기본값) */
    @Synchronized
    private fun choices(context: Context): Map<String, Boolean> {
        val f = file(context)
        if (!f.exists()) return emptyMap()
        return runCatching {
            val o = JSONObject(f.readText())
            val on = o.optJSONArray("on") ?: JSONArray()
            val off = o.optJSONArray("off") ?: JSONArray()
            (0 until on.length()).associate { on.getString(it) to true } + (0 until off.length()).associate { off.getString(it) to false }
        }.getOrDefault(emptyMap())
    }

    @Synchronized
    fun set(context: Context, pkg: String, on: Boolean) {
        val all = choices(context) + (pkg to on)
        file(context).writeText(
            JSONObject()
                .put("on", JSONArray(all.filterValues { it }.keys.toList()))
                .put("off", JSONArray(all.filterValues { !it }.keys.toList()))
                .toString(),
        )
    }

    fun isMessenger(context: Context, pkg: String): Boolean =
        pkg in MESSENGERS || pkg == runCatching { Telephony.Sms.getDefaultSmsPackage(context) }.getOrNull()

    /** 켜져 있나 — 고른 적이 없으면 알려진 카드사·은행 앱만 켜짐 */
    fun isOn(context: Context, pkg: String): Boolean =
        choices(context)[pkg] ?: (pkg in CardNoticeListener.KNOWN && !isMessenger(context, pkg))

    /** [message]: 알림 종류가 메시지(CATEGORY_MESSAGE)면 문자·메신저처럼 다룬다 */
    fun level(context: Context, pkg: String, message: Boolean): Level = when {
        !isOn(context, pkg) -> Level.OFF
        message || isMessenger(context, pkg) -> Level.ASK
        else -> Level.WRITE
    }
}
