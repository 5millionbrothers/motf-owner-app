(function hardenAdminLaunchContent() {
  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  let events = [];
  let submissions = [];
  let enhancing = false;

  function client() { return window.motfSupabase; }
  function isAdmin() { return window.motfCurrentProfile?.role === "admin"; }
  function localDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }
  function parseTimeline(value) {
    return String(value || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [time = "", title = "", description = ""] = line.split("|").map((item) => item.trim());
      return { time, title, description };
    }).filter((item) => item.title);
  }
  function timelineText(items) {
    return (Array.isArray(items) ? items : []).map((item) => [item.time, item.title, item.description].filter(Boolean).join(" | ")).join("\n");
  }
  async function upload(file, folder) {
    if (!file) return null;
    const extension = String(file.name || "file").split(".").pop().toLowerCase();
    const path = `${folder}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
    const { error } = await client().storage.from("content-media").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || undefined });
    if (error) throw error;
    return client().storage.from("content-media").getPublicUrl(path).data.publicUrl;
  }
  async function uploadMany(files, folder) {
    return Promise.all(Array.from(files || []).map((file) => upload(file, folder)));
  }

  function resetEventForm() {
    const form = $("#adminEventForm");
    if (!form) return;
    form.reset();
    form.eventId.value = "";
    form.querySelector("h2").textContent = "MOriginal 등록·수정";
    const status = $("[data-event-poster-status]", form);
    if (status) status.textContent = "새 등록 시 포스터 파일이 필요합니다.";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadEvents() {
    if (!isAdmin() || !client()) return;
    const { data, error } = await client().from("platform_events").select("*").order("created_at", { ascending: false });
    if (!error) events = data || [];
    enhanceEventRows();
  }

  function enhanceEventRows() {
    $("#adminEventList")?.querySelectorAll(".admin-control-row").forEach((row) => {
      const id = row.querySelector("span")?.textContent.trim();
      const actions = row.querySelector(".motf-admin-action-group");
      if (!id || !actions || actions.querySelector("[data-event-edit]")) return;
      actions.insertAdjacentHTML("afterbegin", `<button class="secondary-btn" type="button" data-event-edit="${escapeHtml(id)}">전체 수정</button>`);
    });
  }

  function editEvent(id) {
    const item = events.find((event) => String(event.id) === String(id));
    const form = $("#adminEventForm");
    if (!item || !form) return;
    form.eventId.value = item.id;
    form.title.value = item.title || "";
    form.shortDescription.value = item.short_description || "";
    form.description.value = item.description || "";
    form.venueName.value = item.venue_name || "";
    form.startsAt.value = localDateTime(item.starts_at);
    form.endsAt.value = localDateTime(item.ends_at);
    form.opensAt.value = localDateTime(item.application_opens_at);
    form.closesAt.value = localDateTime(item.application_closes_at);
    form.price.value = item.price_per_person ?? 0;
    form.capacity.value = item.capacity ?? 1;
    form.formUrl.value = item.google_form_url || "";
    form.promoVideoUrl.value = item.promo_video_url || "";
    form.status.value = item.status || "scheduled";
    form.highlights.value = (item.highlights || []).join("\n");
    form.timelineText.value = timelineText(item.timeline);
    form.querySelector("h2").textContent = `MOriginal 수정 · ${item.title}`;
    $("[data-event-poster-status]", form).textContent = "새 파일을 선택하지 않으면 기존 포스터와 추가 사진을 유지합니다.";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveEvent(form) {
    const id = form.eventId.value;
    const current = events.find((item) => String(item.id) === String(id));
    const nextPoster = await upload(form.posterFile.files[0], "events");
    if (!nextPoster && !current?.poster_url) throw new Error("새 MOriginal에는 포스터 파일이 필요합니다.");
    const nextGallery = await uploadMany(form.galleryFiles.files, "events");
    const payload = {
      title: form.title.value.trim(),
      short_description: form.shortDescription.value.trim(),
      description: form.description.value.trim() || null,
      poster_url: nextPoster || current?.poster_url,
      gallery_urls: [...(current?.gallery_urls || []), ...nextGallery],
      venue_name: form.venueName.value.trim() || null,
      starts_at: new Date(form.startsAt.value).toISOString(),
      ends_at: new Date(form.endsAt.value).toISOString(),
      application_opens_at: new Date(form.opensAt.value).toISOString(),
      application_closes_at: new Date(form.closesAt.value).toISOString(),
      price_per_person: Number(form.price.value),
      capacity: Number(form.capacity.value),
      google_form_url: form.formUrl.value.trim() || null,
      promo_video_url: form.promoVideoUrl.value.trim() || null,
      status: form.status.value,
      highlights: form.highlights.value.split("\n").map((item) => item.trim()).filter(Boolean),
      timeline: parseTimeline(form.timelineText.value),
    };
    const query = id
      ? client().from("platform_events").update(payload).eq("id", id)
      : client().from("platform_events").insert({ ...payload, slug: `${Date.now()}-${payload.title.replace(/\s+/g, "-").slice(0, 24)}`, created_by: window.motfCurrentProfile.id });
    const { error } = await query;
    if (error) throw error;
    resetEventForm();
    await window.motfOpenAdminControl?.("master-launch-content");
    await loadEvents();
    alert(id ? "MOriginal의 세부사항을 수정했습니다." : "MOriginal을 등록했습니다.");
  }

  async function loadSubmissions() {
    if (!isAdmin() || !client()) return;
    const { data, error } = await client().from("recreation_submissions").select("*").eq("review_status", "pending").order("created_at", { ascending: true });
    if (error) {
      const target = $("#adminRecreationSubmissionList");
      if (target) target.innerHTML = `<div class="admin-control-empty">검토 요청을 불러오지 못했습니다. ${escapeHtml(error.message)}</div>`;
      return;
    }
    submissions = data || [];
    renderSubmissions();
  }

  function renderSubmissions() {
    const target = $("#adminRecreationSubmissionList");
    if (!target) return;
    target.innerHTML = submissions.length ? submissions.map((item) => `<article class="admin-control-row admin-content-row"><div><strong>${escapeHtml(item.title)}</strong><span>${new Date(item.created_at).toLocaleString("ko-KR")} · ${escapeHtml(item.people_label || "인원 미입력")}</span></div><div class="motf-admin-action-group"><button class="secondary-btn" type="button" data-submission-load="${item.id}">등록 양식에 불러오기</button><button class="motf-reject-action-btn" type="button" data-submission-reject="${item.id}">반려</button></div></article>`).join("") : '<div class="admin-control-empty">대기 중인 추천 검토 요청이 없습니다.</div>';
  }

  function loadSubmissionIntoForm(id) {
    const item = submissions.find((row) => String(row.id) === String(id));
    const form = $("#adminRecreationForm");
    if (!item || !form) return;
    form.reset();
    form.activityId.value = "";
    form.sourceSubmissionId.value = item.id;
    form.title.value = item.title || "";
    form.summary.value = item.instructions?.slice(0, 120) || "이용자 추천 레크레이션";
    form.playType.value = item.play_type || "team";
    form.instructions.value = item.instructions || "";
    const people = String(item.people_label || "").match(/(\d+).*?(\d+)?/);
    form.peopleMin.value = people?.[1] || "";
    form.peopleMax.value = people?.[2] || people?.[1] || "";
    Array.from(form.spaces.options).forEach((option) => { option.selected = (item.spaces || []).includes(option.value); });
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveSubmissionAsActivity(form) {
    const sourceId = form.sourceSubmissionId.value;
    const source = submissions.find((item) => String(item.id) === String(sourceId));
    const media = [...(source?.media_urls || []), ...await uploadMany(form.mediaFiles.files, "recreation")];
    const payload = {
      title: form.title.value.trim(), summary: form.summary.value.trim(), people_min: Number(form.peopleMin.value) || null,
      people_max: Number(form.peopleMax.value) || null, spaces: Array.from(form.spaces.selectedOptions).map((item) => item.value),
      play_type: form.playType.value, duration_minutes: Number(form.duration.value) || null,
      materials: form.materials.value.split(",").map((item) => item.trim()).filter(Boolean), instructions: form.instructions.value.trim() || null,
      script_example: form.scriptExample.value.trim() || null, media_urls: media, source_submission_id: sourceId,
      is_active: form.isActive.checked, sort_order: Number(form.sortOrder.value) || 100, created_by: window.motfCurrentProfile.id,
    };
    const { error } = await client().from("recreation_activities").insert(payload);
    if (error) throw error;
    const result = await client().from("recreation_submissions").update({ review_status: "approved", reviewed_by: window.motfCurrentProfile.id, reviewed_at: new Date().toISOString() }).eq("id", sourceId);
    if (result.error) throw result.error;
    form.reset(); form.sourceSubmissionId.value = "";
    await window.motfOpenAdminControl?.("master-launch-content");
    await loadSubmissions();
    alert("추천을 승인하고 이용자 레크레이션 목록에 공개했습니다.");
  }

  function enhance() {
    if (enhancing || !isAdmin()) return;
    enhancing = true;
    try {
      const eventForm = $("#adminEventForm");
      if (eventForm && !eventForm.dataset.reviewEnhanced) {
        eventForm.dataset.reviewEnhanced = "true";
        eventForm.insertAdjacentHTML("afterbegin", '<input name="eventId" type="hidden">');
        eventForm.querySelector("h2").textContent = "MOriginal 등록·수정";
        const poster = eventForm.posterFile;
        poster.required = false;
        poster.parentElement.insertAdjacentHTML("beforeend", '<small class="motf-field-status" data-event-poster-status>새 등록 시 포스터 파일이 필요합니다.</small>');
        eventForm.querySelector(".admin-form-grid").insertAdjacentHTML("beforeend", '<label class="admin-field-wide">타임라인 (시간 | 제목 | 설명, 한 줄에 하나)<textarea name="timelineText" rows="5" placeholder="15:00 | 체크인 | 객실 배정 및 짐 정리"></textarea></label>');
        eventForm.querySelector('[type="submit"]').insertAdjacentHTML("afterend", '<button class="secondary-btn" type="button" data-event-reset>새로 작성</button>');
        loadEvents();
      }
      const recreationForm = $("#adminRecreationForm");
      if (recreationForm && !recreationForm.sourceSubmissionId) {
        recreationForm.insertAdjacentHTML("afterbegin", '<input name="sourceSubmissionId" type="hidden">');
        recreationForm.insertAdjacentHTML("beforebegin", '<section class="admin-control-card"><h2>이용자 추천 검토 대기</h2><p class="admin-control-note">요청을 양식에 불러와 내용을 다듬은 뒤 저장하면 승인과 공개가 한 번에 처리됩니다.</p><div id="adminRecreationSubmissionList" class="admin-control-list"></div></section>');
        loadSubmissions();
      }
      const placement = $("#adminCardForm select[name='placement'] option[value='hero']");
      if (placement) placement.textContent = "moTF PICK (커뮤니티 첫 카드)";
      $("#adminCouponList")?.querySelectorAll('[data-admin-delete^="coupons:"]').forEach((button) => { button.textContent = "사용 중지·삭제"; });
      enhanceEventRows();
    } finally { enhancing = false; }
  }

  document.addEventListener("submit", async (event) => {
    if (event.target.id === "adminEventForm") {
      event.preventDefault(); event.stopImmediatePropagation();
      const button = event.target.querySelector('[type="submit"]');
      button.disabled = true;
      try { await saveEvent(event.target); } catch (error) { alert(error.message || "MOriginal을 저장하지 못했습니다."); }
      finally { button.disabled = false; }
    }
    if (event.target.id === "adminRecreationForm" && event.target.sourceSubmissionId?.value) {
      event.preventDefault(); event.stopImmediatePropagation();
      const button = event.target.querySelector('[type="submit"]');
      button.disabled = true;
      try { await saveSubmissionAsActivity(event.target); } catch (error) { alert(error.message || "추천을 승인하지 못했습니다."); }
      finally { button.disabled = false; }
    }
  }, true);

  document.addEventListener("click", async (event) => {
    const coupon = event.target.closest('[data-admin-delete^="coupons:"]');
    if (coupon) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!confirm("사용 이력이 있으면 삭제하지 않고 사용 중지합니다. 계속할까요?")) return;
      const id = coupon.dataset.adminDelete.split(":")[1];
      const { data, error } = await client().rpc("admin_archive_coupon", { target_coupon_id: id });
      alert(error ? error.message : data === "deleted" ? "사용 이력이 없어 삭제했습니다." : "사용 이력을 보존하고 쿠폰을 중지했습니다.");
      if (!error) await window.motfOpenAdminControl?.("master-commerce");
      return;
    }
    const edit = event.target.closest("[data-event-edit]");
    if (edit) { event.preventDefault(); editEvent(edit.dataset.eventEdit); return; }
    if (event.target.closest("[data-event-reset]")) { resetEventForm(); return; }
    const load = event.target.closest("[data-submission-load]");
    if (load) { loadSubmissionIntoForm(load.dataset.submissionLoad); return; }
    const reject = event.target.closest("[data-submission-reject]");
    if (reject) {
      if (!confirm("이 레크레이션 추천을 반려할까요?")) return;
      const { error } = await client().from("recreation_submissions").update({ review_status: "rejected", reviewed_by: window.motfCurrentProfile.id, reviewed_at: new Date().toISOString() }).eq("id", reject.dataset.submissionReject);
      if (error) alert(error.message); else await loadSubmissions();
    }
    if (event.target.closest('[data-admin-content-tab="events"]')) window.setTimeout(loadEvents, 0);
    if (event.target.closest('[data-admin-content-tab="recreation"]')) window.setTimeout(loadSubmissions, 0);
  }, true);

  const observer = new MutationObserver(() => enhance());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("motf:auth-ready", enhance);
  window.setTimeout(enhance, 0);
})();
