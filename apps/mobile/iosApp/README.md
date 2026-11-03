# iosApp (나중에)

iOS 앱 진입점이 들어갈 자리예요. iOS 빌드에는 **macOS + Xcode** 가 필요해요.

1. Mac 에서 `apps/mobile` 을 열고 `./gradlew -Pios :ui:linkDebugFrameworkIosSimulatorArm64` 로 공통 화면 프레임워크(`OurMoneyUi`)를 만든다.
2. Xcode 로 iOS App 프로젝트를 이 폴더에 만들고, `MainViewController()`(Compose 화면)를 SwiftUI 에 붙인다.
3. iOS 전용 기능은 여기서 Swift 로: 홈 화면 위젯(WidgetKit), 알림.

공통 코드(`core`, `ui`)는 그대로 쓴다. 카드사 앱 알림 읽기는 iOS 정책상 불가능해서 iOS 에서는 단축어 자동화 등 다른 방법을 쓴다.
