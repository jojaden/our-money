import type { Metadata, Viewport } from "next";
import { Shell } from "@/components/Shell";
import { RegisterSW } from "@/components/RegisterSW";
import "./tokens.css";
import "./globals.css";
import "./controls.css";
import "./cards.css";
import "./moments.css";
import "./wallet.css";
import "./shell.css";


export const metadata: Metadata = {
  title: "우리 집 가계부",
  description: "두 사람의 월급 배분, 이체 체크, 카드·현금 지출 기록",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "우리 집", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

// 첫 그림 전에 테마를 고른다 (흰 화면이 번쩍이지 않게). lib/theme.ts 와 같은 키·규칙, #17171c 는 tokens.json ground 의 dark 값
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("our-money-theme");if(t!=="dark"&&t!=="system")t="light";document.documentElement.dataset.theme=t;if(t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches)){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","#17171c")}}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme 은 THEME_SCRIPT 가 그리기 전에 붙인다 (미리 그린 HTML 과 달라도 괜찮다)
    <html lang="ko" data-theme="light" suppressHydrationWarning>
      <head>
        {/* 상태 막대 색. Next 가 관리하지 않게 직접 두고, 셸이 페이지마다 바꾼다 (홈은 따뜻한 띠) */}
        <meta name="theme-color" content="#f3f3f1" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preload" href="/fonts/pretendard/pretendard.css" as="style" />
        <link rel="preload" href="/fonts/alan-sans/alan-sans.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="stylesheet" href="/fonts/pretendard/pretendard.css" />
      </head>
      <body>
        <Shell>{children}</Shell>
        <RegisterSW />
      </body>
    </html>
  );
}
