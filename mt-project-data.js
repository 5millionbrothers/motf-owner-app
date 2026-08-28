(function connectMtProjects() {
  const client = window.motfSupabase;
  if (!client || typeof window.motfApplyMtProject !== "function") return;

  let currentProject = null;
  let currentUser = null;
  const projectFields = "id, owner_id, title, organization_name, region, starts_on, ends_on, guest_count, status, final_business_id, final_reservation_id, estimated_budget, created_at, updated_at";
  const itemFields = "id, project_id, item_kind, reference_id, title, quantity, amount, status, note, created_at, updated_at";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function requireUser() {
    if (!currentUser) throw new Error("로그인하면 내 MT를 저장하고 여러 기기에서 이어서 준비할 수 있어요.");
    return currentUser;
  }

  async function candidateDetails(projectId) {
    const { data: candidates, error } = await client.from("mt_project_candidates")
      .select("id, project_id, business_id, offering_id, estimated_cost, sort_order")
      .eq("project_id", projectId)
      .order("sort_order");
    if (error) throw error;
    const businessIds = [...new Set((candidates || []).map((item) => item.business_id).filter(Boolean))];
    if (!businessIds.length) return [];
    const offeringIds = [...new Set((candidates || []).map((item) => item.offering_id).filter(Boolean))];
    const [businessResult, offeringResult] = await Promise.all([
      client.from("businesses")
        .select("id, business_name, address, cover_image_url, bath_count, station_distance_m")
        .in("id", businessIds),
      client.from("offerings")
        .select("id, business_id, name, price, max_people, base_people, min_people, extra_person_fee, image_url, image_urls, bathroom_count, bathroom_gender_separated, bathroom_note")
        .in("id", offeringIds),
    ]);
    const { data: businesses, error: businessError } = businessResult;
    if (businessError) throw businessError;
    if (offeringResult.error) throw offeringResult.error;
    const byId = new Map((businesses || []).map((business) => [business.id, business]));
    const offeringById = new Map((offeringResult.data || []).map((offering) => [offering.id, offering]));
    return (candidates || []).map((candidate) => ({
      ...candidate,
      business: byId.get(candidate.business_id) || null,
      offering: offeringById.get(candidate.offering_id) || null,
    }));
  }

  async function projectChildren(projectId) {
    const [itineraryResult, noticeResult, itemResult] = await Promise.all([
      client.from("mt_itinerary_items").select("id, starts_at, title, place, note, sort_order").eq("project_id", projectId).order("starts_at").order("sort_order"),
      client.from("mt_notices").select("id, title, notice_date, body, is_pinned, created_at").eq("project_id", projectId).order("is_pinned", { ascending: false }).order("notice_date", { ascending: false }).order("created_at", { ascending: false }),
      client.from("mt_project_items").select(itemFields).eq("project_id", projectId).neq("status", "cancelled").order("created_at"),
    ]);
    if (itineraryResult.error) throw itineraryResult.error;
    if (noticeResult.error) throw noticeResult.error;
    if (itemResult.error) throw itemResult.error;
    return { itinerary: itineraryResult.data || [], notices: noticeResult.data || [], items: itemResult.data || [] };
  }

  async function loadProjects() {
    const { data: sessionData } = await client.auth.getSession();
    currentUser = sessionData.session?.user || null;
    currentProject = null;
    if (!currentUser) {
      window.motfApplyMtProjects?.([]);
      return [];
    }
    const { data: projects, error } = await client.from("mt_projects")
      .select(projectFields)
      .order("starts_on", { ascending: false });
    if (error) throw error;
    const projectIds = (projects || []).map((project) => project.id);
    let items = [];
    if (projectIds.length) {
      const { data, error: itemError } = await client.from("mt_project_items")
        .select(itemFields)
        .in("project_id", projectIds)
        .neq("status", "cancelled");
      if (itemError) throw itemError;
      items = data || [];
    }
    const hydrated = (projects || []).map((project) => ({ ...project, is_owner: project.owner_id === currentUser.id, items: items.filter((item) => item.project_id === project.id) }));
    window.motfApplyMtProjects?.(hydrated);
    return hydrated;
  }

  window.motfSelectMtProject = async function selectMtProject(projectId) {
    requireUser();
    const { data: project, error } = await client.from("mt_projects")
      .select(projectFields)
      .eq("id", projectId)
      .single();
    if (error) throw error;
    const [children, candidates] = await Promise.all([projectChildren(project.id), candidateDetails(project.id)]);
    currentProject = { ...project, ...children, is_owner: project.owner_id === currentUser.id };
    window.motfApplyMtProject(currentProject, candidates);
    return currentProject;
  };

  window.motfCreateMtProject = async function createMtProject(payload) {
    const user = requireUser();
    const { data, error } = await client.from("mt_projects")
      .insert({ ...payload, owner_id: user.id, status: "planning" })
      .select(projectFields)
      .single();
    if (error) throw error;
    currentProject = { ...data, itinerary: [], notices: [], items: [] };
    await loadProjects();
    currentProject = { ...data, itinerary: [], notices: [], items: [] };
    window.motfApplyMtProject(currentProject, []);
    return currentProject;
  };

  function ensureProject() {
    requireUser();
    if (!currentProject) throw new Error("내 MT에서 여행을 먼저 선택하거나 새로 만들어주세요.");
    if (currentProject.owner_id !== currentUser.id) throw new Error("초대받은 MT는 보기만 할 수 있습니다.");
    return currentProject;
  }

  window.motfCreateMtInvite = async function createMtInvite() {
    const project = ensureProject();
    const { data, error } = await client.rpc("create_mt_project_invite", { target_project_id: project.id, valid_days: 7 });
    if (error) throw error;
    return data;
  };

  window.motfAcceptMtInvite = async function acceptMtInvite(code) {
    requireUser();
    const { data, error } = await client.rpc("accept_mt_project_invite", { target_code: String(code || "").trim() });
    if (error) throw error;
    await loadProjects();
    return data;
  };

  window.motfSaveMtProject = async function saveMtProject(payload) {
    const project = ensureProject();
    const { data, error } = await client.from("mt_projects")
      .update(payload)
      .eq("id", project.id)
      .eq("owner_id", currentUser.id)
      .select(projectFields)
      .single();
    if (error) throw error;
    currentProject = { ...currentProject, ...data };
    window.motfApplyMtProject(currentProject, null);
    return data;
  };

  window.motfSaveMtCandidate = async function saveMtCandidate(businessId, offeringId, shouldAdd) {
    const project = ensureProject();
    if (shouldAdd) {
      const { error } = await client.rpc("save_mt_room_candidate", {
        target_project_id: project.id,
        target_business_id: businessId,
        target_offering_id: offeringId,
      });
      if (error) throw error;
    } else {
      const { error } = await client.from("mt_project_candidates").delete().eq("project_id", project.id).eq("offering_id", offeringId);
      if (error) throw error;
    }
  };

  window.motfGetCandidateRoomAvailability = async function getCandidateRoomAvailability(projectId, businessId) {
    const user = requireUser();
    const { data: project, error: projectError } = await client.from("mt_projects")
      .select(projectFields)
      .eq("id", projectId)
      .eq("owner_id", user.id)
      .single();
    if (projectError) throw projectError;
    const { data: blocks, error: blockError } = await client.rpc("get_public_stay_calendar", {
      target_business_id: businessId,
      range_start: project.starts_on,
      range_end: project.ends_on,
    });
    if (blockError) throw blockError;
    return {
      project,
      unavailableOfferingIds: [...new Set((blocks || []).map((block) => String(block.offering_id)))],
    };
  };

  window.motfSaveCandidateToProject = async function saveCandidateToProject(projectId, businessId, offeringId) {
    const user = requireUser();
    const project = (await loadProjects()).find((item) => String(item.id) === String(projectId));
    if (!project || project.owner_id !== user.id) throw new Error("선택한 내 MT를 찾을 수 없습니다.");
    const { error } = await client.rpc("save_mt_room_candidate", {
      target_project_id: projectId,
      target_business_id: businessId,
      target_offering_id: offeringId,
    });
    if (error) throw error;
    await loadProjects();
  };

  window.motfSetMtStayItem = async function setMtStayItem({ business_id, offering_id, title, amount }) {
    const project = ensureProject();
    const oldIds = (currentProject.items || []).filter((item) => item.item_kind === "stay").map((item) => item.id).filter((id) => uuidPattern.test(String(id)));
    if (oldIds.length) {
      const { error: deleteError } = await client.from("mt_project_items").delete().in("id", oldIds);
      if (deleteError) throw deleteError;
    }
    const payload = { project_id: project.id, item_kind: "stay", title, quantity: 1, amount, status: "planned" };
    if (uuidPattern.test(String(offering_id))) payload.reference_id = offering_id;
    else if (uuidPattern.test(String(business_id))) payload.reference_id = business_id;
    const { data, error } = await client.from("mt_project_items").insert(payload).select(itemFields).single();
    if (error) throw error;
    currentProject.items = [...(currentProject.items || []).filter((item) => item.item_kind !== "stay"), data];
    return data;
  };

  window.motfClearMtStayItem = async function clearMtStayItem() {
    const project = ensureProject();
    const oldIds = (currentProject.items || []).filter((item) => item.item_kind === "stay").map((item) => item.id).filter((id) => uuidPattern.test(String(id)));
    if (oldIds.length) {
      const { error } = await client.from("mt_project_items").delete().in("id", oldIds).eq("project_id", project.id);
      if (error) throw error;
    }
    currentProject.items = (currentProject.items || []).filter((item) => item.item_kind !== "stay");
  };

  window.motfCompleteMtProject = async function completeMtProject() {
    const project = ensureProject();
    const { data, error } = await client.from("mt_projects")
      .update({ status: "completed" })
      .eq("id", project.id)
      .eq("owner_id", currentUser.id)
      .select(projectFields)
      .single();
    if (error) throw error;
    currentProject = { ...currentProject, ...data };
    await loadProjects();
    window.motfApplyMtProject(currentProject, null);
    return data;
  };

  window.motfAddMtShoppingItem = async function addMtShoppingItem({ product_id, title, quantity, amount }) {
    const project = ensureProject();
    const existing = (currentProject.items || []).find((item) => item.item_kind === "shopping" && String(item.reference_id) === String(product_id));
    if (existing && uuidPattern.test(String(existing.id))) {
      const { data, error } = await client.from("mt_project_items")
        .update({ quantity: Number(existing.quantity || 1) + Number(quantity || 1), amount })
        .eq("id", existing.id)
        .select(itemFields)
        .single();
      if (error) throw error;
      currentProject.items = currentProject.items.map((item) => item.id === data.id ? data : item);
      return data;
    }
    const payload = { project_id: project.id, item_kind: "shopping", title, quantity, amount, status: "planned" };
    if (uuidPattern.test(String(product_id))) payload.reference_id = product_id;
    const { data, error } = await client.from("mt_project_items").insert(payload).select(itemFields).single();
    if (error) throw error;
    currentProject.items = [...(currentProject.items || []), data];
    return data;
  };

  window.motfRemoveMtItem = async function removeMtItem(itemId) {
    const project = ensureProject();
    if (!uuidPattern.test(String(itemId))) return;
    const { error } = await client.from("mt_project_items").delete().eq("id", itemId).eq("project_id", project.id);
    if (error) throw error;
    currentProject.items = (currentProject.items || []).filter((item) => item.id !== itemId);
  };

  window.motfAddMtItinerary = async function addMtItinerary(payload) {
    const project = ensureProject();
    const { data, error } = await client.from("mt_itinerary_items")
      .insert({ ...payload, project_id: project.id, sort_order: Date.now() % 1000000 })
      .select("id, starts_at, title, place, note, sort_order")
      .single();
    if (error) throw error;
    currentProject.itinerary = [...(currentProject.itinerary || []), data].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    return data;
  };

  window.motfAddMtNotice = async function addMtNotice(payload) {
    const project = ensureProject();
    const { data, error } = await client.from("mt_notices")
      .insert({ ...payload, project_id: project.id, author_id: currentUser.id })
      .select("id, title, notice_date, body, is_pinned, created_at")
      .single();
    if (error) throw error;
    currentProject.notices = [data, ...(currentProject.notices || [])];
    return data;
  };

  async function initializeProjects() {
    await loadProjects();
    const params = new URLSearchParams(location.search);
    const inviteCode = params.get("invite") || window.sessionStorage.getItem("motf.pendingMtInvite");
    if (!inviteCode || !currentUser) return;
    try {
      await window.motfAcceptMtInvite(inviteCode);
      window.sessionStorage.removeItem("motf.pendingMtInvite");
      params.delete("invite");
      history.replaceState(history.state, "", `${location.pathname}${params.toString() ? `?${params}` : ""}`);
    } catch (error) {
      window.sessionStorage.removeItem("motf.pendingMtInvite");
      console.warn("MT 초대 참여 실패", error);
    }
  }

  initializeProjects().catch((error) => console.warn("MT 목록을 불러오지 못했습니다.", error));
  client.auth.onAuthStateChange((_event, session) => {
    if (session?.user?.id !== currentUser?.id) loadProjects().catch(console.warn);
  });
})();
