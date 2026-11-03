package com.jojaden.ourmoney.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jojaden.ourmoney.core.calc.currentMonth
import com.jojaden.ourmoney.core.calc.periodOf

/** 앱 진입 화면 (Android·iOS 공통). 화면은 다음 단계에서 하나씩 옮긴다. */
@Composable
fun App() {
    val month = currentMonth(25)
    val p = periodOf(month, 25)
    MaterialTheme {
        Surface(Modifier.fillMaxSize(), color = Color(0xFFF2F2F7)) {
            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("우리 집 가계부", fontSize = 32.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1C1C1E))
                Text("${month.substring(5).trimStart('0')}월 · ${p.start} – ${p.last}", fontSize = 15.sp, color = Color(0xFF6E6E73))
            }
        }
    }
}
