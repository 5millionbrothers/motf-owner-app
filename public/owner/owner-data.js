(function connectOwnerDirectoryData() {
  const originalSaveMypageData = window.saveMypageData;
  const originalRefreshMasterDataDisplays = window.refreshMasterDataDisplays;

  const businessSelect = [
    "id",
    "owner_id",
    "business_type",
    "business_name",
    "representative_name",
    "phone",
    "business_number",
    "address",
    "description",
    "region",
    "cover_image_url",
    "facilities",
    "approval_status",
    "rejection_reason",
  ].join(", ");

  function client() {
    return window.motfSupabase;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensurePartnerFields() {
    let fields = document.querySelector("#motfBusinessFields");
    if (fields) return fields;
    const editSection = document.querySelector("#panel-mypage .edit-section");
    if (!editSection) return null;

    fields = document.createElement("div");
    fields.id = "motfBusinessFields";
    fields.className = "motf-business-fields";
    fields.innerHTML = `
      <label>업장명
        <input id="motfBusinessName" maxlength="100" autocomplete="organization" />
      </label>
      <label>대표자명
        <input id="motfRepresentativeName" maxlength="50" autocomplete="name" />
      </label>
      <label>업장 연락처
        <input id="motfBusinessPhone" maxlength="30" autocomplete="tel" />
      </label>
      <label>사업자등록번호
        <input id="motfBusinessNumber" maxlength="30" />
      </label>
      <label>지역
        <input id="motfBusinessRegion" maxlength="50" placeholder="예: 가평" />
      </label>
      <label class="motf-field-wide">업장 주소
        <input id="motfBusinessAddress" maxlength="250" autocomplete="street-address" />
      </label>
    `;
    editSection.insertBefore(fields, editSection.firstElementChild);
    return fields;
  }

  function updatePhotoPreview(url = window.motfGetCurrentPhotoUrl?.()) {
    const preview = document.getElementById("motfPhotoUploadPreview");
    if (!preview) return;
    if (!url) {
      preview.classList.remove("active");
      preview.innerHTML = "";
      return;
    }
    preview.classList.add("active");
    preview.innerHTML = `<img src="${escapeHtml(url)}" alt="등록된 사진"><span>현재 등록된 사진</span>`;
  }

  window.motfRefreshPhotoPreview = updatePhotoPreview;

  function bindPhotoUpload() {
    const input = document.getElementById("motfPhotoUploadInput");
    if (!input || input.dataset.storageBound) return;
    input.dataset.storageBound = "true";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      const business = window.motfCurrentBusiness;
      const profile = window.motfCurrentProfile;
      const target = window.motfGetCurrentPhotoTarget?.();
      if (!file || !business || !profile || !target) return;
      if (!file.type.startsWith("image/")) {
        alert("이미지 파일만 업로드할 수 있습니다.");
        input.value = "";
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert("사진은 한 장당 5MB 이하만 업로드할 수 있습니다.");
        input.value = "";
        return;
      }

      input.disabled = true;
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const objectPath = `${profile.id}/${business.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await client().storage
        .from("catalog-images")
        .upload(objectPath, file, { cacheControl: "3600", upsert: false });

      if (uploadError) {
        console.error(uploadError);
        input.disabled = false;
        input.value = "";
        alert("사진을 업로드하지 못했습니다.");
        return;
      }

      const { data: publicData } = client().storage
        .from("catalog-images")
        .getPublicUrl(objectPath);
      const publicUrl = publicData.publicUrl;
      let saveError = null;

      if (target.type === "business") {
        const result = await client().from("businesses")
          .update({ cover_image_url: publicUrl, updated_at: new Date().toISOString() })
          .eq("id", business.id)
          .select(businessSelect)
          .single();
        saveError = result.error;
        if (!saveError) window.motfCurrentBusiness = result.data;
      } else {
        window.motfSetCurrentPhotoUrl?.(publicUrl);
        const result = await client().rpc("save_business_offerings", {
          target_business_id: business.id,
          items: window.motfReadOfferingsFromDashboard?.() || [],
        });
        saveError = result.error;
      }

      input.disabled = false;
      input.value = "";
      if (saveError) {
        console.error(saveError);
        alert("사진 주소를 업장 정보에 저장하지 못했습니다.");
        return;
      }
      updatePhotoPreview(publicUrl);
      alert("사진이 저장되었습니다. 이용자 화면에도 반영됩니다.");
    });
  }

  window.loadMotfPartnerBusiness = function loadMotfPartnerBusiness(business) {
    if (!business) return;
    ensurePartnerFields();
    const values = {
      motfBusinessName: business.business_name,
      motfRepresentativeName: business.representative_name,
      motfBusinessPhone: business.phone,
      motfBusinessNumber: business.business_number,
      motfBusinessRegion: business.region,
      motfBusinessAddress: business.address,
      editDescInput: business.description,
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input) input.value = value || "";
    });
    bindPhotoUpload();
    updatePhotoPreview(business.cover_image_url || null);
    client().from("offerings")
      .select("id, name, description, price, max_people, unit, category, image_url, sort_order")
      .eq("business_id", business.id)
      .order("sort_order")
      .then(({ data, error }) => {
        if (!error && data?.length) {
          window.motfApplyOfferingsToDashboard?.(data);
          updatePhotoPreview();
        }
      });
  };

  window.saveMypageData = async function saveMypageDataToDatabase() {
    const business = window.motfCurrentBusiness;
    if (!business || !client()) {
      return originalSaveMypageData?.();
    }

    const payload = {
      business_name: document.getElementById("motfBusinessName")?.value.trim(),
      representative_name: document.getElementById("motfRepresentativeName")?.value.trim(),
      phone: document.getElementById("motfBusinessPhone")?.value.trim() || null,
      business_number: document.getElementById("motfBusinessNumber")?.value.trim() || null,
      region: document.getElementById("motfBusinessRegion")?.value.trim() || null,
      address: document.getElementById("motfBusinessAddress")?.value.trim() || null,
      description: document.getElementById("editDescInput")?.value.trim() || null,
      facilities: window.motfReadFacilitiesFromDashboard?.() || [],
      updated_at: new Date().toISOString(),
    };

    if (!payload.business_name || !payload.representative_name) {
      alert("업장명과 대표자명을 입력해주세요.");
      return;
    }

    const saveButton = document.querySelector('#panel-mypage button[onclick="saveMypageData()"]');
    const originalButtonHtml = saveButton?.innerHTML;
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "저장 중...";
    }

    const offeringItems = window.motfReadOfferingsFromDashboard?.() || [];
    const [{ data, error }, offeringResult] = await Promise.all([
      client().from("businesses")
        .update(payload)
        .eq("id", business.id)
        .select(businessSelect)
        .single(),
      client().rpc("save_business_offerings", {
        target_business_id: business.id,
        items: offeringItems,
      }),
    ]);

    if (saveButton) {
      saveButton.disabled = false;
      saveButton.innerHTML = originalButtonHtml;
      window.lucide?.createIcons();
    }

    if (error || offeringResult.error) {
      console.error(error || offeringResult.error);
      alert("업장 정보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    window.motfCurrentBusiness = data;
    window.motfApplyBusinessToDashboard?.(data);
    alert("업장 기본정보와 객실·상품이 저장되었습니다.");
  };

  function statusLabel(status) {
    return ({
      pending: "승인 대기",
      approved: "이용 중",
      rejected: "반려",
      suspended: "정지",
    })[status] || status;
  }

  function statusBadge(status) {
    const active = status === "approved";
    return `<span class="master-status-badge ${active ? "master-badge-active" : "master-badge-waiting"}">${escapeHtml(statusLabel(status))}</span>`;
  }

  function userAction(profile) {
    if (profile.status === "approved") {
      return `<button class="motf-reject-action-btn motf-admin-mini-btn" onclick="motfSetAccountStatus('${profile.id}', 'suspended', 'user')">이용 정지</button>`;
    }
    return `<button class="primary-btn motf-admin-mini-btn" onclick="motfSetAccountStatus('${profile.id}', 'approved', 'user')">이용 재개</button>`;
  }

  function partnerStatusAction(profile) {
    if (profile.status === "pending") {
      return `
        <div class="motf-admin-action-group">
          <button class="primary-btn motf-admin-mini-btn" onclick="motfSetAccountStatus('${profile.id}', 'approved', 'partner')">승인</button>
          <button class="motf-reject-action-btn motf-admin-mini-btn" onclick="motfSetAccountStatus('${profile.id}', 'rejected', 'partner')">거절</button>
        </div>
      `;
    }
    if (profile.status === "approved") {
      return `<button class="motf-reject-action-btn motf-admin-mini-btn" onclick="motfSetAccountStatus('${profile.id}', 'suspended', 'partner')">입점 정지</button>`;
    }
    return `<button class="primary-btn motf-admin-mini-btn" onclick="motfSetAccountStatus('${profile.id}', 'approved', 'partner')">입점 재개</button>`;
  }

  function partnerAction(profile, business, offerings) {
    const statusAction = partnerStatusAction(profile);
    if (!business) return statusAction;
    const businessOfferings = offerings.filter((item) => item.business_id === business.id);
    if (!businessOfferings.length) return statusAction;
    const hasActive = businessOfferings.some((item) => item.is_active);
    return `
      <div class="motf-admin-action-group">
        ${statusAction}
        <button class="secondary-btn motf-admin-mini-btn" onclick="motfToggleBusinessOfferings('${business.id}', ${hasActive ? "false" : "true"})">
          ${hasActive ? "상품 숨김" : "상품 공개"}
        </button>
      </div>
    `;
  }

  function renderUsers(profiles) {
    const body = document.getElementById("masterUserControlTableBody");
    if (!body) return;
    const users = profiles.filter((profile) => profile.role === "user");
    if (!users.length) {
      body.innerHTML = '<tr class="motf-admin-empty-row"><td colspan="5">가입한 이용자가 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = users.map((profile) => `
      <tr>
        <td><strong>${escapeHtml(profile.full_name || "이름 미등록")}</strong><br><small>${escapeHtml(profile.email || "")}</small></td>
        <td>${escapeHtml(profile.phone || "미등록")}</td>
        <td>${escapeHtml(profile.organization || "미등록")}</td>
        <td>${statusBadge(profile.status)}</td>
        <td>${userAction(profile)}</td>
      </tr>
    `).join("");
  }

  function renderPartners(profiles, businesses, offerings) {
    const body = document.getElementById("masterPartnerControlTableBody");
    if (!body) return;
    const partners = profiles.filter((profile) => profile.role === "partner");
    if (!partners.length) {
      body.innerHTML = '<tr class="motf-admin-empty-row"><td colspan="5">가입한 파트너가 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = partners.map((profile) => {
      const business = businesses.find((item) => item.owner_id === profile.id);
      const businessOfferings = business ? offerings.filter((item) => item.business_id === business.id) : [];
      const type = business?.business_type === "market" ? "공판장" : "숙소";
      return `
        <tr>
          <td><strong>${escapeHtml(business?.business_name || "업장정보 미등록")}</strong><br><small>${escapeHtml(profile.email || "")}</small></td>
          <td>${escapeHtml(type)} · ${statusBadge(profile.status)}</td>
          <td>${escapeHtml(business?.business_number || "사업자번호 미등록")}</td>
          <td><span style="font-weight:700; color:var(--teal-dark);">${businessOfferings.length}개 상품</span></td>
          <td>${partnerAction(profile, business, offerings)}</td>
        </tr>
      `;
    }).join("");
    window.lucide?.createIcons();
  }

  window.loadMotfAdminDirectory = async function loadMotfAdminDirectory() {
    const profile = window.motfCurrentProfile;
    if (!client() || profile?.role !== "admin") return;

    const userHeaders = document.querySelectorAll("#panel-master-partners .master-admin-table:first-of-type thead th");
    ["회원", "연락처", "학교/소속", "상태", "관리"].forEach((label, index) => {
      if (userHeaders[index]) userHeaders[index].textContent = label;
    });
    const directoryTables = document.querySelectorAll("#panel-master-partners .master-admin-table");
    const partnerHeaders = directoryTables[1]?.querySelectorAll("thead th") || [];
    ["파트너사명", "업종/상태", "사업자 정보", "등록 상품", "심사 및 공개 관리"].forEach((label, index) => {
      if (partnerHeaders[index]) partnerHeaders[index].textContent = label;
    });

    const [profileResult, businessResult, offeringResult] = await Promise.all([
      client().from("profiles")
        .select("id, email, full_name, phone, organization, role, status, created_at")
        .order("created_at", { ascending: false }),
      client().from("businesses")
        .select(businessSelect)
        .order("created_at", { ascending: false }),
      client().from("offerings")
        .select("id, business_id, is_active"),
    ]);

    if (profileResult.error || businessResult.error || offeringResult.error) {
      console.error(profileResult.error || businessResult.error || offeringResult.error);
      const userBody = document.getElementById("masterUserControlTableBody");
      const partnerBody = document.getElementById("masterPartnerControlTableBody");
      if (userBody) userBody.innerHTML = '<tr class="motf-admin-empty-row"><td colspan="5">회원 정보를 불러오지 못했습니다.</td></tr>';
      if (partnerBody) partnerBody.innerHTML = '<tr class="motf-admin-empty-row"><td colspan="5">파트너 정보를 불러오지 못했습니다.</td></tr>';
      return;
    }

    renderUsers(profileResult.data || []);
    renderPartners(profileResult.data || [], businessResult.data || [], offeringResult.data || []);
  };

  window.motfToggleBusinessOfferings = async function motfToggleBusinessOfferings(businessId, active) {
    if (!client() || window.motfCurrentProfile?.role !== "admin") return;
    if (!confirm(active ? "이 업장의 상품을 이용자에게 공개할까요?" : "이 업장의 상품을 이용자 화면에서 숨길까요?")) return;
    const { error } = await client().rpc("set_business_offerings_active", {
      target_business_id: businessId,
      active,
    });
    if (error) {
      console.error(error);
      alert("상품 공개 상태를 변경하지 못했습니다.");
      return;
    }
    await window.loadMotfAdminDirectory();
    alert("상품 공개 상태가 변경되었습니다.");
  };

  window.motfSetAccountStatus = async function motfSetAccountStatus(userId, status, role) {
    if (!client() || window.motfCurrentProfile?.role !== "admin") return;
    const actionText = status === "approved" ? "승인 또는 이용 재개" : status === "suspended" ? "이용 정지" : "가입 거절";
    if (!confirm(`이 계정을 ${actionText} 처리하시겠습니까?`)) return;

    let error = null;
    if (role === "partner" && (status === "approved" || status === "rejected")) {
      let reason = null;
      if (status === "rejected") {
        reason = prompt("거절 사유를 입력해주세요.")?.trim();
        if (!reason) return;
      }
      ({ error } = await client().rpc("review_partner_application", {
        target_user_id: userId,
        decision: status,
        reason,
      }));
    } else {
      ({ error } = await client().rpc("set_account_status", {
        target_user_id: userId,
        new_status: status,
      }));
    }

    if (error) {
      console.error(error);
      alert("계정 상태를 변경하지 못했습니다.");
      return;
    }
    await window.loadMotfAdminDirectory();
    alert("계정 상태가 변경되었습니다.");
  };

  window.refreshMasterDataDisplays = function refreshMasterDataDisplaysWithDatabase(...args) {
    const result = originalRefreshMasterDataDisplays?.apply(this, args);
    if (window.motfCurrentProfile?.role === "admin") {
      window.setTimeout(window.loadMotfAdminDirectory, 0);
    }
    return result;
  };
})();
