import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function env(name: string) {
  return String(process.env[name] || "").trim();
}

function response(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

async function findUserByEmail(
  service: SupabaseClient,
  email: string,
) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function ensureTestUser(
  service: SupabaseClient,
  spec: { email: string; name: string; index: number },
  password: string,
) {
  const metadata = {
    account_type: "user",
    full_name: spec.name,
    internal_test: true,
  };
  let user: User | null = null;
  const existing = await findUserByEmail(service, spec.email);
  if (existing) {
    const { data, error } = await service.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(existing.user_metadata || {}), ...metadata },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await service.auth.admin.createUser({
      email: spec.email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw error;
    user = data.user;
  }

  if (!user) throw new Error(`${spec.email} 계정을 생성하지 못했습니다.`);
  const now = new Date().toISOString();
  const { error: profileError } = await service.from("profiles").upsert({
    id: user.id,
    email: spec.email,
    full_name: spec.name,
    phone: null,
    role: "user",
    status: "approved",
    organization: "moTF 내부 테스트",
    birth_date: "2000-01-01",
    identity_provider: "internal_test",
    identity_ci_hash: `internal-test:${user.id}`,
    identity_verified_at: now,
    adult_verified_at: now,
    password_set_at: now,
    profile_completed_at: now,
    is_test_account: true,
    updated_at: now,
  }, { onConflict: "id" });
  if (profileError) throw profileError;

  const { error: pointError } = await service.from("point_accounts").upsert({
    user_id: user.id,
  }, { onConflict: "user_id", ignoreDuplicates: true });
  if (pointError) throw pointError;

  return { email: spec.email, password, name: spec.name, userId: user.id };
}

export async function POST(request: NextRequest) {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishableKey || !serviceRoleKey) {
    return response(503, { ok: false, message: "Supabase 서버 환경변수가 설정되지 않았습니다." });
  }

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return response(401, { ok: false, message: "운영자 로그인이 필요합니다." });
  }

  try {
    const token = authorization.slice("Bearer ".length);
    const callerClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: caller, error: callerError } = await callerClient.auth.getUser(token);
    if (callerError || !caller.user) return response(401, { ok: false, message: "로그인이 만료되었습니다." });

    const service = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("role,status")
      .eq("id", caller.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "admin" || profile?.status !== "approved") {
      return response(403, { ok: false, message: "승인된 운영자만 테스트 계정을 만들 수 있습니다." });
    }

    const password = `Mtf!${randomBytes(4).toString("hex")}`;
    const specs = Array.from({ length: 5 }, (_, offset) => {
      const index = offset + 1;
      const suffix = String(index).padStart(2, "0");
      return { index, email: `motf-test${suffix}@motf.co.kr`, name: `모티프 테스트${suffix}` };
    });
    const accounts = [];
    for (const spec of specs) accounts.push(await ensureTestUser(service, spec, password));

    return response(200, {
      ok: true,
      accounts,
      message: "테스트 이용자 5개를 생성하거나 같은 비밀번호로 초기화했습니다.",
    });
  } catch (error) {
    console.error("create-test-users", error);
    return response(500, {
      ok: false,
      message: error instanceof Error ? error.message : "테스트 계정을 만들지 못했습니다.",
    });
  }
}
