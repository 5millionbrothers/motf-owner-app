(function connectOwnerDirectoryData() {
  const originalSaveMypageData = window.saveMypageData;
  const originalRefreshMasterDataDisplays = window.refreshMasterDataDisplays;
  const originalRenderOrders = window.renderOrders;
  const originalRenderMasterOrders = window.renderMasterOrders;
  const originalSendChatMessage = window.sendChatMessage;
  const originalRenderMasterCases = window.renderMasterCases;

  const businessSelect = [
    "id",
    "owner_id",
    "business_type",
    "business_name",
    "representative_name",
    "phone",
    "business_number",
    "address",
    "address_detail",
    "postal_code",
    "description",
    "region",
    "cover_image_url",
    "facilities",
    "latitude",
    "longitude",
    "location_verified_at",
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

  let naverMapsPromise;
  let postcodePromise;

  function hasCoordinates(business) {
    if (business?.latitude == null || business?.longitude == null || business.latitude === "" || business.longitude === "") return false;
    return Number.isFinite(Number(business?.latitude)) && Number.isFinite(Number(business?.longitude));
  }

  function setLocationStatus(message, state = "pending") {
    const status = document.getElementById("motfBusinessLocationStatus");
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  function clearVerifiedLocation(message = "주소가 변경되었습니다. 위치를 다시 확인해주세요.") {
    const fields = document.getElementById("motfBusinessFields");
    if (!fields) return;
    delete fields.dataset.latitude;
    delete fields.dataset.longitude;
    delete fields.dataset.locationAddress;
    setLocationStatus(message, "pending");
  }

  function loadPostcodeApi() {
    if (window.daum?.Postcode) return Promise.resolve(window.daum);
    if (postcodePromise) return postcodePromise;
    postcodePromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-motf-postcode="true"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window.daum), { once: true });
        existing.addEventListener("error", () => reject(new Error("주소 검색 API를 불러오지 못했습니다.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.dataset.motfPostcode = "true";
      script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      script.onload = () => resolve(window.daum);
      script.onerror = () => {
        postcodePromise = undefined;
        script.remove();
        reject(new Error("주소 검색 API를 불러오지 못했습니다."));
      };
      document.head.appendChild(script);
    });
    return postcodePromise;
  }

  async function openBusinessAddressSearch() {
    const daum = await loadPostcodeApi();
    new daum.Postcode({
      oncomplete(data) {
        const address = data.roadAddress || data.address || "";
        const postcode = data.zonecode || "";
        const region = data.sigungu || data.sido || "";
        const addressInput = document.getElementById("motfBusinessAddress");
        const postalInput = document.getElementById("motfBusinessPostalCode");
        const regionInput = document.getElementById("motfBusinessRegion");
        const detailInput = document.getElementById("motfBusinessAddressDetail");

        if (addressInput) addressInput.value = address;
        if (postalInput) postalInput.value = postcode;
        if (regionInput && !regionInput.value.trim()) regionInput.value = region;
        detailInput?.focus();
        clearVerifiedLocation("주소가 선택되었습니다. 저장 시 지도 위치를 확인합니다.");
      },
    }).open();
  }

  window.motfOpenBusinessAddressSearch = () => {
    openBusinessAddressSearch().catch((error) => {
      alert(error.message || "주소 검색을 열지 못했습니다.");
    });
  };

  async function loadNaverGeocoder() {
    if (window.naver?.maps?.Service) return window.naver;
    if (naverMapsPromise) return naverMapsPromise;
    naverMapsPromise = (async () => {
      const response = await fetch("/api/map-config", { cache: "no-store" });
      if (!response.ok) throw new Error("지도 설정을 불러오지 못했습니다.");
      const { naverMapKeyId } = await response.json();
      if (!naverMapKeyId) throw new Error("네이버 지도 인증키가 설정되지 않았습니다.");
      await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-motf-naver-geocoder="true"]');
        existing?.remove();
        const script = document.createElement("script");
        script.dataset.motfNaverGeocoder = "true";
        script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(naverMapKeyId)}&submodules=geocoder`;
        script.onload = resolve;
        script.onerror = () => {
          script.remove();
          reject(new Error("네이버 주소 검색 모듈을 불러오지 못했습니다."));
        };
        document.head.appendChild(script);
      });
      if (!window.naver?.maps?.Service) throw new Error("네이버 주소 검색 서비스를 사용할 수 없습니다.");
      return window.naver;
    })().catch((error) => {
      naverMapsPromise = undefined;
      throw error;
    });
    return naverMapsPromise;
  }

  async function geocodeAddress(address) {
    const naver = await loadNaverGeocoder();
    return new Promise((resolve, reject) => {
      naver.maps.Service.geocode({ address }, (status, response) => {
        if (status !== naver.maps.Service.Status.OK) {
          reject(new Error(`주소 검색 요청에 실패했습니다. 네이버 지도 API 설정과 허용 도메인을 확인해주세요. (${status})`));
          return;
        }
        const result = response?.v2?.addresses?.[0];
        const latitude = Number(result?.y);
        const longitude = Number(result?.x);
        if (!result || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          reject(new Error("주소를 찾지 못했습니다. 도로명과 건물번호까지 입력해주세요."));
          return;
        }
        resolve({ latitude, longitude, matchedAddress: result.roadAddress || result.jibunAddress || address });
      });
    });
  }

  async function verifyBusinessLocation() {
    const fields = ensurePartnerFields();
    const addressInput = document.getElementById("motfBusinessAddress");
    const button = document.getElementById("motfVerifyBusinessLocationButton");
    const address = addressInput?.value.trim();
    if (!fields || !address) {
      setLocationStatus("주소를 먼저 입력해주세요.", "error");
      throw new Error("업장 주소를 입력해주세요.");
    }
    button?.setAttribute("disabled", "");
    setLocationStatus("주소 위치를 확인하는 중입니다...", "pending");
    try {
      const result = await geocodeAddress(address);
      fields.dataset.latitude = String(result.latitude);
      fields.dataset.longitude = String(result.longitude);
      fields.dataset.locationAddress = address;
      setLocationStatus(`위치 확인 완료 · ${result.matchedAddress}`, "success");
      return result;
    } catch (error) {
      delete fields.dataset.latitude;
      delete fields.dataset.longitude;
      delete fields.dataset.locationAddress;
      setLocationStatus(error.message || "주소 위치를 확인하지 못했습니다.", "error");
      throw error;
    } finally {
      button?.removeAttribute("disabled");
    }
  }

  window.motfVerifyBusinessLocation = () => verifyBusinessLocation().catch((error) => {
    alert(error.message || "주소 위치를 확인하지 못했습니다.");
  });

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
      <label>우편번호
        <span class="motf-address-search-row">
          <input id="motfBusinessPostalCode" maxlength="12" readonly placeholder="주소 검색으로 입력" />
          <button type="button" class="motf-address-search-button" onclick="motfOpenBusinessAddressSearch()">
            <i data-lucide="search"></i> 주소 검색
          </button>
        </span>
      </label>
      <label class="motf-field-wide">업장 주소
        <input id="motfBusinessAddress" maxlength="250" autocomplete="street-address" readonly placeholder="주소 검색 버튼으로 도로명주소를 선택해주세요." />
      </label>
      <label class="motf-field-wide">상세주소
        <input id="motfBusinessAddressDetail" maxlength="120" autocomplete="address-line2" placeholder="건물명, 층, 호수 등 선택 입력" />
        <span class="motf-location-actions">
          <button type="button" id="motfVerifyBusinessLocationButton" class="motf-location-button" onclick="motfVerifyBusinessLocation()">
            <i data-lucide="map-pin"></i> 주소 위치 확인
          </button>
          <small id="motfBusinessLocationStatus" class="motf-location-status" data-state="pending">지도에 표시할 위치를 확인해주세요.</small>
        </span>
      </label>
    `;
    editSection.insertBefore(fields, editSection.firstElementChild);
    const addressInput = document.getElementById("motfBusinessAddress");
    addressInput?.addEventListener("input", () => {
      if (addressInput.value.trim() === fields.dataset.locationAddress) return;
      clearVerifiedLocation("주소가 변경되었습니다. 위치를 다시 확인해주세요.");
    });
    window.lucide?.createIcons();
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
      motfBusinessPostalCode: business.postal_code,
      motfBusinessAddress: business.address,
      motfBusinessAddressDetail: business.address_detail,
      editDescInput: business.description,
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input) input.value = value || "";
    });
    const fields = document.getElementById("motfBusinessFields");
    if (fields && hasCoordinates(business)) {
      fields.dataset.latitude = String(business.latitude);
      fields.dataset.longitude = String(business.longitude);
      fields.dataset.locationAddress = business.address || "";
      setLocationStatus("저장된 지도 위치가 있습니다.", "success");
    } else if (fields) {
      delete fields.dataset.latitude;
      delete fields.dataset.longitude;
      delete fields.dataset.locationAddress;
      setLocationStatus("지도에 표시할 위치를 확인해주세요.", "pending");
    }
    bindPhotoUpload();
    updatePhotoPreview(business.cover_image_url || null);
    client().from("offerings")
      .select("id, name, description, price, max_people, unit, category, image_url, sort_order")
      .eq("business_id", business.id)
      .order("sort_order")
      .then(({ data, error }) => {
        if (!error) {
          const offerings = data || [];
          window.motfApplyOfferingsToDashboard?.(offerings);
          updatePhotoPreview();
          const needsOnboarding = !business.region || !business.address || !business.description || !offerings.length;
          window.motfSetPartnerOnboarding?.(needsOnboarding);
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
      postal_code: document.getElementById("motfBusinessPostalCode")?.value.trim() || null,
      address: document.getElementById("motfBusinessAddress")?.value.trim() || null,
      address_detail: document.getElementById("motfBusinessAddressDetail")?.value.trim() || null,
      description: document.getElementById("editDescInput")?.value.trim() || null,
      facilities: window.motfReadFacilitiesFromDashboard?.() || [],
      updated_at: new Date().toISOString(),
    };

    if (!payload.business_name || !payload.representative_name || !payload.region || !payload.address || !payload.description) {
      alert("업장명, 대표자명, 지역, 주소와 소개 문구를 모두 입력해주세요.");
      return;
    }

    const offeringItems = window.motfReadOfferingsFromDashboard?.() || [];
    if (!offeringItems.length || offeringItems.some((item) => !item.name || Number(item.price) <= 0)) {
      alert("객실 또는 상품을 하나 이상 추가하고 이름과 가격을 입력해주세요.");
      return;
    }
    const saveButton = document.querySelector('#panel-mypage button[onclick="saveMypageData()"]');
    const originalButtonHtml = saveButton?.innerHTML;
    if (saveButton) saveButton.disabled = true;
    try {
      if (saveButton) saveButton.textContent = "주소 확인 중...";
      const fields = ensurePartnerFields();
      const addressIsVerified = fields?.dataset.locationAddress === payload.address
        && Number.isFinite(Number(fields?.dataset.latitude))
        && Number.isFinite(Number(fields?.dataset.longitude));
      const location = addressIsVerified
        ? { latitude: Number(fields.dataset.latitude), longitude: Number(fields.dataset.longitude) }
        : await verifyBusinessLocation();
      payload.latitude = location.latitude;
      payload.longitude = location.longitude;
      payload.location_verified_at = new Date().toISOString();

      if (saveButton) saveButton.textContent = "저장 중...";
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
      if (error || offeringResult.error) throw error || offeringResult.error;

      window.motfCurrentBusiness = data;
      window.motfApplyBusinessToDashboard?.(data);
      window.motfSetPartnerOnboarding?.(false);
      alert("업장 기본정보와 객실·상품, 지도 위치가 저장되었습니다.");
    } catch (error) {
      console.error(error);
      alert(error.message || "업장 정보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.innerHTML = originalButtonHtml;
        window.lucide?.createIcons();
      }
    }
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
      const locationState = hasCoordinates(business)
        ? '<small class="motf-map-state is-ready">지도 위치 확인됨</small>'
        : '<small class="motf-map-state is-missing">지도 위치 미등록</small>';
      return `
        <tr>
          <td><strong>${escapeHtml(business?.business_name || "업장정보 미등록")}</strong><br><small>${escapeHtml(profile.email || "")}</small>${locationState}</td>
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

    const profiles = profileResult.data || [];
    renderUsers(profiles);
    renderPartners(profiles, businessResult.data || [], offeringResult.data || []);

    const localDateKey = (value) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    };
    const todayKey = localDateKey(new Date());
    const newUsersToday = profiles.filter((profile) => profile.role === "user" && localDateKey(profile.created_at) === todayKey).length;
    const pendingPartners = profiles.filter((profile) => profile.role === "partner" && profile.status === "pending").length;
    const userStat = document.getElementById("m-stat-users");
    const partnerStat = document.getElementById("m-stat-pending-partners");
    if (userStat) userStat.textContent = `${newUsersToday.toLocaleString()}명`;
    if (partnerStat) partnerStat.textContent = `${pendingPartners.toLocaleString()}개 업체`;
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
    if (window.motfCurrentProfile?.role === "admin") {
      window.setTimeout(window.loadMotfAdminDirectory, 0);
      window.setTimeout(window.loadMotfAdminTransactions, 0);
      return;
    }
    return originalRefreshMasterDataDisplays?.apply(this, args);
  };

  let partnerTransactions = [];
  let adminTransactions = [];
  const transactionStatus = {
    pending: "확정 대기",
    confirmed: "확정",
    rejected: "거절",
    cancelled: "취소",
    completed: "완료",
  };

  function activePartnerOrderStatus() {
    const button = document.querySelector("#panel-orders .tab-btn.active");
    const source = button?.getAttribute("onclick") || "pending";
    if (source.includes("confirm")) return "confirmed";
    if (source.includes("past")) return "completed";
    if (source.includes("reject")) return "rejected";
    return "pending";
  }

  function transactionCard(item, admin = false) {
    const pending = item.status === "pending";
    const actions = pending ? `
      <div class="item-actions">
        <button class="mypage-btn" style="background:var(--olive-soft);color:var(--teal-dark);" onclick="motfProcessTransaction('${item.kind}','${item.id}','confirmed')">${admin ? "운영팀 " : ""}확정</button>
        <button class="motf-reject-action-btn" onclick="motfProcessTransaction('${item.kind}','${item.id}','rejected')">${admin ? "운영팀 " : ""}거절</button>
      </div>
    ` : `<span class="master-status-badge ${item.status === "rejected" ? "master-badge-terminated" : "master-badge-active"}">${transactionStatus[item.status] || item.status}</span>`;
    return `
      <div class="item-card">
        <div style="flex:1;">
          <div style="font-size:12px;color:var(--teal);font-weight:700;margin-bottom:5px;">${escapeHtml(item.businessName)}</div>
          <h4>${escapeHtml(item.customerName)}</h4>
          <p>${escapeHtml(item.date)} · ${escapeHtml(item.target)} · ${Number(item.amount).toLocaleString()}원</p>
          ${item.rejectReason ? `<p style="color:#b91c1c;">거절 사유: ${escapeHtml(item.rejectReason)}</p>` : ""}
        </div>
        ${actions}
      </div>
    `;
  }

  window.loadMotfPartnerTransactions = async function loadMotfPartnerTransactions(business = window.motfCurrentBusiness) {
    if (!client() || !business) return;
    const table = business.business_type === "market" ? "market_orders" : "reservations";
    const fields = business.business_type === "market"
      ? "id, customer_name, pickup_time, total_amount, status, reject_reason, created_at, market_order_items(item_name, quantity)"
      : "id, customer_name, group_name, event_date, offering_name, total_amount, status, reject_reason";
    const { data, error } = await client().from(table).select(fields).eq("business_id", business.id).order("created_at", { ascending: false });
    if (error) return console.error(error);
    partnerTransactions = (data || []).map((item) => ({
      kind: business.business_type === "market" ? "market" : "stay",
      id: item.id,
      businessName: business.business_name,
      customerName: item.group_name ? `${item.customer_name} (${item.group_name})` : item.customer_name,
      date: business.business_type === "market"
        ? `${String(item.created_at || "").slice(0, 10)} ${String(item.pickup_time || "").slice(0, 5)}`.trim()
        : item.event_date,
      target: business.business_type === "market"
        ? (item.market_order_items || []).map((row) => `${row.item_name} ${row.quantity}개`).join(", ")
        : item.offering_name,
      amount: item.total_amount,
      status: item.status,
      rejectReason: item.reject_reason,
    }));
    mockData[currentOwnerType].orders = partnerTransactions.map((item) => ({
      id: item.id,
      user: item.customerName,
      date: String(item.date || "").slice(0, 10),
      target: item.target,
      price: Number(item.amount || 0),
      status: item.status,
      rejectReason: item.rejectReason || "",
    }));
    const active = partnerTransactions.filter((item) => !["rejected", "cancelled"].includes(item.status));
    const rawTotal = active.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const settled = active.filter((item) => item.status === "completed").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const expected = active.filter((item) => ["pending", "confirmed"].includes(item.status)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const rate = currentOwnerType === "market" ? 0.05 : 0.07;
    const values = {
      "rev-total-val": rawTotal,
      "rev-net-total-val": Math.floor(rawTotal * (1 - rate)),
      "rev-settled-val": Math.floor(settled * (1 - rate)),
      "rev-expected-val": Math.floor(expected * (1 - rate)),
    };
    Object.entries(values).forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (node) node.textContent = `${value.toLocaleString()}원`;
    });
    window.renderCalendar?.();
    window.renderOrders();
  };

  window.renderOrders = function renderDatabaseOrders() {
    if (!window.motfCurrentBusiness) return originalRenderOrders?.();
    const area = document.getElementById("orderListArea");
    if (!area) return;
    const rows = partnerTransactions.filter((item) => item.status === activePartnerOrderStatus());
    area.innerHTML = rows.length
      ? rows.map((item) => transactionCard(item)).join("")
      : '<p style="padding:24px;text-align:center;color:var(--muted);">조건에 맞는 실제 요청이 없습니다.</p>';
  };

  window.loadMotfAdminTransactions = async function loadMotfAdminTransactions() {
    if (!client() || window.motfCurrentProfile?.role !== "admin") return;
    const [businessResult, reservationResult, orderResult] = await Promise.all([
      client().from("businesses").select("id, business_name, business_type"),
      client().from("reservations").select("id, business_id, customer_name, group_name, event_date, offering_name, total_amount, status, reject_reason, created_at").order("created_at", { ascending: false }),
      client().from("market_orders").select("id, business_id, customer_name, pickup_time, total_amount, status, reject_reason, created_at, market_order_items(item_name, quantity)").order("created_at", { ascending: false }),
    ]);
    if (businessResult.error || reservationResult.error || orderResult.error) return console.error(businessResult.error || reservationResult.error || orderResult.error);
    const businesses = businessResult.data || [];
    const nameOf = (id) => businesses.find((item) => item.id === id)?.business_name || "업장";
    adminTransactions = [
      ...(reservationResult.data || []).map((item) => ({ kind:"stay", id:item.id, businessId:item.business_id, businessName:nameOf(item.business_id), customerName:item.group_name ? `${item.customer_name} (${item.group_name})` : item.customer_name, date:item.event_date, target:item.offering_name, amount:item.total_amount, status:item.status, rejectReason:item.reject_reason })),
      ...(orderResult.data || []).map((item) => ({ kind:"market", id:item.id, businessId:item.business_id, businessName:nameOf(item.business_id), customerName:item.customer_name, date:`${String(item.created_at || "").slice(0,10)} ${String(item.pickup_time || "").slice(0,5)}`.trim(), target:(item.market_order_items || []).map((row)=>`${row.item_name} ${row.quantity}개`).join(", "), amount:item.total_amount, status:item.status, rejectReason:item.reject_reason })),
    ];
    const filter = document.getElementById("masterOrderPartnerFilter");
    if (filter) filter.innerHTML = '<option value="all">전체 파트너</option>' + businesses.map((item) => `<option value="${item.id}">${escapeHtml(item.business_name)}</option>`).join("");
    renderAdminTransactionSummary();
    window.renderMasterOrders();
  };

  function renderAdminTransactionSummary() {
    const countedStatuses = new Set(["confirmed", "completed"]);
    const counted = adminTransactions.filter((item) => countedStatuses.has(item.status));
    const gmv = counted.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const fee = counted.reduce((sum, item) => sum + Math.floor(Number(item.amount || 0) * (item.kind === "market" ? 0.05 : 0.07)), 0);
    const gmvNode = document.getElementById("m-stat-gmv");
    const feeNode = document.getElementById("m-stat-fee");
    if (gmvNode) gmvNode.textContent = `${gmv.toLocaleString()}원`;
    if (feeNode) feeNode.textContent = `${fee.toLocaleString()}원`;

    const tracker = document.getElementById("masterTransactionTrackerBody");
    if (tracker) {
      tracker.innerHTML = adminTransactions.length
        ? adminTransactions.map((item) => {
            const itemFee = Math.floor(Number(item.amount || 0) * (item.kind === "market" ? 0.05 : 0.07));
            return `<tr>
              <td>${escapeHtml(String(item.id).slice(0, 8).toUpperCase())}</td>
              <td>${escapeHtml(item.businessName)}</td>
              <td>${escapeHtml(item.customerName)}</td>
              <td>${Number(item.amount || 0).toLocaleString()}원</td>
              <td>${itemFee.toLocaleString()}원</td>
              <td>${escapeHtml(transactionStatus[item.status] || item.status)}</td>
            </tr>`;
          }).join("")
        : '<tr class="motf-admin-empty-row"><td colspan="6">실제 거래 내역이 없습니다.</td></tr>';
    }

    const rejectTimeline = document.getElementById("masterRejectTimelineBody");
    if (rejectTimeline) {
      const rejected = adminTransactions.filter((item) => item.status === "rejected");
      rejectTimeline.innerHTML = rejected.length
        ? rejected.map((item) => `<tr>
            <td>${escapeHtml(item.businessName)}</td>
            <td>${escapeHtml(item.customerName)}</td>
            <td>${escapeHtml(item.target || "-")}</td>
            <td>${Number(item.amount || 0).toLocaleString()}원</td>
            <td>${escapeHtml(item.rejectReason || "사유 미입력")}</td>
          </tr>`).join("")
        : '<tr class="motf-admin-empty-row"><td colspan="5">거절된 실제 요청이 없습니다.</td></tr>';
    }

    const activeRevenueTab = document.querySelector("#panel-master-revenue .rev-menu-btn.active")?.id;
    renderAdminRevenue(activeRevenueTab === "m-rev-sub-2" ? "room" : activeRevenueTab === "m-rev-sub-3" ? "trend" : "period");
  }

  function renderAdminRevenue(tab) {
    const content = document.getElementById("masterRevenueSubContent");
    if (!content) return;
    ["m-rev-sub-1", "m-rev-sub-2", "m-rev-sub-3"].forEach((id, index) => {
      document.getElementById(id)?.classList.toggle("active", index === ["period", "room", "trend"].indexOf(tab));
    });

    const counted = adminTransactions.filter((item) => ["confirmed", "completed"].includes(item.status));
    if (!counted.length) {
      const titles = { period: "기간별 매출 조회", room: "업장별 매출 비중", trend: "매출 변동 추이" };
      content.innerHTML = `<h4>${titles[tab]}</h4><p style="color:var(--muted);">확정 또는 완료된 실제 거래가 아직 없습니다.</p>`;
      return;
    }

    if (tab === "room") {
      const totals = new Map();
      counted.forEach((item) => totals.set(item.businessName, (totals.get(item.businessName) || 0) + Number(item.amount || 0)));
      const grandTotal = [...totals.values()].reduce((sum, value) => sum + value, 0);
      content.innerHTML = `<h4>업장별 매출 비중</h4><div style="background:var(--warm);padding:16px;border-radius:8px;line-height:1.9;">${[...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, total]) => `<div>${escapeHtml(name)}: <strong>${total.toLocaleString()}원</strong> (${((total / grandTotal) * 100).toFixed(1)}%)</div>`)
        .join("")}</div>`;
      return;
    }

    const monthly = new Map();
    counted.forEach((item) => {
      const month = String(item.date || "").slice(0, 7) || "날짜 미상";
      monthly.set(month, (monthly.get(month) || 0) + Number(item.amount || 0));
    });
    const rows = [...monthly.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    const title = tab === "trend" ? "매출 변동 추이" : "기간별 매출 조회";
    content.innerHTML = `<h4>${title}</h4><div style="background:var(--warm);padding:16px;border-radius:8px;line-height:1.9;">${rows
      .map(([month, total]) => `<div>${escapeHtml(month)}: <strong>${total.toLocaleString()}원</strong></div>`)
      .join("")}</div>`;
  }

  window.switchMasterRevSub = function switchDatabaseMasterRevenue(tab) {
    renderAdminRevenue(tab);
  };

  window.renderMasterOrders = function renderDatabaseMasterOrders() {
    if (window.motfCurrentProfile?.role !== "admin") return originalRenderMasterOrders?.();
    const area = document.getElementById("masterOrderListArea");
    if (!area) return;
    const businessFilter = document.getElementById("masterOrderPartnerFilter")?.value || "all";
    const rawStatus = document.getElementById("masterOrderStatusFilter")?.value || "all";
    const statusMap = { confirm:"confirmed", past:"completed", reject:"rejected" };
    const statusFilter = statusMap[rawStatus] || rawStatus;
    const rows = adminTransactions.filter((item) => (businessFilter === "all" || item.businessId === businessFilter) && (statusFilter === "all" || item.status === statusFilter));
    area.innerHTML = rows.length ? rows.map((item) => transactionCard(item, true)).join("") : '<p style="padding:24px;text-align:center;color:var(--muted);">조건에 맞는 실제 요청이 없습니다.</p>';
  };

  window.motfProcessTransaction = async function motfProcessTransaction(kind, id, status) {
    let reason = null;
    if (status === "rejected") {
      reason = prompt("거절 사유를 입력해주세요.")?.trim();
      if (!reason) return;
    }
    if (!confirm(status === "confirmed" ? "이 요청을 확정할까요?" : "이 요청을 거절할까요?")) return;
    const functionName = kind === "market" ? "set_market_order_status" : "set_reservation_status";
    const args = kind === "market"
      ? { target_order_id:id, new_status:status, reason }
      : { target_reservation_id:id, new_status:status, reason };
    const { error } = await client().rpc(functionName, args);
    if (error) return alert("요청 상태를 변경하지 못했습니다.");
    if (window.motfCurrentProfile?.role === "admin") await window.loadMotfAdminTransactions();
    else await window.loadMotfPartnerTransactions();
    alert("요청 상태가 변경되었습니다.");
  };

  let adminChatBusinesses = [];
  let adminChatConversations = [];
  let chatReloadTimer = 0;

  function mapMessages(messages = []) {
    return [...messages]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((message) => ({
        id: message.id,
        type: message.sender_role === "user" ? "in" : "out",
        role: message.sender_role,
        text: message.body,
        createdAt: message.created_at,
      }));
  }

  window.loadMotfPartnerChats = async function loadMotfPartnerChats(business = window.motfCurrentBusiness) {
    if (!client() || !business) return;
    const { data, error } = await client().from("conversations")
      .select("id, customer_name, group_name, last_message_at, messages(id, sender_role, body, created_at)")
      .eq("business_id", business.id)
      .order("last_message_at", { ascending: false });
    if (error) return console.error(error);
    await Promise.all((data || []).map((conversation) => client().rpc("mark_conversation_read", {
      target_conversation_id: conversation.id,
    })));
    const chats = (data || []).map((conversation) => {
      const messages = mapMessages(conversation.messages);
      const userLabel = conversation.group_name
        ? `${conversation.customer_name} (${conversation.group_name})`
        : conversation.customer_name;
      return {
        conversationId: conversation.id,
        user: userLabel,
        status: "대화 중",
        preview: messages.at(-1)?.text || "새 대화가 시작되었습니다.",
        messages,
      };
    });
    mockData[currentOwnerType].chats = chats;
    currentSelectedChatUser = chats[0]?.user || "";
    window.renderChatList?.();
    window.renderChatMessages?.();
  };

  window.sendChatMessage = async function sendDatabaseChatMessage() {
    if (!window.motfCurrentBusiness) return originalSendChatMessage?.();
    const input = document.getElementById("chatMessageInput");
    const text = input?.value.trim();
    if (!text) return;
    const chat = mockData[currentOwnerType].chats.find((item) => item.user === currentSelectedChatUser);
    if (!chat?.conversationId) return originalSendChatMessage?.();
    input.disabled = true;
    const { error } = await client().rpc("send_chat_message", {
      target_conversation_id: chat.conversationId,
      message_body: text,
    });
    input.disabled = false;
    if (error) {
      console.error(error);
      alert(`메시지를 보내지 못했습니다.\n${error.message}`);
      return;
    }
    input.value = "";
    await window.loadMotfPartnerChats();
    currentSelectedChatUser = chat.user;
    window.renderChatList?.();
    window.renderChatMessages?.();
  };

  window.loadMotfAdminChats = async function loadMotfAdminChats() {
    if (!client() || window.motfCurrentProfile?.role !== "admin") return;
    const [businessResult, conversationResult] = await Promise.all([
      client().from("businesses").select("id, business_name, business_type, representative_name").order("business_name"),
      client().from("conversations")
        .select("id, business_id, customer_name, group_name, last_message_at, messages(id, sender_role, body, created_at)")
        .order("last_message_at", { ascending: false }),
    ]);
    if (businessResult.error || conversationResult.error) return console.error(businessResult.error || conversationResult.error);
    adminChatBusinesses = businessResult.data || [];
    adminChatConversations = (conversationResult.data || []).map((conversation) => ({
      ...conversation,
      messages: mapMessages(conversation.messages),
    }));
    if (!adminChatBusinesses.some((item) => item.id === masterSelectedChatPartner)) {
      masterSelectedChatPartner = adminChatBusinesses.find((item) => adminChatConversations.some((chat) => chat.business_id === item.id))?.id
        || adminChatBusinesses[0]?.id
        || "";
    }
    window.renderMasterChatMonitor();
  };

  window.renderMasterChatMonitor = function renderDatabaseMasterChatMonitor() {
    if (window.motfCurrentProfile?.role !== "admin") return;
    const partnerList = document.getElementById("masterChatPartnerList");
    const userList = document.getElementById("masterChatUserList");
    const messageArea = document.getElementById("masterChatMessageArea");
    const title = document.getElementById("masterChatPartnerTitle");
    if (!partnerList || !userList || !messageArea || !title) return;

    partnerList.innerHTML = "";
    adminChatBusinesses.forEach((business) => {
      const count = adminChatConversations.filter((chat) => chat.business_id === business.id).length;
      const button = document.createElement("button");
      button.className = `master-list-item ${masterSelectedChatPartner === business.id ? "active" : ""}`;
      button.innerHTML = `<strong>${escapeHtml(business.business_name)}</strong><small>이용자 대화 ${count}건</small>`;
      button.onclick = () => {
        masterSelectedChatPartner = business.id;
        masterSelectedChatUser = "";
        window.renderMasterChatMonitor();
      };
      partnerList.appendChild(button);
    });

    const business = adminChatBusinesses.find((item) => item.id === masterSelectedChatPartner);
    const conversations = adminChatConversations.filter((chat) => chat.business_id === masterSelectedChatPartner);
    if (!conversations.some((chat) => chat.id === masterSelectedChatUser)) masterSelectedChatUser = conversations[0]?.id || "";
    title.innerText = business ? `${business.business_name} 사장님 채팅` : "파트너를 선택해 주세요";
    userList.innerHTML = "";
    conversations.forEach((conversation) => {
      const preview = conversation.messages.at(-1)?.text || "새 대화";
      const userLabel = conversation.group_name ? `${conversation.customer_name} (${conversation.group_name})` : conversation.customer_name;
      const button = document.createElement("button");
      button.className = `master-list-item ${masterSelectedChatUser === conversation.id ? "active" : ""}`;
      button.innerHTML = `<strong>${escapeHtml(userLabel)}</strong><small>${escapeHtml(preview)}</small>`;
      button.onclick = () => {
        masterSelectedChatUser = conversation.id;
        window.renderMasterChatMonitor();
      };
      userList.appendChild(button);
    });

    const conversation = conversations.find((chat) => chat.id === masterSelectedChatUser);
    if (!conversation) {
      messageArea.innerHTML = '<p style="color:var(--muted);">저장된 대화가 없습니다.</p>';
      return;
    }
    messageArea.innerHTML = conversation.messages.map((message) => {
      const incoming = message.role === "user";
      const sender = incoming ? conversation.customer_name : message.role === "admin" ? "모티프 운영팀" : `${business?.business_name || "업장"} 사장님`;
      return `<div style="align-self:${incoming ? "flex-start" : "flex-end"};max-width:72%;"><div class="admin-chat-meta">${escapeHtml(sender)}</div><div class="chat-bubble ${incoming ? "received" : "sent"}" style="max-width:100%;">${escapeHtml(message.text)}</div></div>`;
    }).join("");
    messageArea.scrollTop = messageArea.scrollHeight;
  };

  window.loadMotfAdminSupportCases = async function loadMotfAdminSupportCases() {
    if (!client() || window.motfCurrentProfile?.role !== "admin") return;
    const { data, error } = await client().from("support_cases")
      .select("id, case_type, title, body, status, created_at, reporter:profiles!support_cases_reporter_id_fkey(full_name, email), businesses(business_name)")
      .order("created_at", { ascending: false });
    if (error) return console.error(error);
    const typeText = { inquiry: "문의", dispute: "분쟁" };
    const statusText = { received: "접수", processing: "처리 중", resolved: "완료" };
    masterExtendedData.cases = (data || []).map((item) => ({
      id: item.id,
      type: typeText[item.case_type] || item.case_type,
      reporter: escapeHtml(item.reporter?.full_name || item.reporter?.email || "이용자"),
      partner: escapeHtml(item.businesses?.business_name || "플랫폼 문의"),
      title: escapeHtml(item.title),
      detail: escapeHtml(item.body),
      date: new Date(item.created_at).toLocaleDateString("ko-KR"),
      status: statusText[item.status] || item.status,
    }));
    window.renderMasterCases();
  };

  window.renderMasterCases = function renderDatabaseMasterCases() {
    if (window.motfCurrentProfile?.role !== "admin") return originalRenderMasterCases?.();
    return originalRenderMasterCases?.();
  };

  window.updateMasterCaseStatus = async function updateDatabaseMasterCaseStatus(id, statusLabel) {
    if (window.motfCurrentProfile?.role !== "admin") return;
    const statusMap = { "접수": "received", "처리 중": "processing", "완료": "resolved" };
    const { error } = await client().rpc("review_support_case", {
      target_case_id: id,
      new_status: statusMap[statusLabel] || statusLabel,
      note: null,
    });
    if (error) {
      console.error(error);
      alert(`문의 상태를 변경하지 못했습니다.\n${error.message}`);
      return;
    }
    await window.loadMotfAdminSupportCases();
  };

  function scheduleChatReload() {
    window.clearTimeout(chatReloadTimer);
    chatReloadTimer = window.setTimeout(() => {
      if (window.motfCurrentProfile?.role === "admin") window.loadMotfAdminChats();
      else if (window.motfCurrentBusiness) window.loadMotfPartnerChats();
    }, 250);
  }

  window.setTimeout(() => {
    if (!client()) return;
    client().channel("owner-chat-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, scheduleChatReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, scheduleChatReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_cases" }, () => window.loadMotfAdminSupportCases?.())
      .subscribe();
  }, 0);
})();
