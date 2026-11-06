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

디버그 APK 는 내 폰에서 개발할 때만 써요. 디버그 앱은 USB 디버깅이 허락된 컴퓨터가 앱 저장소(로그인, 모은 알림)를 읽을 수 있고, 누구나 아는 디버그 키로 서명돼요.

## 출시용 APK (두 사람에게 건넬 것)

1. 출시 키를 한 번 만들어요. **저장소 밖**에 두고, 잃어버리면 같은 앱으로 업데이트할 수 없으니 따로 백업해요.
   ```bash
   keytool -genkeypair -v -keystore ~/keys/our-money-release.jks -alias our-money -keyalg RSA -keysize 4096 -validity 10000
   ```
2. `apps/mobile/keystore.properties` 를 만들어요(git 이 무시해요. 절대 커밋하지 않아요).
   ```properties
   storeFile=/Users/<나>/keys/our-money-release.jks
   storePassword=<키 저장소 비밀번호>
   keyAlias=our-money
   keyPassword=<키 비밀번호>
   ```
3. 만들고 확인해요.
   ```bash
   ./gradlew :androidApp:assembleRelease   # → androidApp/build/outputs/apk/release/androidApp-release.apk
   $ANDROID_HOME/build-tools/37.0.0/apksigner verify --print-certs androidApp/build/outputs/apk/release/androidApp-release.apk
   $ANDROID_HOME/build-tools/37.0.0/aapt2 dump xmltree --file AndroidManifest.xml androidApp/build/outputs/apk/release/androidApp-release.apk | grep -i debuggable
   ```
   서명자가 `CN=Android Debug` 가 아니고, `debuggable` 이 나오지 않으면 건네도 돼요. `keystore.properties` 가 없으면 `androidApp-release-unsigned.apk` 만 나와요(설치할 수 없어요).

디버그 APK 를 깔아 둔 폰은 서명이 달라서 출시용으로 덮어쓸 수 없어요. 처음 한 번은 앱을 지우고 새로 설치해야 해요(웹 데이터는 그대로고, 폰에서 다시 로그인하고 알림 접근·알림 허용을 다시 켜요).

## 버전

Kotlin 2.4.21 · Compose Multiplatform 1.12.2 · AGP 9.5.0 · Gradle 9.8.2 · supabase-kt 3.8.0 · compileSdk 37 · minSdk 26
