import { NextRequest, NextResponse } from "next/server";

type TransactionKind = "stay" | "market";
type RefundAccount = {
  bank: string;
  number: string;
  holderName: string;
  holderPhoneNumber?: string;
};

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PORTONE_API_SECRET",
];

function env(name: string) {
  return String(process.env[name] || "").trim();
}

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function assertKind(value: unknown): TransactionKind | null {
  return value === "stay" || value === "market" ? value : null;
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function supabaseRequest(path: string, key: string, options: RequestInit = {}) {
  const response = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL")}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(String(data?.message || data?.error_description || "Supabase request failed."));
  }
  return data;
}

async function userSupabaseRequest(path: string, authorization: string, options: RequestInit = {}) {
  const response = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL")}${path}`, {
    ...options,
    headers: {
      apikey: env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      Authorization: authorization,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(String(data?.message || data?.error_description || "Supabase request failed."));
  }
  return data;
}

async function ensureUser(authorization: string) {
  const response = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/user`, {
    headers: {
      apikey: env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      Authorization: authorization,
    },
    cache: "no-store",
  });
  const data = await readJson(response);
  if (!response.ok || !data?.id) throw new Error("로그인이 만료되었습니다.");
  return data;
}

async function rejectTransaction(kind: TransactionKind, id: string, reason: string, authorization: string) {
  const path = kind === "market"
    ? "/rest/v1/rpc/set_market_order_status"
    : "/rest/v1/rpc/set_reservation_status";
  const body = kind === "market"
    ? { target_order_id: id, new_status: "rejected", reason }
    : { target_reservation_id: id, new_status: "rejected", reason };
  await userSupabaseRequest(path, authorization, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function paymentIntentFor(kind: TransactionKind, id: string) {
  const query = [
    "/rest/v1/payment_intents",
    "?select=order_id,customer_id,kind,amount,status,transaction_id,refund_status,refund_amount,refund_reason",
    `&kind=eq.${encodeURIComponent(kind)}`,
    `&transaction_id=eq.${encodeURIComponent(id)}`,
    "&status=eq.confirmed",
    "&limit=1",
  ].join("");
  const rows = await supabaseRequest(query, env("SUPABASE_SERVICE_ROLE_KEY"));
  return Array.isArray(rows) ? rows[0] : null;
}

async function refundAccountFor(customerId: string): Promise<RefundAccount | null> {
  const query = `/rest/v1/customer_refund_accounts?select=bank,account_number,holder_name,phone&user_id=eq.${encodeURIComponent(customerId)}&limit=1`;
  const rows = await supabaseRequest(query, env("SUPABASE_SERVICE_ROLE_KEY"));
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.bank || !row?.account_number || !row?.holder_name) return null;
  return {
    bank: String(row.bank),
    number: String(row.account_number).replace(/\D/g, ""),
    holderName: String(row.holder_name),
    ...(row.phone ? { holderPhoneNumber: String(row.phone).replace(/\D/g, "") } : {}),
  };
}

function transactionTable(kind: TransactionKind) {
  return kind === "market" ? "market_orders" : "reservations";
}

function paymentStatusFor(refundStatus: string) {
  if (refundStatus === "refunded") return "refunded";
  if (refundStatus === "processing") return "refund_processing";
  if (refundStatus === "failed") return "refund_failed";
  return "refund_required";
}

async function markRefundState(
  kind: TransactionKind,
  id: string,
  orderId: string,
  refundStatus: "processing" | "refunded" | "failed",
  amount: number,
  reason: string,
  responseBody: unknown,
) {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    refund_status: refundStatus,
    refund_amount: amount,
    refund_reason: reason,
    refund_response: responseBody,
    refund_requested_at: now,
  };
  if (refundStatus === "refunded") payload.refunded_at = now;

  await supabaseRequest(`/rest/v1/payment_intents?order_id=eq.${encodeURIComponent(orderId)}`, env("SUPABASE_SERVICE_ROLE_KEY"), {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  await supabaseRequest(`/rest/v1/${transactionTable(kind)}?id=eq.${encodeURIComponent(id)}`, env("SUPABASE_SERVICE_ROLE_KEY"), {
    method: "PATCH",
    body: JSON.stringify({
      ...payload,
      payment_status: paymentStatusFor(refundStatus),
    }),
  });
}

function portoneRefundStatus(data: unknown): "processing" | "refunded" | "failed" {
  const body = data as Record<string, unknown> | null;
  const cancellation = body?.cancellation as Record<string, unknown> | undefined;
  const raw = String(
    cancellation?.status
      || body?.status
      || body?.cancellationStatus
      || "",
  ).toUpperCase();
  if (raw.includes("FAIL")) return "failed";
  if (raw.includes("SUCCEED") || raw.includes("SUCCESS") || raw.includes("COMPLETE") || raw.includes("CANCELLED")) {
    return "refunded";
  }
  return "processing";
}

function portOnePaymentId(orderId: string) {
  return String(orderId || "")
    .replace(/^MOTF-STAY-/, "MS-")
    .replace(/^MOTF-MARKET-/, "MM-")
    .slice(0, 40);
}

async function cancelPortOnePayment(paymentId: string, reason: string, refundAccount: RefundAccount) {
  const payload: Record<string, unknown> = { reason, refundAccount };
  const storeId = env("PORTONE_STORE_ID");
  if (storeId) payload.storeId = storeId;

  const response = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `PortOne ${env("PORTONE_API_SECRET")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = await readJson(response);
  if (!response.ok) {
    const message = String(data?.message || data?.type || "PortOne refund request failed.");
    const error = new Error(message);
    (error as Error & { responseBody?: unknown }).responseBody = data;
    throw error;
  }
  return data;
}

export async function POST(request: NextRequest) {
  const missing = REQUIRED_ENV.filter((name) => !env(name));
  if (missing.length) return json(500, { ok: false, message: `환경변수가 없습니다: ${missing.join(", ")}` });

  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json(401, { ok: false, message: "로그인이 필요합니다." });
    await ensureUser(authorization);

    const body = await request.json().catch(() => null);
    const kind = assertKind(body?.kind);
    const id = String(body?.id || "").trim();
    const reason = String(body?.reason || "사장님/운영팀 예약 거절").trim();
    if (!kind || !id) return json(400, { ok: false, message: "거래 종류와 거래 ID가 필요합니다." });

    await rejectTransaction(kind, id, reason, authorization);

    const intent = await paymentIntentFor(kind, id);
    if (!intent?.order_id) {
      return json(200, {
        ok: true,
        rejected: true,
        refundStatus: "none",
        message: "거절 처리되었습니다. 연결된 확정 결제가 없어 자동 환불 대상은 아닙니다.",
      });
    }

    const amount = Number(intent.refund_amount || intent.amount || 0);
    const refundAccount = await refundAccountFor(String(intent.customer_id || ""));
    if (!refundAccount) {
      await markRefundState(kind, id, intent.order_id, "failed", amount, reason, {
        code: "REFUND_ACCOUNT_REQUIRED",
        message: "이용자 환불계좌가 등록되지 않았습니다.",
      });
      return json(409, {
        ok: false,
        rejected: true,
        refundStatus: "failed",
        message: "거절은 완료됐지만 이용자 환불계좌가 없어 자동 환불을 시작하지 못했습니다. 운영팀이 이용자에게 환불계좌를 확인해주세요.",
      });
    }
    await markRefundState(kind, id, intent.order_id, "processing", amount, reason, { requested: true });

    try {
      const cancelResponse = await cancelPortOnePayment(portOnePaymentId(intent.order_id), reason, refundAccount);
      const refundStatus = portoneRefundStatus(cancelResponse);
      await markRefundState(kind, id, intent.order_id, refundStatus, amount, reason, cancelResponse);
      return json(200, {
        ok: true,
        rejected: true,
        refundStatus,
        message: refundStatus === "refunded" ? "거절 및 전액 환불이 완료되었습니다." : "거절 및 환불 요청이 접수되었습니다.",
      });
    } catch (error) {
      const responseBody = (error as Error & { responseBody?: unknown }).responseBody || { message: (error as Error).message };
      await markRefundState(kind, id, intent.order_id, "failed", amount, reason, responseBody);
      return json(502, {
        ok: false,
        rejected: true,
        refundStatus: "failed",
        message: `거절은 완료됐지만 자동 환불 요청이 실패했습니다: ${(error as Error).message}`,
      });
    }
  } catch (error) {
    return json(400, { ok: false, message: (error as Error).message || "자동 환불 처리에 실패했습니다." });
  }
}
