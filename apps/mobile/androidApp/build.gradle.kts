// androidApp — 안드로이드 진입점. 카드 결제 알림 읽기·홈 화면 위젯 같은 안드로이드 전용 기능이 여기 들어간다.
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose.compiler)
}

// 출시 서명 — 키는 저장소에 두지 않는다. apps/mobile/keystore.properties(git 무시)가 있으면 assembleRelease 가 그 키로 서명한다.
// 없으면 release APK 는 서명되지 않는다(설치 불가). 만드는 법은 apps/mobile/README.md "출시용 APK".
val releaseKey = providers.fileContents(rootProject.layout.projectDirectory.file("keystore.properties")).asText.orNull
    ?.let { text -> Properties().apply { load(text.reader()) } }

android {
    namespace = "com.jojaden.ourmoney"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.jojaden.ourmoney"
        minSdk = 26
        targetSdk = 36
        versionCode = 6
        versionName = "0.5.0"
        // 웹앱 주소 — 디버그로 개발 서버를 열 때만 -PwebUrl=http://<맥 IP>:3000 (저장소에 IP 를 적지 않는다)
        val webUrl = providers.gradleProperty("webUrl").getOrElse("https://our-money-sage.vercel.app")
        buildConfigField("String", "WEB_URL", "\"$webUrl\"")
    }

    if (releaseKey != null) {
        signingConfigs.create("release") {
            storeFile = file(releaseKey.getProperty("storeFile"))
            storePassword = releaseKey.getProperty("storePassword")
            keyAlias = releaseKey.getProperty("keyAlias")
            keyPassword = releaseKey.getProperty("keyPassword")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (releaseKey != null) signingConfig = signingConfigs.getByName("release")
        }
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(project(":ui"))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
}
