package com.jojaden.ourmoney.core

import com.jojaden.ourmoney.core.notice.Expect
import com.jojaden.ourmoney.core.notice.Payment
import com.jojaden.ourmoney.core.notice.PaymentKind
import com.jojaden.ourmoney.core.notice.Sureness
import com.jojaden.ourmoney.core.notice.matchPayment
import com.jojaden.ourmoney.core.notice.sameName
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

// 결제 알림 ↔ 이번 달 할 일 맞추기 (값은 지어냈다)

class MatchTest {
    private val gas = Expect("2026-11:gas", "pay", "도시가스", 32_000, "2026-11-03", "card_auto", null)
    private val phone = Expect("2026-11:phone", "pay", "통신비 2회선", 98_000, "2026-11-03", "card_auto", "0001")
    private val rent = Expect("2026-11:rent", "pay", "관리비", 230_000, "2026-10-30", "account_auto", null)
    private val isa = Expect("t:2026-11:a>isa", "transfer", "현빈 ISA로 옮길 돈", 500_000, "2026-10-26", null, null)
    private val all = listOf(gas, phone, rent, isa)

    private fun card(amount: Long, who: String?, last4: String? = null) = Payment(PaymentKind.APPROVE, amount, who, last4, 1)
    private fun bank(amount: Long, who: String?, kind: PaymentKind = PaymentKind.WITHDRAW) = Payment(kind, amount, who, "0003", null)

    @Test
    fun 카드_끝자리가_맞으면_확실() {
        assertEquals(Sureness.SURE to phone, matchPayment(card(98_000, "SK텔레콤_자동납부_0000", "0001"), "2026-11-03", all)?.let { it.sureness to it.expect })
    }

    @Test
    fun 가맹점_이름이_맞으면_확실() {
        assertEquals(Sureness.SURE to gas, matchPayment(card(32_000, "한국도시가스(주)"), "2026-11-04", all)?.let { it.sureness to it.expect })
    }

    @Test
    fun 금액만_맞으면_물어본다() {
        assertEquals(Sureness.MAYBE to phone, matchPayment(card(98_000, "SK텔레콤_자동납부_0000"), "2026-11-03", all)?.let { it.sureness to it.expect })
    }

    @Test
    fun 계좌_출금은_이체와_자동이체에() {
        assertEquals(Sureness.SURE to isa, matchPayment(bank(500_000, "현빈"), "2026-10-26", all)?.let { it.sureness to it.expect })
        assertEquals(Sureness.SURE to rent, matchPayment(bank(230_000, "아파트관리비"), "2026-11-01", all)?.let { it.sureness to it.expect })
    }

    @Test
    fun 방향_모르는_계좌_알림은_이름이_맞아도_묻는다() {
        assertEquals(Sureness.MAYBE, matchPayment(bank(500_000, "현빈", PaymentKind.MOVE), "2026-10-26", all)?.sureness)
    }

    @Test
    fun 카드_사용은_자동이체와_맞추지_않는다() {
        assertNull(matchPayment(card(230_000, "관리비"), "2026-10-30", all))
    }

    @Test
    fun 기한에서_멀면_맞추지_않는다() {
        assertNull(matchPayment(bank(230_000, "관리비"), "2026-11-10", all))
        assertNull(matchPayment(bank(230_000, "관리비"), "2026-10-20", all))
    }

    @Test
    fun 들어온_돈과_취소는_맞추지_않는다() {
        assertNull(matchPayment(bank(230_000, "관리비", PaymentKind.DEPOSIT), "2026-10-30", all))
        assertNull(matchPayment(Payment(PaymentKind.CANCEL, 32_000, "한국도시가스(주)", null, 1), "2026-11-03", all))
    }

    @Test
    fun 같은_금액이_둘이면_가까운_기한으로_묻는다() {
        val water = Expect("2026-11:water", "pay", "수도", 32_000, "2026-11-08", "card_auto", null)
        val m = matchPayment(card(32_000, "편의점"), "2026-11-06", listOf(gas, water))
        assertEquals(Sureness.MAYBE to water, m?.let { it.sureness to it.expect })
    }

    @Test
    fun 이름_맞추기() {
        assertTrue(sameName("서울도시가스(주)", "도시가스"))
        assertTrue(sameName("현빈", "현빈 ISA로 옮길 돈"))
        assertFalse(sameName("카페", "관리비"))
        assertFalse(sameName("가", "가스"))
        assertFalse(sameName(null, "관리비"))
    }
}
