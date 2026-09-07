import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdmin, env } from "@/lib/admin-server";
import { downloadPublicImage } from "@/lib/safe-site-crawler";
import type { StayImportDraft } from "@/lib/stay-import";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FACILITY_KEYS = new Set(["barbecue", "karaoke", "field", "pool", "screen", "wifi", "parking", "pickup"]);

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [value.message, value.details, value.hint]
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
    const code = String(value.code ?? "").trim();
    if (parts.length) return `${parts.join(" / ")}${code ? ` (${code})` : ""}`;
  }
  return String(error || "알 수 없는 서버 오류");
}

function text(value: unknown, max: number, required = false) {
  const result = String(value ?? "").trim().slice(0, max);
  if (required && !result) throw new Error("필수 숙소 정보가 비어 있습니다.");
  return result || null;
}

function number(value: unknown, nullable: true): number | null;
function number(value: unknown, nullable?: false): number;
function number(value: unknown, nullable = false): number | null {
  if (value === "" || value == null) return nullable ? null : 0;
  const result = Math.round(Number(value));
  if (!Number.isFinite(result) || result < 0) throw new Error("가격·인원 값은 0 이상의 숫자여야 합니다.");
  return result;
}

function positiveOrNull(value: unknown) {
  const result = number(value, true);
  return result && result > 0 ? result : null;
}

