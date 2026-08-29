import { NextRequest, NextResponse } from "next/server";

function env(name: string) {
  return String(process.env[name] || "").trim();
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { message: text }; }
}

async function authenticatedUser(authorization: string) {
  const response = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), Authorization: authorization },
    cache: "no-store",
  });
  const body = await readJson(response);
  if (!response.ok || !body?.id) throw new Error("로그인이 만료되었습니다.");
  return body;
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const user = await authenticatedUser(authorization);
    const body = await request.json();
    const businessNumber = String(body.businessNumber || "").replace(/\D/g, "");
    const startDate = String(body.startDate || "").replace(/\D/g, "");
    const representativeName = String(body.representativeName || "").trim();
    const businessId = String(body.businessId || "");
    if (businessNumber.length !== 10 || startDate.length !== 8 || !representativeName || !businessId) return NextResponse.json({ message: "사업자번호·개업일자·대표자명을 모두 입력해주세요." }, { status: 400 });
    if (!env("DATA_GO_KR_SERVICE_KEY")) return NextResponse.json({ message: "공공데이터포털 서비스키가 설정되지 않았습니다." }, { status: 503 });
    if (!env("SUPABASE_SERVICE_ROLE_KEY")) return NextResponse.json({ message: "사업자 인증 서버 권한이 설정되지 않았습니다." }, { status: 503 });

    // Authorize with the caller's token so the existing businesses RLS policy is
    // the single source of truth for both partners and administrators.
    const ownerCheck = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/businesses?id=eq.${encodeURIComponent(businessId)}&select=id,owner_id&limit=1`, {
      headers: { apikey: env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), Authorization: authorization },
      cache: "no-store",
    });
    const ownerRows = await readJson(ownerCheck);
    if (!ownerCheck.ok) return NextResponse.json({ message: ownerRows?.message || "업장 권한을 확인하지 못했습니다." }, { status: 502 });
    if (!Array.isArray(ownerRows) || !ownerRows.length) return NextResponse.json({ message: "이 업장을 확인할 권한이 없습니다." }, { status: 403 });
    if (ownerRows[0].owner_id !== user.id) {
      const profileCheck = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,status&limit=1`, {
        headers: { apikey: env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), Authorization: authorization },
        cache: "no-store",
      });
      const profileRows = await readJson(profileCheck);
      if (!profileCheck.ok || profileRows?.[0]?.role !== "admin" || profileRows?.[0]?.status !== "approved") {
        return NextResponse.json({ message: "이 업장을 확인할 권한이 없습니다." }, { status: 403 });
      }
    }

    const statusResponse = await fetch(`https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(env("DATA_GO_KR_SERVICE_KEY"))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ b_no: [businessNumber] }),
      cache: "no-store",
    });
    const statusBody = await readJson(statusResponse);
    const result = statusBody?.data?.[0];
    if (!statusResponse.ok || !result) return NextResponse.json({ message: statusBody?.message || "국세청 사업자 상태를 확인하지 못했습니다." }, { status: 502 });
    if (String(result.b_stt_cd) !== "01") return NextResponse.json({ message: result.b_stt || "현재 계속사업 상태가 아닙니다." }, { status: 409 });

    const validationResponse = await fetch(`https://api.odcloud.kr/api/nts-businessman/v1/validate?serviceKey=${encodeURIComponent(env("DATA_GO_KR_SERVICE_KEY"))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businesses: [{ b_no: businessNumber, start_dt: startDate, p_nm: representativeName, p_nm2: "", b_nm: "", corp_no: "", b_sector: "", b_type: "", b_adr: "" }] }),
      cache: "no-store",
    });
    const validationBody = await readJson(validationResponse);
    const validation = validationBody?.data?.[0];
    if (!validationResponse.ok || !validation) return NextResponse.json({ message: "국세청 진위확인 응답을 받지 못했습니다." }, { status: 502 });
    if (String(validation.valid) !== "01") return NextResponse.json({ message: validation.valid_msg || "대표자명 또는 개업일자가 국세청 등록정보와 일치하지 않습니다." }, { status: 409 });

    const updateResponse = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/businesses?id=eq.${encodeURIComponent(businessId)}`, {
      method: "PATCH",
      headers: {
        apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
        Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        business_number: businessNumber,
        business_start_date: `${startDate.slice(0, 4)}-${startDate.slice(4, 6)}-${startDate.slice(6, 8)}`,
        representative_name: representativeName,
        business_number_verification_status: "verified",
        business_number_status_checked_at: new Date().toISOString(),
        business_number_verified_at: new Date().toISOString(),
      }),
      cache: "no-store",
    });
    const updateBody = await readJson(updateResponse);
    if (!updateResponse.ok) return NextResponse.json({ message: updateBody?.message || "확인 결과를 업장 정보에 저장하지 못했습니다." }, { status: 502 });
    return NextResponse.json({ ok: true, status: result.b_stt, taxType: result.tax_type, verified: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "사업자 상태 확인에 실패했습니다." }, { status: 500 });
  }
}
