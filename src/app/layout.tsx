import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "moTF 파트너",
  description: "모티프 숙소·공판장 파트너 관리 서비스",
  icons: {
    icon: [
      { url: "/owner/assets/motf-favicon.svg", type: "image/svg+xml" },
      { url: "/owner/assets/motf-favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/owner/assets/motf-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "moTF 파트너",
    description: "모티프 숙소·공판장 파트너 관리 서비스",
    images: [{ url: "https://motfowner.co.kr/owner/assets/motf-logo-icon.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary",
    images: ["https://motfowner.co.kr/owner/assets/motf-logo-icon.png"],
  },
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
