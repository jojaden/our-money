// 앱 아이콘 생성: node scripts/icons.mjs [F1|F2|F3]
// 기본 F1안 — 한 지붕 아래 현빈(살구)·예진(분홍)의 동전이 겹치고, 겹친 곳(흰색)이 둘이 함께 관리하는 돈.
// 후보와 그리는 코드는 scripts/icon-designs.mjs, 비교 화면은 scripts/icon-options.mjs
import sharp from "sharp";
import { iconSvg } from "./icon-designs.mjs";

const key = process.argv[2] ?? "F1";
const out = [
  // 안드로이드·브라우저 아이콘: 타일 전체를 채운다 (런처가 모양을 깎는다)
  ["public/icon-512.png", 512, { rounded: false, scale: 1.06 }],
  ["public/icon-192.png", 192, { rounded: false, scale: 1.06 }],
  // maskable: 원형으로 잘려도 그림이 안전 영역(80%) 안에 들어오게
  ["public/icon-maskable-512.png", 512, { rounded: false, scale: 0.86 }],
  ["public/apple-touch-icon.png", 180, { rounded: false, scale: 1.06 }],
  // 앱 안 로고용 (둥근 타일)
  ["public/mark.png", 128, { rounded: true, scale: 1.06 }],
];
for (const [file, size, opts] of out) {
  await sharp(Buffer.from(iconSvg(key, opts))).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}
