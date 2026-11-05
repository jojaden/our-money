package com.jojaden.ourmoney.notice

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.jojaden.ourmoney.core.notice.parseNotice

/**
 * 카드 결제 알림 읽기. 결제처럼 보이는 알림을 폰 안에 모으고(NoticeSamples), 읽은 돈이 이번 달 할 일과 맞으면 알린다(Matching).
 * 해석과 맞추기는 모두 폰 안에서만 한다.
 * 시스템만 이 서비스에 붙을 수 있다 (매니페스트의 BIND_NOTIFICATION_LISTENER_SERVICE 권한).
 * 보낸 앱은 sbn.packageName 으로 본다 — 시스템이 채우는 값이라 다른 앱이 흉내 낼 수 없다.
 */
class CardNoticeListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName == packageName || sbn.isOngoing) return
        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
        if (!looksLikePayment(sbn.packageName, "$title\n$text")) return
        NoticeSamples.add(this, NoticeSample(sbn.postTime, sbn.packageName, title, text))
        parseNotice(title, text)?.let { onPayment(this, it, sbn.postTime) }
    }

    companion object {
        /**
         * 자주 쓰는 카드사·페이 앱 (패키지 이름은 추정 — 모은 알림의 실제 이름으로 고친다).
         * 신한카드(신한 SOL페이), 우리카드(우리WON카드), 삼성카드, KB국민카드(KB Pay), 네이버페이, 토스
         */
        val KNOWN = setOf(
            "com.shcard.smartpay",
            "com.wooricard.smartapp",
            "kr.co.samsungcard.mpocket",
            "com.kbcard.cxh.appcard",
            "com.naverfin.payapp",
            "viva.republica.toss",
        )

        private val MONEY = Regex("""[0-9][0-9,]*\s*원""")
        private val WORDS = Regex("승인|결제|취소|사용|출금")

        /** 알려진 앱이거나, 다른 앱이라도 "금액 + 승인·결제" 모양이면 모은다 (패키지 이름을 알아내려고) */
        fun looksLikePayment(pkg: String, body: String): Boolean =
            MONEY.containsMatchIn(body) && (pkg in KNOWN || WORDS.containsMatchIn(body))
    }
}
