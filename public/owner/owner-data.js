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
    "business_number_verification_status",
    "business_number_status_checked_at",
    "business_number_verified_at",
    "address",
    "address_detail",
    "postal_code",
    "description",
    "short_description",
    "highlight_summary",
    "highlight_keys",
    "region",
    "cover_image_url",
    "gallery_image_urls",
    "facilities",
    "nearby_tags",
    "room_count",
    "bath_count",
    "shared_bathroom_count",
    "shared_bathroom_gender_separated",
    "shared_bathroom_note",
    "shoulder_season_ranges",
    "peak_season_ranges",
    "amenity_details",
    "extra_fees",
    "latitude",
    "longitude",
    "station_distance_m",
    "convenience_distance_m",
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

  function normalizeBusinessRegion(region = "", address = "") {
    const regionText = String(region || "").trim();
    const locationText = `${regionText} ${String(address || "")}`.replace(/\s+/g, " ").trim();
    if (/가평군|가평\s*대성리|대성리/.test(locationText)) return "가평";
    if (/^[^\s]+군$/.test(regionText)) return regionText.slice(0, -1);
    if (/^[^\s]+시$/.test(regionText) && !/(특별시|광역시|특별자치시)$/.test(regionText)) return regionText.slice(0, -1);
    return regionText;
  }

  function setBusinessRegion(region = "", address = "") {
    const normalized = normalizeBusinessRegion(region, address);
    const input = document.getElementById("motfBusinessRegion");
    const display = document.getElementById("motfBusinessRegionDisplay");
    if (input) input.value = normalized;
    if (display) display.textContent = normalized || "주소를 검색하면 자동 설정됩니다.";
    return normalized;
  }

  let naverMapsPromise;
  let postcodePromise;
  const nearbyOptions = [
    { key: "river", label: "강가" },
    { key: "seaside", label: "바다" },
    { key: "valley", label: "계곡" },
    { key: "mountain", label: "산·숲" },
    { key: "quiet", label: "조용한 주변" },
    { key: "bus", label: "대형버스 진입" },
  ];
  let selectedNearbyTags = new Set();
  let extraFeeRows = [];
  let locationReferencePoints = [];

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
        const region = normalizeBusinessRegion(data.sigungu || data.sido || "", address);
        const addressInput = document.getElementById("motfBusinessAddress");
        const postalInput = document.getElementById("motfBusinessPostalCode");
        const regionInput = document.getElementById("motfBusinessRegion");
        const detailInput = document.getElementById("motfBusinessAddressDetail");

        if (addressInput) addressInput.value = address;
        if (postalInput) postalInput.value = postcode;
        if (regionInput) regionInput.value = region;
        setBusinessRegion(region, address);
        detailInput?.focus();
        clearVerifiedLocation("주소가 선택되었습니다. 저장 시 지도 위치를 확인합니다.");
        window.setTimeout(() => verifyBusinessLocation().catch(() => {}), 0);
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
    try {
      const { data: sessionData } = await client().auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (accessToken) {
        const response = await fetch("/api/geocode-address", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ address }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && Number.isFinite(Number(result.latitude)) && Number.isFinite(Number(result.longitude))) {
          return { latitude: Number(result.latitude), longitude: Number(result.longitude), matchedAddress: result.matchedAddress || address };
        }
      }
    } catch (error) {
      console.warn("Server geocoding fallback failed.", error);
    }
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

  function setLocationReferenceStatus(message, state = "pending") {
    const status = document.getElementById("motfLocationReferenceStatus");
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  function renderLocationReferencePoints() {
    const list = document.getElementById("motfLocationReferenceList");
    const count = document.getElementById("motfLocationReferenceCount");
    if (!list || !count) return;
    count.textContent = `${locationReferencePoints.length}개`;
    if (!locationReferencePoints.length) {
      list.innerHTML = '<div class="location-reference-empty">등록된 기준 장소가 없습니다. 왼쪽에서 첫 장소를 등록해주세요.</div>';
      return;
    }
    list.innerHTML = locationReferencePoints.map((point) => {
      const typeLabel = point.reference_type === "station" ? "역" : "편의점";
      const regionLabel = point.region || "전 지역";
      const latitude = Number(point.latitude).toFixed(6);
      const longitude = Number(point.longitude).toFixed(6);
      return `<article class="location-reference-item ${point.is_active ? "" : "inactive"}">
        <div class="location-reference-item-main">
          <span class="location-reference-type ${point.reference_type}">${typeLabel}</span>
          <div><strong>${escapeHtml(point.name)}</strong><p>${escapeHtml(regionLabel)} · ${latitude}, ${longitude}</p></div>
        </div>
        <div class="location-reference-item-actions">
          <button type="button" class="ghost-btn" onclick="motfToggleLocationReference('${point.id}', ${!point.is_active})">${point.is_active ? "사용 중" : "사용 안 함"}</button>
          <button type="button" class="secondary-btn" onclick="motfEditLocationReference('${point.id}')">수정</button>
          <button type="button" class="ghost-btn danger" onclick="motfDeleteLocationReference('${point.id}')" aria-label="${escapeHtml(point.name)} 삭제" title="삭제"><i data-lucide="trash-2"></i></button>
        </div>
      </article>`;
    }).join("");
    window.lucide?.createIcons();
  }

  window.loadMotfLocationReferencePoints = async function loadMotfLocationReferencePoints() {
    const list = document.getElementById("motfLocationReferenceList");
    if (!list || !client() || window.motfCurrentProfile?.role !== "admin") return;
    list.innerHTML = '<div class="location-reference-empty">기준 장소를 불러오는 중입니다.</div>';
    const { data, error } = await client()
      .from("location_reference_points")
      .select("id, reference_type, name, region, latitude, longitude, is_active, created_at, updated_at")
      .order("reference_type", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      list.innerHTML = `<div class="location-reference-empty error">기준 장소를 불러오지 못했습니다.<small>${escapeHtml(error.message)}</small></div>`;
      return;
    }
    locationReferencePoints = data || [];
    renderLocationReferencePoints();
  };

  window.motfResetLocationReferenceForm = function resetLocationReferenceForm() {
    const form = document.getElementById("motfLocationReferenceForm");
    form?.reset();
    const id = document.getElementById("motfLocationReferenceId");
    const region = document.getElementById("motfLocationReferenceRegion");
    const title = document.getElementById("motfLocationReferenceFormTitle");
    if (id) id.value = "";
    if (region) region.value = "가평";
    if (title) title.textContent = "기준 장소 등록";
    setLocationReferenceStatus("주소를 검색하면 위도와 경도가 자동으로 입력됩니다.");
  };

  function applyLocationReferenceCoordinates(result) {
    const latitudeInput = document.getElementById("motfLocationReferenceLatitude");
    const longitudeInput = document.getElementById("motfLocationReferenceLongitude");
    const latitude = Number(result?.latitude);
    const longitude = Number(result?.longitude);
    if (!latitudeInput || !longitudeInput || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("주소의 좌표를 입력칸에 반영하지 못했습니다.");
    }
    latitudeInput.value = latitude.toFixed(7);
    longitudeInput.value = longitude.toFixed(7);
    latitudeInput.setAttribute("value", latitudeInput.value);
    longitudeInput.setAttribute("value", longitudeInput.value);
    [latitudeInput, longitudeInput].forEach((input) => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  window.motfSearchLocationReferenceAddress = async function searchLocationReferenceAddress() {
    try {
      const daum = await loadPostcodeApi();
      new daum.Postcode({
        oncomplete(data) {
          const address = data.roadAddress || data.address || "";
          const region = document.getElementById("motfLocationReferenceRegion");
          const addressInput = document.getElementById("motfLocationReferenceAddress");
          if (addressInput) addressInput.value = address;
          if (region) region.value = normalizeBusinessRegion(data.sigungu || data.sido || "", address);
          setLocationReferenceStatus("주소에서 좌표를 찾는 중입니다...");
          geocodeAddress(address).then((result) => {
            applyLocationReferenceCoordinates(result);
            if (addressInput && result.matchedAddress) addressInput.value = result.matchedAddress;
            setLocationReferenceStatus(`좌표 확인 완료 · ${result.matchedAddress}`, "success");
          }).catch((error) => setLocationReferenceStatus(error.message || "좌표를 찾지 못했습니다.", "error"));
        },
      }).open();
    } catch (error) {
      setLocationReferenceStatus(error.message || "주소 검색을 열지 못했습니다.", "error");
    }
  };

  window.motfSaveLocationReference = async function saveLocationReference(event) {
    event?.preventDefault?.();
    if (!client() || window.motfCurrentProfile?.role !== "admin") return alert("관리자 계정으로 로그인해주세요.");
    const id = document.getElementById("motfLocationReferenceId")?.value || "";
    const latitude = Number(document.getElementById("motfLocationReferenceLatitude")?.value);
    const longitude = Number(document.getElementById("motfLocationReferenceLongitude")?.value);
    const name = document.getElementById("motfLocationReferenceName")?.value.trim() || "";
    if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return alert("장소명과 좌표를 확인해주세요.");
    const payload = {
      reference_type: document.getElementById("motfLocationReferenceType")?.value || "station",
      name,
      region: normalizeBusinessRegion(
        document.getElementById("motfLocationReferenceRegion")?.value,
        document.getElementById("motfLocationReferenceAddress")?.value
      ) || null,
      latitude,
      longitude,
      is_active: Boolean(document.getElementById("motfLocationReferenceActive")?.checked),
    };
    setLocationReferenceStatus("기준 장소를 저장하는 중입니다...");
    const query = id
      ? client().from("location_reference_points").update(payload).eq("id", id)
      : client().from("location_reference_points").insert(payload);
    const { error } = await query;
    if (error) {
      setLocationReferenceStatus(error.message || "저장하지 못했습니다.", "error");
      return;
    }
    window.motfResetLocationReferenceForm();
    await window.loadMotfLocationReferencePoints();
    setLocationReferenceStatus("저장 완료 · 숙소별 최단거리가 자동으로 다시 계산됩니다.", "success");
  };

  window.motfEditLocationReference = function editLocationReference(id) {
    const point = locationReferencePoints.find((item) => item.id === id);
    if (!point) return;
    document.getElementById("motfLocationReferenceId").value = point.id;
    document.getElementById("motfLocationReferenceType").value = point.reference_type;
    document.getElementById("motfLocationReferenceName").value = point.name || "";
    document.getElementById("motfLocationReferenceRegion").value = point.region || "";
    document.getElementById("motfLocationReferenceAddress").value = "";
    document.getElementById("motfLocationReferenceLatitude").value = point.latitude;
    document.getElementById("motfLocationReferenceLongitude").value = point.longitude;
    document.getElementById("motfLocationReferenceActive").checked = Boolean(point.is_active);
    document.getElementById("motfLocationReferenceFormTitle").textContent = "기준 장소 수정";
    setLocationReferenceStatus("좌표를 직접 수정하거나 주소를 다시 검색할 수 있습니다.");
    document.getElementById("motfLocationReferenceForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  window.motfToggleLocationReference = async function toggleLocationReference(id, isActive) {
    if (!client() || window.motfCurrentProfile?.role !== "admin") return;
    const { error } = await client().from("location_reference_points").update({ is_active: Boolean(isActive) }).eq("id", id);
    if (error) return alert(error.message || "상태를 변경하지 못했습니다.");
    await window.loadMotfLocationReferencePoints();
  };

  window.motfDeleteLocationReference = async function deleteLocationReference(id) {
    if (!client() || window.motfCurrentProfile?.role !== "admin") return;
    const point = locationReferencePoints.find((item) => item.id === id);
    if (!confirm(`${point?.name || "이 기준 장소"}을 삭제하시겠습니까? 숙소 거리가 자동으로 다시 계산됩니다.`)) return;
    const { error } = await client().from("location_reference_points").delete().eq("id", id);
    if (error) return alert(error.message || "삭제하지 못했습니다.");
    window.motfResetLocationReferenceForm();
    await window.loadMotfLocationReferencePoints();
  };

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

  window.motfVerifyBusinessNumber = async function verifyBusinessNumber() {
    const number = String(document.getElementById("motfBusinessNumber")?.value || "").replace(/\D/g, "");
    const status = document.getElementById("motfBusinessNumberStatus");
    const button = document.getElementById("motfVerifyBusinessNumberButton");
    if (number.length !== 10) {
      alert("사업자등록번호 숫자 10자리를 입력해주세요.");
      return;
    }
    const { data: sessionData } = await client().auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("로그인이 만료되었습니다.");
    if (status) status.textContent = "국세청 사업자 상태를 확인하는 중입니다.";
    button?.setAttribute("disabled", "disabled");
    try {
      const response = await fetch("/api/verify-business-number", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ businessNumber: number, businessId: window.motfCurrentBusiness?.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "사업자 상태를 확인하지 못했습니다.");
      if (status) status.textContent = "영업 중인 사업자로 확인되었습니다. 운영팀 서류 대조 후 최종 인증됩니다.";
    } catch (error) {
      const message = error.message || "사업자 상태를 확인하지 못했습니다.";
      if (status) status.textContent = message;
      alert(message);
    } finally {
      button?.removeAttribute("disabled");
    }
  };

  function ensurePartnerFields() {
    let fields = document.querySelector("#motfBusinessFields");
    populateOwnerAccountFields();
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
        <small class="motf-field-status">휴대폰 본인확인은 KG이니시스 통합인증 연결 후 활성화됩니다.</small>
      </label>
      <label>사업자등록번호
        <span class="motf-address-search-row">
          <input id="motfBusinessNumber" maxlength="30" inputmode="numeric" placeholder="숫자 10자리" />
          <button type="button" id="motfVerifyBusinessNumberButton" class="motf-address-search-button" onclick="motfVerifyBusinessNumber()">상태 확인</button>
        </span>
        <small id="motfBusinessNumberStatus" class="motf-field-status">공공데이터포털의 무료 국세청 상태조회로 영업 여부를 확인합니다. 최종 인증은 운영팀이 서류와 대조합니다.</small>
      </label>
      <label>운영 지역
        <span id="motfBusinessRegionDisplay" class="motf-auto-region">주소를 검색하면 자동 설정됩니다.</span>
        <input id="motfBusinessRegion" type="hidden" />
        <small class="motf-field-status">선택한 주소의 행정구역을 기준으로 자동 분류됩니다.</small>
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
        <small class="motf-field-status">위치 확인은 도로명주소로만 진행하며 상세주소는 좌표 검색에 사용하지 않습니다.</small>
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

  function populateOwnerAccountFields() {
    const profile = window.motfCurrentProfile || {};
    const business = window.motfCurrentBusiness || {};
    const values = {
      motfOwnerEmail: profile.email || "",
      motfOwnerPhone: profile.phone || business.phone || "",
      motfSettlementHolder: business.representative_name || profile.full_name || "",
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input && !input.value) input.value = value || "";
    });
  }

  function updatePhotoPreview() {
    const preview = document.getElementById("motfPhotoUploadPreview");
    if (!preview) return;
    const urls = window.motfGetCurrentPhotoUrls?.() || [];
    if (!urls.length) {
      preview.classList.remove("active");
      preview.innerHTML = "";
      return;
    }
    preview.classList.add("active");
    preview.innerHTML = urls.map((url, index) => `<figure class="owner-photo-item">
      <img src="${escapeHtml(url)}" alt="등록된 사진 ${index + 1}">
      <figcaption>${index === 0 ? "대표사진" : `사진 ${index + 1}`}</figcaption>
      <div class="owner-photo-actions">
        ${index > 0 ? `<button type="button" title="대표사진으로 지정" onclick="motfMakeCoverPhoto(${index})"><i data-lucide="star"></i></button>` : ""}
        <button type="button" title="앞으로 이동" onclick="motfMovePhoto(${index},-1)" ${index === 0 ? "disabled" : ""}><i data-lucide="chevron-left"></i></button>
        <button type="button" title="뒤로 이동" onclick="motfMovePhoto(${index},1)" ${index === urls.length - 1 ? "disabled" : ""}><i data-lucide="chevron-right"></i></button>
        <button type="button" class="danger" title="사진 삭제" onclick="motfRemovePhoto(${index})"><i data-lucide="trash-2"></i></button>
      </div>
    </figure>`).join("");
    window.lucide?.createIcons();
  }

  window.motfRefreshPhotoPreview = updatePhotoPreview;

  async function persistCurrentPhotoUrls(urls) {
    const business = window.motfCurrentBusiness;
    const target = window.motfGetCurrentPhotoTarget?.();
    if (!business || !target) return;
    window.motfReplaceCurrentPhotoUrls?.(urls);
    if (target.type === "business") {
      const result = await client().from("businesses")
        .update({ cover_image_url: urls[0] || null, gallery_image_urls: urls, updated_at: new Date().toISOString() })
        .eq("id", business.id)
        .select(businessSelect)
        .single();
      if (result.error) throw result.error;
      window.motfCurrentBusiness = result.data;
    } else {
      const result = await client().rpc("save_business_offerings", {
        target_business_id: business.id,
        items: window.motfReadOfferingsFromDashboard?.() || [],
      });
      if (result.error) throw result.error;
    }
    updatePhotoPreview();
  }

  window.motfMovePhoto = async function movePhoto(index, direction) {
    const urls = [...(window.motfGetCurrentPhotoUrls?.() || [])];
    const nextIndex = index + direction;
    if (!urls[index] || nextIndex < 0 || nextIndex >= urls.length) return;
    [urls[index], urls[nextIndex]] = [urls[nextIndex], urls[index]];
    try { await persistCurrentPhotoUrls(urls); } catch (error) { console.error(error); alert("사진 순서를 저장하지 못했습니다."); }
  };
  window.motfMakeCoverPhoto = async function makeCoverPhoto(index) {
    const urls = [...(window.motfGetCurrentPhotoUrls?.() || [])];
    if (!urls[index]) return;
    urls.unshift(...urls.splice(index, 1));
    try { await persistCurrentPhotoUrls(urls); } catch (error) { console.error(error); alert("대표사진을 저장하지 못했습니다."); }
  };
  window.motfRemovePhoto = async function removePhoto(index) {
    const urls = [...(window.motfGetCurrentPhotoUrls?.() || [])];
    if (!urls[index] || !confirm("이 사진을 목록에서 삭제할까요?")) return;
    urls.splice(index, 1);
    try { await persistCurrentPhotoUrls(urls); } catch (error) { console.error(error); alert("사진을 삭제하지 못했습니다."); }
  };

  function renderNearbyChoices() {
    const area = document.getElementById("motfNearbyTagChoices");
    if (!area) return;
    area.innerHTML = nearbyOptions.map((item) => `<label class="owner-choice-chip ${selectedNearbyTags.has(item.key) ? "selected" : ""}"><input type="checkbox" value="${item.key}" ${selectedNearbyTags.has(item.key) ? "checked" : ""}><span>${item.label}</span></label>`).join("");
    area.querySelectorAll("input").forEach((input) => input.addEventListener("change", () => {
      if (input.checked) selectedNearbyTags.add(input.value); else selectedNearbyTags.delete(input.value);
      renderNearbyChoices();
    }));
  }

  function renderExtraFeeRows() {
    const area = document.getElementById("motfExtraFeeRows");
    if (!area) return;
    if (!extraFeeRows.length) extraFeeRows = [{ label: "", amount: null, detail: "", category: "optional" }];
    area.innerHTML = extraFeeRows.map((fee, index) => `<div class="owner-fee-row">
      <input value="${escapeHtml(fee.label || "")}" maxlength="40" placeholder="요금명 예: 바베큐장" data-fee-field="label" data-fee-index="${index}">
      <div class="money-input-wrap"><input value="${fee.amount ? Number(fee.amount).toLocaleString("ko-KR") : ""}" inputmode="numeric" placeholder="금액" data-fee-field="amount" data-fee-index="${index}"><span>원</span></div>
      <select data-fee-field="category" data-fee-index="${index}"><option value="optional" ${fee.category === "optional" ? "selected" : ""}>선택 요금</option><option value="confirmed" ${fee.category === "confirmed" ? "selected" : ""}>필수 요금</option><option value="onsite" ${fee.category === "onsite" ? "selected" : ""}>현장 확인</option></select>
      <input value="${escapeHtml(fee.detail || "")}" maxlength="100" placeholder="설명 예: 최대 30명" data-fee-field="detail" data-fee-index="${index}">
      <button type="button" class="icon-danger" onclick="motfRemoveExtraFeeRow(${index})" aria-label="요금 삭제"><i data-lucide="trash-2"></i></button>
    </div>`).join("");
    area.querySelectorAll("[data-fee-field]").forEach((input) => input.addEventListener("input", () => {
      const index = Number(input.dataset.feeIndex);
      const field = input.dataset.feeField;
      if (field === "amount") {
        const amount = Number(String(input.value).replace(/\D/g, "")) || null;
        extraFeeRows[index][field] = amount;
        input.value = amount ? amount.toLocaleString("ko-KR") : "";
      } else extraFeeRows[index][field] = input.value;
    }));
    window.lucide?.createIcons();
  }
  window.motfAddExtraFeeRow = () => { extraFeeRows.push({ label: "", amount: null, detail: "", category: "optional" }); renderExtraFeeRows(); };
  window.motfRemoveExtraFeeRow = (index) => { extraFeeRows.splice(index, 1); renderExtraFeeRows(); };

  function bindPhotoUpload() {
    const input = document.getElementById("motfPhotoUploadInput");
    if (!input || input.dataset.storageBound) return;
    input.dataset.storageBound = "true";
    input.addEventListener("change", async () => {
      const files = [...(input.files || [])];
      const business = window.motfCurrentBusiness;
      const profile = window.motfCurrentProfile;
      const target = window.motfGetCurrentPhotoTarget?.();
      if (!files.length || !business || !profile || !target) return;
      if (files.length > 10) {
        alert("사진은 한 번에 최대 10장까지 업로드할 수 있습니다.");
        input.value = "";
        return;
      }
      if (files.some((file) => !file.type.startsWith("image/"))) {
        alert("이미지 파일만 업로드할 수 있습니다.");
        input.value = "";
        return;
      }
      if (files.some((file) => file.size > 5 * 1024 * 1024)) {
        alert("사진은 한 장당 5MB 이하만 업로드할 수 있습니다.");
        input.value = "";
        return;
      }

      input.disabled = true;
      const uploadedUrls = [];
      for (const file of files) {
        const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const objectPath = `${profile.id}/${business.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await client().storage
          .from("catalog-images")
          .upload(objectPath, file, { cacheControl: "3600", upsert: false });
        if (uploadError) {
          console.error(uploadError);
          input.disabled = false;
          input.value = "";
          alert(`${file.name} 사진을 업로드하지 못했습니다.`);
          return;
        }
        const { data: publicData } = client().storage.from("catalog-images").getPublicUrl(objectPath);
        if (publicData?.publicUrl) uploadedUrls.push(publicData.publicUrl);
      }
      let saveError = null;

      if (target.type === "business") {
        const gallery = [...new Set([business.cover_image_url, ...(business.gallery_image_urls || []), ...uploadedUrls].filter(Boolean))];
        const result = await client().from("businesses")
          .update({ cover_image_url: gallery[0] || null, gallery_image_urls: gallery, updated_at: new Date().toISOString() })
          .eq("id", business.id)
          .select(businessSelect)
          .single();
        saveError = result.error;
        if (!saveError) window.motfCurrentBusiness = result.data;
      } else {
        window.motfSetCurrentPhotoUrls?.(uploadedUrls);
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
      updatePhotoPreview();
      alert(`${uploadedUrls.length}장의 사진이 저장되었습니다. 이용자 화면에도 반영됩니다.`);
    });
  }

  window.loadMotfPartnerBusiness = function loadMotfPartnerBusiness(business) {
    if (!business) return;
    ensurePartnerFields();
    populateOwnerAccountFields();
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
      motfShortDescription: business.short_description,
      motfRoomCount: business.room_count,
      motfBathCount: business.bath_count,
      motfSharedBathCount: business.shared_bathroom_count,
      motfSharedBathNote: business.shared_bathroom_note,
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input) input.value = value || "";
    });
    setBusinessRegion(business.region, business.address);
    const businessNumberStatus = document.getElementById("motfBusinessNumberStatus");
    if (businessNumberStatus) {
      businessNumberStatus.textContent = business.business_number_verification_status === "verified"
        ? "사업자등록번호 최종 인증이 완료되었습니다."
        : business.business_number_verification_status === "active_checked"
          ? "영업 중인 사업자로 확인되었습니다. 운영팀 서류 대조 후 최종 인증됩니다."
          : "국세청 영업 상태 확인 후 운영팀이 서류와 대조해 최종 인증합니다.";
    }
    const stayDetailFields = document.getElementById("motfStayDetailFields");
    if (stayDetailFields) stayDetailFields.hidden = business.business_type !== "stay";
    window.motfApplySeasonRangesToDashboard?.(
      business.shoulder_season_ranges || [],
      business.peak_season_ranges || []
    );
    const sharedBathSeparated = document.getElementById("motfSharedBathSeparated");
    if (sharedBathSeparated) sharedBathSeparated.checked = Boolean(business.shared_bathroom_gender_separated);
    window.motfApplyAmenityDetailsToDashboard?.(business.amenity_details || []);
    window.motfApplyHighlightKeysToDashboard?.(business.highlight_keys || []);
    selectedNearbyTags = new Set(business.nearby_tags || []);
    extraFeeRows = Array.isArray(business.extra_fees) ? business.extra_fees.map((item) => ({ ...item, category: item.category || "optional" })) : [];
    renderNearbyChoices();
    renderExtraFeeRows();
    const automaticDistances = document.getElementById("motfAutomaticDistances");
    if (automaticDistances) automaticDistances.innerHTML = [
      `<span>가까운 역: ${business.station_distance_m == null ? "기준 좌표 등록 후 자동 계산" : `${Number(business.station_distance_m).toLocaleString()}m`}</span>`,
      `<span>가까운 편의점: ${business.convenience_distance_m == null ? "기준 좌표 등록 후 자동 계산" : `${Number(business.convenience_distance_m).toLocaleString()}m`}</span>`,
    ].join("");
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
    const loadOfferings = async () => {
      let result = await client().from("offerings")
        .select("id, name, description, price, max_people, min_people, base_people, extra_person_fee, unit, category, image_url, image_urls, sort_order, feature_summary, amenity_details, detail_sections, origin, nutrition_info, is_alcohol, stock_quantity, is_active, offseason_weekday_price, offseason_weekend_price, shoulder_weekday_price, shoulder_weekend_price, peak_weekday_price, peak_weekend_price, bathroom_count, bathroom_gender_separated, bathroom_note")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("sort_order");

      // Keep the operating portal usable while optional detail columns are being migrated.
      if (result.error) {
        result = await client().from("offerings")
          .select("id, name, description, price, max_people, min_people, unit, category, image_url, sort_order")
          .eq("business_id", business.id)
          .order("sort_order");
      }

      if (result.error) {
        console.error("Failed to load offerings", result.error);
        return;
      }

      const offerings = result.data || [];
      window.motfApplyOfferingsToDashboard?.(offerings);
      updatePhotoPreview();
      const needsOnboarding = !business.region || !business.address || !business.description || !offerings.length;
      window.motfSetPartnerOnboarding?.(needsOnboarding);
    };
    loadOfferings();
  };

  window.saveMypageData = async function saveMypageDataToDatabase() {
    const business = window.motfCurrentBusiness;
    if (!business || !client()) {
      return originalSaveMypageData?.();
    }

    const seasonRanges = window.motfReadSeasonRangesFromDashboard?.() || { shoulder: [], peak: [] };
    const payload = {
      business_name: document.getElementById("motfBusinessName")?.value.trim(),
      representative_name: document.getElementById("motfRepresentativeName")?.value.trim(),
      phone: document.getElementById("motfBusinessPhone")?.value.trim() || null,
      business_number: document.getElementById("motfBusinessNumber")?.value.trim() || null,
      region: normalizeBusinessRegion(
        document.getElementById("motfBusinessRegion")?.value,
        document.getElementById("motfBusinessAddress")?.value
      ) || null,
      postal_code: document.getElementById("motfBusinessPostalCode")?.value.trim() || null,
      address: document.getElementById("motfBusinessAddress")?.value.trim() || null,
      address_detail: document.getElementById("motfBusinessAddressDetail")?.value.trim() || null,
      description: document.getElementById("editDescInput")?.value.trim() || null,
      short_description: document.getElementById("motfShortDescription")?.value.trim()
        || document.getElementById("editDescInput")?.value.trim().slice(0, 140)
        || null,
      highlight_keys: window.motfReadHighlightKeysFromDashboard?.() || [],
      facilities: window.motfReadFacilitiesFromDashboard?.() || [],
      nearby_tags: [...selectedNearbyTags],
      shared_bathroom_count: Number(document.getElementById("motfSharedBathCount")?.value || 0),
      shared_bathroom_gender_separated: Boolean(document.getElementById("motfSharedBathSeparated")?.checked),
      shared_bathroom_note: document.getElementById("motfSharedBathNote")?.value.trim() || null,
      shoulder_season_ranges: seasonRanges.shoulder,
      peak_season_ranges: seasonRanges.peak,
      amenity_details: window.motfReadAmenityDetailsFromDashboard?.() || [],
      extra_fees: extraFeeRows.filter((item) => item.label).map((item) => ({ label: item.label.trim(), amount: Number(item.amount) || null, detail: item.detail?.trim() || null, category: item.category || "optional" })),
      updated_at: new Date().toISOString(),
    };
    const ownerPhone = document.getElementById("motfOwnerPhone")?.value.trim() || null;

    if (!payload.business_name || !payload.representative_name || !payload.region || !payload.address || !payload.description) {
      alert("업장명, 대표자명, 주소와 소개 문구를 모두 입력해주세요. 운영 지역은 주소에서 자동 설정됩니다.");
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
      const businessResult = await client().from("businesses")
        .update(payload)
        .eq("id", business.id)
        .select(businessSelect)
        .single();
      if (businessResult.error) throw businessResult.error;
      const [offeringResult, profileResult] = await Promise.all([
        client().rpc("save_business_offerings", {
          target_business_id: business.id,
          items: offeringItems,
        }),
        ownerPhone
          ? client().from("profiles").update({ phone: ownerPhone, updated_at: new Date().toISOString() }).eq("id", window.motfCurrentProfile?.id)
          : Promise.resolve({ error: null }),
      ]);
      if (offeringResult.error || profileResult.error) throw offeringResult.error || profileResult.error;
      await Promise.all([
        client().rpc("refresh_business_nearby_distances", { target_business_id: business.id }),
        client().rpc("refresh_business_highlights", { target_business_id: business.id }),
      ]);
      const refreshed = await client().from("businesses").select(businessSelect).eq("id", business.id).single();
      if (refreshed.error) throw refreshed.error;

      const data = refreshed.data;
      window.motfCurrentBusiness = data;
      if (window.motfCurrentProfile && ownerPhone) window.motfCurrentProfile.phone = ownerPhone;
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
  let adminSettlements = [];
  const transactionStatus = {
    pending: "확정 대기",
    confirmed: "확정",
    rejected: "거절",
    cancelled: "취소",
    completed: "완료",
  };
  const refundStatus = {
    required: "환불 예정",
    processing: "환불 처리 중",
    refunded: "환불 완료",
    failed: "환불 확인 필요",
  };
  function transactionDisplayStatus(item) {
    if (item.refundStatus && item.refundStatus !== "none") return refundStatus[item.refundStatus] || item.refundStatus;
    if (item.status === "virtual_account_issued") return "입금 대기";
    return transactionStatus[item.status] || item.status;
  }

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
    const refundLabel = item.refundStatus && item.refundStatus !== "none" ? refundStatus[item.refundStatus] || item.refundStatus : "";
    const readOnlyPaymentIntent = item.kind === "payment_intent" || item.status === "virtual_account_issued";
    const extraChargeButton = item.kind === "stay" && ["confirmed", "completed"].includes(item.status)
      ? `<button class="secondary-btn compact" onclick="motfOpenExtraChargeDialog('${item.id}')"><i data-lucide="receipt-text"></i>추가금 요청</button>`
      : "";
    const actions = readOnlyPaymentIntent ? `
      <span class="master-status-badge master-badge-waiting">입금 대기</span>
    ` : pending ? `
      <div class="item-actions">
        <button class="mypage-btn" style="background:var(--olive-soft);color:var(--teal-dark);" onclick="motfProcessTransaction('${item.kind}','${item.id}','confirmed')">${admin ? "운영팀 " : ""}확정</button>
        <button class="motf-reject-action-btn" onclick="motfProcessTransaction('${item.kind}','${item.id}','rejected')">${admin ? "운영팀 " : ""}거절</button>
      </div>
    ` : `<div class="item-actions"><span class="master-status-badge ${item.status === "rejected" ? "master-badge-terminated" : "master-badge-active"}">${refundLabel || transactionStatus[item.status] || item.status}</span>${extraChargeButton}</div>`;
    return `
      <div class="item-card">
        <div style="flex:1;">
          <div style="font-size:12px;color:var(--teal);font-weight:700;margin-bottom:5px;">${escapeHtml(item.businessName)}</div>
          <h4>${escapeHtml(item.customerName)}</h4>
          <p>${escapeHtml(item.date)} · ${escapeHtml(item.target)} · ${Number(item.amount).toLocaleString()}원</p>
          ${item.rejectReason ? `<p style="color:#b91c1c;">거절 사유: ${escapeHtml(item.rejectReason)}</p>` : ""}
          ${refundLabel ? `<p style="color:#b45309;">${escapeHtml(refundLabel)}${item.refundAmount ? ` · ${Number(item.refundAmount).toLocaleString()}원` : ""}</p>` : ""}
        </div>
        ${actions}
      </div>
    `;
  }

  function pendingIntentBusinessId(item = {}) {
    return String(item.business_id || item.draft?.business_id || item.draft?.businessId || "");
  }

  function pendingIntentTarget(item = {}) {
    const draft = item.draft || {};
    if (item.kind === "market") {
      const items = Array.isArray(draft.items) ? draft.items : [];
      const label = items
        .map((row) => `${row.item_name || row.name || "상품"} ${row.quantity || 1}개`)
        .join(", ");
      return label || item.order_name || "공판장 주문";
    }
    return draft.offering_name || item.order_name || "숙소 예약";
  }

  function pendingIntentToTransaction(item = {}, businessName = "입금 대기") {
    const draft = item.draft || {};
    const issuedDate = String(item.virtual_account_issued_at || item.created_at || "").slice(0, 10);
    const pickupTime = String(draft.pickup_time || "").slice(0, 5);
    const customerName = draft.group_name
      ? `${draft.customer_name || "이용자"} (${draft.group_name})`
      : draft.customer_name || "이용자";
    return {
      kind: "payment_intent",
      sourceKind: item.kind,
      id: item.order_id,
      businessId: pendingIntentBusinessId(item),
      businessName,
      customerName,
      date: item.kind === "market"
        ? `${issuedDate} ${pickupTime}`.trim()
        : draft.event_date || issuedDate,
      target: pendingIntentTarget(item),
      amount: item.amount,
      status: item.status,
      rejectReason: "",
      refundStatus: "none",
      refundAmount: null,
    };
  }

  function blockSourceLabel(source) {
    return {
      manual: "수동 차단",
      pending_payment: "입금 대기",
      motf: "예약 확정",
      external_ical: "외부 일정",
      external_api: "외부 연동",
    }[source] || source || "-";
  }

  async function loadStayAvailabilityData(businessId = null) {
    if (!client()) return { offerings: [], blocks: [] };
    let offeringQuery = client()
      .from("offerings")
      .select("id, business_id, name, is_active, businesses(id, business_name, business_type)")
      .eq("is_active", true)
      .order("sort_order");
    let blockQuery = client()
      .from("stay_availability_blocks")
      .select("id, business_id, offering_id, start_date, end_date, source, note, status, offerings(name), businesses(business_name)")
      .eq("status", "active")
      .order("start_date", { ascending: true });

    if (businessId) {
      offeringQuery = offeringQuery.eq("business_id", businessId);
      blockQuery = blockQuery.eq("business_id", businessId);
    }

    const [offeringResult, blockResult] = await Promise.all([offeringQuery, blockQuery]);
    if (offeringResult.error || blockResult.error) {
      console.warn("Could not load stay availability data.", offeringResult.error || blockResult.error);
      return { offerings: [], blocks: [] };
    }

    return {
      offerings: (offeringResult.data || []).filter((item) => item.businesses?.business_type === "stay"),
      blocks: blockResult.data || [],
    };
  }

  function availabilityBoxHtml(scope, offerings, blocks) {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const options = offerings.length
      ? offerings.map((item) => `<option value="${item.id}">${escapeHtml(item.businesses?.business_name || "숙소")} · ${escapeHtml(item.name || "객실")}</option>`).join("")
      : '<option value="">등록된 숙소 객실 없음</option>';
    const rows = blocks.length
      ? blocks.map((block) => `<tr>
          <td>${escapeHtml(block.businesses?.business_name || "-")}</td>
          <td>${escapeHtml(block.offerings?.name || "-")}</td>
          <td>${escapeHtml(block.start_date)} ~ ${escapeHtml(block.end_date)}</td>
          <td>${escapeHtml(blockSourceLabel(block.source))}</td>
          <td>${escapeHtml(block.note || "-")}</td>
          <td>${block.source === "manual" ? `<button class="motf-reject-action-btn" style="padding:5px 9px;font-size:12px;" onclick="motfCancelAvailabilityBlock('${block.id}', '${scope}')">해제</button>` : '<span class="master-status-badge master-badge-waiting">자동</span>'}</td>
        </tr>`).join("")
      : '<tr class="motf-admin-empty-row"><td colspan="6">현재 활성화된 방막기 내역이 없습니다.</td></tr>';

    return `
      <div class="info-panel" style="margin-bottom:18px;">
        <div class="section-toolbar" style="margin-bottom:12px;">
          <h3 style="margin:0;">수동 공실/품절 관리</h3>
          <span>외부 예약이나 전화 예약이 들어오면 여기서 직접 방을 막아둘 수 있습니다.</span>
        </div>
        <div class="admin-filter-row">
          <select id="${scope}AvailabilityOffering">${options}</select>
          <input id="${scope}AvailabilityStart" type="date" value="${today}" />
          <input id="${scope}AvailabilityEnd" type="date" value="${tomorrow}" />
          <input id="${scope}AvailabilityNote" placeholder="메모 예: 네이버 예약, 전화 예약" />
          <button class="primary-btn" type="button" onclick="motfCreateAvailabilityBlock('${scope}')">품절 처리</button>
        </div>
        <table class="master-admin-table">
          <thead><tr><th>숙소</th><th>객실</th><th>기간</th><th>상태</th><th>메모</th><th>관리</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  async function renderAvailabilityManager(scope, businessId = null) {
    const targetId = scope === "master" ? "masterOrderListArea" : "orderListArea";
    const list = document.getElementById(targetId);
    if (!list) return;
    let box = document.getElementById(`${scope}AvailabilityManager`);
    if (!box) {
      box = document.createElement("div");
      box.id = `${scope}AvailabilityManager`;
      list.parentElement?.insertBefore(box, list);
    }
    const { offerings, blocks } = await loadStayAvailabilityData(businessId);
    box.innerHTML = availabilityBoxHtml(scope, offerings, blocks);
    if (scope === "partner") window.motfApplyAvailabilityCalendarData?.({ offerings, blocks });
  }

  window.motfRenderAvailabilityManager = renderAvailabilityManager;

  window.motfOpenAvailabilityForDate = async function openAvailabilityForDate(date, offeringId = "") {
    window.switchPanel?.("availability");
    await renderAvailabilityManager("partner", window.motfCurrentBusiness?.id);
    const start = document.getElementById("partnerAvailabilityStart");
    const end = document.getElementById("partnerAvailabilityEnd");
    const offering = document.getElementById("partnerAvailabilityOffering");
    const next = new Date(`${date}T00:00:00`);
    next.setDate(next.getDate() + 1);
    if (start) start.value = date;
    if (end) end.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    if (offeringId && offering) offering.value = offeringId;
    document.getElementById("partnerAvailabilityManager")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  window.motfCreateAvailabilityBlock = async function motfCreateAvailabilityBlock(scope) {
    const offeringId = document.getElementById(`${scope}AvailabilityOffering`)?.value;
    const startDate = document.getElementById(`${scope}AvailabilityStart`)?.value;
    const endDate = document.getElementById(`${scope}AvailabilityEnd`)?.value;
    const note = document.getElementById(`${scope}AvailabilityNote`)?.value || "";
    if (!offeringId || !startDate || !endDate || startDate >= endDate) {
      alert("객실과 올바른 날짜 범위를 선택해주세요.");
      return;
    }
    const { error } = await client().rpc("create_stay_manual_block", {
      target_offering_id: offeringId,
      target_check_in: startDate,
      target_check_out: endDate,
      block_note: note,
    });
    if (error) {
      console.error(error);
      alert(error.message || "품절 처리에 실패했습니다.");
      return;
    }
    if (scope === "master") await renderAvailabilityManager("master", null);
    else await renderAvailabilityManager("partner", window.motfCurrentBusiness?.id);
    alert("선택한 기간이 품절 처리되었습니다.");
  };

  window.motfCancelAvailabilityBlock = async function motfCancelAvailabilityBlock(blockId, scope) {
    if (!confirm("이 수동 품절 처리를 해제할까요?")) return;
    const { error } = await client().rpc("cancel_stay_availability_block", {
      target_block_id: blockId,
    });
    if (error) {
      console.error(error);
      alert("품절 해제에 실패했습니다.");
      return;
    }
    if (scope === "master") await renderAvailabilityManager("master", null);
    else await renderAvailabilityManager("partner", window.motfCurrentBusiness?.id);
  };

  window.loadMotfPartnerTransactions = async function loadMotfPartnerTransactions(business = window.motfCurrentBusiness) {
    if (!client() || !business) return;
    const table = business.business_type === "market" ? "market_orders" : "reservations";
    const fields = business.business_type === "market"
      ? "id, customer_name, pickup_time, total_amount, status, reject_reason, refund_status, refund_amount, created_at, market_order_items(item_name, quantity)"
      : "id, customer_name, group_name, event_date, offering_name, total_amount, status, reject_reason, refund_status, refund_amount";
    const { data, error } = await client().from(table).select(fields).eq("business_id", business.id).order("created_at", { ascending: false });
    if (error) return console.error(error);
    const { data: pendingIntents, error: pendingIntentError } = await client().rpc("list_pending_payment_intents", {
      target_business_id: business.id,
    });
    if (pendingIntentError) console.warn("Could not load pending payment intents.", pendingIntentError);
    const pendingPaymentRows = (pendingIntents || [])
      .filter((item) => item.kind === (business.business_type === "market" ? "market" : "stay"))
      .map((item) => pendingIntentToTransaction(item, item.business_name || business.business_name));
    partnerTransactions = [
      ...pendingPaymentRows,
      ...(data || []).map((item) => ({
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
      refundStatus: item.refund_status,
      refundAmount: item.refund_amount,
      })),
    ];
    mockData[currentOwnerType].orders = partnerTransactions.map((item) => ({
      id: item.id,
      user: item.customerName,
      date: String(item.date || "").slice(0, 10),
      target: item.target,
      price: Number(item.amount || 0),
      status: item.status,
      rejectReason: item.rejectReason || "",
      refundStatus: item.refundStatus || "none",
      refundAmount: item.refundAmount || null,
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
    if (business.business_type === "stay") {
      const availability = await loadStayAvailabilityData(business.id);
      window.motfApplyAvailabilityCalendarData?.(availability);
    }
    window.renderCalendar?.();
    window.renderOrders();
    window.loadMotfPartnerExtraCharges?.();
  };

  window.renderOrders = function renderDatabaseOrders() {
    if (!window.motfCurrentBusiness) return originalRenderOrders?.();
    const area = document.getElementById("orderListArea");
    if (!area) return;
    const activeStatus = activePartnerOrderStatus();
    const rows = partnerTransactions.filter((item) => activeStatus === "pending"
      ? ["pending", "virtual_account_issued"].includes(item.status)
      : item.status === activeStatus);
    area.innerHTML = rows.length
      ? rows.map((item) => transactionCard(item)).join("")
      : '<p style="padding:24px;text-align:center;color:var(--muted);">조건에 맞는 실제 요청이 없습니다.</p>';
  };

  window.loadMotfAdminTransactions = async function loadMotfAdminTransactions() {
    if (!client() || window.motfCurrentProfile?.role !== "admin") return;
    const [businessResult, reservationResult, orderResult, intentResult] = await Promise.all([
      client().from("businesses").select("id, business_name, business_type"),
      client().from("reservations").select("id, business_id, customer_name, group_name, event_date, offering_name, total_amount, status, reject_reason, refund_status, refund_amount, created_at").order("created_at", { ascending: false }),
      client().from("market_orders").select("id, business_id, customer_name, pickup_time, total_amount, status, reject_reason, refund_status, refund_amount, created_at, market_order_items(item_name, quantity)").order("created_at", { ascending: false }),
      client().rpc("list_pending_payment_intents", { target_business_id: null }),
    ]);
    if (businessResult.error || reservationResult.error || orderResult.error || intentResult.error) return console.error(businessResult.error || reservationResult.error || orderResult.error || intentResult.error);
    const businesses = businessResult.data || [];
    const nameOf = (id) => businesses.find((item) => item.id === id)?.business_name || "업장";
    adminTransactions = [
      ...(intentResult.data || []).filter((item) => item.kind !== "extra_charge").map((item) => pendingIntentToTransaction(item, nameOf(pendingIntentBusinessId(item)))),
      ...(reservationResult.data || []).map((item) => ({ kind:"stay", id:item.id, businessId:item.business_id, businessName:nameOf(item.business_id), customerName:item.group_name ? `${item.customer_name} (${item.group_name})` : item.customer_name, date:item.event_date, target:item.offering_name, amount:item.total_amount, status:item.status, rejectReason:item.reject_reason, refundStatus:item.refund_status, refundAmount:item.refund_amount })),
      ...(orderResult.data || []).map((item) => ({ kind:"market", id:item.id, businessId:item.business_id, businessName:nameOf(item.business_id), customerName:item.customer_name, date:`${String(item.created_at || "").slice(0,10)} ${String(item.pickup_time || "").slice(0,5)}`.trim(), target:(item.market_order_items || []).map((row)=>`${row.item_name} ${row.quantity}개`).join(", "), amount:item.total_amount, status:item.status, rejectReason:item.reject_reason, refundStatus:item.refund_status, refundAmount:item.refund_amount })),
    ];
    const filter = document.getElementById("masterOrderPartnerFilter");
    if (filter) filter.innerHTML = '<option value="all">전체 파트너</option>' + businesses.map((item) => `<option value="${item.id}">${escapeHtml(item.business_name)}</option>`).join("");
    renderAdminTransactionSummary();
    window.renderMasterOrders();
    loadMotfAdminSettlements();
    window.loadMotfAdminExtraCharges?.();
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
              <td>${escapeHtml(transactionDisplayStatus(item))}</td>
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

  async function loadMotfAdminSettlements() {
    if (!client() || window.motfCurrentProfile?.role !== "admin") return;
    const { data, error } = await client().rpc("list_partner_settlements");
    if (error) {
      console.warn("Could not load partner settlements.", error);
      adminSettlements = [];
    } else {
      adminSettlements = data || [];
    }
    renderMotfAdminSettlements();
  }

  function renderMotfAdminSettlements() {
    const body = document.getElementById("masterSettlementTableBody");
    if (!body) return;
    const pending = adminSettlements.filter((item) => item.status === "pending");
    const paid = adminSettlements.filter((item) => item.status === "paid");
    const gross = adminSettlements.reduce((sum, item) => sum + Number(item.gross_amount || 0), 0);
    const fee = adminSettlements.reduce((sum, item) => sum + Number(item.commission_amount || 0), 0);
    const rows = [...pending, ...paid];

    body.innerHTML = rows.length
      ? rows.map((item) => {
          const rate = `${(Number(item.commission_rate || 0) * 100).toFixed(0)}%`;
          const label = item.transaction_kind === "market" ? "공판장" : item.transaction_kind === "extra_charge" ? "숙소 추가금" : "숙소";
          const status = item.status === "paid"
            ? `<span class="master-status-badge master-badge-active">정산 완료</span>`
            : `<button class="primary-btn" style="padding:6px 12px; font-size:13px; background-color:#d97706;" onclick="motfMarkSettlementPaid('${item.id}')">정산 완료처리</button>`;
          return `<tr>
            <td><strong>${escapeHtml(item.business_name || "업장")}</strong><br><small>${label} · ${escapeHtml(item.customer_name || "-")} · ${escapeHtml(item.target_name || "-")}</small></td>
            <td>${rate}</td>
            <td>${Number(item.gross_amount || 0).toLocaleString()}원</td>
            <td style="color:#b91c1c;">${Number(item.commission_amount || 0).toLocaleString()}원</td>
            <td style="font-weight:700; color:var(--teal-dark);">${Number(item.payout_amount || 0).toLocaleString()}원</td>
            <td>${status}</td>
          </tr>`;
        }).join("")
      : '<tr class="motf-admin-empty-row"><td colspan="6">확정된 예약/주문 기준 정산 건이 아직 없습니다.</td></tr>';

    const gmvNode = document.getElementById("m-stat-gmv");
    const feeNode = document.getElementById("m-stat-fee");
    if (gmvNode) gmvNode.textContent = `${gross.toLocaleString()}원`;
    if (feeNode) feeNode.textContent = `${fee.toLocaleString()}원`;

  }

  window.motfMarkSettlementPaid = async function motfMarkSettlementPaid(id) {
    const note = prompt("정산 메모를 입력해주세요. 비워도 됩니다.") || "";
    const { error } = await client().rpc("mark_partner_settlement_paid", {
      target_settlement_id: id,
      payment_note: note,
    });
    if (error) {
      console.error(error);
      alert("정산 완료처리에 실패했습니다.");
      return;
    }
    await loadMotfAdminSettlements();
    alert("정산 완료로 처리했습니다.");
  };

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
    renderAvailabilityManager("master", null);
    const businessFilter = document.getElementById("masterOrderPartnerFilter")?.value || "all";
    const rawStatus = document.getElementById("masterOrderStatusFilter")?.value || "all";
    const statusMap = { confirm:"confirmed", past:"completed", reject:"rejected" };
    const statusFilter = statusMap[rawStatus] || rawStatus;
    const rows = adminTransactions.filter((item) => {
      const matchesBusiness = businessFilter === "all" || item.businessId === businessFilter;
      const matchesStatus = statusFilter === "all" || item.status === statusFilter || (statusFilter === "pending" && item.status === "virtual_account_issued");
      return matchesBusiness && matchesStatus;
    });
    area.innerHTML = rows.length ? rows.map((item) => transactionCard(item, true)).join("") : '<p style="padding:24px;text-align:center;color:var(--muted);">조건에 맞는 실제 요청이 없습니다.</p>';
  };

  window.motfProcessTransaction = async function motfProcessTransaction(kind, id, status) {
    let reason = null;
    if (status === "rejected") {
      reason = prompt("거절 사유를 입력해주세요.")?.trim();
      if (!reason) return;
    }
    if (!confirm(status === "confirmed" ? "이 요청을 확정할까요?" : "이 요청을 거절할까요?")) return;
    if (status === "rejected") {
      const { data: sessionData } = await client().auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) return alert("로그인이 만료되었습니다. 다시 로그인해주세요.");
      const response = await fetch("/api/refund-transaction", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ kind, id, reason }),
      });
      const result = await response.json().catch(() => null);
      if (window.motfCurrentProfile?.role === "admin") await window.loadMotfAdminTransactions();
      else await window.loadMotfPartnerTransactions();
      if (!response.ok || !result?.ok) {
        return alert(result?.message || "거절은 처리됐지만 자동 환불 요청에 실패했습니다. 관리자 확인이 필요합니다.");
      }
      alert(result.message || "거절 및 자동 환불 요청이 처리되었습니다.");
      return;
    }
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
  let partnerPresenceTimer = 0;
  let partnerPresenceConversationId = "";

  function mapMessages(messages = [], support = false) {
    return [...messages]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((message) => ({
        id: message.id,
        type: support ? (message.sender_role === "admin" ? "in" : "out") : (message.sender_role === "user" ? "in" : "out"),
        role: message.sender_role,
        text: message.body,
        createdAt: message.created_at,
      }));
  }

  function selectedPartnerConversationId() {
    return mockData[currentOwnerType]?.chats
      ?.find((item) => item.user === currentSelectedChatUser)
      ?.conversationId || "";
  }

  function isPartnerChatVisible() {
    return window.motfCurrentProfile?.role === "partner"
      && currentActivePanel === "chat"
      && document.visibilityState === "visible"
      && Boolean(selectedPartnerConversationId());
  }

  async function setPartnerPresence(conversationId, isActive) {
    if (!client() || !conversationId) return;
    const { error } = await client().rpc("set_chat_presence", {
      target_conversation_id: conversationId,
      is_active: isActive,
    });
    if (error) console.error(error);
  }

  function stopPartnerPresence() {
    window.clearInterval(partnerPresenceTimer);
    partnerPresenceTimer = 0;
    const previousId = partnerPresenceConversationId;
    partnerPresenceConversationId = "";
    if (previousId) void setPartnerPresence(previousId, false);
  }

  async function syncPartnerConversation({ markRead = true } = {}) {
    const conversationId = selectedPartnerConversationId();
    if (!isPartnerChatVisible() || !conversationId) {
      stopPartnerPresence();
      return;
    }

    if (partnerPresenceConversationId && partnerPresenceConversationId !== conversationId) {
      void setPartnerPresence(partnerPresenceConversationId, false);
    }
    partnerPresenceConversationId = conversationId;

    if (markRead) {
      const { error } = await client().rpc("mark_conversation_read", {
        target_conversation_id: conversationId,
      });
      if (error) console.error(error);
    } else {
      await setPartnerPresence(conversationId, true);
    }

    window.clearInterval(partnerPresenceTimer);
    partnerPresenceTimer = window.setInterval(() => {
      if (!isPartnerChatVisible() || selectedPartnerConversationId() !== partnerPresenceConversationId) {
        stopPartnerPresence();
        return;
      }
      void setPartnerPresence(partnerPresenceConversationId, true);
    }, 45_000);
  }

  window.motfSyncPartnerChatPresence = syncPartnerConversation;

  window.loadMotfPartnerChats = async function loadMotfPartnerChats(business = window.motfCurrentBusiness) {
    if (!client() || !business) return;
    const selectedConversationId = selectedPartnerConversationId();
    const { data: supportConversationId, error: supportStartError } = await client().rpc("start_support_conversation");
    if (supportStartError) console.warn("Could not prepare support conversation.", supportStartError);
    const businessQuery = client().from("conversations")
      .select("id, customer_name, group_name, last_message_at, messages(id, sender_role, body, created_at)")
      .eq("business_id", business.id)
      .order("last_message_at", { ascending: false });
    const supportQuery = supportConversationId
      ? client().from("conversations").select("id, customer_name, group_name, last_message_at, messages(id, sender_role, body, created_at)").eq("id", supportConversationId).limit(1)
      : Promise.resolve({ data: [], error: null });
    const [businessResult, supportResult] = await Promise.all([businessQuery, supportQuery]);
    if (businessResult.error || supportResult.error) return console.error(businessResult.error || supportResult.error);
    const businessChats = (businessResult.data || []).map((conversation) => {
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
    const supportChats = (supportResult.data || []).map((conversation) => {
      const messages = mapMessages(conversation.messages, true);
      return {
        conversationId: conversation.id,
        user: "모티프 운영팀",
        status: "항상 상단 고정",
        preview: messages.at(-1)?.text || "운영 관련 문의를 남겨주세요.",
        messages,
        isSupport: true,
      };
    });
    const chats = [...supportChats, ...businessChats];
    mockData[currentOwnerType].chats = chats;
    currentSelectedChatUser = chats.find((item) => item.conversationId === selectedConversationId)?.user
      || chats[0]?.user
      || "";
    window.renderChatList?.();
    window.renderChatMessages?.();
    await syncPartnerConversation({ markRead: true });
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

  const extraChargeStatusLabels = {
    submitted: "운영팀 검토 중",
    approved: "이용자 결제 요청",
    payment_prepared: "결제 준비",
    payment_pending: "입금 대기",
    paid: "입금 완료",
    rejected: "검토 반려",
    cancelled: "취소",
    expired: "기한 만료",
  };

  const extraChargeCategories = [
    ["additional_person", "추가인원"],
    ["barbecue", "야외바베큐"],
    ["pool", "수영장"],
    ["karaoke", "노래방/마이크"],
    ["screen", "TV/화면"],
    ["pickup", "픽업"],
    ["other", "기타"],
  ];

  function extraChargeItemsHtml(items = []) {
    return `<ul class="extra-charge-items">${items.map((item) => `<li>${escapeHtml(item.label || "추가 이용금")} · ${Number(item.quantity || 1).toLocaleString()} × ${Number(item.unit_amount || 0).toLocaleString()}원${item.note ? ` · ${escapeHtml(item.note)}` : ""}</li>`).join("")}</ul>`;
  }

  function extraChargeCard(item, admin = false) {
    const statusClass = ["paid", "approved"].includes(item.status) ? "master-badge-active" : ["rejected", "expired", "cancelled"].includes(item.status) ? "master-badge-terminated" : "master-badge-waiting";
    const reviewActions = admin && item.status === "submitted" ? `
      <div class="item-actions">
        <button class="primary-btn" onclick="motfReviewExtraCharge('${item.id}','approved')">승인·결제 요청</button>
        <button class="motf-reject-action-btn" onclick="motfReviewExtraCharge('${item.id}','rejected')">반려</button>
      </div>` : `<span class="master-status-badge ${statusClass}">${extraChargeStatusLabels[item.status] || item.status}</span>`;
    return `<article class="item-card">
      <div class="item-info" style="flex:1;">
        <div style="font-size:12px;color:var(--teal);font-weight:700;margin-bottom:5px;">${escapeHtml(item.businesses?.business_name || window.motfCurrentBusiness?.business_name || "숙소")}</div>
        <h4>${escapeHtml(item.reservations?.customer_name || "이용자")} · ${escapeHtml(item.reservations?.offering_name || "객실")}</h4>
        <p>${escapeHtml(item.reservations?.event_date || "")} · 요청 ${new Date(item.created_at).toLocaleString("ko-KR")}</p>
        ${extraChargeItemsHtml(item.items)}
        ${item.owner_note ? `<p>사장님 메모: ${escapeHtml(item.owner_note)}</p>` : ""}
        ${item.review_note ? `<p style="color:#b45309;">운영팀 메모: ${escapeHtml(item.review_note)}</p>` : ""}
        <div class="extra-charge-status-line"><strong>${Number(item.total_amount || 0).toLocaleString()}원</strong>${item.due_at ? `<span>결제 기한 ${new Date(item.due_at).toLocaleString("ko-KR")}</span>` : ""}</div>
      </div>${reviewActions}
    </article>`;
  }

  async function loadExtraCharges(targetBusinessId = null) {
    let query = client().from("reservation_extra_charge_requests")
      .select("id, reservation_id, business_id, customer_id, items, total_amount, owner_note, review_note, status, due_at, paid_at, created_at, businesses(business_name), reservations(customer_name, offering_name, event_date)")
      .order("created_at", { ascending: false });
    if (targetBusinessId) query = query.eq("business_id", targetBusinessId);
    const { data, error } = await query;
    if (error) { console.error("Failed to load extra charges", error); return []; }
    return data || [];
  }

  window.loadMotfPartnerExtraCharges = async function loadMotfPartnerExtraCharges() {
    if (!client() || !window.motfCurrentBusiness || window.motfCurrentProfile?.role !== "partner") return;
    const section = document.getElementById("partnerExtraChargeSection");
    const list = document.getElementById("partnerExtraChargeList");
    if (!section || !list || window.motfCurrentBusiness.business_type !== "stay") return;
    section.hidden = false;
    const rows = await loadExtraCharges(window.motfCurrentBusiness.id);
    list.innerHTML = rows.length ? rows.map((item) => extraChargeCard(item)).join("") : '<p style="padding:18px 0;color:var(--muted);">아직 요청한 추가 이용금이 없습니다.</p>';
    window.lucide?.createIcons();
  };

  window.loadMotfAdminExtraCharges = async function loadMotfAdminExtraCharges() {
    if (!client() || window.motfCurrentProfile?.role !== "admin") return;
    const list = document.getElementById("adminExtraChargeList");
    if (!list) return;
    const rows = await loadExtraCharges();
    list.innerHTML = rows.length ? rows.map((item) => extraChargeCard(item, true)).join("") : '<p style="padding:18px 0;color:var(--muted);">검토할 추가 이용금 요청이 없습니다.</p>';
    window.lucide?.createIcons();
  };

  window.motfOpenExtraChargeDialog = function motfOpenExtraChargeDialog(reservationId) {
    const source = [...partnerTransactions, ...adminTransactions].find((item) => item.kind === "stay" && item.id === reservationId);
    if (!source) return alert("확정 예약 정보를 찾지 못했습니다.");
    document.getElementById("motfExtraChargeReservationId").value = reservationId;
    document.getElementById("motfExtraChargeReservationSummary").innerHTML = `<strong>${escapeHtml(source.businessName)} · ${escapeHtml(source.target)}</strong><br>${escapeHtml(source.customerName)} · ${escapeHtml(source.date)}`;
    document.getElementById("motfExtraChargeRows").innerHTML = "";
    document.getElementById("motfExtraChargeNote").value = "";
    document.getElementById("motfExtraChargeDueAt").value = "";
    window.motfAddExtraChargeRow("additional_person", "추가인원");
    document.getElementById("motfExtraChargeDialog").showModal();
    window.lucide?.createIcons();
  };

  window.motfAddExtraChargeRow = function motfAddExtraChargeRow(category = "other", label = "") {
    const rows = document.getElementById("motfExtraChargeRows");
    if (!rows) return;
    const row = document.createElement("div");
    row.className = "extra-charge-form-row";
    row.innerHTML = `
      <select data-extra-category>${extraChargeCategories.map(([value, text]) => `<option value="${value}" ${value === category ? "selected" : ""}>${text}</option>`).join("")}</select>
      <input data-extra-label maxlength="60" value="${escapeHtml(label)}" placeholder="항목명">
      <input data-extra-quantity type="number" min="1" value="1" aria-label="수량">
      <input data-extra-money inputmode="numeric" placeholder="단가">
      <button type="button" onclick="this.parentElement.remove(); motfUpdateExtraChargeTotal()" aria-label="항목 삭제"><i data-lucide="trash-2"></i></button>`;
    rows.appendChild(row);
    row.querySelectorAll("input,select").forEach((input) => input.addEventListener("input", window.motfUpdateExtraChargeTotal));
    window.motfUpdateExtraChargeTotal();
    window.lucide?.createIcons();
  };

  window.motfUpdateExtraChargeTotal = function motfUpdateExtraChargeTotal() {
    let total = 0;
    document.querySelectorAll("#motfExtraChargeRows .extra-charge-form-row").forEach((row) => {
      total += Math.max(1, Number(row.querySelector("[data-extra-quantity]")?.value || 1)) * (Number(String(row.querySelector("[data-extra-money]")?.value || "").replace(/\D/g, "")) || 0);
    });
    const node = document.getElementById("motfExtraChargeTotal");
    if (node) node.textContent = `${total.toLocaleString()}원`;
  };

  window.motfReviewExtraCharge = async function motfReviewExtraCharge(id, decision) {
    const note = prompt(decision === "approved" ? "이용자에게 함께 전달할 메모가 있다면 입력해주세요." : "반려 사유를 입력해주세요.") || "";
    if (decision === "rejected" && !note.trim()) return;
    const { error } = await client().rpc("review_reservation_extra_charge_request", {
      target_request_id: id,
      review_decision: decision,
      note,
    });
    if (error) return alert(error.message || "추가금 요청을 처리하지 못했습니다.");
    await window.loadMotfAdminExtraCharges();
    alert(decision === "approved" ? "이용자에게 추가금 결제 요청을 보냈습니다." : "추가금 요청을 반려했습니다.");
  };

  document.getElementById("motfExtraChargeForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const items = [...document.querySelectorAll("#motfExtraChargeRows .extra-charge-form-row")].map((row) => ({
      category: row.querySelector("[data-extra-category]")?.value || "other",
      label: row.querySelector("[data-extra-label]")?.value.trim() || "",
      quantity: Math.max(1, Number(row.querySelector("[data-extra-quantity]")?.value || 1)),
      unit_amount: Number(String(row.querySelector("[data-extra-money]")?.value || "").replace(/\D/g, "")) || 0,
    })).filter((item) => item.label && item.unit_amount > 0);
    if (!items.length) return alert("추가금 항목명과 단가를 입력해주세요.");
    const submit = event.target.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const dueValue = document.getElementById("motfExtraChargeDueAt").value;
      const { error } = await client().rpc("create_reservation_extra_charge_request", {
        target_reservation_id: document.getElementById("motfExtraChargeReservationId").value,
        charge_items: items,
        request_note: document.getElementById("motfExtraChargeNote").value.trim() || null,
        payment_due_at: dueValue ? new Date(dueValue).toISOString() : null,
      });
      if (error) throw error;
      document.getElementById("motfExtraChargeDialog").close();
      if (window.motfCurrentProfile?.role === "admin") await window.loadMotfAdminExtraCharges();
      else await window.loadMotfPartnerExtraCharges();
      alert(window.motfCurrentProfile?.role === "admin" ? "추가금 결제 요청을 등록했습니다." : "운영팀에 추가금 검토를 요청했습니다.");
    } catch (error) {
      alert(error.message || "추가금 요청을 등록하지 못했습니다.");
    } finally { submit.disabled = false; }
  });

  function scheduleChatReload() {
    window.clearTimeout(chatReloadTimer);
    chatReloadTimer = window.setTimeout(() => {
      if (window.motfCurrentProfile?.role === "admin") window.loadMotfAdminChats();
      else if (window.motfCurrentBusiness) window.loadMotfPartnerChats();
    }, 250);
  }

  window.addEventListener("motf:owner-panel-change", () => {
    if (isPartnerChatVisible()) void syncPartnerConversation({ markRead: true });
    else stopPartnerPresence();
  });
  window.addEventListener("motf:owner-chat-change", () => {
    void syncPartnerConversation({ markRead: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (isPartnerChatVisible()) void syncPartnerConversation({ markRead: true });
    else stopPartnerPresence();
  });
  window.addEventListener("pagehide", stopPartnerPresence);

  function formatPhoneInput(value = "") {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
    if (digits.startsWith("02")) {
      if (digits.length <= 2) return digits;
      if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
      return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
    }
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  document.addEventListener("input", (event) => {
    if (event.target.matches('input[type="tel"], #motfBusinessPhone, #motfOwnerPhone, [data-phone-input]')) {
      event.target.value = formatPhoneInput(event.target.value);
    }
    if (event.target.matches("[data-money-input], [data-extra-money]")) {
      const amount = Number(String(event.target.value || "").replace(/\D/g, "")) || 0;
      event.target.value = amount ? amount.toLocaleString("ko-KR") : "";
      if (event.target.matches("[data-extra-money]")) window.motfUpdateExtraChargeTotal?.();
    }
  });

  window.setTimeout(() => {
    if (!client()) return;
    client().channel("owner-chat-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, scheduleChatReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, scheduleChatReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_cases" }, () => window.loadMotfAdminSupportCases?.())
      .subscribe();
  }, 0);
})();
