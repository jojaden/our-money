// core — 모델·계산·Supabase 데이터. Android·iOS 가 같이 쓴다. UI 코드는 넣지 않는다.
plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.android.kmp.library)
    alias(libs.plugins.kotlin.serialization)
}

val iosEnabled = providers.gradleProperty("ios").isPresent || System.getProperty("os.name").startsWith("Mac")

kotlin {
    android {
        namespace = "com.jojaden.ourmoney.core"
        compileSdk = 37
        minSdk = 26
    }
    // 계산 로직 단위 테스트를 리눅스에서 빠르게 돌리기 위한 JVM 타깃
    jvm()
    if (iosEnabled) {
        iosArm64()
        iosSimulatorArm64()
    }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlinx.coroutines.core)
            api(libs.kotlinx.datetime)
            implementation(libs.kotlinx.serialization.json)
            api(libs.supabase.postgrest)
            api(libs.supabase.auth)
            api(libs.supabase.realtime)
        }
        androidMain.dependencies {
            implementation(libs.ktor.client.okhttp)
        }
        jvmMain.dependencies {
            implementation(libs.ktor.client.okhttp)
        }
        if (iosEnabled) {
            iosMain.dependencies {
                implementation(libs.ktor.client.darwin)
            }
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
    }
}
