package com.jojaden.ourmoney.notice

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jojaden.ourmoney.core.notice.parseNotice
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val Ink = Color(0xFF1C1C1E)
private val Muted = Color(0xFF6E6E73)
private val Card = Color(0xFFFFFFFF)

/**
 * 카드 알림 모으기 화면 (임시). 알림 접근 권한 상태, 모은 알림 목록과 해석기가 읽은 값,
 * 숫자를 가려 복사하기(해석 규칙을 만들 때 붙여 넣을 용도), 모두 지우기.
 */
@Composable
fun NoticeScreen(
    enabled: Boolean,
    canNotify: Boolean,
    samples: List<NoticeSample>,
    onOpenSettings: () -> Unit,
    onAllowNotify: () -> Unit,
    onCopy: () -> Unit,
    onClear: () -> Unit,
) {
    val time = SimpleDateFormat("M/d HH:mm", Locale.KOREA)
    Scaffold(containerColor = Color(0xFFF2F2F7)) { inner ->
        // 목록이 시스템 막대 뒤로 지나가도 첫 줄과 끝 줄은 가리지 않게 (edge-to-edge)
        LazyColumn(
            contentPadding = inner,
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "head", contentType = "head") {
                Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("카드 알림 모으기", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Ink)
                    Text(
                        if (enabled) "알림을 읽고 있어요. 결제 알림이 여기에 모이고, 이번 달 고정비·이체와 맞으면 체크해 둬요. 알림 글은 폰 밖으로 보내지 않아요."
                        else "카드·은행 결제 알림을 읽으려면 알림 접근을 허용해 주세요.",
                        fontSize = 15.sp,
                        color = Muted,
                    )
                    if (enabled && !canNotify) {
                        Text("결제가 할 일과 맞으면 폰 알림으로 알려 드려요. 알림을 허용하면 \"체크할까요?\"도 거기서 물어봐요.", fontSize = 15.sp, color = Muted)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (!enabled) Button(onClick = onOpenSettings) { Text("알림 접근 허용") }
                        if (enabled && !canNotify) Button(onClick = onAllowNotify) { Text("알림 허용") }
                        if (samples.isNotEmpty()) {
                            Button(onClick = onCopy) { Text("숫자 가려서 복사") }
                            OutlinedButton(onClick = onClear) { Text("모두 지우기") }
                        }
                    }
                }
            }
            if (samples.isEmpty()) {
                item(key = "empty", contentType = "empty") {
                    Text("아직 모은 알림이 없어요.", Modifier.padding(horizontal = 20.dp), fontSize = 15.sp, color = Muted)
                }
            }
            items(samples, key = { "${it.at}:${it.pkg}:${it.text.hashCode()}" }, contentType = { "sample" }) { s ->
                Column(
                    Modifier
                        .padding(horizontal = 16.dp)
                        .fillMaxWidth()
                        .background(Card, RoundedCornerShape(16.dp))
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text("${time.format(Date(s.at))} · ${s.pkg}", fontSize = 12.sp, color = Muted)
                    if (s.title.isNotBlank()) Text(s.title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                    Text(s.text, fontSize = 15.sp, color = Ink)
                    // 다시 그릴 때마다 정규식을 돌리지 않게 알림마다 한 번만 읽는다
                    val read = remember(s) { NoticeSamples.describe(parseNotice(s.title, s.text)) }
                    Text("읽은 값: $read", fontSize = 13.sp, color = Muted)
                }
            }
        }
    }
}
