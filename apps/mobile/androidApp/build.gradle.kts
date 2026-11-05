// androidApp — 안드로이드 진입점. 카드 결제 알림 읽기·홈 화면 위젯 같은 안드로이드 전용 기능이 여기 들어간다.
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose.compiler)
}

android {
    namespace = "com.jojaden.ourmoney"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.jojaden.ourmoney"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "0.2.0"
        // 웹앱 주소 — 디버그로 개발 서버를 열 때만 -PwebUrl=http://<맥 IP>:3000 (저장소에 IP 를 적지 않는다)
        val webUrl = providers.gradleProperty("webUrl").getOrElse("https://our-money-sage.vercel.app")
        buildConfigField("String", "WEB_URL", "\"$webUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
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
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
}
