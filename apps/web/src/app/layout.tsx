import type { Metadata, Viewport } from "next";
import { Shell } from "@/components/Shell";
import { RegisterSW } from "@/components/RegisterSW";
import "./globals.css";


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
  themeColor: "#f2f4f6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preload" href="/fonts/pretendard/pretendard.css" as="style" />
        <link rel="stylesheet" href="/fonts/pretendard/pretendard.css" />
      </head>
      <body>
        <Shell>{children}</Shell>
        <RegisterSW />
      </body>
    </html>
  );
}
