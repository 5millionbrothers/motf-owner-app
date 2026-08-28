import { NextRequest, NextResponse } from "next/server";

function env(...names: string[]) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { message: text }; }
}

async function requireUser(authorization: string) {
  const baseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const response = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: authorization },
    cache: "no-store",
  });
  const user = await readJson(response);
  if (!response.ok || !user?.id) throw new Error("로그인이 만료되었습니다.");
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request.headers.get("authorization") || "");
    const body = await request.json();
    const address = String(body.address || "").trim().slice(0, 250);
    if (!address) return NextResponse.json({ message: "주소가 필요합니다." }, { status: 400 });

    const keyId = env("NAVER_MAP_KEY_ID", "NAVER_CLOUD_ACCESS_KEY_ID");
    const secret = env("NAVER_MAP_SECRET_KEY", "NAVER_CLOUD_SECRET_KEY");
    if (!keyId || !secret) {
      return NextResponse.json({ message: "서버 주소 확인 키가 설정되지 않았습니다." }, { status: 503 });
    }

    const response = await fetch(`https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(address)}`, {
      headers: {
        "x-ncp-apigw-api-key-id": keyId,
        "x-ncp-apigw-api-key": secret,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const result = await readJson(response);
    const match = result?.addresses?.[0];
    const latitude = Number(match?.y);
    const longitude = Number(match?.x);
    if (!response.ok || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ message: result?.error?.message || "도로명주소의 위치를 찾지 못했습니다." }, { status: 422 });
    }
    return NextResponse.json({
      latitude,
      longitude,
      matchedAddress: match.roadAddress || match.jibunAddress || address,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "주소 위치 확인에 실패했습니다." }, { status: 500 });
  }
}
