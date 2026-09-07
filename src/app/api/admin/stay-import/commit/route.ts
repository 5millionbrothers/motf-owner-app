import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdmin, env } from "@/lib/admin-server";
import { downloadPublicImage } from "@/lib/safe-site-crawler";
import type { StayImportDraft } from "@/lib/stay-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FACILITY_KEYS = new Set(["barbecue", "karaoke", "field", "pool", "screen", "wifi", "parking", "pickup"]);

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
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
  const rooms = Array.isArray(value.rooms) ? value.rooms.slice(0, 40).map((room) => ({
    name: text(room.name, 100, true)!, description: text(room.description, 2_000), price: number(room.price),
    minPeople: positiveOrNull(room.minPeople), basePeople: positiveOrNull(room.basePeople), maxPeople: positiveOrNull(room.maxPeople),
    extraPersonFee: number(room.extraPersonFee), bathroomCount: number(room.bathroomCount),
    bathroomGenderSeparated: Boolean(room.bathroomGenderSeparated), bathroomNote: text(room.bathroomNote, 160),
    featureSummary: (Array.isArray(room.featureSummary) ? room.featureSummary : []).map((item) => text(item, 80)).filter(Boolean).slice(0, 8) as string[],
  })) : [];
  if (!rooms.length || rooms.some((room) => room.price <= 0)) throw new Error("객실을 한 개 이상 입력하고 모든 객실 가격을 확인해주세요.");
  return {
    sourceUrl: text(value.sourceUrl, 2_000, true)!, businessName: text(value.businessName, 120, true)!,
    representativeName: text(value.representativeName, 80), phone: text(value.phone, 30), postalCode: text(value.postalCode, 10),
    address: text(value.address, 300, true), addressDetail: text(value.addressDetail, 200), region: text(value.region, 80, true),
    shortDescription: text(value.shortDescription, 140, true)!, description: text(value.description, 3_000, true)!,
    facilities: (Array.isArray(value.facilities) ? value.facilities : []).filter((item) => FACILITY_KEYS.has(item.key)).map((item) => ({ key: item.key, detail: text(item.detail, 200) })),
    extraFees: (Array.isArray(value.extraFees) ? value.extraFees : []).slice(0, 20).map((fee) => ({
      label: text(fee.label, 40, true)!, amount: number(fee.amount, true), detail: text(fee.detail, 100),
      category: ["confirmed", "optional", "onsite", "deposit"].includes(fee.category) ? fee.category : "optional",
    })),
    rooms, imageUrls: [...new Set((Array.isArray(value.imageUrls) ? value.imageUrls : []).map((url) => text(url, 2_000)).filter(Boolean))].slice(0, 15) as string[],
    warnings: [], evidence: [],
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
  const uploadedPaths: string[] = [];
  try {
    const { user: admin, service } = await authenticatedAdmin(request.headers.get("authorization") || "");
    const body = await request.json().catch(() => null);
    if (!body?.rightsConfirmed) return json(400, { ok: false, message: "숙소 측이 제공한 공식 정보·사진을 등록할 권한이 있는지 확인해주세요." });
    const jobId = text(body?.jobId, 80, true)!;
    const draft = validateDraft(body?.draft);

    const { data: job, error: jobError } = await service.from("stay_import_jobs").select("id,status,canonical_url").eq("id", jobId).maybeSingle();
    if (jobError || !job) throw new Error("가져오기 작업을 찾지 못했습니다.");
    if (job.status === "committed") return json(409, { ok: false, message: "이미 등록이 끝난 작업입니다." });
    const { data: duplicate } = await service.from("businesses").select("id,business_name").eq("source_url", draft.sourceUrl).limit(1).maybeSingle();
    if (duplicate) return json(409, { ok: false, message: `같은 출처로 등록된 숙소가 있습니다: ${duplicate.business_name}` });

    const account = credentials(draft.businessName);
    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email: account.email, password: account.password, email_confirm: true,
      user_metadata: { account_type: "partner", full_name: draft.representativeName || draft.businessName, imported_by_admin: true },
    });
    if (authError || !authData.user) throw authError || new Error("임시 사장님 계정을 만들지 못했습니다.");
    createdUserId = authData.user.id;
    const { error: profileError } = await service.from("profiles").upsert({
      id: createdUserId, email: account.email, full_name: draft.representativeName || draft.businessName,
      phone: draft.phone, role: "partner", status: "approved", updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (profileError) throw profileError;

    const location = await geocode([draft.address, draft.addressDetail].filter(Boolean).join(" "));
    const amenityDetails = draft.facilities.map((item) => ({ key: item.key, label: item.key, available: true, params: {}, detail: item.detail }));
    const { data: business, error: businessError } = await service.from("businesses").insert({
      owner_id: createdUserId, business_type: "stay", business_name: draft.businessName,
      representative_name: draft.representativeName || "확인 필요", phone: draft.phone,
      address: draft.address, address_detail: draft.addressDetail, postal_code: draft.postalCode,
      region: draft.region, short_description: draft.shortDescription, description: draft.description,
      facilities: draft.facilities.map((item) => item.key), amenity_details: amenityDetails, extra_fees: draft.extraFees,
      latitude: location?.latitude || null, longitude: location?.longitude || null,
      location_verified_at: location ? new Date().toISOString() : null,
      approval_status: "approved", source_url: draft.sourceUrl, import_job_id: jobId, imported_at: new Date().toISOString(),
    }).select("id").single();
    if (businessError || !business) throw businessError || new Error("숙소 기본 정보를 저장하지 못했습니다.");
    createdBusinessId = business.id;

    const storedImageUrls: string[] = [];
    for (const [index, imageUrl] of draft.imageUrls.entries()) {
      try {
        const image = await downloadPublicImage(imageUrl);
        const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[image.contentType] || "jpg";
        const path = `${createdUserId}/${createdBusinessId}/import-${String(index + 1).padStart(2, "0")}.${extension}`;
        const { error } = await service.storage.from("catalog-images").upload(path, image.data, { contentType: image.contentType, cacheControl: "86400", upsert: false });
        if (error) throw error;
        uploadedPaths.push(path);
        storedImageUrls.push(service.storage.from("catalog-images").getPublicUrl(path).data.publicUrl);
      } catch (error) {
        console.warn("stay-import image skipped", imageUrl, error);
      }
    }
    if (storedImageUrls.length) {
      const { error } = await service.from("businesses").update({ cover_image_url: storedImageUrls[0], gallery_image_urls: storedImageUrls }).eq("id", createdBusinessId);
      if (error) throw error;
    }

    const offerings = draft.rooms.map((room, index) => ({
      business_id: createdBusinessId, name: room.name, description: room.description, price: room.price,
      min_people: room.minPeople, base_people: room.basePeople, max_people: room.maxPeople,
      extra_person_fee: room.extraPersonFee, bathroom_count: room.bathroomCount,
      bathroom_gender_separated: room.bathroomGenderSeparated, bathroom_note: room.bathroomNote,
      feature_summary: room.featureSummary, sort_order: index, is_active: true,
      offseason_weekday_price: room.price, offseason_weekend_price: room.price,
      shoulder_weekday_price: room.price, shoulder_weekend_price: room.price,
      peak_weekday_price: room.price, peak_weekend_price: room.price,
    }));
    const { error: offeringError } = await service.from("offerings").insert(offerings);
    if (offeringError) throw offeringError;

    await Promise.allSettled([
      service.rpc("refresh_business_highlights", { target_business_id: createdBusinessId }),
      service.rpc("refresh_business_nearby_distances", { target_business_id: createdBusinessId }),
      service.from("admin_audit_logs").insert({
        admin_id: admin.id, action: "stay_website_import", target_type: "business", target_id: createdBusinessId,
        after_data: { source_url: draft.sourceUrl, room_count: offerings.length, image_count: storedImageUrls.length, import_job_id: jobId },
      }),
    ]);
    const { error: finishError } = await service.from("stay_import_jobs").update({
      status: "committed", draft, business_id: createdBusinessId, account_email: account.email,
      committed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    if (finishError) throw finishError;

    return json(200, {
      ok: true, businessId: createdBusinessId, account: { email: account.email, password: account.password },
      imageCount: storedImageUrls.length,
      warnings: [!location && "주소 좌표는 사장님 화면에서 다시 확인해주세요.", storedImageUrls.length < draft.imageUrls.length && `${draft.imageUrls.length - storedImageUrls.length}개 이미지는 형식·용량·접근 문제로 제외됐습니다.`].filter(Boolean),
      message: "숙소와 임시 사장님 계정을 등록했습니다. 비밀번호는 지금만 표시됩니다.",
    });
  } catch (error) {
    console.error("stay-import commit", error);
    try {
      const { service } = await authenticatedAdmin(request.headers.get("authorization") || "");
      if (uploadedPaths.length) await service.storage.from("catalog-images").remove(uploadedPaths);
      if (createdBusinessId) await service.from("businesses").delete().eq("id", createdBusinessId);
      if (createdUserId) await service.auth.admin.deleteUser(createdUserId);
    } catch (cleanupError) {
      console.error("stay-import cleanup", cleanupError);
    }
    const message = error instanceof Error ? error.message : "숙소를 등록하지 못했습니다.";
    return json(/로그인|권한/.test(message) ? 403 : 500, { ok: false, message });
  }
}
