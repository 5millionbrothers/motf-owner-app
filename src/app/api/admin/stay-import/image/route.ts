import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/admin-server";
import { downloadPublicImage } from "@/lib/safe-site-crawler";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const jobId = String(request.nextUrl.searchParams.get("jobId") || "");
    const index = Number(request.nextUrl.searchParams.get("index"));
    if (!/^[0-9a-f-]{36}$/i.test(jobId) || !Number.isInteger(index) || index < 0 || index >= 300) {
      return new NextResponse("Invalid image reference", { status: 400 });
    }
    const { data: job, error } = await serviceClient().from("stay_import_jobs").select("image_candidates").eq("id", jobId).maybeSingle();
    const candidates = Array.isArray(job?.image_candidates) ? job.image_candidates : [];
    const url = typeof candidates[index] === "string" ? candidates[index] : "";
    if (error || !url) return new NextResponse("Image not found", { status: 404 });
    const image = await downloadPublicImage(url);
    return new NextResponse(image.data, {
      headers: { "Content-Type": image.contentType, "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new NextResponse("Image unavailable", { status: 404 });
  }
}
