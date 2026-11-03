// 우리 집 가계부 — 모바일 (Kotlin Multiplatform)
//  core       : 모델·계산·Supabase 데이터 (Android·iOS 공통)
//  ui         : Compose Multiplatform 화면 (Android·iOS 공통)
//  androidApp : 안드로이드 진입점 + 카드 알림·위젯 등 안드로이드 전용 기능
//  iosApp     : (나중에) Xcode 진입점 — macOS 에서 ./gradlew -Pios 로 iOS 타깃을 켠다
rootProject.name = "our-money-mobile"

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

include(":core", ":ui", ":androidApp")
