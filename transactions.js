(function connectUserTransactions() {
  const client = window.motfSupabase;
  if (!client) {
    console.error("예약 연결에 필요한 로그인 설정을 불러오지 못했습니다.");
    return;
  }
  const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
  const statusText = {
    pending: "결제 완료·승인 대기",
    confirmed: "확정",
    rejected: "거절",
    cancelled: "취소",
    completed: "이용 완료",
  };
  const refundText = {
    required: "거절·환불 예정",
    processing: "환불 처리 중",
    refunded: "환불 완료",
    failed: "환불 확인 필요",
  };
  function displayStatus(item) {
    if (item.refund_status && item.refund_status !== "none") return refundText[item.refund_status] || statusText[item.status] || item.status;
    return statusText[item.status] || item.status;
  }
  function isFutureDate(value) {
    if (!value) return true;
    const time = new Date(value).getTime();
    return Number.isNaN(time) || time > Date.now();
  }
  function pendingAccountExpiresAt(item = {}) {
    const account = item.virtual_account || item.virtualAccount || {};
    return item.expires_at || account.dueDate || account.due_date || account.expiredAt || account.expired_at || account.expiresAt || account.expires_at || account.expiry?.dueDate || account.expiry?.due_date || account.accountExpiry?.dueDate || account.accountExpiry?.due_date || "";
  }
  function bankLabel(value = "") {
    const code = String(value || "").trim();
    const upper = code.toUpperCase();
    const labels = {
      WOORI: "우리은행",
      IBK: "IBK기업은행",
      KB: "KB국민은행",
      KOOKMIN: "KB국민은행",
      SHINHAN: "신한은행",
      HANA: "하나은행",
      NH: "NH농협은행",
      NONGHYUP: "NH농협은행",
      KAKAOBANK: "카카오뱅크",
      K_BANK: "케이뱅크",
      TOSS_BANK: "토스뱅크",
      SC: "SC제일은행",
      CITI: "씨티은행",
      DAEGU: "대구은행",
      BUSAN: "부산은행",
      GWANGJU: "광주은행",
      JEONBUK: "전북은행",
      KYONGNAM: "경남은행",
      SAEMAUL: "새마을금고",
      SHINHYUP: "신협",
      SUHYUP: "수협은행",
      POST: "우체국",
    };
    return labels[upper] || code.replace(/_/g, " ");
  }
  function accountLabel(account = {}) {
    const bank = bankLabel(account.bankName || account.bank || account.bankCode);
    const number = String(account.accountNumber || account.account_number || "").replace(/\s+/g, "");
    const holder = account.holderName || account.accountHolder || account.customerName || "";
    return [bank, number].filter(Boolean).join(" ") + (holder ? ` (예금주 ${holder})` : "");
  }

  async function loadMyTransactions() {
    const { data: authData } = await client.auth.getSession();
    const userId = authData.session?.user?.id;
    if (!userId) {
      window.motfApplyMyTransactions?.([], []);
      return;
    }
    const [reservationResult, orderResult, intentResult, pointResult] = await Promise.all([
      client.from("reservations")
        .select("id, business_id, event_date, check_out_date, guest_count, offering_name, total_amount, original_amount, customer_paid_amount, points_used, coupon_discount, base_accommodation_amount, status, refund_status, refund_amount, businesses(business_name)")
        .eq("customer_id", userId)
        .order("created_at", { ascending: false }),
      client.from("market_orders")
        .select("id, business_id, pickup_time, total_amount, original_amount, customer_paid_amount, points_used, coupon_discount, status, refund_status, refund_amount, businesses(business_name), market_order_items(id)")
        .eq("customer_id", userId)
        .order("created_at", { ascending: false }),
      client.from("payment_intents")
        .select("order_id, kind, amount, original_amount, points_used, coupon_discount, order_name, status, payment_method, virtual_account, virtual_account_issued_at, created_at, expires_at, extra_charge_request_id")
        .eq("customer_id", userId)
        .in("status", ["virtual_account_issued", "waiting_for_deposit"])
        .order("created_at", { ascending: false }),
      client.from("point_accounts")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (reservationResult.error || orderResult.error || intentResult.error) {
      console.error(reservationResult.error || orderResult.error || intentResult.error);
      return;
    }
    const pointBalance = pointResult.error ? 0 : Number(pointResult.data?.balance || 0);
    window.motfPointBalance = pointBalance;
    document.querySelectorAll("[data-point-balance]").forEach((node) => { node.textContent = `${pointBalance.toLocaleString("ko-KR")}P`; });
    document.querySelectorAll("#bookingPoints, #marketPoints").forEach((input) => { input.max = String(pointBalance); });
    const reservations = (reservationResult.data || []).map((item) => ({
      id: item.id,
      businessId: item.business_id,
      stayName: item.businesses?.business_name || "숙소",
      roomName: item.offering_name,
      date: item.event_date,
      checkOutDate: item.check_out_date || "",
      people: item.guest_count,
      amount: item.original_amount || item.total_amount,
      paidAmount: item.customer_paid_amount,
      pointsUsed: item.points_used,
      couponDiscount: item.coupon_discount,
      baseAmount: item.base_accommodation_amount,
      status: displayStatus(item),
      rawStatus: item.status,
      refundAmount: item.refund_amount,
    }));
    const orders = (orderResult.data || []).map((item) => ({
      id: item.id,
      businessId: item.business_id,
      storeName: item.businesses?.business_name || "마트",
      pickupTime: String(item.pickup_time || "").slice(0, 5),
      amount: item.original_amount || item.total_amount,
      paidAmount: item.customer_paid_amount,
      pointsUsed: item.points_used,
      couponDiscount: item.coupon_discount,
      status: displayStatus(item),
      rawStatus: item.status,
      refundAmount: item.refund_amount,
      items: item.market_order_items || [],
    }));
    (intentResult.data || []).filter((item) => isFutureDate(pendingAccountExpiresAt(item))).forEach((item) => {
      const account = item.virtual_account || {};
      const label = accountLabel(account);
      const pendingItem = {
        id: item.order_id,
        amount: item.amount,
        status: "입금 전",
        virtualAccount: account,
        expiresAt: pendingAccountExpiresAt(item),
        isPendingVirtualAccount: true,
      };
      if (item.kind === "stay" || item.kind === "extra_charge") {
        reservations.unshift({
          ...pendingItem,
          stayName: item.kind === "extra_charge" ? "추가 이용금" : "가상계좌 입금 대기",
          roomName: item.order_name,
          date: String(item.virtual_account_issued_at || item.created_at || "").slice(0, 10),
          people: "-",
          isExtraCharge: item.kind === "extra_charge",
        });
      } else {
        orders.unshift({
          ...pendingItem,
          storeName: "가상계좌 입금 대기",
          pickupTime: String(item.virtual_account_issued_at || item.created_at || "").slice(11, 16),
          items: [{ id: item.order_id }],
        });
      }
    });
    window.motfApplyMyTransactions?.(reservations, orders);
  }
  window.motfReloadTransactions = loadMyTransactions;

  document.addEventListener("submit", async (event) => {
    if (event.target.id === "bookingForm") {
      const draft = window.motfGetReservationDraft?.();
      if (!draft || !isUuid(draft.business_id)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert("이 숙소는 아직 데모 정보라 실제 예약을 접수할 수 없습니다.\n사장님이 등록한 실제 숙소를 선택해주세요.");
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const submitButton = event.target.querySelector('[type="submit"]');
      const originalHtml = submitButton?.innerHTML;
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = "결제 금액 확인 중..."; }
      try {
        const requestedPoints = Math.max(0, Math.min(Number(document.querySelector("#bookingPoints")?.value || 0), Number(window.motfPointBalance || 0)));
        const { data, error } = await client.rpc("prepare_stay_checkout", {
          target_business_id: draft.business_id,
          target_offering_id: draft.offering_id,
          customer_name: draft.customer_name,
          group_name: draft.group_name,
          contact_phone: draft.contact_phone,
          event_date: draft.event_date,
          guest_count: draft.guest_count,
          request_memo: draft.request_memo,
          check_in_date: draft.event_date,
          check_out_date: draft.check_out_date,
          requested_points: requestedPoints,
          coupon_code: document.querySelector("#bookingCouponCode")?.value.trim() || null,
        });
        if (error) throw error;
        const intent = Array.isArray(data) ? data[0] : data;
        if (!intent) throw new Error("결제 대기 정보를 만들지 못했습니다.");
        window.motfStartPreparedPayment?.(intent, draft);
      } catch (error) {
        console.error(error);
        alert(`결제를 준비하지 못했습니다.\n${error.message || "잠시 후 다시 시도해주세요."}`);
      } finally {
        if (submitButton) { submitButton.disabled = false; submitButton.innerHTML = originalHtml; window.refreshIcons?.(); }
      }
      return;
    }

    if (event.target.id === "orderForm") {
      const draft = window.motfGetMarketOrderDraft?.();
      if (!draft || !isUuid(draft.business_id)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert("이 마트는 아직 데모 정보라 실제 주문을 접수할 수 없습니다.\n사장님이 등록한 실제 마트를 선택해주세요.");
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const submitButton = event.target.querySelector('[type="submit"]');
      const originalHtml = submitButton?.innerHTML;
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = "결제 금액 확인 중..."; }
      try {
        const requestedPoints = Math.max(0, Math.min(Number(document.querySelector("#marketPoints")?.value || 0), Number(window.motfPointBalance || 0)));
        const { data, error } = await client.rpc("prepare_market_checkout", {
          target_business_id: draft.business_id,
          customer_name: draft.customer_name,
          contact_phone: draft.contact_phone,
          pickup_place: draft.pickup_place,
          pickup_time: draft.pickup_time,
          request_memo: draft.request_memo,
          items: draft.items,
          requested_points: requestedPoints,
          coupon_code: document.querySelector("#marketCouponCode")?.value.trim() || null,
        });
        if (error) throw error;
        const intent = Array.isArray(data) ? data[0] : data;
        if (!intent) throw new Error("결제 대기 정보를 만들지 못했습니다.");
        window.motfStartPreparedPayment?.(intent, draft);
      } catch (error) {
        console.error(error);
        alert(`결제를 준비하지 못했습니다.\n${error.message || "잠시 후 다시 시도해주세요."}`);
      } finally {
        if (submitButton) { submitButton.disabled = false; submitButton.innerHTML = originalHtml; window.refreshIcons?.(); }
      }
    }
  }, true);

  // 필수 입력값이 빠져 submit 이벤트 자체가 발생하지 않는 경우에도
  // 사용자가 버튼이 고장 났다고 느끼지 않도록 명확한 안내를 보여준다.
  document.addEventListener("click", (event) => {
    const submitButton = event.target.closest('#bookingForm [type="submit"], #orderForm [type="submit"]');
    if (!submitButton) return;
    const form = submitButton.closest("form");
    if (form && !form.checkValidity()) {
      window.setTimeout(() => alert("필수 입력 항목과 동의 체크를 모두 확인해주세요."), 0);
    }
  }, true);

  document.addEventListener("click", async (event) => {
    const cancelButton = event.target.closest("[data-cancel-reservation]");
    if (!cancelButton) return;
    const reservationId = cancelButton.dataset.cancelReservation;
    if (!confirm("예약을 취소할까요? 이용일까지 남은 기간에 따라 환불률이 자동 적용됩니다.")) return;
    const reason = prompt("취소 사유를 입력해주세요.")?.trim() || "이용자 예약 취소";
    cancelButton.disabled = true;
    try {
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("로그인이 만료되었습니다.");
      const response = await fetch("/api/cancel-reservation", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId, reason }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.message || "예약 취소를 처리하지 못했습니다.");
      alert(result.message || "예약 취소와 환불 요청이 접수되었습니다.");
      await loadMyTransactions();
    } catch (error) {
      alert(error.message || "예약 취소를 처리하지 못했습니다.");
    } finally { cancelButton.disabled = false; }
  });

  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN") window.setTimeout(loadMyTransactions, 0);
    if (event === "SIGNED_OUT") {
      window.motfPointBalance = 0;
      document.querySelectorAll("[data-point-balance]").forEach((node) => { node.textContent = "0P"; });
      window.motfApplyMyTransactions?.([], []);
    }
  });
  window.setTimeout(loadMyTransactions, 0);
})();
