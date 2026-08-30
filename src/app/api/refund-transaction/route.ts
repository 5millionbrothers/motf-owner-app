import { NextRequest, NextResponse } from "next/server";

type TransactionKind = "stay" | "market";

function env(name: string) { return String(process.env[name] || "").trim(); }
function firstEnv(...names: string[]) { return names.map(env).find(Boolean) || ""; }
function json(status: number, body: Record<string, unknown>) { return NextResponse.json(body, { status }); }
function assertKind(value: unknown): TransactionKind | null { return value === "stay" || value === "market" ? value : null; }
function supabaseUrl() { return firstEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL").replace(/\/$/, ""); }
function publicKey() { return firstEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"); }
function serviceKey() { return firstEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"); }

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

async function ensureUser(authorization: string) {
  const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: publicKey(), Authorization: authorization },
    cache: "no-store",
  });
  const data = await readJson(response);
  if (!response.ok || !data?.id) throw new Error("로그인이 만료되었습니다.");
  return data;
}

async function userRpc(path: string, authorization: string, body: Record<string, unknown>) {
  return supabaseRequest(path, publicKey(), {
    method: "POST",
    headers: { Authorization: authorization },
    body: JSON.stringify(body),
  });
}

async function setTransactionStatus(kind: TransactionKind, id: string, status: "rejected" | "cancelled", reason: string, authorization: string) {
  return kind === "market"
    ? userRpc("/rest/v1/rpc/set_market_order_status", authorization, { target_order_id: id, new_status: status, reason })
    : userRpc("/rest/v1/rpc/set_reservation_status", authorization, { target_reservation_id: id, new_status: status, reason });
}

async function ensureTransactionAccess(kind: TransactionKind, id: string, authorization: string) {
  const table = kind === "stay" ? "reservations" : "market_orders";
  const rows = await supabaseRequest(
    `/rest/v1/${table}?select=id,status&id=eq.${encodeURIComponent(id)}&limit=1`,
    publicKey(),
    { headers: { Authorization: authorization } },
  );
  if (!Array.isArray(rows) || !rows.length) throw new Error("이 거래를 처리할 권한이 없습니다.");
  return rows[0];
}

async function ensureAdmin(userId: string) {
  const rows = await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role&limit=1`, serviceKey());
  if (!Array.isArray(rows) || rows[0]?.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

async function writeAudit(userId: string, actionType: string, kind: TransactionKind, id: string, reason: string, details: unknown) {
  try {
    await supabaseRequest("/rest/v1/admin_transaction_actions", serviceKey(), {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ admin_id: userId, action_type: actionType, transaction_kind: kind, transaction_id: id, reason, details }),
    });
  } catch (error) {
    console.warn("transaction audit unavailable", (error as Error).message);
  }
}

async function tossCancel(paymentKey: string, reason: string, amount: number, idempotencyKey: string) {
  const response = await fetch(`https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env("TOSS_SECRET_KEY")}:`).toString("base64")}`,
      "Content-Type": "application/json",
      "TossPayments-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ cancelReason: reason, cancelAmount: amount }),
    cache: "no-store",
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(String(data?.message || "토스 자동 환불 요청에 실패했습니다."));
  return data;
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
    const user = await ensureUser(authorization);
    const body = await request.json().catch(() => null);
    const kind = assertKind(body?.kind);
    const id = String(body?.id || "").trim();
    const action = body?.action === "cancel" ? "cancel" : "reject";
    const requestedStatus = action === "cancel" ? "cancelled" : "rejected";
    const reason = String(body?.reason || (action === "cancel" ? "운영팀 예약 취소" : "사장님/운영팀 요청 거절")).trim().slice(0, 200);
    if (!kind || !id) return json(400, { ok: false, message: "거래 종류와 거래 ID가 필요합니다." });
    const transaction = await ensureTransactionAccess(kind, id, authorization);
    if (action === "cancel") {
      await ensureAdmin(user.id);
      if (transaction.status !== "confirmed") return json(409, { ok: false, message: "확정 상태의 거래만 운영팀에서 취소할 수 있습니다." });
    }

    const rows = await supabaseRequest([
      "/rest/v1/payment_intents?select=id,order_id,customer_id,kind,provider,payment_key,amount,points_used,status,transaction_id",
      `&kind=eq.${encodeURIComponent(kind)}&transaction_id=eq.${encodeURIComponent(id)}&status=eq.confirmed&limit=1`,
    ].join(""), serviceKey());
    const intent = Array.isArray(rows) ? rows[0] : null;

    if (!intent?.payment_key) {
      await setTransactionStatus(kind, id, requestedStatus, reason, authorization);
      await writeAudit(user.id, action, kind, id, reason, { refundStatus: "none", provider: intent?.provider || null });
      return json(200, { ok: true, action, refundStatus: "none", message: `${action === "cancel" ? "취소" : "거절"} 처리되었습니다. 연결된 확정 결제가 없습니다.` });
    }
    if (intent.provider !== "toss") {
      await setTransactionStatus(kind, id, requestedStatus, reason, authorization);
      await writeAudit(user.id, action, kind, id, reason, { refundStatus: "manual", provider: intent.provider });
      return json(409, { ok: false, action, refundStatus: "manual", message: `${action === "cancel" ? "취소" : "거절"}은 완료됐지만 과거 테스트 결제는 운영팀 수동 환불 확인이 필요합니다.` });
    }

    const externalAmount = Number(intent.amount || 0);
    const pointAmount = Number(intent.points_used || 0);
    const result = externalAmount > 0
      ? await tossCancel(intent.payment_key, reason, externalAmount, `motf-${action}-${kind}-${id}`)
      : { status: "POINT_ONLY_REFUND" };

    await supabaseRequest("/rest/v1/rpc/record_toss_refund", serviceKey(), {
      method: "POST",
      body: JSON.stringify({
        target_transaction_kind: kind,
        target_transaction_id: id,
        external_refund_amount: externalAmount,
        points_refund_amount: pointAmount,
        refund_percent: 100,
        refund_reason: reason,
        refund_state: "refunded",
        provider_response: result,
        requested_transaction_status: requestedStatus,
      }),
    });
    await writeAudit(user.id, action, kind, id, reason, { refundStatus: "refunded", externalAmount, pointAmount });

    return json(200, { ok: true, action, refundStatus: "refunded", message: `${action === "cancel" ? "취소" : "거절"} 및 전액 환불이 완료되었습니다.${pointAmount ? ` ${pointAmount.toLocaleString("ko-KR")}P도 복구됩니다.` : ""}` });
  } catch (error) {
    console.error("refund-transaction", error);
    return json(502, { ok: false, message: (error as Error).message || "자동 환불 처리에 실패했습니다." });
  }
}
