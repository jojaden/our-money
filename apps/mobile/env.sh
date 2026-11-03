# 모바일 빌드용 환경 변수 (WSL): source apps/mobile/env.sh
export JAVA_HOME="$(ls -d "$HOME"/.local/share/dev/jdk-21* | head -1)"
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
