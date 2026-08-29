(function setupPartnerOperations() {
  let reviews = [];
  let settlements = [];
  let transactions = [];
  let offerings = [];
  let availabilityBlocks = [];
  let conversations = [];
  let lastLoadedAt = 0;
  let loadingPromise = null;
  let realtimeTimer = 0;

  const $ = (selector) => document.querySelector(selector);
  const client = () => window.motfSupabase;
  const money = (value) => `${Number(value || 0).toLocaleString("ko-KR")}원`;
  const date = (value) => value ? new Date(value).toLocaleDateString("ko-KR") : "-";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const rating5 = (value) => Math.max(0, Math.min(5, Number(value || 0) / 2));

  function statCard(label, value, detail, tone = "") {
    return `<article class="owner-operation-stat ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
  }

  function empty(message) {
    return `<div class="owner-empty-state"><i data-lucide="inbox"></i><p>${escapeHtml(message)}</p></div>`;
  }

  async function loadTransactions(business) {
    const isMarket = business.business_type === "market";
    const table = isMarket ? "market_orders" : "reservations";
    const fields = isMarket
      ? "id,customer_name,total_amount,status,created_at,pickup_time"
      : "id,customer_name,group_name,offering_name,total_amount,status,event_date,created_at";
    const { data, error } = await client().from(table).select(fields)
      .eq("business_id", business.id).order("created_at", { ascending: false }).limit(300);
    if (error) throw error;
    transactions = (data || []).map((item) => ({
      ...item,
      displayName: item.group_name ? `${item.customer_name} (${item.group_name})` : item.customer_name,
      targetName: isMarket ? "공판장 주문" : item.offering_name,
      activityDate: isMarket ? item.created_at : item.event_date,
    }));
  }

  async function loadOfferingsAndAvailability(business) {
    const offeringResult = await client().from("offerings").select("id,name,is_active")
      .eq("business_id", business.id).order("sort_order");
    if (offeringResult.error) throw offeringResult.error;
    offerings = offeringResult.data || [];
    if (business.business_type !== "stay") {
      availabilityBlocks = [];
      return;
    }
    const blockResult = await client().from("stay_availability_blocks")
      .select("id,offering_id,start_date,end_date,source,status,note")
      .eq("business_id", business.id).eq("status", "active")
      .gte("end_date", new Date().toISOString().slice(0, 10)).order("start_date").limit(500);
    if (blockResult.error) throw blockResult.error;
    availabilityBlocks = blockResult.data || [];
  }

  async function loadConversations(business) {
    const { data, error } = await client().from("conversations")
      .select("id,customer_name,group_name,last_message_at")
      .eq("business_id", business.id).order("last_message_at", { ascending: false }).limit(100);
    if (error) throw error;
    conversations = data || [];
  }

  window.motfLoadPartnerReviews = async function loadPartnerReviews(force = false) {
    const business = window.motfCurrentBusiness;
    if (!client() || !business || window.motfCurrentProfile?.role !== "partner") return;
    if (!force && reviews.length) return renderReviews();
    const target = $("#ownerReviewList");
    if (target) target.innerHTML = '<div class="owner-loading-state">리뷰를 불러오는 중입니다.</div>';
    const { data, error } = await client().from("reviews")
      .select("id,author_name,rating,body,tags,image_urls,structured_scores,comfortable_people_min,comfortable_people_max,recommend_30_plus,organizer_difficulty,is_hidden,created_at")
      .eq("business_id", business.id).order("created_at", { ascending: false }).limit(300);
    if (error) {
      if (target) target.innerHTML = empty(`리뷰를 불러오지 못했습니다: ${error.message}`);
      return;
    }
    reviews = data || [];
    renderReviewSummary();
    renderReviews();
  };

  function renderReviewSummary() {
    const target = $("#ownerReviewStats");
    if (!target) return;
    const visible = reviews.filter((review) => !review.is_hidden);
    const average = visible.length ? visible.reduce((sum, review) => sum + rating5(review.rating), 0) / visible.length : 0;
    const counts = [5, 4, 3, 2, 1].map((score) => ({
      score,
      count: visible.filter((review) => Math.round(rating5(review.rating)) === score).length,
    }));
    target.innerHTML = `
      <div class="owner-review-score"><span>평균 평점</span><strong>${average.toFixed(1)}</strong><div class="owner-stars" aria-label="5점 만점 ${average.toFixed(1)}점">${"★".repeat(Math.round(average))}${"☆".repeat(5 - Math.round(average))}</div><small>공개 리뷰 ${visible.length}개</small></div>
      <div class="owner-rating-bars">${counts.map(({ score, count }) => `<div><span>${score}점</span><div><i style="width:${visible.length ? Math.round(count / visible.length * 100) : 0}%"></i></div><small>${count}</small></div>`).join("")}</div>`;
  }

  function renderReviews() {
    const target = $("#ownerReviewList");
    if (!target) return;
    const query = String($("#ownerReviewSearch")?.value || "").trim().toLowerCase();
    const filter = $("#ownerReviewRatingFilter")?.value || "all";
    const rows = reviews.filter((review) => {
      const score = rating5(review.rating);
      const matchesSearch = !query || [review.author_name, review.body, ...(review.tags || [])].join(" ").toLowerCase().includes(query);
      const matchesFilter = filter === "all"
        || (filter === "high" && score >= 4)
        || (filter === "low" && score <= 3)
        || (filter === "photo" && (review.image_urls || []).length > 0);
      return matchesSearch && matchesFilter;
    });
    target.innerHTML = rows.length ? rows.map((review) => {
      const score = rating5(review.rating);
      const images = (review.image_urls || []).slice(0, 4);
      return `<article class="owner-review-card ${review.is_hidden ? "is-hidden" : ""}">
        <header><div><strong>${escapeHtml(review.author_name || "moTF 이용자")}</strong><span class="owner-review-stars">${"★".repeat(Math.round(score))}${"☆".repeat(5 - Math.round(score))} <b>${score.toFixed(1)}</b></span></div><time>${date(review.created_at)}</time></header>
        <p>${escapeHtml(review.body)}</p>
        ${(review.tags || []).length ? `<div class="owner-review-tags">${review.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        ${images.length ? `<div class="owner-review-images">${images.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(url)}" alt="리뷰 사진"></a>`).join("")}</div>` : ""}
        ${review.is_hidden ? '<small class="owner-review-hidden-note">운영팀에 의해 현재 비공개 처리된 리뷰입니다.</small>' : ""}
      </article>`;
    }).join("") : empty("조건에 맞는 리뷰가 없습니다.");
    window.lucide?.createIcons();
  }
  window.motfRenderPartnerReviews = renderReviews;

  window.motfLoadPartnerSettlements = async function loadPartnerSettlements(force = false) {
    if (!client() || !window.motfCurrentBusiness || window.motfCurrentProfile?.role !== "partner") return;
    if (!force && settlements.length) return renderSettlements();
    const target = $("#ownerSettlementList");
    if (target) target.innerHTML = '<div class="owner-loading-state">정산 내역을 불러오는 중입니다.</div>';
    const { data, error } = await client().rpc("list_own_partner_settlements");
    if (error) {
      if (target) target.innerHTML = empty(`정산 내역을 불러오지 못했습니다. DB 62번 적용 여부를 확인해주세요. (${error.message})`);
      return;
    }
    settlements = (data || []).filter((item) => item.business_id === window.motfCurrentBusiness.id);
    renderSettlementSummary();
    renderSettlements();
  };

  function filteredSettlements() {
    const status = $("#ownerSettlementStatus")?.value || "all";
    const from = $("#ownerSettlementFrom")?.value || "";
    const to = $("#ownerSettlementTo")?.value || "";
    return settlements.filter((item) => {
      const itemDate = String(item.transaction_date || item.created_at || "").slice(0, 10);
      return (status === "all" || item.status === status) && (!from || itemDate >= from) && (!to || itemDate <= to);
    });
  }

  function renderSettlementSummary() {
    const target = $("#ownerSettlementStats");
    if (!target) return;
    const pending = settlements.filter((item) => item.status === "pending");
    const paid = settlements.filter((item) => item.status === "paid");
    target.innerHTML = [
      statCard("정산 예정", money(pending.reduce((sum, item) => sum + Number(item.payout_amount || 0), 0)), `${pending.length}건`, "is-accent"),
      statCard("정산 완료", money(paid.reduce((sum, item) => sum + Number(item.payout_amount || 0), 0)), `${paid.length}건`),
      statCard("누적 판매금액", money(settlements.reduce((sum, item) => sum + Number(item.gross_amount || 0), 0)), "할인 전 판매가"),
      statCard("누적 수수료", money(settlements.reduce((sum, item) => sum + Number(item.commission_amount || 0), 0)), "거래별 적용률 반영"),
    ].join("");
  }

  function renderSettlements() {
    const target = $("#ownerSettlementList");
    if (!target) return;
    const rows = filteredSettlements();
    target.innerHTML = rows.length ? rows.map((item) => `<article class="owner-settlement-row">
      <div class="owner-settlement-main"><span class="owner-settlement-status ${item.status}">${item.status === "paid" ? "정산 완료" : "정산 예정"}</span><strong>${escapeHtml(item.target_name || "거래")}</strong><p>${escapeHtml(item.customer_name || "이용자")} · ${date(item.transaction_date)}</p><small>거래번호 ${escapeHtml(item.transaction_id)}</small></div>
      <dl><div><dt>판매금액</dt><dd>${money(item.gross_amount)}</dd></div><div><dt>모티프 부담 할인</dt><dd>${money(item.platform_discount_amount)}</dd></div><div><dt>수수료 (${(Number(item.commission_rate || 0) * 100).toFixed(1)}%)</dt><dd>-${money(item.commission_amount)}</dd></div><div class="owner-settlement-payout"><dt>지급액</dt><dd>${money(item.payout_amount)}</dd></div></dl>
      <div class="owner-settlement-date"><span>${item.status === "paid" ? "지급일" : "생성일"}</span><strong>${date(item.paid_at || item.created_at)}</strong></div>
    </article>`).join("") : empty("조건에 맞는 정산 내역이 없습니다.");
    window.lucide?.createIcons();
  }
  window.motfRenderPartnerSettlements = renderSettlements;

  function downloadCsv(filename, rows) {
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  window.motfExportPartnerSettlements = function exportPartnerSettlements() {
    const rows = filteredSettlements();
    if (!rows.length) return alert("내보낼 정산 내역이 없습니다.");
    downloadCsv(`motf-settlements-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["거래번호", "거래일", "이용자", "객실/상품", "판매금액", "고객결제액", "모티프부담할인", "수수료율", "수수료", "지급액", "상태", "지급일"],
      ...rows.map((item) => [item.transaction_id, item.transaction_date, item.customer_name, item.target_name, item.gross_amount, item.customer_paid_amount, item.platform_discount_amount, Number(item.commission_rate || 0) * 100, item.commission_amount, item.payout_amount, item.status, item.paid_at || ""]),
    ]);
  };

  function renderOperations() {
    const business = window.motfCurrentBusiness;
    if (!business) return;
    const today = new Date().toISOString().slice(0, 10);
    const pending = transactions.filter((item) => item.status === "pending");
    const upcoming = transactions.filter((item) => item.status === "confirmed" && String(item.activityDate || "").slice(0, 10) >= today);
    const recentChats = conversations.filter((item) => Date.now() - new Date(item.last_message_at).getTime() < 24 * 60 * 60 * 1000);
    const visibleReviews = reviews.filter((review) => !review.is_hidden);
    const average = visibleReviews.length ? visibleReviews.reduce((sum, review) => sum + rating5(review.rating), 0) / visibleReviews.length : 0;
    const pendingPayout = settlements.filter((item) => item.status === "pending").reduce((sum, item) => sum + Number(item.payout_amount || 0), 0);

    $("#ownerOperationsGreeting").textContent = `${business.business_name} 운영 현황입니다. 중요한 항목부터 확인하세요.`;
    $("#ownerOperationsStats").innerHTML = [
      statCard("확정 대기", `${pending.length}건`, "승인 또는 거절 필요", pending.length ? "is-warning" : ""),
      statCard("다가오는 일정", `${upcoming.length}건`, "확정된 예약/주문"),
      statCard("최근 24시간 문의", `${recentChats.length}건`, `전체 채팅 ${conversations.length}개`),
      statCard("이용자 평점", visibleReviews.length ? `${average.toFixed(1)} / 5` : "리뷰 없음", `${visibleReviews.length}개 리뷰`),
      statCard("정산 예정", money(pendingPayout), `${settlements.filter((item) => item.status === "pending").length}건`, "is-accent"),
    ].join("");

    const tasks = [];
    if (pending.length) tasks.push({ icon: "clipboard-check", title: `확정 대기 ${pending.length}건`, body: "일정과 객실을 확인한 뒤 승인 또는 거절해주세요.", panel: "orders", action: "예약 확인" });
    if (recentChats.length) tasks.push({ icon: "message-circle", title: `최근 문의 ${recentChats.length}건`, body: "답변을 기다리는 이용자가 있는지 확인해주세요.", panel: "chat", action: "채팅 열기" });
    if (business.business_type === "stay" && availabilityBlocks.length) tasks.push({ icon: "calendar-x", title: `현재 방막기 ${availabilityBlocks.length}건`, body: "외부 예약과 수동 차단 날짜가 정확한지 확인해주세요.", panel: "calendar", action: "캘린더 보기" });
    const lowReviews = visibleReviews.filter((review) => rating5(review.rating) <= 3);
    if (lowReviews.length) tasks.push({ icon: "message-square-warning", title: `확인이 필요한 리뷰 ${lowReviews.length}건`, body: "3점 이하 후기를 살펴보고 운영 개선에 반영해보세요.", panel: "reviews", action: "리뷰 보기" });
    $("#ownerOperationsTasks").innerHTML = tasks.length ? tasks.map((task) => `<button type="button" class="owner-task-row" onclick="switchPanel('${task.panel}')"><i data-lucide="${task.icon}"></i><span><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.body)}</small></span><b>${escapeHtml(task.action)} <i data-lucide="chevron-right"></i></b></button>`).join("") : `<div class="owner-all-clear"><i data-lucide="circle-check-big"></i><div><strong>지금 바로 처리할 항목이 없습니다.</strong><p>새로운 예약이나 문의가 들어오면 이곳에 표시됩니다.</p></div></div>`;

    const settlement = window.motfCurrentSettlementAccount || {};
    const checks = [
      [business.approval_status === "approved", "입점 승인"],
      [business.business_number_verification_status === "verified", "사업자 정보 인증"],
      [business.latitude != null && business.longitude != null, "지도 위치 확인"],
      [Boolean(business.cover_image_url || business.gallery_image_urls?.length), "대표·상세 사진"],
      [offerings.some((item) => item.is_active), business.business_type === "market" ? "판매 상품 등록" : "객실 등록"],
      [Boolean(settlement.bank_name && settlement.account_number && settlement.account_holder), "정산 계좌 등록"],
    ];
    $("#ownerBusinessHealth").innerHTML = checks.map(([done, label]) => `<div class="${done ? "done" : "todo"}"><i data-lucide="${done ? "check" : "circle"}"></i><span>${escapeHtml(label)}</span><b>${done ? "완료" : "확인 필요"}</b></div>`).join("");

    const activities = [
      ...transactions.slice(0, 5).map((item) => ({ at: item.created_at, icon: "calendar-check", title: `${item.displayName || "이용자"} · ${item.targetName || "거래"}`, detail: `${money(item.total_amount)} · ${item.status === "pending" ? "확정 대기" : item.status}` })),
      ...reviews.slice(0, 4).map((review) => ({ at: review.created_at, icon: "star", title: `${review.author_name || "이용자"}님의 ${rating5(review.rating).toFixed(1)}점 리뷰`, detail: review.body })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6);
    $("#ownerRecentActivity").innerHTML = activities.length ? activities.map((item) => `<div><i data-lucide="${item.icon}"></i><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span><time>${date(item.at)}</time></div>`).join("") : empty("아직 표시할 운영 활동이 없습니다.");
    window.lucide?.createIcons();
  }

  window.motfRefreshPartnerOperations = async function refreshPartnerOperations(force = false) {
    const business = window.motfCurrentBusiness;
    if (!client() || !business || window.motfCurrentProfile?.role !== "partner") return;
    if (loadingPromise) return loadingPromise;
    if (!force && Date.now() - lastLoadedAt < 30000) return renderOperations();
    loadingPromise = Promise.all([
      loadTransactions(business),
      loadOfferingsAndAvailability(business),
      loadConversations(business),
      window.motfLoadPartnerReviews(true),
      window.motfLoadPartnerSettlements(true),
    ]).then(() => {
      lastLoadedAt = Date.now();
      renderOperations();
    }).catch((error) => {
      console.error("Partner operations failed", error);
      const target = $("#ownerOperationsTasks");
      if (target) target.innerHTML = empty(error.message || "운영 현황을 불러오지 못했습니다.");
    }).finally(() => { loadingPromise = null; });
    return loadingPromise;
  };

  window.addEventListener("motf:owner-panel-change", (event) => {
    const panelId = event.detail?.panelId;
    if (panelId === "operations") window.motfRefreshPartnerOperations(false);
    if (panelId === "reviews") window.motfLoadPartnerReviews(false);
    if (panelId === "settlements") window.motfLoadPartnerSettlements(false);
  });

  function scheduleRealtimeRefresh() {
    window.clearTimeout(realtimeTimer);
    realtimeTimer = window.setTimeout(() => window.motfRefreshPartnerOperations(true), 800);
  }

  window.setTimeout(() => {
    if (!client()) return;
    client().channel("partner-operations-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, scheduleRealtimeRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "market_orders" }, scheduleRealtimeRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "reviews" }, scheduleRealtimeRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_settlements" }, scheduleRealtimeRefresh)
      .subscribe();
  }, 0);
})();
