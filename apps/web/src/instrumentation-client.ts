import { trackNavigationMotion } from "./lib/navigationMotion";

// Next가 기록 함수를 감싸기 전에 설치한다. React StrictMode의 재설치와 섞이지 않게 앱 수명 동안 유지한다.
trackNavigationMotion();
