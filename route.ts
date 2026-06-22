import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { naverMapKeyId: process.env.NAVER_MAP_KEY_ID ?? "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
