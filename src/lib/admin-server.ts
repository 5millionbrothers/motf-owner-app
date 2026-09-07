import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function env(name: string) {
  return String(process.env[name] || "").trim();
}

export function firstEnv(...names: string[]) {
  return names.map(env).find(Boolean) || "";
}

export function serverConfig() {
  return {
    url: firstEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL").replace(/\/$/, ""),
    publicKey: firstEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
    ),
    serviceKey: firstEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_KEY"),
  };
}

export function serviceClient() {
  const config = serverConfig();
  if (!config.url || !config.serviceKey) throw new Error("Supabase 서버 환경변수가 없습니다.");
  return createClient(config.url, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticatedAdmin(authorization: string) {
  const config = serverConfig();
  if (!config.url || !config.publicKey || !config.serviceKey) {
    throw new Error("Supabase 서버 환경변수가 없습니다.");
  }
  if (!authorization.startsWith("Bearer ")) throw new Error("운영자 로그인이 필요합니다.");

  const caller = createClient(config.url, config.publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await caller.auth.getUser(authorization.slice("Bearer ".length));
  if (error || !data.user) throw new Error("로그인이 만료되었습니다.");

  const service = serviceClient();
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id,role,status")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (profile?.role !== "admin" || profile?.status !== "approved") {
    throw new Error("승인된 운영자 권한이 필요합니다.");
  }
  return { user: data.user, profile, service } as {
    user: typeof data.user;
    profile: { id: string; role: string; status: string };
    service: SupabaseClient;
  };
}
