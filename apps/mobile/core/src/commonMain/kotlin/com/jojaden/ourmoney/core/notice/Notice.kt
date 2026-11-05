package com.jojaden.ourmoney.core.notice

// 카드·은행 결제 알림 읽기. 알림 글(제목 + 본문)에서 금액·종류·가맹점(받는 쪽)·카드/계좌 끝자리를 꺼낸다.
// 카드사·은행마다 모양이 달라서 한 형식에 맞추지 않고, 아는 조각(날짜·시각·번호·금액·말)을 지운 뒤 남는 글을 가맹점으로 본다.
// 확인한 모양 (숫자는 가림):
//   신한카드   "가맹점 / 0000-00**-****-0000 / 사용 5,000원 일시불"  (취소면 "취소 …")
//   우리카드   "[일시불.승인(0000)]11/04 09:51 / 6,300원 / 누적:800,000원 / 가맹점"
//   신한은행   "450,000원 이름 입출금(0000) / 10.30 22:14"  (입금·출금 말이 없을 수 있다)
//   KB국민은행 "2026/11/04/ 06:38 KB국민 000000-**-***000 출금 10,000원 받는 곳"

/** 알림에서 읽은 돈의 움직임 */
enum class PaymentKind {
    /** 카드 사용·승인 */
    APPROVE,

    /** 카드 취소 */
    CANCEL,

    /** 계좌에서 나감 */
    WITHDRAW,

    /** 계좌로 들어옴 */
    DEPOSIT,

    /** 계좌 알림인데 들어온 건지 나간 건지 말이 없음 */
    MOVE,
}

data class Payment(
    val kind: PaymentKind,
    val amount: Long,
    /** 가맹점(카드) 또는 보낸·받는 쪽(계좌). 못 읽으면 null */
    val counterpart: String?,
    /** 알림에 보이는 카드·계좌 번호의 끝 숫자(3~4자리). 없으면 null */
    val last4: String?,
    /** 할부 개월 — 일시불 1, 계좌 알림이면 null */
    val months: Int?,
) {
    val isCard: Boolean get() = kind == PaymentKind.APPROVE || kind == PaymentKind.CANCEL
}

private val MONEY = Regex("""([0-9][0-9,]*)\s*원""")

/** 금액처럼 보여도 거래 금액이 아닌 것 (누적·잔액·한도) */
private val NOT_AMOUNT = Regex("""(누적|잔액|한도|이용가능)\s*[:：]?\s*$""")

/** 가려진 번호 0000-00**-****-0000, 000000-**-***000 → 끝 숫자 */
private val MASKED_NO = Regex("""[0-9*]+(?:-[0-9*]+)*\*[0-9*-]*?([0-9]{3,4})\b""")

/** 괄호 속 끝자리 (0000) */
private val PAREN_NO = Regex("""\(([0-9]{3,4})\)""")

private val MONTHS = Regex("""([0-9]{1,2})\s*개월""")

// 가맹점을 찾으려고 지우는 조각들
private val STRIP = listOf(
    Regex("""\[[^\]]*]"""), // [일시불.승인(0000)]
    Regex("""[0-9]{4}[/.\-][0-9]{1,2}[/.\-][0-9]{1,2}/?"""), // 2026/11/04/
    Regex("""\b[0-9]{1,2}[/.][0-9]{1,2}\b"""), // 11/04, 10.30
    Regex("""\b[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?\b"""), // 09:51
    Regex("""[0-9*]+(?:-[0-9*]+)*\*[0-9*-]*"""), // 가려진 번호
    Regex("""\([0-9]{3,4}\)"""),
    Regex("""(누적|잔액|한도|이용가능)\s*[:：]?\s*[0-9][0-9,]*\s*원"""),
    MONEY,
    Regex("""[0-9]{1,2}\s*개월"""),
    // 카드사·은행 이름과 거래 말은 떨어진 낱말일 때만 지운다 (가맹점 이름 속 "우리동네", "자동결제"는 그대로)
    Regex("""(?:^|\s)(KB국민|NH농협|IBK기업|신한|우리|국민|하나|삼성|현대|롯데|농협|카카오뱅크|토스뱅크)(카드|은행)?(?=\s|$)"""),
    Regex("""(?:^|\s)(입출금|일시불|할부|승인|사용|취소|출금|입금|이체|결제|체크|신용)(?=\s|$)"""),
)

/** 제목과 본문을 읽어 돈의 움직임으로. 금액을 못 찾으면 null */
fun parseNotice(title: String, text: String): Payment? {
    val body = listOf(title, text).filter { it.isNotBlank() }.joinToString("\n")
    val amount = MONEY.findAll(body).firstOrNull { !NOT_AMOUNT.containsMatchIn(body.substring(0, it.range.first)) }
        ?.groupValues?.get(1)?.replace(",", "")?.toLongOrNull()
        ?: return null
    // "입출금"은 통장 종류라 나감·들어옴을 가리지 않는다
    val words = body.replace("입출금", "")
    val card = Regex("""일시불|할부|승인|카드""").containsMatchIn(body) || Regex("""[0-9]{4}-[0-9*]{2,4}-\*{4}-[0-9]{4}""").containsMatchIn(body)
    val kind = when {
        // 계좌 알림의 "취소"는 어느 쪽인지 모른다
        "취소" in words -> if (card) PaymentKind.CANCEL else PaymentKind.MOVE
        card -> PaymentKind.APPROVE
        "출금" in words || "이체" in words -> PaymentKind.WITHDRAW
        "입금" in words -> PaymentKind.DEPOSIT
        else -> PaymentKind.MOVE
    }
    val last4 = MASKED_NO.find(body)?.groupValues?.get(1) ?: PAREN_NO.find(body)?.groupValues?.get(1)
    val months = when {
        !card -> null
        "일시불" in body -> 1
        else -> MONTHS.find(body)?.groupValues?.get(1)?.toIntOrNull() ?: 1
    }
    val counterpart = body.lines()
        .map { line -> STRIP.fold(line) { acc, r -> r.replace(acc, " ") }.replace(Regex("""[/·|]"""), " ").replace(Regex("""\s+"""), " ").trim() }
        .lastOrNull { it.isNotEmpty() }
    return Payment(kind, amount, counterpart, last4, months)
}
