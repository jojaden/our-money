package com.jojaden.ourmoney.core

import com.jojaden.ourmoney.core.notice.Payment
import com.jojaden.ourmoney.core.notice.PaymentKind
import com.jojaden.ourmoney.core.notice.parseNotice
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds
import kotlin.time.TimeSource

// 결제 알림 읽기. 실제 알림의 모양만 따르고 이름·번호·금액은 지어낸 값이다(공개 저장소).

class NoticeTest {
    private fun p(text: String, title: String = ""): Payment? = parseNotice(title, text)

    @Test
    fun 신한카드_사용() {
        assertEquals(
            Payment(PaymentKind.APPROVE, 5_000, "한국가스(주)", "0001", 1),
            p("한국가스(주)\n1234-56**-****-0001\n사용 5,000원 일시불"),
        )
    }

    @Test
    fun 신한카드_취소() {
        assertEquals(
            Payment(PaymentKind.CANCEL, 28_000, "(주)카셰어", "0001", 1),
            p("(주)카셰어\n1234-56**-****-0001\n취소 28,000원 일시불"),
        )
    }

    @Test
    fun 신한카드_할부와_카드사_제목() {
        assertEquals(
            Payment(PaymentKind.APPROVE, 360_000, "전자랜드", "0001", 3),
            p("전자랜드\n1234-56**-****-0001\n사용 360,000원 3개월", title = "신한카드"),
        )
    }

    @Test
    fun 우리카드_승인_누적은_금액이_아니다() {
        assertEquals(
            Payment(PaymentKind.APPROVE, 6_300, "카페 여의도1", "0002", 1),
            p("[일시불.승인(0002)]11/04 09:51\n6,300원 / 누적:800,000원\n카페 여의도1"),
        )
    }

    @Test
    fun 우리카드_자동납부_가맹점() {
        assertEquals(
            Payment(PaymentKind.APPROVE, 119_000, "SK텔레콤_자동납부_0000", "0002", 1),
            p("[일시불.승인(0002)]10/26 09:56\n119,000원\nSK텔레콤_자동납부_0000"),
        )
    }

    @Test
    fun 신한은행_방향_없는_계좌_알림() {
        assertEquals(
            Payment(PaymentKind.MOVE, 450_000, "예진", "0003", null),
            p("450,000원 예진 입출금(0003)\n10.30 22:14"),
        )
    }

    @Test
    fun 신한은행_제목에_입금() {
        assertEquals(PaymentKind.DEPOSIT, p("450,000원 예진 입출금(0003)\n10.30 22:14", title = "입금")?.kind)
    }

    @Test
    fun KB국민은행_출금() {
        assertEquals(
            Payment(PaymentKind.WITHDRAW, 10_000, "카카오페이", "000", null),
            p("2026/11/04/ 06:38 KB국민 000000-**-***000 출금 10,000원 카카오페이"),
        )
    }

    @Test
    fun 잔액은_금액이_아니다() {
        val r = p("[신한] 잔액 1,200,000원\n출금 230,000원 관리비")
        assertEquals(PaymentKind.WITHDRAW to 230_000L, r?.kind to r?.amount)
        assertEquals("관리비", r?.counterpart)
    }

    @Test
    fun 가맹점_이름_속_낱말은_남긴다() {
        assertEquals("우리동네마트", p("우리동네마트\n1234-56**-****-0001\n사용 12,000원 일시불")?.counterpart)
    }

    @Test
    fun 금액이_없으면_읽지_않는다() {
        assertNull(p("이번 달 카드 실적을 확인하세요"))
    }

    @Test
    fun 가려진_번호_끝자리() {
        assertEquals("5678", p("1234-****-****-5678\n승인 1,000원")?.last4)
        assertEquals("4567", p("**12**4567 결제 1,000원")?.last4)
    }

    // 아무 앱이나 올린 긴 글이 해석을 붙잡지 않는다 (정규식 역추적, 금액마다 앞부분 다시 훑기)
    @Test
    fun 긴_글도_금방_읽는다() {
        val start = TimeSource.Monotonic.markNow()
        assertEquals(1L, p("*".repeat(5_000), title = "결제 1원")?.amount)
        assertNull(p("누적" + " ".repeat(300) + "x" + "누적1원".repeat(100), title = "결제"))
        assertTrue(start.elapsedNow() < 1.seconds)
    }
}
