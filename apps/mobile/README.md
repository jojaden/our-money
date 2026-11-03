# 우리 집 가계부 — 모바일 (Kotlin Multiplatform)

안드로이드 앱이고, 나중에 iOS 를 붙일 수 있게 공통 코드와 플랫폼 코드를 나눴어요.
데이터는 웹과 같은 Supabase(`../../supabase/schema.sql`)를 써요.

```
apps/mobile/
├─ core/        모델·계산(이체·카드값·정산·이어받기)·Supabase 데이터  ← Android·iOS 공통
├─ ui/          Compose Multiplatform 화면·디자인                        ← Android·iOS 공통
├─ androidApp/  안드로이드 진입점 + 카드 결제 알림 자동 기록·위젯·알림  ← 안드로이드 전용
└─ iosApp/      (나중에) Xcode 진입점 + WidgetKit                        ← iOS 전용
```

- 계산 규칙은 웹 `apps/web/src/lib/calc.ts` 와 같아요. `core/src/commonTest` 테스트로 맞는지 확인해요.
- iOS 타깃은 macOS 에서만 켜져요 (`-Pios` 또는 Mac 에서 자동).

## 빌드 (WSL)

```bash
source env.sh                          # JDK 21, Android SDK 경로
./gradlew :core:jvmTest                # 계산 로직 테스트
./gradlew :androidApp:assembleDebug    # 디버그 APK → androidApp/build/outputs/apk/debug/
```

필요한 것: JDK 21 (`~/.local/share/dev/jdk-21*`), Android SDK (`~/Android/Sdk`, platform 37·build-tools 37), `local.properties` 의 `sdk.dir`.

## 버전

Kotlin 2.4.21 · Compose Multiplatform 1.12.2 · AGP 9.5.0 · Gradle 9.8.2 · supabase-kt 3.8.0 · compileSdk 37 · minSdk 26
