# 모바일 빌드용 환경 변수: source apps/mobile/env.sh
# macOS(Homebrew openjdk@21 + ~/Library/Android/sdk)와 WSL(~/.local/share/dev/jdk-21*, ~/Android/Sdk)을 모두 찾는다
if [ -d /opt/homebrew/opt/openjdk@21 ]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
  export ANDROID_HOME="$HOME/Library/Android/sdk"
else
  export JAVA_HOME="$(ls -d "$HOME"/.local/share/dev/jdk-21* | head -1)"
  export ANDROID_HOME="$HOME/Android/Sdk"
fi
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
