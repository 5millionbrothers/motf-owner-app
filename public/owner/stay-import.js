(function setupStayWebsiteImporter() {
  const facilityLabels = { barbecue:"야외 바비큐", karaoke:"노래방·마이크", field:"야외 운동장", pool:"수영장", screen:"TV·스크린", wifi:"와이파이", parking:"주차", pickup:"픽업" };
  let state = { jobId:null, draft:null, pages:[] };
  let progressTimer = null;
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));

  function panelHtml() {
    return `<section id="panel-master-stay-import" class="panel admin-control-panel stay-import-panel">
      <div class="view-title"><div><h1>숙소 웹사이트 자동 등록</h1><p>공식 웹사이트를 읽어 초안을 만들고, 확인한 정보만 모티프에 등록합니다.</p></div></div>
      <aside class="admin-guide"><strong>사용 순서</strong><p>웹사이트 분석 → 가격·객실·사진 검토 → 임시 사장님 계정과 숙소 등록. 같은 내용은 저장된 초안을 재사용하므로 분석 비용이 다시 들지 않습니다.</p></aside>
      <form id="stayImportAnalyzeForm" class="stay-import-source"><label><span>숙소 공식 웹사이트</span><input name="sourceUrl" type="url" required placeholder="https://example.com"></label><button class="primary-btn" type="submit"><i data-lucide="scan-search"></i> 분석하기</button></form>
      <div id="stayImportStatus" class="stay-import-status" hidden aria-live="polite"></div>
      <div id="stayImportProgress" class="stay-import-progress" hidden>
        <div class="stay-import-progress-head"><strong id="stayImportProgressStage">사이트 탐색 중</strong><span id="stayImportProgressEstimate">예상 45초</span></div>
        <div class="stay-import-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
        <small id="stayImportProgressDetail">공식 홈페이지의 객실과 시설 페이지를 찾고 있습니다.</small>
      </div>
      <div id="stayImportEditor"></div>
    </section>`;
  }

  const originalMount = window.motfMountAdminControlTower;
  window.motfMountAdminControlTower = function mountStayImport() {
    originalMount?.();
    if (window.motfCurrentProfile?.role !== "admin" || $("#panel-master-stay-import")) return;
    $("#m-btn-launch-content")?.closest("li")?.insertAdjacentHTML("beforebegin", '<li><button class="menu-item" id="m-btn-stay-import" onclick="motfOpenAdminControl(\'master-stay-import\')"><i data-lucide="wand-sparkles"></i> 숙소 자동 등록</button></li>');
    $(".content-area")?.insertAdjacentHTML("beforeend", panelHtml());
    $("#stayImportAnalyzeForm")?.addEventListener("submit", analyze);
    window.lucide?.createIcons();
  };

  const originalOpen = window.motfOpenAdminControl;
  window.motfOpenAdminControl = async function openStayImport(panelId) {
    if (panelId !== "master-stay-import") return originalOpen?.(panelId);
    if (window.motfCurrentProfile?.role !== "admin") return;
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
    document.querySelectorAll(".menu-item").forEach((button) => button.classList.remove("active"));
    $("#panel-master-stay-import")?.classList.add("active"); $("#m-btn-stay-import")?.classList.add("active");
  };

  async function accessToken() { const { data } = await window.motfSupabase.auth.getSession(); if (!data.session?.access_token) throw new Error("로그인이 만료되었습니다."); return data.session.access_token; }
  function setStatus(message, kind = "working") { const area = $("#stayImportStatus"); if (!area) return; area.hidden = !message; area.className = `stay-import-status is-${kind}`; area.innerHTML = kind === "working" ? `<span class="stay-import-spinner"></span>${escapeHtml(message)}` : escapeHtml(message); }

  function startProgress(mode = "analyze") {
    if (progressTimer) clearInterval(progressTimer);
    const area = $("#stayImportProgress"); if (!area) return;
    const startedAt = Date.now(); const expectedSeconds = mode === "commit" ? 35 : 45;
    const stages = mode === "commit"
      ? [
          [0, "등록 정보 확인 중", "입력한 객실과 요금 정보를 검증하고 있습니다."],
          [8, "사진 저장 중", "선택한 사진을 모티프 저장소로 옮기고 있습니다."],
          [22, "숙소와 객실 등록 중", "숙소 정보와 객실 데이터를 연결하고 있습니다."],
          [31, "사장님 계정 생성 중", "로그인 계정과 최종 연결 상태를 확인하고 있습니다."],
        ]
      : [
          [0, "사이트 탐색 중", "공식 홈페이지의 객실과 시설 페이지를 찾고 있습니다."],
          [10, "객실·요금 수집 중", "상세 페이지와 공식 예약표에서 가격과 기준 인원을 확인하고 있습니다."],
          [22, "사진과 시설 확인 중", "갤러리, 배경 사진과 이미지형 안내를 선별하고 있습니다."],
          [34, "등록 초안 생성 중", "수집한 근거를 숙소 등록 양식으로 정리하고 있습니다."],
        ];
    area.hidden = false;
    const update = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const stage = [...stages].reverse().find(([second]) => elapsed >= second) || stages[0];
      const percent = Math.min(92, Math.round(6 + 86 * (1 - Math.exp(-elapsed / 23))));
      const remaining = Math.max(0, expectedSeconds - Math.round(elapsed));
      $("#stayImportProgressStage").textContent = stage[1];
      $("#stayImportProgressDetail").textContent = stage[2];
      $("#stayImportProgressEstimate").textContent = remaining > 0 ? `약 ${Math.max(5, Math.ceil(remaining / 5) * 5)}초 남음` : "서버 응답을 기다리는 중";
      const track = area.querySelector("[role='progressbar']"); track.setAttribute("aria-valuenow", String(percent)); track.querySelector("i").style.width = `${percent}%`;
    };
    update(); progressTimer = setInterval(update, 500);
  }

  function finishProgress(success) {
    if (progressTimer) clearInterval(progressTimer); progressTimer = null;
    const area = $("#stayImportProgress"); if (!area) return;
    if (!success) { area.hidden = true; return; }
    const track = area.querySelector("[role='progressbar']"); track.setAttribute("aria-valuenow", "100"); track.querySelector("i").style.width = "100%";
    $("#stayImportProgressStage").textContent = "완료"; $("#stayImportProgressEstimate").textContent = "100%"; $("#stayImportProgressDetail").textContent = "결과를 화면에 표시했습니다.";
    setTimeout(() => { area.hidden = true; }, 1200);
  }

  async function analyze(event) {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button"); button.disabled = true; $("#stayImportEditor").innerHTML = ""; setStatus("웹사이트에서 객실·가격·시설·사진을 수집하고 있습니다."); startProgress("analyze");
    try {
      const response = await fetch("/api/admin/stay-import/analyze", { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${await accessToken()}` }, body:JSON.stringify({ sourceUrl:form.sourceUrl.value.trim() }) });
      const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.message || "분석하지 못했습니다.");
      state = { jobId:result.jobId, draft:result.draft, pages:result.crawledPages || [] }; setStatus(result.message, result.cached ? "cached" : "success"); finishProgress(true); renderEditor();
    } catch (error) { finishProgress(false); setStatus(error.message || "분석하지 못했습니다.", "error"); }
    finally { button.disabled = false; window.lucide?.createIcons(); }
  }

  function field(label, name, value, options = {}) { const attrs = [options.required ? "required" : "", options.type ? `type="${options.type}"` : "", options.min != null ? `min="${options.min}"` : ""].filter(Boolean).join(" "); return `<label class="${options.wide ? "wide" : ""}"><span>${label}</span><input name="${name}" value="${escapeHtml(value ?? "")}" ${attrs}></label>`; }

  function renderEditor() {
    const draft = state.draft; if (!draft) return;
    draft.seasonRanges = draft.seasonRanges || { shoulder:[], peak:[] };
    const seasonSummary = [...draft.seasonRanges.shoulder.map((range) => `<span>준성수기 ${escapeHtml(range.startDate)} ~ ${escapeHtml(range.endDate)}</span>`), ...draft.seasonRanges.peak.map((range) => `<span>성수기 ${escapeHtml(range.startDate)} ~ ${escapeHtml(range.endDate)}</span>`)].join("");
    const facilities = Object.entries(facilityLabels).map(([key, label]) => { const item = draft.facilities.find((facility) => facility.key === key); return `<div class="stay-import-facility"><label><input type="checkbox" data-facility-key="${key}" ${item ? "checked" : ""}><span>${label}</span></label><input type="text" data-facility-detail="${key}" value="${escapeHtml(item?.detail || "")}" placeholder="확인된 세부사항"></div>`; }).join("");
    $("#stayImportEditor").innerHTML = `<form id="stayImportCommitForm" class="stay-import-editor">
      <section class="stay-import-block"><div class="stay-import-block-title"><div><strong>1. 기본 정보</strong><span>AI가 비워둔 값은 근거가 없다는 뜻입니다.</span></div></div><div class="stay-import-fields">
        ${field("숙소명", "businessName", draft.businessName, { required:true })}${field("대표자", "representativeName", draft.representativeName)}${field("전화번호", "phone", draft.phone)}${field("운영 지역", "region", draft.region, { required:true })}${field("우편번호", "postalCode", draft.postalCode)}${field("상세주소", "addressDetail", draft.addressDetail)}${field("주소", "address", draft.address, { required:true, wide:true })}${field("목록 한 줄 소개", "shortDescription", draft.shortDescription, { required:true, wide:true })}<label class="wide"><span>상세 소개</span><textarea name="description" rows="7" required>${escapeHtml(draft.description)}</textarea></label>
      </div></section>
      ${draft.warnings?.length ? `<section class="stay-import-warning"><strong>반드시 확인할 항목</strong><ul>${draft.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
      <section class="stay-import-block"><div class="stay-import-block-title"><div><strong>2. 시설</strong><span>공식 사이트에서 확인된 항목만 선택하세요.</span></div></div><div class="stay-import-facilities">${facilities}</div></section>
      <section class="stay-import-block"><div class="stay-import-block-title"><div><strong>3. 객실과 요금</strong><span>공식 예약 달력이 있으면 시즌별 평일·주말 요금과 시즌 기간을 함께 제안합니다.</span></div><button type="button" class="secondary-btn compact" id="stayImportAddRoom"><i data-lucide="plus"></i> 객실 추가</button></div>${seasonSummary ? `<div class="stay-import-season-summary"><strong>자동 감지한 시즌 기간</strong>${seasonSummary}<small>등록 후 사장님 화면의 시즌 달력에서 날짜별로 수정할 수 있습니다.</small></div>` : ""}<div id="stayImportRooms"></div></section>
      <section class="stay-import-block"><div class="stay-import-block-title"><div><strong>4. 추가요금</strong><span>바비큐·인원추가·보증금 등 실제 총비용에 필요한 항목입니다.</span></div><button type="button" class="secondary-btn compact" id="stayImportAddFee"><i data-lucide="plus"></i> 요금 추가</button></div><div id="stayImportFees"></div></section>
      <section class="stay-import-block"><div class="stay-import-block-title"><div><strong>5. 가져올 사진 <em>${draft.imageUrls.length}장</em></strong><span>정상적으로 확인되는 사진은 모두 선택되어 있으며, 원하지 않는 사진만 해제하면 됩니다.</span></div></div><div class="stay-import-images">${draft.imageUrls.map((url, index) => `<label><input type="checkbox" data-image-url="${escapeHtml(url)}" checked><img src="/api/admin/stay-import/image?jobId=${encodeURIComponent(state.jobId)}&index=${index}" alt="가져오기 후보 ${index + 1}" loading="lazy" onerror="this.closest('label').classList.add('is-broken');this.nextElementSibling.textContent='제외';this.previousElementSibling.checked=false"><span>${index + 1}</span></label>`).join("") || "<p>자동으로 찾은 사진이 없습니다.</p>"}</div></section>
      <section class="stay-import-block stay-import-final"><label class="stay-import-rights"><input name="rightsConfirmed" type="checkbox" required><span>이 숙소의 공식 정보와 사진을 모티프에 등록할 권한을 확인했습니다.</span></label><p>등록 후 임시 사장님 이메일과 비밀번호가 한 번만 표시됩니다. 숙소·객실은 바로 이용자 카탈로그에 반영되므로 마지막으로 확인해주세요.</p><button class="primary-btn" type="submit"><i data-lucide="database"></i> 검토 완료·숙소 등록</button></section>
    </form>`;
    renderRooms(); renderFees();
    $("#stayImportAddRoom").onclick = () => { draft.rooms.push({ name:"새 객실", description:null, price:0, minPeople:null, basePeople:null, maxPeople:null, extraPersonFee:0, bathroomCount:0, bathroomGenderSeparated:false, bathroomNote:null, featureSummary:[], imageUrls:[], offseasonWeekdayPrice:0, offseasonWeekendPrice:0, shoulderWeekdayPrice:0, shoulderWeekendPrice:0, peakWeekdayPrice:0, peakWeekendPrice:0 }); renderRooms(); };
    $("#stayImportAddFee").onclick = () => { draft.extraFees.push({ label:"", amount:null, detail:null, category:"optional" }); renderFees(); };
    $("#stayImportCommitForm").addEventListener("submit", commit); window.lucide?.createIcons();
  }

  function renderRooms() {
    const area = $("#stayImportRooms"); area.innerHTML = state.draft.rooms.map((room, index) => `<article class="stay-import-room" data-room-index="${index}"><div class="stay-import-room-head"><strong>객실 ${index + 1}</strong><button type="button" class="icon-danger" data-remove-room="${index}" aria-label="객실 삭제"><i data-lucide="trash-2"></i></button></div><div class="stay-import-fields">${field("객실명", "name", room.name, { required:true })}${field("대표 1박 요금", "price", room.price, { required:true, type:"number", min:0 })}${field("기준 인원", "basePeople", room.basePeople, { type:"number", min:0 })}${field("최대 인원", "maxPeople", room.maxPeople, { type:"number", min:0 })}${field("추가 인원비", "extraPersonFee", room.extraPersonFee, { type:"number", min:0 })}${field("객실 내 화장실", "bathroomCount", room.bathroomCount, { type:"number", min:0 })}${field("비수기 평일", "offseasonWeekdayPrice", room.offseasonWeekdayPrice ?? room.price, { type:"number", min:0 })}${field("비수기 주말", "offseasonWeekendPrice", room.offseasonWeekendPrice ?? room.price, { type:"number", min:0 })}${field("준성수기 평일", "shoulderWeekdayPrice", room.shoulderWeekdayPrice ?? room.price, { type:"number", min:0 })}${field("준성수기 주말", "shoulderWeekendPrice", room.shoulderWeekendPrice ?? room.price, { type:"number", min:0 })}${field("성수기 평일", "peakWeekdayPrice", room.peakWeekdayPrice ?? room.price, { type:"number", min:0 })}${field("성수기 주말", "peakWeekendPrice", room.peakWeekendPrice ?? room.price, { type:"number", min:0 })}${field("특징 (쉼표 구분)", "featureSummary", room.featureSummary.join(", "), { wide:true })}<label class="wide"><span>객실 소개</span><textarea name="description" rows="3">${escapeHtml(room.description || "")}</textarea></label></div>${room.imageUrls?.length ? `<div class="stay-import-room-images"><strong>이 객실에 자동 배정할 사진 ${room.imageUrls.length}장</strong><div>${room.imageUrls.map((url) => { const imageIndex = state.draft.imageUrls.indexOf(url); return imageIndex < 0 ? "" : `<label><input type="checkbox" data-room-image-url="${escapeHtml(url)}" checked><img src="/api/admin/stay-import/image?jobId=${encodeURIComponent(state.jobId)}&index=${imageIndex}" alt="${escapeHtml(room.name)} 사진" loading="lazy"><span>배정</span></label>`; }).join("")}</div></div>` : ""}</article>`).join("");
    area.querySelectorAll("[data-remove-room]").forEach((button) => button.onclick = () => { state.draft.rooms.splice(Number(button.dataset.removeRoom), 1); renderRooms(); }); window.lucide?.createIcons();
  }

  function renderFees() {
    const area = $("#stayImportFees"); area.innerHTML = state.draft.extraFees.map((fee, index) => `<div class="stay-import-fee" data-fee-index="${index}"><input name="label" value="${escapeHtml(fee.label)}" placeholder="요금명"><input name="amount" type="number" min="0" value="${fee.amount ?? ""}" placeholder="금액"><select name="category"><option value="confirmed" ${fee.category === "confirmed" ? "selected" : ""}>필수 요금</option><option value="optional" ${fee.category === "optional" ? "selected" : ""}>선택 요금</option><option value="onsite" ${fee.category === "onsite" ? "selected" : ""}>현장 확인</option><option value="deposit" ${fee.category === "deposit" ? "selected" : ""}>환급 보증금</option></select><input name="detail" value="${escapeHtml(fee.detail || "")}" placeholder="조건·단위"><button type="button" class="icon-danger" data-remove-fee="${index}" aria-label="요금 삭제"><i data-lucide="trash-2"></i></button></div>`).join("") || '<p class="admin-control-empty">확인된 추가요금이 없습니다.</p>';
    area.querySelectorAll("[data-remove-fee]").forEach((button) => button.onclick = () => { state.draft.extraFees.splice(Number(button.dataset.removeFee), 1); renderFees(); }); window.lucide?.createIcons();
  }

  function readEditor(form) {
    const value = (name) => form.querySelector(`section.stay-import-block [name="${name}"]`)?.value.trim() || null;
    const rooms = [...form.querySelectorAll("[data-room-index]")].map((node) => ({ name:node.querySelector('[name="name"]').value.trim(), description:node.querySelector('[name="description"]').value.trim() || null, price:Number(node.querySelector('[name="price"]').value), minPeople:null, basePeople:node.querySelector('[name="basePeople"]').value === "" ? null : Number(node.querySelector('[name="basePeople"]').value), maxPeople:node.querySelector('[name="maxPeople"]').value === "" ? null : Number(node.querySelector('[name="maxPeople"]').value), extraPersonFee:Number(node.querySelector('[name="extraPersonFee"]').value || 0), bathroomCount:Number(node.querySelector('[name="bathroomCount"]').value || 0), bathroomGenderSeparated:false, bathroomNote:null, featureSummary:node.querySelector('[name="featureSummary"]').value.split(",").map((item) => item.trim()).filter(Boolean), imageUrls:[...node.querySelectorAll('[data-room-image-url]:checked')].map((input) => input.dataset.roomImageUrl), offseasonWeekdayPrice:Number(node.querySelector('[name="offseasonWeekdayPrice"]').value || 0), offseasonWeekendPrice:Number(node.querySelector('[name="offseasonWeekendPrice"]').value || 0), shoulderWeekdayPrice:Number(node.querySelector('[name="shoulderWeekdayPrice"]').value || 0), shoulderWeekendPrice:Number(node.querySelector('[name="shoulderWeekendPrice"]').value || 0), peakWeekdayPrice:Number(node.querySelector('[name="peakWeekdayPrice"]').value || 0), peakWeekendPrice:Number(node.querySelector('[name="peakWeekendPrice"]').value || 0) }));
    const extraFees = [...form.querySelectorAll("[data-fee-index]")].map((node) => ({ label:node.querySelector('[name="label"]').value.trim(), amount:node.querySelector('[name="amount"]').value === "" ? null : Number(node.querySelector('[name="amount"]').value), category:node.querySelector('[name="category"]').value, detail:node.querySelector('[name="detail"]').value.trim() || null })).filter((fee) => fee.label);
    const facilities = Object.keys(facilityLabels).filter((key) => form.querySelector(`[data-facility-key="${key}"]`)?.checked).map((key) => ({ key, detail:form.querySelector(`[data-facility-detail="${key}"]`)?.value.trim() || null }));
    return { ...state.draft, businessName:value("businessName"), representativeName:value("representativeName"), phone:value("phone"), region:value("region"), postalCode:value("postalCode"), address:value("address"), addressDetail:value("addressDetail"), shortDescription:value("shortDescription"), description:value("description"), rooms, extraFees, facilities, imageUrls:[...form.querySelectorAll("[data-image-url]:checked")].map((input) => input.dataset.imageUrl) };
  }

  async function commit(event) {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type="submit"]'); const draft = readEditor(form);
    if (draft.rooms.some((room) => room.price <= 0)) return setStatus("모든 객실의 1박 요금을 확인해주세요.", "error");
    if (!confirm(`${draft.businessName}과 객실 ${draft.rooms.length}개를 실제 데이터베이스에 등록할까요?`)) return;
    button.disabled = true; setStatus("사진을 저장하고 숙소·객실·임시 사장님 계정을 만들고 있습니다."); startProgress("commit");
    try {
      const response = await fetch("/api/admin/stay-import/commit", { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${await accessToken()}` }, body:JSON.stringify({ jobId:state.jobId, draft, rightsConfirmed:form.rightsConfirmed.checked }) });
      const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.message || "등록하지 못했습니다."); setStatus(result.message, "success"); finishProgress(true);
      $("#stayImportEditor").innerHTML = `<section class="stay-import-complete"><i data-lucide="circle-check-big"></i><div><h2>숙소 등록 완료</h2><p>${escapeHtml(draft.businessName)} · 객실 ${draft.rooms.length}개 · 사진 ${result.imageCount}장</p></div><dl><div><dt>사장님 로그인 이메일</dt><dd><code>${escapeHtml(result.account.email)}</code></dd></div><div><dt>임시 비밀번호</dt><dd><code>${escapeHtml(result.account.password)}</code></dd></div></dl><strong>비밀번호는 서버나 DB에 따로 저장되지 않으므로 지금 안전한 곳에 기록해주세요.</strong>${result.warnings?.length ? `<ul>${result.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}</section>`;
      state = { jobId:null, draft:null, pages:[] };
    } catch (error) { finishProgress(false); setStatus(error.message || "등록하지 못했습니다.", "error"); button.disabled = false; }
    window.lucide?.createIcons();
  }
})();
