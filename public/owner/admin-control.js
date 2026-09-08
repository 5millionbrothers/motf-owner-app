(function setupAdminControlTower() {
  const $ = (selector) => document.querySelector(selector);
  const money = (value) => `${Number(value || 0).toLocaleString()}원`;
  const dateInput = (offsetDays = 0) => { const date=new Date(Date.now()+offsetDays*86400000); date.setMinutes(date.getMinutes()-date.getTimezoneOffset()); return date.toISOString().slice(0,16); };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let mounted = false;
  let adminMembers = [];
  let adminEvents = [];
  let adminCards = [];
  let adminPopups = [];
  let adminCommunity = [];
  let adminRecreation = [];

  function client() { return window.motfSupabase; }
  function requireAdmin() { if (window.motfCurrentProfile?.role !== "admin") throw new Error("운영자 권한이 필요합니다."); }
  function panelShell(id, title, text, inner) { return `<section id="panel-${id}" class="panel admin-control-panel"><div class="view-title"><div><h1>${title}</h1><p>${text}</p></div></div>${inner}</section>`; }

  async function uploadMedia(file, folder) {
    if (!file) return null;
    const extension = String(file.name || "file").split(".").pop().toLowerCase();
    const path = `${folder}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
    const { error } = await client().storage.from("content-media").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) throw error;
    return client().storage.from("content-media").getPublicUrl(path).data.publicUrl;
  }

  async function uploadMediaList(fileList, folder) {
    return Promise.all(Array.from(fileList || []).map((file) => uploadMedia(file, folder)));
  }

  function guide(title, body) {
    return `<aside class="admin-guide"><strong>${title}</strong><p>${body}</p></aside>`;
  }

  window.motfMountAdminControlTower = function mount() {
    if (window.motfCurrentProfile?.role !== "admin") return;
    const anchor=$("#motfLaunchAdminMenuAnchor");
    if(anchor) anchor.outerHTML=`
      <li><button class="menu-item" id="m-btn-commerce" onclick="motfOpenAdminControl('master-commerce')"><i data-lucide="badge-percent"></i> 포인트·쿠폰·수수료</button></li>
      <li><button class="menu-item" id="m-btn-discovery" onclick="motfOpenAdminControl('master-discovery')"><i data-lucide="list-ordered"></i> 숙소 노출 관리</button></li>
      <li><button class="menu-item" id="m-btn-launch-content" onclick="motfOpenAdminControl('master-launch-content')"><i data-lucide="megaphone"></i> 이벤트·배너·콘텐츠</button></li>`;
    if (!mounted || !$("#panel-master-commerce")) {
      const content=$(".content-area");
      content.insertAdjacentHTML("beforeend", panelShell("master-commerce","포인트·쿠폰·수수료","할인 재원과 정산 기준을 한곳에서 관리합니다.",commerceHtml()));
      content.insertAdjacentHTML("beforeend", panelShell("master-discovery","숙소 노출 관리","검색 결과와 홈 추천 영역의 노출 기준을 관리합니다.",`${guide("노출 순서와 랜덤 가중치", "노출 순서는 숫자가 작을수록 먼저 보입니다. 랜덤 가중치는 같은 순서 안에서 섞일 때의 등장 확률이며 0이면 랜덤 추천에서 제외됩니다. 추천 체크는 홈의 주요 숙소 후보에 포함시키는 설정입니다.")}<div class="admin-list-toolbar"><input id="adminDiscoverySearch" type="search" placeholder="숙소·마트 이름 검색"></div><div id="adminDiscoveryList" class="admin-control-list"></div>`));
      content.insertAdjacentHTML("beforeend", panelShell("master-launch-content","이벤트·배너·콘텐츠","사용자 화면에 공개되는 운영 콘텐츠를 등록한 뒤 언제든 수정할 수 있습니다.",contentHtmlV2()));
      bindFormsV2();
      mounted = true;
    }
    window.lucide?.createIcons();
  };

  window.motfOpenAdminControl = async function open(panelId) {
    requireAdmin();
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
    document.querySelectorAll(".menu-item").forEach((button) => button.classList.remove("active"));
    $(`#panel-${panelId}`)?.classList.add("active");
    $(`#m-btn-${panelId.replace("master-","")}`)?.classList.add("active");
    if(panelId==="master-commerce") await loadCommerce();
    if(panelId==="master-discovery") await loadDiscoveryV2();
    if(panelId==="master-launch-content") await loadContentV2();
  };

  function commerceHtml(){ return `<div class="admin-control-grid">
    <form id="adminCommissionForm" class="admin-control-card"><h2>베타 기본 수수료</h2>${guide("정산 기준", "숙소와 마트의 기본 중개 수수료율입니다. 업장별 예외는 숙소 노출 관리에서 따로 설정하며, 포인트·쿠폰 할인액은 모티프 부담으로 기록되고 파트너 정산 원금은 할인 전 상품가를 기준으로 계산합니다.")}<label>숙소 수수료율 (%)<input name="stayRate" type="number" min="0" max="100" step="0.1" value="3.5"></label><label>마트 수수료율 (%)<input name="marketRate" type="number" min="0" max="100" step="0.1" value="3.5"></label><button class="primary-btn" type="submit">기본 수수료 저장</button></form>
    <form id="adminPointForm" class="admin-control-card"><h2>회원 포인트 조정</h2>${guide("포인트 사용법", "회원 검색 후 지급은 양수, 회수는 음수로 입력합니다. 모든 변경은 사유와 함께 원장에 남고 이용자는 마이페이지에서 확인합니다.")}<label>회원 검색<input id="adminPointMemberSearch" type="search" placeholder="이름·이메일·전화번호"></label><label>회원<select name="userId" required></select></label><label>증감 포인트<input name="amount" type="number" required placeholder="예: 10000 또는 -5000"></label><label>사유<input name="reason" required maxlength="120"></label><button class="primary-btn" type="submit">포인트 반영</button></form>
    <form id="adminCouponForm" class="admin-control-card admin-control-card-wide"><h2>할인코드 만들기</h2>${guide("쿠폰 적용 순서", "결제 전 사용자가 적용 버튼을 누르면 유효기간·최소 주문액·사용 횟수를 즉시 검증합니다. 정률 할인은 최대 할인액을 함께 두는 것이 안전합니다.")}<div class="admin-form-grid"><label>코드<input name="code" required maxlength="30"></label><label>이름<input name="name" required maxlength="80"></label><label>할인 방식<select name="discountType"><option value="percent">할인율</option><option value="fixed">정액</option></select></label><label>할인값<input name="discountValue" type="number" min="1" required></label><label>최대 할인액<input name="maximumDiscount" type="number" min="0"></label><label>최소 주문액<input name="minimumAmount" type="number" min="0" value="0"></label><label>전체 사용 한도<input name="totalUsageLimit" type="number" min="1" placeholder="미입력 시 무제한"></label><label>1인 사용 한도<input name="perUserLimit" type="number" min="1" value="1"></label><label>적용 대상<select name="appliesTo"><option value="all">전체</option><option value="stay">숙소</option><option value="market">마트</option></select></label><label>시작<input name="startsAt" type="datetime-local" required value="${dateInput()}"></label><label>종료<input name="endsAt" type="datetime-local" required value="${dateInput(30)}"></label></div><button class="primary-btn" type="submit">할인코드 발급</button></form>
    <form id="adminCampaignForm" class="admin-control-card admin-control-card-wide"><h2>포인트 적립 캠페인</h2>${guide("자동 적립", "활성 기간 안에 완료된 거래에 적립률을 적용합니다. 건당 최대 포인트를 비워두면 상한이 없습니다.")}<div class="admin-form-grid"><label>캠페인명<input name="name" required></label><label>대상<select name="kind"><option value="all">전체</option><option value="stay">숙소</option><option value="market">마트</option></select></label><label>적립률 (%)<input name="rate" type="number" min="0" max="100" step="0.1" value="1"></label><label>건당 최대 포인트<input name="maxPoints" type="number" min="0"></label><label>시작<input name="startsAt" type="datetime-local" required value="${dateInput()}"></label><label>종료<input name="endsAt" type="datetime-local" required value="${dateInput(90)}"></label></div><button class="primary-btn" type="submit">캠페인 시작</button></form></div><div class="admin-control-split"><section><h2>할인코드 목록</h2><div id="adminCouponList" class="admin-control-list"></div></section><section><h2>포인트 캠페인</h2><div id="adminCampaignList" class="admin-control-list"></div></section></div>`; }

  function contentHtml(){ return `<form id="adminSocialForm" class="admin-control-card admin-social-form"><h2>공식 채널</h2><div class="admin-form-grid"><label class="admin-field-wide">Instagram 주소<input name="instagramUrl" type="url" placeholder="https://www.instagram.com/..."></label></div><button class="secondary-btn" type="submit">채널 저장</button></form><div class="admin-content-tabs"><button class="active" data-admin-content-tab="events">MOriginal</button><button data-admin-content-tab="cards">카드뉴스</button><button data-admin-content-tab="popups">팝업</button><button data-admin-content-tab="community">커뮤니티</button><button data-admin-content-tab="recreation">레크레이션</button></div>
    <section data-admin-content-pane="events">${guide("신청 버튼은 자동으로 바뀝니다", "신청 시작 전에는 ‘곧 신청’, 신청 기간에는 구글폼으로 바로 이동하는 ‘신청 중’ 버튼, 마감 시각 이후나 정원 도달 시에는 ‘마감’, 행사 종료 후에는 ‘종료’로 표시됩니다. 화면이 열려 있어도 시작 시각에 맞춰 자동 갱신됩니다.")}<form id="adminEventForm" class="admin-control-card"><h2>MOriginal 등록</h2><div class="admin-form-grid"><label>제목<input name="title" required></label><label>짧은 소개<input name="shortDescription" required></label><label>포스터 파일<input name="posterFile" type="file" accept="image/*" required></label><label>추가 사진<input name="galleryFiles" type="file" accept="image/*" multiple></label><label>장소명<input name="venueName"></label><label>행사 시작<input name="startsAt" type="datetime-local" required></label><label>행사 종료<input name="endsAt" type="datetime-local" required></label><label>신청 시작<input name="opensAt" type="datetime-local" required></label><label>신청 마감<input name="closesAt" type="datetime-local" required></label><label>1인 가격<input name="price" type="number" min="0" required></label><label>정원<input name="capacity" type="number" min="1" required></label><label>구글폼 URL<input name="formUrl" type="url" placeholder="https://forms.gle/..."></label><label>홍보 영상 URL<input name="promoVideoUrl" type="url" placeholder="https://youtu.be/..."></label><label>상태<select name="status"><option value="scheduled">일정에 따라 자동</option><option value="draft">임시저장</option><option value="closed">수동 마감</option><option value="completed">진행 종료</option></select></label><label class="admin-field-wide">상세 소개<textarea name="description" rows="5"></textarea></label><label class="admin-field-wide">하이라이트 (줄바꿈 구분)<textarea name="highlights" rows="3"></textarea></label></div><button class="primary-btn" type="submit">MOriginal 저장</button></form><div id="adminEventList" class="admin-control-list"></div></section>
    <section data-admin-content-pane="cards" hidden><form id="adminCardForm" class="admin-control-card"><h2>홈 카드뉴스 등록</h2><div class="admin-form-grid"><label>제목<input name="title" required></label><label>설명<input name="subtitle"></label><label>이미지 파일<input name="imageFile" type="file" accept="image/*" required></label><label>연결 URL<input name="linkUrl" type="url"></label><label>노출 위치<select name="placement"><option value="card_news">카드뉴스</option><option value="promotion">프로모션</option><option value="hero">첫 화면</option></select></label><label>순서<input name="sortOrder" type="number" value="100"></label></div><button class="primary-btn" type="submit">카드 등록</button></form><div id="adminCardList" class="admin-control-list"></div></section>
    <section data-admin-content-pane="popups" hidden><form id="adminPopupForm" class="admin-control-card"><h2>팝업 등록</h2><div class="admin-form-grid"><label>제목<input name="title" required></label><label>이미지 파일<input name="imageFile" type="file" accept="image/*"></label><label>연결 URL<input name="linkUrl" type="url"></label><label>시작<input name="startsAt" type="datetime-local" required value="${dateInput()}"></label><label>종료<input name="endsAt" type="datetime-local" required value="${dateInput(7)}"></label><label>닫기 유지 일수<input name="dismissDays" type="number" min="0" value="1"></label><label class="admin-field-wide">내용<textarea name="body" rows="3"></textarea></label></div><button class="primary-btn" type="submit">팝업 등록</button></form><div id="adminPopupList" class="admin-control-list"></div></section>
    <section data-admin-content-pane="community" hidden><form id="adminCommunityForm" class="admin-control-card"><h2>운영팀 커뮤니티 게시글</h2><div class="admin-form-grid"><label>게시판<select name="board"><option value="market-share">나눔장터</option><option value="match">대결신청</option><option value="field-info">현장정보</option></select></label><label>제목<input name="title" required maxlength="100"></label><label class="admin-field-wide">내용<textarea name="body" rows="6" required></textarea></label><label class="admin-field-wide">사진·영상 첨부<input name="mediaFiles" type="file" accept="image/*,video/*" multiple></label></div><button class="primary-btn" type="submit">운영팀 글 게시</button></form><div id="adminCommunityList" class="admin-control-list"></div></section>
    <section data-admin-content-pane="recreation" hidden>${guide("레크레이션 목록 관리", "이용자 추천은 검토 후 아래 양식으로 정식 등록합니다. 공개/비공개, 수정, 삭제가 가능하며 사진과 예시 영상도 파일로 첨부할 수 있습니다.")}<form id="adminRecreationForm" class="admin-control-card"><input name="activityId" type="hidden"><h2>레크레이션 등록·수정</h2><div class="admin-form-grid"><label>이름<input name="title" required></label><label>진행 유형<select name="playType"><option value="icebreak">아이스브레이킹</option><option value="team">팀전</option><option value="solo">개인전</option></select></label><label>최소 인원<input name="peopleMin" type="number" min="1"></label><label>최대 인원<input name="peopleMax" type="number" min="1"></label><label>소요 시간(분)<input name="duration" type="number" min="1"></label><label>공간<select name="spaces" multiple size="2"><option value="indoor">실내</option><option value="outdoor">야외</option></select></label><label class="admin-field-wide">한 줄 소개<input name="summary" required></label><label class="admin-field-wide">준비물 (쉼표 구분)<input name="materials"></label><label class="admin-field-wide">진행 방법<textarea name="instructions" rows="4"></textarea></label><label class="admin-field-wide">대본 예시<textarea name="scriptExample" rows="4"></textarea></label><label class="admin-field-wide">사진·영상<input name="mediaFiles" type="file" accept="image/*,video/*" multiple></label><label>노출 순서<input name="sortOrder" type="number" value="100"></label><label class="admin-inline-check"><input name="isActive" type="checkbox" checked>즉시 공개</label></div><div class="motf-admin-action-group"><button class="primary-btn" type="submit">저장</button><button class="secondary-btn" type="button" id="adminRecreationReset">새로 작성</button></div></form><div id="adminRecreationList" class="admin-control-list"></div></section>`; }

  function contentHtmlV2() {
    const actions = `<div class="motf-admin-action-group"><button class="primary-btn" type="submit">저장</button><button class="secondary-btn" type="button" data-v2-reset>새로 작성</button></div>`;
    return `<form id="adminSocialFormV2" class="admin-control-card admin-social-form"><h2>공식 채널</h2><div class="admin-form-grid"><label class="admin-field-wide">Instagram 주소<input name="instagramUrl" type="url" placeholder="https://www.instagram.com/..."></label></div><button class="secondary-btn" type="submit">채널 저장</button></form>
      <div class="admin-content-tabs"><button class="active" data-admin-content-tab="events">MOriginal</button><button data-admin-content-tab="cards">카드뉴스</button><button data-admin-content-tab="popups">팝업</button><button data-admin-content-tab="community">커뮤니티</button><button data-admin-content-tab="recreation">레크레이션</button></div>
      <section data-admin-content-pane="events"><form id="adminEventFormV2" class="admin-control-card"><input name="recordId" type="hidden"><h2>MOriginal 등록·수정</h2><div class="admin-form-grid"><label>제목<input name="title" required></label><label>짧은 소개<input name="shortDescription" required></label><label>포스터 파일<input name="posterFile" type="file" accept="image/*"></label><label>추가 사진<input name="galleryFiles" type="file" accept="image/*" multiple></label><label>장소명<input name="venueName"></label><label>행사 시작<input name="startsAt" type="datetime-local" required></label><label>행사 종료<input name="endsAt" type="datetime-local" required></label><label>신청 시작<input name="opensAt" type="datetime-local" required></label><label>신청 마감<input name="closesAt" type="datetime-local" required></label><label>1인 가격<input name="price" type="number" min="0" required></label><label>정원<input name="capacity" type="number" min="1" required></label><label>구글폼 URL<input name="formUrl" type="url"></label><label>홍보 영상 URL<input name="promoVideoUrl" type="url"></label><label>상태<select name="status"><option value="scheduled">일정에 따라 자동</option><option value="draft">임시저장</option><option value="closed">수동 마감</option><option value="completed">진행 종료</option></select></label><label class="admin-field-wide">상세 소개<textarea name="description" rows="5"></textarea></label><label class="admin-field-wide">하이라이트 (줄바꿈 구분)<textarea name="highlights" rows="3"></textarea></label></div>${actions}</form><div id="adminEventListV2" class="admin-control-list"></div></section>
      <section data-admin-content-pane="cards" hidden><form id="adminCardFormV2" class="admin-control-card"><input name="recordId" type="hidden"><h2>카드뉴스·프로모션 등록·수정</h2><div class="admin-form-grid"><label>제목<input name="title" required></label><label>설명<input name="subtitle"></label><label>이미지 파일<input name="imageFile" type="file" accept="image/*"></label><label>연결 URL<input name="linkUrl" type="url"></label><label>콘텐츠 유형<select name="placement"><option value="card_news">카드뉴스</option><option value="promotion">프로모션</option><option value="hero">moTF PICK</option></select></label><label>moTF PICK 위치<select name="homeSlot"><option value="">미사용</option><option value="1">1 · 큰 카드</option><option value="2">2 · 오른쪽 위</option><option value="3">3 · 오른쪽 아래</option></select></label><label>목록 순서<input name="sortOrder" type="number" min="0" max="99" value="3"></label></div>${actions}</form><div id="adminCardListV2" class="admin-control-list"></div></section>
      <section data-admin-content-pane="popups" hidden><form id="adminPopupFormV2" class="admin-control-card"><input name="recordId" type="hidden"><h2>팝업 등록·수정</h2><div class="admin-form-grid"><label>제목<input name="title" required></label><label>이미지 파일<input name="imageFile" type="file" accept="image/*"></label><label>연결 URL<input name="linkUrl" type="url"></label><label>시작<input name="startsAt" type="datetime-local" required value="${dateInput()}"></label><label>종료<input name="endsAt" type="datetime-local" required value="${dateInput(7)}"></label><label>닫기 유지 일수<input name="dismissDays" type="number" min="0" value="1"></label><label class="admin-field-wide">내용<textarea name="body" rows="3"></textarea></label></div>${actions}</form><div id="adminPopupListV2" class="admin-control-list"></div></section>
      <section data-admin-content-pane="community" hidden><form id="adminCommunityFormV2" class="admin-control-card"><input name="recordId" type="hidden"><h2>운영팀 게시글 등록·수정</h2><div class="admin-form-grid"><label>게시판<select name="board"><option value="market-share">나눔장터</option><option value="match">대결신청</option><option value="field-info">현장정보</option></select></label><label>제목<input name="title" required maxlength="100"></label><label class="admin-field-wide">내용<textarea name="body" rows="6" required></textarea></label><label class="admin-field-wide">사진·영상 첨부<input name="mediaFiles" type="file" accept="image/*,video/*" multiple></label></div>${actions}</form><div id="adminCommunityListV2" class="admin-control-list"></div><div id="adminCommunityDetailV2" class="admin-community-detail"></div></section>
      <section data-admin-content-pane="recreation" hidden><form id="adminRecreationFormV2" class="admin-control-card"><input name="recordId" type="hidden"><h2>레크레이션 등록·수정</h2><div class="admin-form-grid"><label>이름<input name="title" required></label><label>진행 유형<select name="playType"><option value="icebreak">아이스브레이킹</option><option value="team">팀전</option><option value="solo">개인전</option></select></label><label>최소 인원<input name="peopleMin" type="number" min="1"></label><label>최대 인원<input name="peopleMax" type="number" min="1"></label><label>소요 시간(분)<input name="duration" type="number" min="1"></label><label>공간<select name="spaces" multiple size="2"><option value="indoor">실내</option><option value="outdoor">야외</option></select></label><label class="admin-field-wide">한 줄 소개<input name="summary" required></label><label class="admin-field-wide">준비물 (쉼표 구분)<input name="materials"></label><label class="admin-field-wide">진행 방법<textarea name="instructions" rows="4"></textarea></label><label class="admin-field-wide">진행 대본<textarea name="scriptExample" rows="4"></textarea></label><label>예시 영상 URL<input name="exampleVideoUrl" type="url" placeholder="https://youtu.be/..."></label><label>대본 파일<input name="scriptFile" type="file" accept=".txt,.pdf,.doc,.docx,application/pdf"></label><label class="admin-field-wide">사진·영상<input name="mediaFiles" type="file" accept="image/*,video/*" multiple></label><label>노출 순서<input name="sortOrder" type="number" value="100"></label><label class="admin-inline-check"><input name="isActive" type="checkbox" checked>즉시 공개</label></div>${actions}</form><div id="adminRecreationListV2" class="admin-control-list"></div></section>`;
  }

  function toLocalDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  function resetV2Form(form) {
    form?.reset();
    if (form?.recordId) form.recordId.value = "";
    if (form?.sortOrder) form.sortOrder.value = form.id.includes("Card") ? 3 : 100;
    if (form?.isActive) form.isActive.checked = true;
  }

  function bindFormsV2() {
    $("#adminSocialFormV2")?.addEventListener("submit", saveSocialV2);
    $("#adminEventFormV2")?.addEventListener("submit", saveEventV2);
    $("#adminCardFormV2")?.addEventListener("submit", saveCardV2);
    $("#adminPopupFormV2")?.addEventListener("submit", savePopupV2);
    $("#adminCommunityFormV2")?.addEventListener("submit", saveCommunityV2);
    $("#adminRecreationFormV2")?.addEventListener("submit", saveRecreationV2);
    $("#adminDiscoverySearch")?.addEventListener("input", loadDiscoveryV2);
    document.addEventListener("click", handleAdminV2Click);
  }

  async function handleAdminV2Click(event) {
    const tab = event.target.closest("[data-admin-content-tab]");
    if (tab && tab.closest("#panel-master-launch-content")) {
      document.querySelectorAll("[data-admin-content-tab]").forEach((item) => item.classList.toggle("active", item === tab));
      document.querySelectorAll("[data-admin-content-pane]").forEach((item) => { item.hidden = item.dataset.adminContentPane !== tab.dataset.adminContentTab; });
      return;
    }
    const reset = event.target.closest("[data-v2-reset]");
    if (reset) return resetV2Form(reset.closest("form"));
    const edit = event.target.closest("[data-v2-edit]");
    if (edit) return editContentV2(edit.dataset.v2Edit, edit.dataset.id);
    const detail = event.target.closest("[data-community-detail]");
    if (detail) return loadCommunityDetailV2(detail.dataset.communityDetail);
    const commentDelete = event.target.closest("[data-comment-delete]");
    if (commentDelete && confirm("이 댓글만 삭제하시겠습니까?")) {
      const { error } = await client().from("community_comments").delete().eq("id", commentDelete.dataset.commentDelete);
      if (error) return alert(error.message);
      return loadCommunityDetailV2(commentDelete.dataset.postId);
    }
    const update = event.target.closest("[data-v2-update]");
    if (update) {
      const [table, id, field, value] = update.dataset.v2Update.split(":");
      const parsed = value === "true" ? true : value === "false" ? false : value;
      const { error } = await client().from(table).update({ [field]: parsed }).eq("id", id);
      if (error) alert(error.message); else await loadContentV2();
      return;
    }
    const remove = event.target.closest("[data-v2-delete]");
    if (remove && confirm("이 항목을 삭제하시겠습니까?")) {
      const [table, id] = remove.dataset.v2Delete.split(":");
      const { error } = await client().from(table).delete().eq("id", id);
      if (error) alert(error.message); else await loadContentV2();
    }
  }

  function discoverySelect(value, attr, id, labels) {
    const current = Math.max(0, Math.min(3, Number(value) || 0));
    return `<select ${attr}="${id}">${labels.map((label, index) => `<option value="${index}" ${current === index ? "selected" : ""}>${index} · ${label}</option>`).join("")}</select>`;
  }

  async function loadDiscoveryV2() {
    const { data, error } = await client().from("businesses").select("id,business_name,business_type,approval_status,is_featured,display_order,discovery_weight,commission_rate_override").order("display_order");
    const el = $("#adminDiscoveryList");
    if (error) return el.textContent = error.message;
    const query = $("#adminDiscoverySearch")?.value.trim().toLowerCase() || "";
    const rows = (data || []).filter((item) => String(item.business_name || "").toLowerCase().includes(query));
    el.innerHTML = rows.length ? `<div class="admin-discovery-toolbar">
      <label class="admin-inline-check"><input type="checkbox" id="adminDiscoverySelectAll"> 전체 선택</label>
      <label>선택 순서<select id="adminDiscoveryBulkOrder"><option value="">유지</option>${[0,1,2,3].map((value) => `<option value="${value}">${value}</option>`).join("")}</select></label>
      <label>선택 가중치<select id="adminDiscoveryBulkWeight"><option value="">유지</option>${[0,1,2,3].map((value) => `<option value="${value}">${value}</option>`).join("")}</select></label>
      <label>홈 추천<select id="adminDiscoveryBulkFeatured"><option value="">유지</option><option value="true">추천</option><option value="false">해제</option></select></label>
      <button class="secondary-btn" type="button" id="adminDiscoveryApplyBulk">선택 항목 적용</button>
      <button class="primary-btn" type="button" id="adminDiscoverySaveAll">전체 저장</button>
    </div>${rows.map((item) => `<article class="admin-control-row" data-discovery-row="${item.id}"><label class="admin-discovery-selector" title="선택"><input type="checkbox" data-discovery-select="${item.id}"></label><div><strong>${escapeHtml(item.business_name)}</strong><span>${item.business_type === "stay" ? "숙소" : "마트"} · ${escapeHtml(item.approval_status)}</span></div><label>노출 순서${discoverySelect(item.display_order, "data-business-order", item.id, ["가장 먼저", "앞쪽", "보통", "뒤쪽"])}</label><label>랜덤 가중치${discoverySelect(item.discovery_weight, "data-business-weight", item.id, ["랜덤 제외", "보통", "자주", "우선"])}</label><label>개별 수수료(%)<input type="number" step="0.1" value="${item.commission_rate_override == null ? "" : Number(item.commission_rate_override) * 100}" data-business-rate="${item.id}"></label><label class="admin-inline-check"><input type="checkbox" ${item.is_featured ? "checked" : ""} data-business-featured="${item.id}">홈 추천</label><button class="secondary-btn" type="button" data-save-discovery="${item.id}">저장</button></article>`).join("")}` : '<div class="admin-control-empty">검색 결과가 없습니다.</div>';
    el.querySelectorAll("[data-save-discovery]").forEach((button) => button.addEventListener("click", () => saveDiscoveryV2(button.dataset.saveDiscovery)));
    $("#adminDiscoverySelectAll")?.addEventListener("change", (event) => el.querySelectorAll("[data-discovery-select]").forEach((input) => { input.checked = event.target.checked; }));
    $("#adminDiscoveryApplyBulk")?.addEventListener("click", () => {
      const ids = [...el.querySelectorAll("[data-discovery-select]:checked")].map((input) => input.dataset.discoverySelect);
      if (!ids.length) return alert("먼저 변경할 업장을 선택해주세요.");
      const order = $("#adminDiscoveryBulkOrder").value;
      const weight = $("#adminDiscoveryBulkWeight").value;
      const featured = $("#adminDiscoveryBulkFeatured").value;
      ids.forEach((id) => {
        if (order !== "") $(`[data-business-order="${id}"]`).value = order;
        if (weight !== "") $(`[data-business-weight="${id}"]`).value = weight;
        if (featured !== "") $(`[data-business-featured="${id}"]`).checked = featured === "true";
      });
    });
    $("#adminDiscoverySaveAll")?.addEventListener("click", () => saveDiscoveryRows(rows.map((item) => item.id), true));
  }

  async function saveDiscoveryRows(ids, reload = false) {
    const button = $("#adminDiscoverySaveAll");
    if (button) { button.disabled = true; button.textContent = "저장 중..."; }
    const results = await Promise.all(ids.map((id) => {
      const order = Number($(`[data-business-order="${id}"]`).value);
      const weight = Number($(`[data-business-weight="${id}"]`).value);
      const rateValue = $(`[data-business-rate="${id}"]`).value;
      return client().rpc("admin_update_business_commerce", { target_business_id:id, commission_rate:rateValue === "" ? null : Number(rateValue) / 100, featured:$(`[data-business-featured="${id}"]`).checked, target_display_order:order, target_discovery_weight:weight });
    }));
    const failed = results.filter((result) => result.error);
    if (failed.length) { if (button) button.disabled = false; return alert(`${failed.length}개 항목을 저장하지 못했습니다.\n${failed[0].error.message}`); }
    if (reload) await loadDiscoveryV2();
    alert(`${ids.length}개 업장의 노출 설정을 저장했습니다.`);
  }

  async function saveDiscoveryV2(id) {
    await saveDiscoveryRows([id], true);
  }

  function contentRow(item, label, table, actions, kind = "") {
    return `<article class="admin-control-row admin-content-row ${kind}"><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(item.id)}</span></div><div class="motf-admin-action-group">${actions}<button class="motf-reject-action-btn" type="button" data-v2-delete="${table}:${item.id}">삭제</button></div></article>`;
  }

  async function loadContentV2() {
    const [events, cards, popups, recreation, community, social] = await Promise.all([
      client().from("platform_events").select("*").order("created_at", { ascending:false }),
      client().from("homepage_cards").select("*").order("sort_order"),
      client().from("popup_banners").select("*").order("created_at", { ascending:false }),
      client().from("recreation_activities").select("*").order("sort_order"),
      client().from("community_posts").select("*").order("created_at", { ascending:false }).limit(100),
      client().from("platform_settings").select("setting_value").eq("setting_key", "social").maybeSingle(),
    ]);
    [events, cards, popups, recreation, community].forEach((result) => { if (result.error) console.warn(result.error); });
    adminEvents = events.data || []; adminCards = cards.data || []; adminPopups = popups.data || []; adminRecreation = recreation.data || []; adminCommunity = community.data || [];
    $("#adminSocialFormV2").instagramUrl.value = social.data?.setting_value?.instagram_url || "";
    $("#adminEventListV2").innerHTML = adminEvents.map((item) => contentRow(item, `${item.title} · ${eventStatusLabel(item)} · ${new Date(item.starts_at).toLocaleString()}`, "platform_events", `<button class="secondary-btn" data-v2-edit="event" data-id="${item.id}">수정</button><button class="secondary-btn" data-v2-update="platform_events:${item.id}:status:${item.status === "closed" ? "scheduled" : "closed"}">${item.status === "closed" ? "자동화 재개" : "신청 마감"}</button>`)).join("") || '<div class="admin-control-empty">등록된 항목이 없습니다.</div>';
    $("#adminCardListV2").innerHTML = adminCards.map((item) => contentRow(item, `${item.title} · ${item.placement === "promotion" ? "프로모션" : item.placement === "hero" ? `moTF PICK ${item.home_slot || "미지정"}` : "카드뉴스"} · ${item.is_active ? "노출" : "숨김"}`, "homepage_cards", `<button class="secondary-btn" data-v2-edit="card" data-id="${item.id}">수정</button><button class="secondary-btn" data-v2-update="homepage_cards:${item.id}:is_active:${!item.is_active}">${item.is_active ? "숨기기" : "노출"}</button>`, `content-kind-${item.placement}`)).join("") || '<div class="admin-control-empty">등록된 항목이 없습니다.</div>';
    $("#adminPopupListV2").innerHTML = adminPopups.map((item) => contentRow(item, `${item.title} · ${new Date(item.ends_at).toLocaleString()}까지`, "popup_banners", `<button class="secondary-btn" data-v2-edit="popup" data-id="${item.id}">수정</button><button class="secondary-btn" data-v2-update="popup_banners:${item.id}:is_active:${!item.is_active}">${item.is_active ? "중지" : "노출"}</button>`)).join("") || '<div class="admin-control-empty">등록된 항목이 없습니다.</div>';
    $("#adminCommunityListV2").innerHTML = adminCommunity.map((item) => contentRow(item, `${item.title} · ${item.author_name} · ${item.is_hidden ? "숨김" : "공개"}`, "community_posts", `<button class="secondary-btn" data-community-detail="${item.id}">본문·댓글</button><button class="secondary-btn" data-v2-edit="community" data-id="${item.id}">수정</button><button class="secondary-btn" data-v2-update="community_posts:${item.id}:is_hidden:${!item.is_hidden}">${item.is_hidden ? "공개" : "숨기기"}</button>`)).join("") || '<div class="admin-control-empty">등록된 항목이 없습니다.</div>';
    $("#adminRecreationListV2").innerHTML = adminRecreation.map((item) => contentRow(item, `${item.title} · ${playTypeLabel(item.play_type)} · ${item.is_active ? "공개" : "비공개"}`, "recreation_activities", `<button class="secondary-btn" data-v2-edit="recreation" data-id="${item.id}">수정</button><button class="secondary-btn" data-v2-update="recreation_activities:${item.id}:is_active:${!item.is_active}">${item.is_active ? "비공개" : "공개"}</button>`)).join("") || '<div class="admin-control-empty">등록된 항목이 없습니다.</div>';
  }

  function editContentV2(kind, id) {
    const configs = { event:[adminEvents, "#adminEventFormV2"], card:[adminCards, "#adminCardFormV2"], popup:[adminPopups, "#adminPopupFormV2"], community:[adminCommunity, "#adminCommunityFormV2"], recreation:[adminRecreation, "#adminRecreationFormV2"] };
    const [items, selector] = configs[kind] || [];
    const item = items?.find((row) => row.id === id);
    const form = $(selector);
    if (!item || !form) return;
    form.recordId.value = item.id;
    if (kind === "event") {
      form.title.value=item.title||""; form.shortDescription.value=item.short_description||""; form.venueName.value=item.venue_name||"";
      form.startsAt.value=toLocalDateTime(item.starts_at); form.endsAt.value=toLocalDateTime(item.ends_at); form.opensAt.value=toLocalDateTime(item.application_opens_at); form.closesAt.value=toLocalDateTime(item.application_closes_at);
      form.price.value=item.price_per_person||0; form.capacity.value=item.capacity||1; form.formUrl.value=item.google_form_url||""; form.promoVideoUrl.value=item.promo_video_url||""; form.status.value=item.status||"scheduled"; form.description.value=item.description||""; form.highlights.value=(item.highlights||[]).join("\n");
    }
    if (kind === "card") {
      form.title.value=item.title||""; form.subtitle.value=item.subtitle||""; form.linkUrl.value=item.link_url||""; form.placement.value=item.placement||"card_news"; form.homeSlot.value=item.home_slot||""; form.sortOrder.value=item.sort_order??3;
    }
    if (kind === "popup") {
      form.title.value=item.title||""; form.linkUrl.value=item.link_url||""; form.startsAt.value=toLocalDateTime(item.starts_at); form.endsAt.value=toLocalDateTime(item.ends_at); form.dismissDays.value=item.dismiss_days??1; form.body.value=item.body||"";
    }
    if (kind === "community") {
      form.board.value=item.board_key||"field-info"; form.title.value=item.title||""; form.body.value=item.body||"";
    }
    if (kind === "recreation") {
      form.title.value=item.title||""; form.summary.value=item.summary||""; form.peopleMin.value=item.people_min||""; form.peopleMax.value=item.people_max||""; form.playType.value=item.play_type||"team"; form.duration.value=item.duration_minutes||""; form.materials.value=(item.materials||[]).join(", "); form.instructions.value=item.instructions||""; form.scriptExample.value=item.script_example||""; form.exampleVideoUrl.value=item.example_video_url||""; form.sortOrder.value=item.sort_order??100; form.isActive.checked=Boolean(item.is_active);
      Array.from(form.spaces.options).forEach((option)=>{ option.selected=(item.spaces||[]).includes(option.value); });
    }
    form.scrollIntoView({ behavior:"smooth", block:"start" });
  }

  async function loadCommunityDetailV2(postId) {
    const post = adminCommunity.find((item) => item.id === postId);
    const { data, error } = await client().from("community_comments").select("id,post_id,user_id,parent_comment_id,body,created_at").eq("post_id", postId).order("created_at");
    const box = $("#adminCommunityDetailV2");
    if (error) return box.textContent = error.message;
    box.innerHTML = `<article><h3>${escapeHtml(post?.title || "게시글 상세")}</h3><p class="admin-community-body">${escapeHtml(post?.body || "")}</p><strong>댓글 ${(data || []).length}개</strong><div class="admin-comment-list">${(data || []).map((comment) => `<div><span>${new Date(comment.created_at).toLocaleString()}${comment.parent_comment_id ? " · 답글" : ""}</span><p>${escapeHtml(comment.body)}</p><button class="motf-reject-action-btn" type="button" data-comment-delete="${comment.id}" data-post-id="${postId}">이 댓글 삭제</button></div>`).join("") || "댓글이 없습니다."}</div></article>`;
    box.scrollIntoView({ behavior:"smooth", block:"nearest" });
  }

  async function saveSocialV2(event) { event.preventDefault(); const url=event.target.instagramUrl.value.trim(); const {error}=await client().from("platform_settings").upsert({setting_key:"social",setting_value:{instagram_url:url},description:"공식 소셜 채널",is_public:true,updated_by:window.motfCurrentProfile.id}); alert(error?error.message:"공식 채널을 저장했습니다."); }

  async function saveEventV2(event) { event.preventDefault(); const f=event.target; await withSubmitting(f, async()=>{ const current=adminEvents.find((x)=>x.id===f.recordId.value); const uploaded=await uploadMedia(f.posterFile.files[0],"events"); const gallery=[...(current?.gallery_urls||[]),...await uploadMediaList(f.galleryFiles.files,"events")]; const payload={slug:current?.slug||`${Date.now()}-${f.title.value.trim().replace(/\s+/g,"-").slice(0,24)}`,title:f.title.value.trim(),short_description:f.shortDescription.value.trim(),description:f.description.value.trim()||null,poster_url:uploaded||current?.poster_url,gallery_urls:gallery,venue_name:f.venueName.value.trim()||null,starts_at:new Date(f.startsAt.value).toISOString(),ends_at:new Date(f.endsAt.value).toISOString(),application_opens_at:new Date(f.opensAt.value).toISOString(),application_closes_at:new Date(f.closesAt.value).toISOString(),price_per_person:Number(f.price.value),capacity:Number(f.capacity.value),google_form_url:f.formUrl.value.trim()||null,promo_video_url:f.promoVideoUrl.value.trim()||null,status:f.status.value,highlights:f.highlights.value.split("\n").map(x=>x.trim()).filter(Boolean),created_by:current?.created_by||window.motfCurrentProfile.id}; if(!payload.poster_url) throw new Error("포스터 파일을 선택해주세요."); const query=current?client().from("platform_events").update(payload).eq("id",current.id):client().from("platform_events").insert(payload); const {error}=await query;if(error)throw error;resetV2Form(f);await loadContentV2(); }); }
  async function saveCardV2(event) { event.preventDefault(); const f=event.target; await withSubmitting(f, async()=>{ const current=adminCards.find((x)=>x.id===f.recordId.value); const uploaded=await uploadMedia(f.imageFile.files[0],"homepage-cards"); const payload={title:f.title.value.trim(),subtitle:f.subtitle.value.trim()||null,image_url:uploaded||current?.image_url,link_url:f.linkUrl.value.trim()||null,placement:f.placement.value,home_slot:f.placement.value==="hero"&&f.homeSlot.value?Number(f.homeSlot.value):null,sort_order:Number(f.sortOrder.value)||0,created_by:current?.created_by||window.motfCurrentProfile.id}; if(!payload.image_url)throw new Error("이미지 파일을 선택해주세요."); if(payload.home_slot){await client().from("homepage_cards").update({home_slot:null}).eq("home_slot",payload.home_slot).neq("id",current?.id||"00000000-0000-0000-0000-000000000000");} const query=current?client().from("homepage_cards").update(payload).eq("id",current.id):client().from("homepage_cards").insert(payload);const {error}=await query;if(error)throw error;resetV2Form(f);await loadContentV2(); }); }
  async function savePopupV2(event) { event.preventDefault(); const f=event.target; await withSubmitting(f, async()=>{ const current=adminPopups.find((x)=>x.id===f.recordId.value); const uploaded=await uploadMedia(f.imageFile.files[0],"popups"); const payload={title:f.title.value.trim(),body:f.body.value.trim()||null,image_url:uploaded||current?.image_url||null,link_url:f.linkUrl.value.trim()||null,starts_at:new Date(f.startsAt.value).toISOString(),ends_at:new Date(f.endsAt.value).toISOString(),dismiss_days:Number(f.dismissDays.value)||1,created_by:current?.created_by||window.motfCurrentProfile.id};const query=current?client().from("popup_banners").update(payload).eq("id",current.id):client().from("popup_banners").insert(payload);const {error}=await query;if(error)throw error;resetV2Form(f);await loadContentV2(); }); }
  async function saveCommunityV2(event) { event.preventDefault(); const f=event.target; await withSubmitting(f, async()=>{ const current=adminCommunity.find((x)=>x.id===f.recordId.value); const media=[...(current?.media_urls||[]),...await uploadMediaList(f.mediaFiles.files,"community")]; const payload={author_id:current?.author_id||window.motfCurrentProfile.id,author_name:current?.author_name||"운영팀",board_key:f.board.value,title:f.title.value.trim(),body:f.body.value.trim(),media_urls:media};const query=current?client().from("community_posts").update(payload).eq("id",current.id):client().from("community_posts").insert(payload);const {error}=await query;if(error)throw error;resetV2Form(f);await loadContentV2(); }); }
  async function saveRecreationV2(event) { event.preventDefault(); const f=event.target; await withSubmitting(f, async()=>{ const current=adminRecreation.find((x)=>x.id===f.recordId.value); const media=[...(current?.media_urls||[]),...await uploadMediaList(f.mediaFiles.files,"recreation")]; const scriptFile=await uploadMedia(f.scriptFile.files[0],"recreation-scripts"); const payload={title:f.title.value.trim(),summary:f.summary.value.trim(),people_min:Number(f.peopleMin.value)||null,people_max:Number(f.peopleMax.value)||null,spaces:Array.from(f.spaces.selectedOptions).map(x=>x.value),play_type:f.playType.value,duration_minutes:Number(f.duration.value)||null,materials:f.materials.value.split(",").map(x=>x.trim()).filter(Boolean),instructions:f.instructions.value.trim()||null,script_example:f.scriptExample.value.trim()||null,example_video_url:f.exampleVideoUrl.value.trim()||null,script_file_url:scriptFile||current?.script_file_url||null,media_urls:media,is_active:f.isActive.checked,sort_order:Number(f.sortOrder.value)||100,created_by:current?.created_by||window.motfCurrentProfile.id};const query=current?client().from("recreation_activities").update(payload).eq("id",current.id):client().from("recreation_activities").insert(payload);const {error}=await query;if(error)throw error;resetV2Form(f);await loadContentV2(); }); }

  function bindForms(){
    $("#adminCommissionForm")?.addEventListener("submit",saveCommission); $("#adminPointForm")?.addEventListener("submit",adjustPoints); $("#adminCouponForm")?.addEventListener("submit",saveCoupon); $("#adminCampaignForm")?.addEventListener("submit",saveCampaign); $("#adminSocialForm")?.addEventListener("submit",saveSocial); $("#adminEventForm")?.addEventListener("submit",saveEvent); $("#adminCardForm")?.addEventListener("submit",saveCard); $("#adminPopupForm")?.addEventListener("submit",savePopup); $("#adminCommunityForm")?.addEventListener("submit",saveCommunityPost); $("#adminRecreationForm")?.addEventListener("submit",saveRecreation);
    $("#adminRecreationReset")?.addEventListener("click", resetRecreationForm);
    $("#adminDiscoverySearch")?.addEventListener("input", loadDiscovery);
    document.addEventListener("click",async(event)=>{ const tab=event.target.closest("[data-admin-content-tab]"); if(tab){ document.querySelectorAll("[data-admin-content-tab]").forEach(x=>x.classList.toggle("active",x===tab)); document.querySelectorAll("[data-admin-content-pane]").forEach(x=>x.hidden=x.dataset.adminContentPane!==tab.dataset.adminContentTab); return; } const edit=event.target.closest("[data-recreation-edit]"); if(edit){ editRecreation(edit.dataset.recreationEdit); return; } const update=event.target.closest("[data-admin-update]"); if(update){const [table,id,field,value]=update.dataset.adminUpdate.split(":");const parsed=value==="true"?true:value==="false"?false:value;const {error}=await client().from(table).update({[field]:parsed}).eq("id",id);if(error)alert(error.message);else loadContent();return;} const action=event.target.closest("[data-admin-delete]"); if(action&&confirm("이 항목을 삭제하시겠습니까?")){ const [table,id]=action.dataset.adminDelete.split(":"); const {error}=await client().from(table).delete().eq("id",id); if(error) alert(error.message); else loadContent(); } });
    $("#adminPointMemberSearch")?.addEventListener("input", filterPointMembers);
  }

  function filterPointMembers(){
    const query=$("#adminPointMemberSearch")?.value.trim().toLowerCase()||"";
    const rows=adminMembers.filter((p)=>[p.full_name,p.email,p.phone].some((value)=>String(value||"").toLowerCase().includes(query)));
    const select=$("#adminPointForm")?.userId;
    if(select) select.innerHTML=rows.map(p=>`<option value="${p.id}">${escapeHtml(p.full_name||p.email)} · ${escapeHtml(p.phone||"")}</option>`).join("")||'<option value="">검색 결과 없음</option>';
  }
  async function loadCommerce(){ requireAdmin(); const [settings,profiles,coupons,campaigns]=await Promise.all([client().from("platform_settings").select("setting_value").eq("setting_key","commission").maybeSingle(),client().from("profiles").select("id,email,full_name,phone").eq("role","user").order("created_at",{ascending:false}).limit(500),client().from("coupons").select("*").order("created_at",{ascending:false}),client().from("point_campaigns").select("*").order("created_at",{ascending:false})]); const value=settings.data?.setting_value||{}; adminMembers=profiles.data||[]; $("#adminCommissionForm").stayRate.value=Number(value.stay_rate||.035)*100; $("#adminCommissionForm").marketRate.value=Number(value.market_rate||.035)*100; filterPointMembers(); $("#adminCouponList").innerHTML=listRows(coupons.data||[],item=>`${item.code} · ${item.discount_type==="percent"?`${item.discount_value}%`:money(item.discount_value)} · ${new Date(item.ends_at).toLocaleDateString()}`,"coupons"); $("#adminCampaignList").innerHTML=listRows(campaigns.data||[],item=>`${item.name} · ${Number(item.reward_rate)*100}% · ${item.is_active?"활성":"중지"}`,"point_campaigns"); }
  async function saveCommission(event){event.preventDefault();const f=event.target;const {error}=await client().from("platform_settings").upsert({setting_key:"commission",setting_value:{stay_rate:Number(f.stayRate.value)/100,market_rate:Number(f.marketRate.value)/100},description:"베타 기본 중개 수수료",is_public:false,updated_by:window.motfCurrentProfile.id});alert(error?error.message:"기본 수수료를 저장했습니다.");}
  async function adjustPoints(event){event.preventDefault();const f=event.target;const {data,error}=await client().rpc("admin_adjust_points",{target_user_id:f.userId.value,adjustment:Number(f.amount.value),adjustment_reason:f.reason.value});alert(error?error.message:`반영 완료 · 현재 ${Number(data).toLocaleString()}P`);if(!error){f.amount.value="";f.reason.value="";}}
  async function saveCoupon(event){event.preventDefault();const f=event.target;const payload={code:f.code.value.trim().toUpperCase(),name:f.name.value.trim(),discount_type:f.discountType.value,discount_value:Number(f.discountValue.value),maximum_discount:Number(f.maximumDiscount.value)||null,minimum_order_amount:Number(f.minimumAmount.value)||0,total_usage_limit:Number(f.totalUsageLimit.value)||null,per_user_limit:Math.max(1,Number(f.perUserLimit.value)||1),applies_to:f.appliesTo.value,starts_at:new Date(f.startsAt.value).toISOString(),ends_at:new Date(f.endsAt.value).toISOString(),created_by:window.motfCurrentProfile.id};const {error}=await client().from("coupons").insert(payload);if(error)alert(error.message);else{event.target.reset();await loadCommerce();}}
  async function saveCampaign(event){event.preventDefault();const f=event.target;const {error}=await client().from("point_campaigns").insert({name:f.name.value.trim(),campaign_kind:"cashback",transaction_kind:f.kind.value,reward_rate:Number(f.rate.value)/100,max_points:Number(f.maxPoints.value)||null,starts_at:new Date(f.startsAt.value).toISOString(),ends_at:new Date(f.endsAt.value).toISOString(),created_by:window.motfCurrentProfile.id});if(error)alert(error.message);else{event.target.reset();await loadCommerce();}}
  async function loadDiscovery(){const {data,error}=await client().from("businesses").select("id,business_name,business_type,approval_status,is_featured,display_order,discovery_weight,commission_rate_override").order("display_order");const el=$("#adminDiscoveryList");if(error)return el.textContent=error.message;const query=$("#adminDiscoverySearch")?.value.trim().toLowerCase()||"";const rows=(data||[]).filter((b)=>String(b.business_name||"").toLowerCase().includes(query));el.innerHTML=rows.map(b=>`<article class="admin-control-row"><div><strong>${escapeHtml(b.business_name)}</strong><span>${b.business_type==="stay"?"숙소":"마트"} · ${escapeHtml(b.approval_status)}</span></div><label>노출 순서<input type="number" value="${b.display_order}" data-business-order="${b.id}"></label><label>랜덤 가중치<input type="number" min="0" max="10000" value="${b.discovery_weight}" data-business-weight="${b.id}"></label><label>개별 수수료(%)<input type="number" step="0.1" value="${b.commission_rate_override==null?"":Number(b.commission_rate_override)*100}" data-business-rate="${b.id}"></label><label class="admin-inline-check"><input type="checkbox" ${b.is_featured?"checked":""} data-business-featured="${b.id}">홈 추천</label><button class="secondary-btn" onclick="motfSaveBusinessDiscovery('${b.id}')">저장</button></article>`).join("")||'<div class="admin-control-empty">검색 결과가 없습니다.</div>';}
  window.motfSaveBusinessDiscovery=async function(id){const order=Number($(`[data-business-order="${id}"]`).value);const weight=Number($(`[data-business-weight="${id}"]`).value);const rateValue=$(`[data-business-rate="${id}"]`).value;const {error}=await client().rpc("admin_update_business_commerce",{target_business_id:id,commission_rate:rateValue===""?null:Number(rateValue)/100,featured:$(`[data-business-featured="${id}"]`).checked,target_display_order:order,target_discovery_weight:weight});alert(error?error.message:"노출 설정을 저장했습니다.");};
  async function loadContent(){const [events,cards,popups,recreation,community,social]=await Promise.all([client().from("platform_events").select("*").order("created_at",{ascending:false}),client().from("homepage_cards").select("*").order("sort_order"),client().from("popup_banners").select("*").order("created_at",{ascending:false}),client().from("recreation_activities").select("*").order("sort_order"),client().from("community_posts").select("*").order("created_at",{ascending:false}).limit(100),client().from("platform_settings").select("setting_value").eq("setting_key","social").maybeSingle()]);adminRecreation=recreation.data||[];$("#adminSocialForm").instagramUrl.value=social.data?.setting_value?.instagram_url||"";$("#adminEventList").innerHTML=managedRows(events.data||[],x=>`${x.title} · ${eventStatusLabel(x)} · ${new Date(x.starts_at).toLocaleString()}`,"platform_events",x=>`<button class="secondary-btn" data-admin-update="platform_events:${x.id}:status:${x.status==="closed"?"scheduled":"closed"}">${x.status==="closed"?"일정 자동화 재개":"신청 마감"}</button><button class="secondary-btn" data-admin-update="platform_events:${x.id}:status:completed">진행 종료</button>`);$("#adminCardList").innerHTML=managedRows(cards.data||[],x=>`${x.title} · ${x.placement} · ${x.is_active?"노출":"숨김"}`,"homepage_cards",x=>`<button class="secondary-btn" data-admin-update="homepage_cards:${x.id}:is_active:${!x.is_active}">${x.is_active?"숨기기":"노출하기"}</button>`);$("#adminPopupList").innerHTML=managedRows(popups.data||[],x=>`${x.title} · ${new Date(x.ends_at).toLocaleString()}까지`,"popup_banners",x=>`<button class="secondary-btn" data-admin-update="popup_banners:${x.id}:is_active:${!x.is_active}">${x.is_active?"중지":"노출"}</button>`);$("#adminCommunityList").innerHTML=managedRows(community.data||[],x=>`${x.title} · ${x.author_name} · ${x.is_hidden?"숨김":"공개"}`,"community_posts",x=>`<button class="secondary-btn" data-admin-update="community_posts:${x.id}:is_hidden:${!x.is_hidden}">${x.is_hidden?"공개":"숨기기"}</button>`);$("#adminRecreationList").innerHTML=managedRows(adminRecreation,x=>`${x.title} · ${playTypeLabel(x.play_type)} · ${x.is_active?"공개":"비공개"}`,"recreation_activities",x=>`<button class="secondary-btn" data-recreation-edit="${x.id}">수정</button><button class="secondary-btn" data-admin-update="recreation_activities:${x.id}:is_active:${!x.is_active}">${x.is_active?"비공개":"공개"}</button>`);}
  async function saveSocial(event){event.preventDefault();const url=event.target.instagramUrl.value.trim();const {error}=await client().from("platform_settings").upsert({setting_key:"social",setting_value:{instagram_url:url},description:"공식 소셜 채널",is_public:true,updated_by:window.motfCurrentProfile.id});alert(error?error.message:"공식 채널을 저장했습니다.");}
  function eventStatusLabel(item){const now=Date.now();if(item.status==="draft")return "임시저장";if(item.status==="completed"||now>=new Date(item.ends_at).getTime())return "진행 종료";if(item.status==="closed"||now>=new Date(item.application_closes_at).getTime()||item.application_count>=item.capacity)return "신청 마감";if(now>=new Date(item.application_opens_at).getTime())return "신청 중";return "곧 신청";}
  function playTypeLabel(value){return {icebreak:"아이스브레이킹",team:"팀전",solo:"개인전"}[value]||value;}
  async function withSubmitting(form, task){const button=form.querySelector('[type="submit"]');const old=button?.textContent;if(button){button.disabled=true;button.textContent="업로드 중...";}try{await task();}catch(error){console.error(error);alert(error.message||"저장하지 못했습니다.");}finally{if(button){button.disabled=false;button.textContent=old;}}}
  async function saveEvent(event){event.preventDefault();const f=event.target;await withSubmitting(f,async()=>{const poster=await uploadMedia(f.posterFile.files[0],"events");const gallery=await uploadMediaList(f.galleryFiles.files,"events");const slug=`${Date.now()}-${f.title.value.trim().replace(/\s+/g,"-").slice(0,24)}`;const {error}=await client().from("platform_events").insert({slug,title:f.title.value.trim(),short_description:f.shortDescription.value.trim(),description:f.description.value.trim()||null,poster_url:poster,gallery_urls:gallery,venue_name:f.venueName.value.trim()||null,starts_at:new Date(f.startsAt.value).toISOString(),ends_at:new Date(f.endsAt.value).toISOString(),application_opens_at:new Date(f.opensAt.value).toISOString(),application_closes_at:new Date(f.closesAt.value).toISOString(),price_per_person:Number(f.price.value),capacity:Number(f.capacity.value),google_form_url:f.formUrl.value.trim()||null,promo_video_url:f.promoVideoUrl.value.trim()||null,status:f.status.value,highlights:f.highlights.value.split("\n").map(x=>x.trim()).filter(Boolean),created_by:window.motfCurrentProfile.id});if(error)throw error;f.reset();await loadContent();alert("MOriginal을 저장했습니다.");});}
  async function saveCard(event){event.preventDefault();const f=event.target;await withSubmitting(f,async()=>{const image=await uploadMedia(f.imageFile.files[0],"homepage-cards");const {error}=await client().from("homepage_cards").insert({title:f.title.value.trim(),subtitle:f.subtitle.value.trim()||null,image_url:image,link_url:f.linkUrl.value.trim()||null,placement:f.placement.value,sort_order:Number(f.sortOrder.value)||100,created_by:window.motfCurrentProfile.id});if(error)throw error;f.reset();await loadContent();});}
  async function savePopup(event){event.preventDefault();const f=event.target;await withSubmitting(f,async()=>{const image=await uploadMedia(f.imageFile.files[0],"popups");const {error}=await client().from("popup_banners").insert({title:f.title.value.trim(),body:f.body.value.trim()||null,image_url:image,link_url:f.linkUrl.value.trim()||null,starts_at:new Date(f.startsAt.value).toISOString(),ends_at:new Date(f.endsAt.value).toISOString(),dismiss_days:Number(f.dismissDays.value)||1,created_by:window.motfCurrentProfile.id});if(error)throw error;f.reset();await loadContent();});}
  async function saveCommunityPost(event){event.preventDefault();const f=event.target;await withSubmitting(f,async()=>{const media=await uploadMediaList(f.mediaFiles.files,"community");const {error}=await client().from("community_posts").insert({author_id:window.motfCurrentProfile.id,author_name:"운영팀",board_key:f.board.value,title:f.title.value.trim(),body:f.body.value.trim(),media_urls:media});if(error)throw error;f.reset();await loadContent();alert("운영팀 게시글을 등록했습니다.");});}
  async function saveRecreation(event){event.preventDefault();const f=event.target;await withSubmitting(f,async()=>{const current=adminRecreation.find((item)=>item.id===f.activityId.value);const media=[...(current?.media_urls||[]),...await uploadMediaList(f.mediaFiles.files,"recreation")];const payload={title:f.title.value.trim(),summary:f.summary.value.trim(),people_min:Number(f.peopleMin.value)||null,people_max:Number(f.peopleMax.value)||null,spaces:Array.from(f.spaces.selectedOptions).map((item)=>item.value),play_type:f.playType.value,duration_minutes:Number(f.duration.value)||null,materials:f.materials.value.split(",").map((x)=>x.trim()).filter(Boolean),instructions:f.instructions.value.trim()||null,script_example:f.scriptExample.value.trim()||null,media_urls:media,is_active:f.isActive.checked,sort_order:Number(f.sortOrder.value)||100,created_by:window.motfCurrentProfile.id};const query=current?client().from("recreation_activities").update(payload).eq("id",current.id):client().from("recreation_activities").insert(payload);const {error}=await query;if(error)throw error;resetRecreationForm();await loadContent();alert("레크레이션을 저장했습니다.");});}
  function editRecreation(id){const item=adminRecreation.find((row)=>row.id===id);const f=$("#adminRecreationForm");if(!item||!f)return;f.activityId.value=item.id;f.title.value=item.title||"";f.summary.value=item.summary||"";f.peopleMin.value=item.people_min||"";f.peopleMax.value=item.people_max||"";f.playType.value=item.play_type;f.duration.value=item.duration_minutes||"";f.materials.value=(item.materials||[]).join(", ");f.instructions.value=item.instructions||"";f.scriptExample.value=item.script_example||"";f.sortOrder.value=item.sort_order||100;f.isActive.checked=Boolean(item.is_active);Array.from(f.spaces.options).forEach((option)=>{option.selected=(item.spaces||[]).includes(option.value);});f.scrollIntoView({behavior:"smooth",block:"start"});}
  function resetRecreationForm(){const f=$("#adminRecreationForm");if(!f)return;f.reset();f.activityId.value="";f.sortOrder.value=100;f.isActive.checked=true;}
  function listRows(items,label,table){return items.length?items.map(item=>`<article class="admin-control-row"><div><strong>${escapeHtml(label(item))}</strong><span>${escapeHtml(item.id)}</span></div><button class="motf-reject-action-btn" type="button" data-admin-delete="${table}:${item.id}">삭제</button></article>`).join(""):'<div class="admin-control-empty">등록된 항목이 없습니다.</div>';}
  function managedRows(items,label,table,actions){return items.length?items.map(item=>`<article class="admin-control-row admin-content-row"><div><strong>${escapeHtml(label(item))}</strong><span>${escapeHtml(item.id)}</span></div><div class="motf-admin-action-group">${actions(item)}<button class="motf-reject-action-btn" type="button" data-admin-delete="${table}:${item.id}">삭제</button></div></article>`).join(""):'<div class="admin-control-empty">등록된 항목이 없습니다.</div>';}
  void contentHtml;
  void bindForms;
})();
