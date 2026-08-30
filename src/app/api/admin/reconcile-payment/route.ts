import { NextRequest, NextResponse } from "next/server";

function env(name: string) { return String(process.env[name] || "").trim(); }
function firstEnv(...names: string[]) { return names.map(env).find(Boolean) || ""; }
function supabaseUrl() { return firstEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL").replace(/\/$/, ""); }
function publicKey() { return firstEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"); }
function serviceKey() { return firstEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"); }
function json(status: number, body: Record<string, unknown>) { return NextResponse.json(body, { status }); }

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { message: text }; }
}

async function supabaseRequest(path: string, key: string, options: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl()}${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(options.headers || {}) },
    cache: "no-store",
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(String(data?.message || data?.error_description || "Supabase request failed."));
  return data;
}

async function authenticatedAdmin(authorization: string) {
  const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: publicKey(), Authorization: authorization },
    cache: "no-store",
  });
  const user = await readJson(response);
  if (!response.ok || !user?.id) throw new Error("로그인이 만료되었습니다.");
  const profiles = await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`, serviceKey());
  if (!Array.isArray(profiles) || profiles[0]?.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  return user;
}

async function tossPaymentByOrderId(orderId: string) {
  const response = await fetch(`https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${env("TOSS_SECRET_KEY")}:`).toString("base64")}` },
    cache: "no-store",
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(String(data?.message || "토스 결제 내역을 조회하지 못했습니다."));
  return data;
}

async function writeAudit(adminId: string, intent: Record<string, unknown>, details: unknown) {
  try {
    await supabaseRequest("/rest/v1/admin_transaction_actions", serviceKey(), {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        admin_id: adminId,
        action_type: "reconcile_payment",
        transaction_kind: intent.kind,
        transaction_id: intent.transaction_id || null,
        order_id: intent.order_id,
        reason: "운영팀 결제·예약 복구",
        details,
      }),
    });
  } catch (error) {
    console.warn("transaction audit unavailable", (error as Error).message);
  }
}

export async function POST(request: NextRequest) {
  const missing = [
    !supabaseUrl() && "Supabase URL",
    !publicKey() && "Supabase Publishable Key",
    !serviceKey() && "Supabase Service Role 또는 Secret Key",
    !env("TOSS_SECRET_KEY") && "Toss Secret Key",
  ].filter(Boolean);
  if (missing.length) return json(503, { ok: false, message: `환경변수가 없습니다: ${missing.join(", ")}` });

  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json(401, { ok: false, message: "로그인이 필요합니다." });
    const admin = await authenticatedAdmin(authorization);
    const body = await request.json().catch(() => null);
    const orderId = String(body?.orderId || "").trim();
    if (!/^[A-Za-z0-9_=-]{6,64}$/.test(orderId)) return json(400, { ok: false, message: "토스 주문번호 형식을 확인해주세요." });

    const intents = await supabaseRequest(
      `/rest/v1/payment_intents?order_id=eq.${encodeURIComponent(orderId)}&select=id,order_id,customer_id,kind,amount,status,provider,payment_key,transaction_id,expires_at&limit=1`,
      serviceKey(),
    );
    const intent = Array.isArray(intents) ? intents[0] : null;
    if (!intent) return json(404, { ok: false, message: "우리 결제 원장에서 해당 주문번호를 찾지 못했습니다." });
    if (intent.provider !== "toss") return json(409, { ok: false, message: "토스 결제 주문만 자동 복구할 수 있습니다." });
    if (intent.status === "confirmed" && intent.transaction_id) {
      return json(200, { ok: true, alreadyRecovered: true, transactionId: intent.transaction_id, message: "이미 정상적으로 예약·주문이 생성된 결제입니다." });
    }

    const tossPayment = await tossPaymentByOrderId(orderId);
    if (tossPayment?.orderId !== orderId || Number(tossPayment?.totalAmount) !== Number(intent.amount)) {
      return json(409, { ok: false, message: "토스 결제 금액과 우리 결제 원장이 일치하지 않습니다. 자동 복구를 중단했습니다." });
    }
    if (tossPayment?.status !== "DONE") {
      return json(409, { ok: false, providerStatus: tossPayment?.status || "UNKNOWN", message: `토스 결제 상태가 ${tossPayment?.status || "확인 불가"}입니다. 결제 완료 건만 복구할 수 있습니다.` });
    }

    const result = await supabaseRequest("/rest/v1/rpc/finalize_toss_payment_intent", serviceKey(), {
      method: "POST",
      body: JSON.stringify({
        target_customer_id: intent.customer_id,
        target_order_id: orderId,
        target_payment_key: tossPayment.paymentKey,
        toss_payment: tossPayment,
      }),
    });
    const transaction = Array.isArray(result) ? result[0] : result;
    if (!transaction?.transaction_id) throw new Error("결제는 확인됐지만 예약·주문 생성 결과를 받지 못했습니다.");
    await writeAudit(admin.id, { ...intent, transaction_id: transaction.transaction_id }, { providerStatus: tossPayment.status });
    return json(200, {
      ok: true,
      transactionId: transaction.transaction_id,
      kind: transaction.kind,
      message: transaction.kind === "stay" ? "결제를 확인하고 누락된 예약을 복구했습니다." : "결제를 확인하고 누락된 주문을 복구했습니다.",
    });
  } catch (error) {
    console.error("reconcile-payment", error);
    return json(502, { ok: false, message: (error as Error).message || "결제·예약 복구에 실패했습니다." });
  }
}
