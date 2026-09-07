import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdmin } from "@/lib/admin-server";
import { crawlStaySite } from "@/lib/safe-site-crawler";
import { siteHash, structureStaySite } from "@/lib/stay-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: NextRequest) {
  try {
    const { user, service } = await authenticatedAdmin(request.headers.get("authorization") || "");
    const body = await request.json().catch(() => null);
    const sourceUrl = String(body?.sourceUrl || "").trim().slice(0, 2_000);
    if (!sourceUrl) return json(400, { ok: false, message: "숙소 웹사이트 주소를 입력해주세요." });

    const site = await crawlStaySite(sourceUrl);
    const hash = siteHash(site);
    const { data: cached } = await service
      .from("stay_import_jobs")
      .select("id,draft,crawled_pages,updated_at")
      .eq("source_hash", hash)
      .in("status", ["analyzed", "committed"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached?.draft && body?.force !== true) {
      return json(200, {
        ok: true, cached: true, jobId: cached.id, draft: cached.draft,
        crawledPages: cached.crawled_pages || site.pages.map((page) => page.url),
        message: "같은 웹사이트의 저장된 분석 결과를 불러왔습니다. AI 비용이 추가되지 않았습니다.",
      });
    }

    const draft = await structureStaySite(site);
    const { data: job, error } = await service.from("stay_import_jobs").insert({
      source_url: sourceUrl,
      canonical_url: site.canonicalUrl,
      source_hash: hash,
      status: "analyzed",
      draft,
      crawled_pages: site.pages.map((page) => page.url),
      image_candidates: site.imageUrls,
      warnings: draft.warnings,
      created_by: user.id,
    }).select("id").single();
    if (error) throw new Error(`가져오기 이력을 저장하지 못했습니다. DB 66번 파일 적용 여부를 확인해주세요: ${error.message}`);

    return json(200, {
      ok: true, cached: false, jobId: job.id, draft,
      crawledPages: site.pages.map((page) => page.url),
      message: `${site.pages.length}개 페이지를 읽어 등록 초안을 만들었습니다.`,
    });
  } catch (error) {
    console.error("stay-import analyze", error);
    const message = error instanceof Error ? error.message : "숙소 웹사이트를 분석하지 못했습니다.";
    const status = /로그인|권한/.test(message) ? 403 : /입력|웹사이트|주소|HTML|내부 네트워크/.test(message) ? 400 : 502;
    return json(status, { ok: false, message });
  }
}
