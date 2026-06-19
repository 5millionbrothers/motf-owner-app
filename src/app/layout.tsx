import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "moTF 파트너",
  description: "모티프 숙소·공판장 파트너 관리 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
