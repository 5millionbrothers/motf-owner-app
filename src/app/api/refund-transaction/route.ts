import { NextRequest, NextResponse } from "next/server";

type TransactionKind = "stay" | "market";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TOSS_SECRET_KEY",
];

function env(name: string) { return String(process.env[name] || "").trim(); }
function json(status: number, body: Record<string, unknown>) { return NextResponse.json(body, { status }); }
function assertKind(value: unknown): TransactionKind | null { return value === "stay" || value === "market" ? value : null; }

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { message: text }; }
}

async function supabaseRequest(path: string, key: string, options: RequestInit = {}) {
  const response = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL")}${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(options.headers || {}) },
    cache: "no-store",
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(String(data?.message || data?.error_description || "Supabase request failed."));
  return data;
}

async function ensureUser(authorization: string) {
  const response = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), Authorization: authorization },
    cache: "no-store",
  });
  const data = await readJson(response);
  if (!response.ok || !data?.id) throw new Error("로그인이 만료되었습니다.");
  return data;
}

async function userRpc(path: string, authorization: string, body: Record<string, unknown>) {
  return supabaseRequest(path, env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    method: "POST",
    headers: { Authorization: authorization },
    body: JSON.stringify(body),
  });
}

async function rejectTransaction(kind: TransactionKind, id: string, reason: string, authorization: string) {
  return kind === "market"
    ? userRpc("/rest/v1/rpc/set_market_order_status", authorization, { target_order_id: id, new_status: "rejected", reason })
    : userRpc("/rest/v1/rpc/set_reservation_status", authorization, { target_reservation_id: id, new_status: "rejected", reason });
}

async function ensureTransactionAccess(kind: TransactionKind, id: string, authorization: string) {
  const table = kind === "stay" ? "reservations" : "market_orders";
  const rows = await supabaseRequest(
    `/rest/v1/${table}?select=id,status&id=eq.${encodeURIComponent(id)}&limit=1`,
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { headers: { Authorization: authorization } },
  );
  if (!Array.isArray(rows) || !rows.length) throw new Error("이 거래를 처리할 권한이 없습니다.");
  return rows[0];
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
  const missing = REQUIRED_ENV.filter((name) => !env(name));
  if (missing.length) return json(503, { ok: false, message: `환경변수가 없습니다: ${missing.join(", ")}` });
  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json(401, { ok: false, message: "로그인이 필요합니다." });
    await ensureUser(authorization);
    const body = await request.json().catch(() => null);
    const kind = assertKind(body?.kind);
    const id = String(body?.id || "").trim();
    const reason = String(body?.reason || "사장님/운영팀 요청 거절").trim().slice(0, 200);
    if (!kind || !id) return json(400, { ok: false, message: "거래 종류와 거래 ID가 필요합니다." });
    await ensureTransactionAccess(kind, id, authorization);

    const rows = await supabaseRequest([
      "/rest/v1/payment_intents?select=id,order_id,customer_id,kind,provider,payment_key,amount,points_used,status,transaction_id",
      `&kind=eq.${encodeURIComponent(kind)}&transaction_id=eq.${encodeURIComponent(id)}&status=eq.confirmed&limit=1`,
    ].join(""), env("SUPABASE_SERVICE_ROLE_KEY"));
    const intent = Array.isArray(rows) ? rows[0] : null;

    if (!intent?.payment_key) {
      await rejectTransaction(kind, id, reason, authorization);
      return json(200, { ok: true, rejected: true, refundStatus: "none", message: "거절 처리되었습니다. 연결된 확정 결제가 없습니다." });
    }
    if (intent.provider !== "toss") {
      await rejectTransaction(kind, id, reason, authorization);
      return json(409, { ok: false, rejected: true, refundStatus: "manual", message: "거절은 완료됐지만 과거 테스트 결제는 운영팀 수동 확인이 필요합니다." });
    }

    const externalAmount = Number(intent.amount || 0);
    const pointAmount = Number(intent.points_used || 0);
    const result = externalAmount > 0
      ? await tossCancel(intent.payment_key, reason, externalAmount, `motf-reject-${kind}-${id}`)
      : { status: "POINT_ONLY_REFUND" };

    await supabaseRequest("/rest/v1/rpc/record_toss_refund", env("SUPABASE_SERVICE_ROLE_KEY"), {
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
        requested_transaction_status: "rejected",
      }),
    });

    return json(200, { ok: true, rejected: true, refundStatus: "refunded", message: `거절 및 전액 환불이 완료되었습니다.${pointAmount ? ` ${pointAmount.toLocaleString("ko-KR")}P도 복구됩니다.` : ""}` });
  } catch (error) {
    console.error("refund-transaction", error);
    return json(502, { ok: false, message: (error as Error).message || "자동 환불 처리에 실패했습니다." });
  }
}
