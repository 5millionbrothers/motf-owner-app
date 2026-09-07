(function connectListingReviewWorkflow() {
  const $ = (selector) => document.querySelector(selector);
  const client = () => window.motfSupabase;
  const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const money = (value) => `${Number(value || 0).toLocaleString("ko-KR")}원`;

  function missingItems(business, offerings) {
    const missing = [];
    if (!business?.business_name || business.business_name === "숙소명 확인 필요") missing.push("숙소명");
    if (!business?.representative_name || business.representative_name === "확인 필요") missing.push("대표자명");
    if (!business?.phone) missing.push("숙소 연락처");
    if (!business?.address) missing.push("기본 주소");
    if (!business?.region) missing.push("운영 지역");
    if (!business?.description) missing.push("숙소 소개");
    if (!business?.cover_image_url && !(business?.gallery_image_urls || []).length) missing.push("숙소 사진");
    if (!offerings.length) missing.push("객실 정보");
    const unnamed = offerings.filter((item) => !String(item.name || "").trim()).length;
    const zeroPrice = offerings.filter((item) => Number(item.offseason_weekday_price ?? item.price ?? 0) <= 0).length;
    const noCapacity = offerings.filter((item) => Number(item.base_people || 0) <= 0 || Number(item.max_people || 0) <= 0).length;
    const noPhotos = offerings.filter((item) => !item.image_url && !(item.image_urls || []).length).length;
    if (unnamed) missing.push(`객실명 ${unnamed}개`);
    if (zeroPrice) missing.push(`비수기 평일 요금 ${zeroPrice}개 객실`);
    if (noCapacity) missing.push(`기준·최대 인원 ${noCapacity}개 객실`);
    if (noPhotos) missing.push(`객실 사진 ${noPhotos}개 객실`);
    return missing;
  }

  async function latestOwnerRequest(businessId) {
    const { data } = await client().from("business_listing_review_requests")
      .select("id,request_type,status,review_note,created_at,reviewed_at")
      .eq("business_id", businessId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data || null;
  }

  window.motfUpdateListingReviewUi = async function updateListingReviewUi() {
    const business = window.motfCurrentBusiness;
    const notice = $("#motfListingReviewNotice");
    const submit = $("#motfSubmitListingButton");
    const save = $('#panel-mypage button[onclick="saveMypageData()"]');
    if (!business || window.motfCurrentProfile?.role !== "partner" || !notice) return;
    const offerings = window.motfReadOfferingsFromDashboard?.() || [];
    const missing = missingItems(business, offerings);
    const request = await latestOwnerRequest(business.id);
    const pending = request?.status === "pending";
    const isDraft = business.approval_status !== "approved";
    notice.hidden = false;
    notice.className = `listing-review-notice ${pending ? "is-pending" : isDraft ? "is-draft" : "is-approved"}`;
    notice.innerHTML = `<div class="listing-review-notice-head"><div><strong>${pending ? "운영팀 심사 대기 중" : isDraft ? "비공개 숙소 초안" : "현재 공개 중인 숙소"}</strong><span>${pending ? "신청 내용을 수정하면 기존 대기 요청이 새 내용으로 교체됩니다." : isDraft ? "아래 항목을 점검한 뒤 별도의 등록 신청을 보내주세요." : "변경사항은 운영팀 승인 후 이용자 화면에 반영됩니다."}</span></div><i data-lucide="${pending ? "clock-3" : isDraft ? "clipboard-list" : "badge-check"}"></i></div>${missing.length ? `<div class="listing-review-missing"><b>확인 권장 ${missing.length}개</b>${missing.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : '<div class="listing-review-ready"><i data-lucide="circle-check"></i> 주요 등록 항목이 모두 입력되었습니다.</div>'}${request?.status === "rejected" && request.review_note ? `<p class="listing-review-rejected"><b>최근 반려 사유</b>${escapeHtml(request.review_note)}</p>` : ""}`;
    if (submit) { submit.hidden = !isDraft; submit.disabled = pending; submit.innerHTML = `<i data-lucide="${pending ? "clock-3" : "send"}"></i> ${pending ? "등록 심사 중" : "등록 신청"}`; }
    if (save) save.innerHTML = `<i data-lucide="${business.approval_status === "approved" ? "send" : "save"}"></i> ${business.approval_status === "approved" ? "변경 승인 요청" : "비공개 초안 저장"}`;
    window.lucide?.createIcons();
  };

  window.motfSubmitInitialListing = async function submitInitialListing() {
    const business = window.motfCurrentBusiness;
    if (!business || business.approval_status === "approved") return;
    const [{ data: freshBusiness, error: businessError }, { data: offerings, error: offeringError }] = await Promise.all([
      client().from("businesses").select("*").eq("id", business.id).single(),
      client().from("offerings").select("*").eq("business_id", business.id).order("sort_order"),
    ]);
    if (businessError || offeringError) return alert((businessError || offeringError).message);
    const missing = missingItems(freshBusiness, offerings || []);
    if (!confirm(`${missing.length ? `확인 권장 항목이 ${missing.length}개 남아 있습니다. 그래도 ` : ""}운영팀에 신규 등록 심사를 신청할까요?`)) return;
    const button = $("#motfSubmitListingButton");
    if (button) button.disabled = true;
    const { error } = await client().rpc("submit_business_listing_review", {
      target_business_id: business.id, proposed_business: freshBusiness,
      proposed_offerings: offerings || [], requested_type: "new_listing",
    });
    if (error) { if (button) button.disabled = false; return alert(error.message); }
    alert("등록 신청을 보냈습니다. 운영팀 승인 전까지 이용자 화면에는 노출되지 않습니다.");
    await window.motfUpdateListingReviewUi();
  };

  function requestStatus(status) {
    return ({ pending: "검토 대기", approved: "승인 완료", rejected: "반려", cancelled: "취소" })[status] || status;
  }

  window.motfLoadListingReviews = async function loadListingReviews() {
    if (window.motfCurrentProfile?.role !== "admin") return;
    const area = $("#motfListingReviewList");
    if (!area) return;
    area.innerHTML = '<div class="admin-control-empty">심사 요청을 불러오는 중입니다.</div>';
    const filter = $("#motfListingReviewFilter")?.value || "pending";
    let query = client().from("business_listing_review_requests").select("*").order("created_at", { ascending: false });
    if (filter !== "all") query = query.eq("status", filter);
    const { data: requests, error } = await query;
    if (error) { area.innerHTML = `<div class="admin-control-empty">${escapeHtml(error.message)}</div>`; return; }
    const businessIds = [...new Set((requests || []).map((item) => item.business_id))];
    const { data: businesses } = businessIds.length
      ? await client().from("businesses").select("id,business_name,approval_status,owner_id,import_job_id").in("id", businessIds)
      : { data: [] };
    const byId = new Map((businesses || []).map((item) => [item.id, item]));
    area.innerHTML = (requests || []).map((request) => {
      const business = byId.get(request.business_id);
      const proposed = request.proposed_business || {};
      const offerings = Array.isArray(request.proposed_offerings) ? request.proposed_offerings : [];
      const missing = missingItems(proposed, offerings);
      const pending = request.status === "pending";
      return `<article class="listing-review-card"><div class="listing-review-card-head"><div><span class="listing-review-type">${request.request_type === "new_listing" ? "신규 입점" : "정보 변경"}</span><h3>${escapeHtml(proposed.business_name || business?.business_name || "숙소명 미확인")}</h3><p>${new Date(request.created_at).toLocaleString("ko-KR")} 신청 · 객실 ${offerings.length}개</p></div><span class="listing-review-status is-${request.status}">${requestStatus(request.status)}</span></div><div class="listing-review-summary"><span>주소 <b>${escapeHtml(proposed.address || "미입력")}</b></span><span>대표 연락처 <b>${escapeHtml(proposed.phone || "미입력")}</b></span><span>사진 <b>${(proposed.gallery_image_urls || []).length}장</b></span><span>최저 객실가 <b>${offerings.length ? money(Math.min(...offerings.map((item) => Number(item.price || 0)))) : "객실 없음"}</b></span></div>${missing.length ? `<div class="listing-review-missing"><b>확인 권장 ${missing.length}개</b>${missing.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : '<div class="listing-review-ready">주요 항목 입력 완료</div>'}${request.review_note ? `<p class="listing-review-note">처리 메모: ${escapeHtml(request.review_note)}</p>` : ""}${pending ? `<div class="listing-review-card-actions"><button class="secondary-btn" onclick="motfReviewListing('${request.id}','rejected')"><i data-lucide="x"></i> 반려</button><button class="primary-btn" onclick="motfReviewListing('${request.id}','approved')"><i data-lucide="check"></i> 승인·반영</button></div>` : ""}</article>`;
    }).join("") || '<div class="admin-control-empty">해당 상태의 심사 요청이 없습니다.</div>';
    window.lucide?.createIcons();
  };

  window.motfReviewListing = async function reviewListing(requestId, decision) {
    const note = decision === "rejected" ? prompt("사장님에게 보여줄 반려 사유를 입력해주세요.") : null;
    if (decision === "rejected" && !note?.trim()) return;
    if (!confirm(decision === "approved" ? "이 신청 내용을 승인하고 이용자 화면에 반영할까요?" : "이 신청을 반려할까요?")) return;
    const { error } = await client().rpc("review_business_listing_request", {
      target_request_id: requestId, decision, note: note?.trim() || null,
    });
    if (error) return alert(error.message);
    alert(decision === "approved" ? "승인되어 공개 정보에 반영되었습니다." : "반려 처리했습니다.");
    await Promise.all([window.motfLoadListingReviews(), window.loadMotfAdminDirectory?.()]);
  };
})();