function validateDraft(input: unknown): StayImportDraft {
  const value = (input || {}) as StayImportDraft;
  const rooms = Array.isArray(value.rooms) ? value.rooms.slice(0, 40).map((room, index) => ({
    name: text(room.name, 100) || `객실 ${index + 1}`, description: text(room.description, 2_000), price: number(room.price),
    minPeople: positiveOrNull(room.minPeople), basePeople: positiveOrNull(room.basePeople), maxPeople: positiveOrNull(room.maxPeople),
    extraPersonFee: number(room.extraPersonFee), bathroomCount: number(room.bathroomCount),
    bathroomGenderSeparated: Boolean(room.bathroomGenderSeparated), bathroomNote: text(room.bathroomNote, 160),
    featureSummary: (Array.isArray(room.featureSummary) ? room.featureSummary : []).map((item) => text(item, 80)).filter(Boolean).slice(0, 8) as string[],
    imageUrls: (Array.isArray(room.imageUrls) ? room.imageUrls : []).map((url) => text(url, 2_000)).filter(Boolean).slice(0, 40) as string[],
    offseasonWeekdayPrice: number(room.offseasonWeekdayPrice ?? room.price), offseasonWeekendPrice: number(room.offseasonWeekendPrice ?? room.price),
    shoulderWeekdayPrice: number(room.shoulderWeekdayPrice ?? room.price), shoulderWeekendPrice: number(room.shoulderWeekendPrice ?? room.price),
    peakWeekdayPrice: number(room.peakWeekdayPrice ?? room.price), peakWeekendPrice: number(room.peakWeekendPrice ?? room.price),
  })) : [];
  return {
    sourceUrl: text(value.sourceUrl, 2_000, true)!, businessName: text(value.businessName, 120) || "숙소명 확인 필요",
    representativeName: text(value.representativeName, 80), phone: text(value.phone, 30), postalCode: text(value.postalCode, 10),
    address: text(value.address, 300), addressDetail: text(value.addressDetail, 200), region: text(value.region, 80),
    shortDescription: text(value.shortDescription, 140) || "", description: text(value.description, 3_000) || "",
    facilities: (Array.isArray(value.facilities) ? value.facilities : []).filter((item) => FACILITY_KEYS.has(item.key)).map((item) => ({ key: item.key, detail: text(item.detail, 200) })),
    extraFees: (Array.isArray(value.extraFees) ? value.extraFees : []).slice(0, 20).map((fee) => ({
      label: text(fee.label, 40, true)!, amount: number(fee.amount, true), detail: text(fee.detail, 100),
      category: ["confirmed", "optional", "onsite", "deposit"].includes(fee.category) ? fee.category : "optional",
    })),
    rooms, imageUrls: [...new Set((Array.isArray(value.imageUrls) ? value.imageUrls : []).map((url) => text(url, 2_000)).filter(Boolean))].slice(0, 300) as string[],
    seasonRanges: {
      shoulder: (Array.isArray(value.seasonRanges?.shoulder) ? value.seasonRanges.shoulder : []).filter((range) => /^\d{4}-\d{2}-\d{2}$/.test(range.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(range.endDate)).slice(0, 30),
      peak: (Array.isArray(value.seasonRanges?.peak) ? value.seasonRanges.peak : []).filter((range) => /^\d{4}-\d{2}-\d{2}$/.test(range.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(range.endDate)).slice(0, 30),
    }, warnings: [], evidence: [],
  };
}

function credentials(name: string) {
  const domain = (env("MOTF_IMPORT_ACCOUNT_DOMAIN") || "motf.co.kr").replace(/^@/, "");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "stay";
  const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const password = `M!${randomBytes(12).toString("base64url")}7a`;
  return { email: `import-${slug}-${suffix}@${domain}`, password };
}

async function geocode(address: string) {
  const keyId = env("NAVER_MAP_KEY_ID") || env("NAVER_CLOUD_ACCESS_KEY_ID");
  const secret = env("NAVER_MAP_SECRET_KEY") || env("NAVER_CLOUD_SECRET_KEY");
  if (!keyId || !secret) return null;
  const response = await fetch(`https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(address)}`, {
    headers: { "x-ncp-apigw-api-key-id": keyId, "x-ncp-apigw-api-key": secret, Accept: "application/json" }, cache: "no-store",
  });
  const result = await response.json().catch(() => null);
  const match = result?.addresses?.[0];
  const latitude = Number(match?.y), longitude = Number(match?.x);
  return response.ok && Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

export async function POST(request: NextRequest) {
  let createdUserId: string | null = null;
  let createdBusinessId: string | null = null;
  let activeJobId: string | null = null;
  let stage = "요청 확인";
  const uploadedPaths: string[] = [];
  try {
    stage = "관리자 인증";
    const { user: admin, service } = await authenticatedAdmin(request.headers.get("authorization") || "");
    const body = await request.json().catch(() => null);
    if (!body?.rightsConfirmed) return json(400, { ok: false, message: "숙소 측이 제공한 공식 정보·사진을 등록할 권한이 있는지 확인해주세요." });
    const jobId = text(body?.jobId, 80, true)!;
    activeJobId = jobId;
    const draft = validateDraft(body?.draft);

    stage = "가져오기 작업 조회";
    const { data: job, error: jobError } = await service.from("stay_import_jobs").select("id,status,canonical_url").eq("id", jobId).maybeSingle();
    if (jobError) throw jobError;
    if (!job) throw new Error("가져오기 작업을 찾지 못했습니다.");
    if (job.status === "committed") return json(409, { ok: false, message: "이미 등록이 끝난 작업입니다." });
    const { data: duplicate } = await service.from("businesses").select("id,business_name").eq("source_url", draft.sourceUrl).limit(1).maybeSingle();
    if (duplicate) return json(409, { ok: false, message: `같은 출처로 등록된 숙소가 있습니다: ${duplicate.business_name}` });

    stage = "임시 사장님 계정 생성";
    const account = credentials(draft.businessName);
    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email: account.email, password: account.password, email_confirm: true,
      user_metadata: { account_type: "partner", full_name: draft.representativeName || draft.businessName, imported_by_admin: true },
    });
    if (authError || !authData.user) throw authError || new Error("임시 사장님 계정을 만들지 못했습니다.");
    createdUserId = authData.user.id;
    stage = "사장님 프로필 저장";
    const { error: profileError } = await service.from("profiles").upsert({
      id: createdUserId, email: account.email, full_name: draft.representativeName || draft.businessName,
      phone: draft.phone, role: "partner", status: "pending", updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (profileError) throw profileError;

    stage = "숙소 기본정보 저장";
    const locationAddress = [draft.address, draft.addressDetail].filter(Boolean).join(" ");
    const location = locationAddress ? await geocode(locationAddress).catch(() => null) : null;
    const amenityDetails = draft.facilities.map((item) => ({ key: item.key, label: item.key, available: true, params: {}, detail: item.detail }));
    const { data: business, error: businessError } = await service.from("businesses").insert({
      owner_id: createdUserId, business_type: "stay", business_name: draft.businessName,
      representative_name: draft.representativeName || "확인 필요", phone: draft.phone,
      address: draft.address, address_detail: draft.addressDetail, postal_code: draft.postalCode,
      region: draft.region, short_description: draft.shortDescription, description: draft.description,
      facilities: draft.facilities.map((item) => item.key), amenity_details: amenityDetails, extra_fees: draft.extraFees,
      shoulder_season_ranges: draft.seasonRanges.shoulder.map((range) => ({ start_date: range.startDate, end_date: range.endDate })),
      peak_season_ranges: draft.seasonRanges.peak.map((range) => ({ start_date: range.startDate, end_date: range.endDate })),
      latitude: location?.latitude || null, longitude: location?.longitude || null,
      location_verified_at: location ? new Date().toISOString() : null,
      approval_status: "pending", source_url: draft.sourceUrl, import_job_id: jobId, imported_at: new Date().toISOString(),
    }).select("id").single();
    if (businessError || !business) throw businessError || new Error("숙소 기본 정보를 저장하지 못했습니다.");
    createdBusinessId = business.id;

    stage = "숙소 사진 저장";
    const storedImageUrls: Array<string | null> = new Array(draft.imageUrls.length).fill(null);
    let nextImageIndex = 0;
    const importNextImage = async () => {
      while (nextImageIndex < draft.imageUrls.length) {
        const index = nextImageIndex;
        nextImageIndex += 1;
        const imageUrl = draft.imageUrls[index];
        if (!imageUrl) continue;
      try {
        const image = await downloadPublicImage(imageUrl);
        const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[image.contentType] || "jpg";
        const path = `${createdUserId}/${createdBusinessId}/import-${String(index + 1).padStart(2, "0")}.${extension}`;
        const { error } = await service.storage.from("catalog-images").upload(path, image.data, { contentType: image.contentType, cacheControl: "86400", upsert: false });
        if (error) throw error;
        uploadedPaths.push(path);
        storedImageUrls[index] = service.storage.from("catalog-images").getPublicUrl(path).data.publicUrl;
      } catch (error) {
        console.warn("stay-import image skipped", imageUrl, error);
      }
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, draft.imageUrls.length) }, () => importNextImage()));
    const successfulImageUrls = storedImageUrls.filter((url): url is string => Boolean(url));
    const importedImageMap = new Map(draft.imageUrls.map((sourceUrl, index) => [sourceUrl, storedImageUrls[index]]));
    if (successfulImageUrls.length) {
      const { error } = await service.from("businesses").update({ cover_image_url: successfulImageUrls[0], gallery_image_urls: successfulImageUrls }).eq("id", createdBusinessId);
      if (error) throw error;
    }

    stage = "객실정보 저장";
    const offerings = draft.rooms.map((room, index) => ({
      business_id: createdBusinessId, name: room.name, description: room.description, price: room.price,
      min_people: room.minPeople, base_people: room.basePeople, max_people: room.maxPeople,
      extra_person_fee: room.extraPersonFee, bathroom_count: room.bathroomCount,
      bathroom_gender_separated: room.bathroomGenderSeparated, bathroom_note: room.bathroomNote,
      feature_summary: room.featureSummary, sort_order: index, is_active: false,
      image_urls: room.imageUrls.map((url) => importedImageMap.get(url)).filter((url): url is string => Boolean(url)),
      image_url: room.imageUrls.map((url) => importedImageMap.get(url)).find((url): url is string => Boolean(url)) || null,
      offseason_weekday_price: room.offseasonWeekdayPrice, offseason_weekend_price: room.offseasonWeekendPrice,
      shoulder_weekday_price: room.shoulderWeekdayPrice, shoulder_weekend_price: room.shoulderWeekendPrice,
      peak_weekday_price: room.peakWeekdayPrice, peak_weekend_price: room.peakWeekendPrice,
    }));
    if (offerings.length) {
      const { error: offeringError } = await service.from("offerings").insert(offerings);
      if (offeringError) throw offeringError;
    }

    stage = "가져오기 완료 처리";
    await Promise.allSettled([
      service.rpc("refresh_business_highlights", { target_business_id: createdBusinessId }),
      service.rpc("refresh_business_nearby_distances", { target_business_id: createdBusinessId }),
      service.from("admin_audit_logs").insert({
        admin_id: admin.id, action: "stay_website_import", target_type: "business", target_id: createdBusinessId,
        after_data: { source_url: draft.sourceUrl, room_count: offerings.length, image_count: successfulImageUrls.length, import_job_id: jobId },
      }),
    ]);
    const { error: finishError } = await service.from("stay_import_jobs").update({
      status: "committed", draft, business_id: createdBusinessId, account_email: account.email,
      committed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    if (finishError) throw finishError;

    return json(200, {
      ok: true, businessId: createdBusinessId, account: { email: account.email, password: account.password },
      imageCount: successfulImageUrls.length,
      warnings: [!location && "주소 좌표는 사장님 화면에서 다시 확인해주세요.", successfulImageUrls.length < draft.imageUrls.length && `${draft.imageUrls.length - successfulImageUrls.length}개 이미지는 형식·용량·접근 문제로 제외됐습니다.`].filter(Boolean),
      message: "승인 대기 숙소와 임시 사장님 계정을 등록했습니다. 운영자 입점 승인 전까지 이용자 화면에는 노출되지 않습니다.",
    });
  } catch (error) {
    const detail = errorMessage(error);
    const message = `${stage} 단계 실패: ${detail}`;
    console.error("stay-import commit", { stage, error });
    try {
      const { service } = await authenticatedAdmin(request.headers.get("authorization") || "");
      if (uploadedPaths.length) await service.storage.from("catalog-images").remove(uploadedPaths);
      if (createdBusinessId) await service.from("businesses").delete().eq("id", createdBusinessId);
      if (createdUserId) await service.auth.admin.deleteUser(createdUserId);
      if (activeJobId) {
        await service.from("stay_import_jobs").update({
          status: "failed", error_message: message.slice(0, 2_000), updated_at: new Date().toISOString(),
        }).eq("id", activeJobId);
      }
    } catch (cleanupError) {
      console.error("stay-import cleanup", cleanupError);
    }
    return json(/로그인|권한/.test(message) ? 403 : 500, { ok: false, message });
  }
}
