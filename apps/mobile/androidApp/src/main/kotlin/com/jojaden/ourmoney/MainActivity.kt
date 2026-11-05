package com.jojaden.ourmoney

import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationManagerCompat
import com.jojaden.ourmoney.notice.CardNoticeListener
import com.jojaden.ourmoney.notice.NoticeSample
import com.jojaden.ourmoney.notice.NoticeSamples
import com.jojaden.ourmoney.notice.NoticeScreen

class MainActivity : ComponentActivity() {
    // 권한은 저장해 두지 않고 화면에 돌아올 때마다 다시 확인한다 (설정에서 언제든 끌 수 있다)
    private var enabled by mutableStateOf(false)
    private var samples by mutableStateOf(emptyList<NoticeSample>())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            NoticeScreen(
                enabled = enabled,
                samples = samples,
                onOpenSettings = ::openListenerSettings,
                onCopy = ::copyMasked,
                onClear = {
                    NoticeSamples.clear(this)
                    samples = emptyList()
                },
            )
        }
    }

    override fun onResume() {
        super.onResume()
        enabled = packageName in NotificationManagerCompat.getEnabledListenerPackages(this)
        samples = NoticeSamples.list(this)
    }

    private fun openListenerSettings() {
        // Android 11+ 는 이 앱의 알림 접근 화면으로 바로 간다
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
                .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, ComponentName(this, CardNoticeListener::class.java).flattenToString())
        } else {
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        }
        runCatching { startActivity(intent) }.onFailure { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
    }

    private fun copyMasked() {
        val text = samples.joinToString("\n\n") { NoticeSamples.masked(it) }
        getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("카드 알림", text))
        Toast.makeText(this, "숫자를 가려서 ${samples.size}건을 복사했어요", Toast.LENGTH_SHORT).show()
    }
}
