// ui — Compose Multiplatform 화면. Android·iOS 가 같은 화면 코드를 쓴다.
plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.android.kmp.library)
    alias(libs.plugins.compose.mp)
    alias(libs.plugins.compose.compiler)
}

val iosEnabled = providers.gradleProperty("ios").isPresent || System.getProperty("os.name").startsWith("Mac")

kotlin {
    android {
        namespace = "com.jojaden.ourmoney.ui"
        compileSdk = 37
        minSdk = 26
        androidResources { enable = true }
    }
    if (iosEnabled) {
        listOf(iosArm64(), iosSimulatorArm64()).forEach {
            it.binaries.framework {
                baseName = "OurMoneyUi"
                isStatic = true
            }
        }
    }

    sourceSets {
        commonMain.dependencies {
            api(project(":core"))
            implementation(libs.compose.runtime)
            implementation(libs.compose.foundation)
            implementation(libs.compose.ui)
            implementation(libs.compose.material3)
            implementation(libs.compose.resources)
            implementation(libs.lifecycle.viewmodel.compose)
        }
    }
}
