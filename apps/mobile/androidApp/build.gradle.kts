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
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    buildFeatures { compose = true }
}

dependencies {
    implementation(project(":ui"))
    implementation(libs.androidx.activity.compose)
}
