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
      <label class="motf-field-wide">업장 주소
        <input id="motfBusinessAddress" maxlength="250" autocomplete="street-address" />
      </label>
    `;
    editSection.insertBefore(fields, editSection.firstElementChild);
    return fields;
  }

  window.loadMotfPartnerBusiness = function loadMotfPartnerBusiness(business) {
    if (!business) return;
    ensurePartnerFields();
    const values = {
      motfBusinessName: business.business_name,
      motfRepresentativeName: business.representative_name,
      motfBusinessPhone: business.phone,
      motfBusinessNumber: business.business_number,
      motfBusinessAddress: business.address,
      editDescInput: business.description,
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input) input.value = value || "";
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
      address: document.getElementById("motfBusinessAddress")?.value.trim() || null,
      description: document.getElementById("editDescInput")?.value.trim() || null,
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

    const { data, error } = await client()
      .from("businesses")
      .update(payload)
      .eq("id", business.id)
      .select(businessSelect)
      .single();

    if (saveButton) {
      saveButton.disabled = false;
      saveButton.innerHTML = originalButtonHtml;
      window.lucide?.createIcons();
    }

    if (error) {
      console.error(error);
      alert("업장 정보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    window.motfCurrentBusiness = data;
    window.motfApplyBusinessToDashboard?.(data);
    alert("업장 기본정보가 저장되었습니다.");
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

  function partnerAction(profile) {
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

  function renderPartners(profiles, businesses) {
    const body = document.getElementById("masterPartnerControlTableBody");
    if (!body) return;
    const partners = profiles.filter((profile) => profile.role === "partner");
    if (!partners.length) {
      body.innerHTML = '<tr class="motf-admin-empty-row"><td colspan="5">가입한 파트너가 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = partners.map((profile) => {
      const business = businesses.find((item) => item.owner_id === profile.id);
      const type = business?.business_type === "market" ? "공판장" : "숙소";
      return `
        <tr>
          <td><strong>${escapeHtml(business?.business_name || "업장정보 미등록")}</strong><br><small>${escapeHtml(profile.email || "")}</small></td>
          <td>${escapeHtml(type)} · ${statusBadge(profile.status)}</td>
          <td>${escapeHtml(business?.business_number || "사업자번호 미등록")}</td>
          <td><span style="font-weight:700; color:var(--teal-dark);">0건</span></td>
          <td>${partnerAction(profile)}</td>
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

    const [profileResult, businessResult] = await Promise.all([
      client().from("profiles")
        .select("id, email, full_name, phone, organization, role, status, created_at")
        .order("created_at", { ascending: false }),
      client().from("businesses")
        .select(businessSelect)
        .order("created_at", { ascending: false }),
    ]);

    if (profileResult.error || businessResult.error) {
      console.error(profileResult.error || businessResult.error);
      const userBody = document.getElementById("masterUserControlTableBody");
      const partnerBody = document.getElementById("masterPartnerControlTableBody");
      if (userBody) userBody.innerHTML = '<tr class="motf-admin-empty-row"><td colspan="5">회원 정보를 불러오지 못했습니다.</td></tr>';
      if (partnerBody) partnerBody.innerHTML = '<tr class="motf-admin-empty-row"><td colspan="5">파트너 정보를 불러오지 못했습니다.</td></tr>';
      return;
    }

    renderUsers(profileResult.data || []);
    renderPartners(profileResult.data || [], businessResult.data || []);
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
