import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atoms — 把想法变成可销售的产品",
  description:
    "AI 员工用于验证想法、构建产品并获取客户。几分钟内完成，无需编码。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      style={{ "--font-ibm-plex-sans": '\"IBM Plex Sans\"', "--font-ibm-plex-mono": '\"IBM Plex Mono\"' } as CSSProperties}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
