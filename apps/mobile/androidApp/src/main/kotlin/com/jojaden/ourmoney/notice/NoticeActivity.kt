package com.jojaden.ourmoney.notice

import android.Manifest
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
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationManagerCompat

/** 카드 알림 모으기 화면 — 웹(설정)에서 "카드 알림"을 누르면 열린다. 알림 접근, 결제가 할 일과 맞을 때 알릴 권한, 모은 알림 */
class NoticeActivity : ComponentActivity() {
    // 권한은 저장해 두지 않고 화면에 돌아올 때마다 다시 확인한다 (설정에서 언제든 끌 수 있다)
    private var enabled by mutableStateOf(false)
    private var samples by mutableStateOf(emptyList<NoticeSample>())
    private var canNotify by mutableStateOf(true)
    /** 알림 권한을 "다시 묻지 않음"으로 거절했으면 설정 화면으로 보낸다 */
    private var notifyBlocked by mutableStateOf(false)

    // 알림 권한(Android 13+): 확인 → (화면의 설명 글이 이유) → 요청 → 영구 거절이면 다음에 누를 때 설정으로
    private val notifyPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        canNotify = granted
        notifyBlocked = !granted && !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            NoticeScreen(
                enabled = enabled,
                canNotify = canNotify,
                samples = samples,
                onOpenSettings = ::openListenerSettings,
                onAllowNotify = ::allowNotify,
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
        canNotify = MatchNotifier.canNotify(this)
    }

    private fun allowNotify() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !notifyBlocked) {
            notifyPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            // 영구 거절했거나 Android 12 이하에서 꺼 둔 경우: 이 앱의 알림 설정 화면으로
            startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
        }
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
