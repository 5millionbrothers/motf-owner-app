(function connectOwnerRevenue() {
  const $ = (selector) => document.querySelector(selector);
  const money = (value) => `${Math.round(Number(value || 0)).toLocaleString("ko-KR")}원`;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
  let rows = [];
  let mode = "summary";

  function filteredRows() {
    const from = $("#ownerRevenueFrom")?.value || "";
    const to = $("#ownerRevenueTo")?.value || "";
    return rows.filter((item) => (!from || item.transaction_date >= from) && (!to || item.transaction_date <= to));
  }

  function aggregate(list, keyOf) {
    const map = new Map();
    list.forEach((item) => {
      const key = keyOf(item);
      const current = map.get(key) || { key, count:0, gross:0, payout:0 };
      current.count += 1;
      current.gross += Number(item.gross_amount || 0);
      current.payout += Number(item.payout_amount || 0);
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => b.gross - a.gross);
  }

  function table(items, firstLabel) {
    return `<div class="owner-revenue-table"><div class="owner-revenue-table-head"><span>${firstLabel}</span><span>거래</span><span>판매금액</span><span>지급 예정·완료액</span></div>${items.map((item) => `<div><strong>${escapeHtml(item.key)}</strong><span>${item.count}건</span><span>${money(item.gross)}</span><span>${money(item.payout)}</span></div>`).join("") || '<p class="owner-revenue-empty">선택한 기간의 거래가 없습니다.</p>'}</div>`;
  }

  function render() {
    const list = filteredRows();
    const gross = list.reduce((sum, item) => sum + Number(item.gross_amount || 0), 0);
    const payout = list.reduce((sum, item) => sum + Number(item.payout_amount || 0), 0);
    const paid = list.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.payout_amount || 0), 0);
    const pending = list.filter((item) => item.status === "pending").reduce((sum, item) => sum + Number(item.payout_amount || 0), 0);
    if ($("#rev-total-val")) $("#rev-total-val").textContent = money(gross);
    if ($("#rev-net-total-val")) $("#rev-net-total-val").textContent = money(payout);
    if ($("#rev-settled-val")) $("#rev-settled-val").textContent = money(paid);
    if ($("#rev-expected-val")) $("#rev-expected-val").textContent = money(pending);
    const container = $("#revenueSubContent");
    if (!container) return;
    const controls = `<div class="owner-revenue-controls"><label>시작일<input id="ownerRevenueFrom" type="date" value="${$("#ownerRevenueFrom")?.value || ""}"></label><label>종료일<input id="ownerRevenueTo" type="date" value="${$("#ownerRevenueTo")?.value || ""}"></label><button class="secondary-btn" type="button" id="ownerRevenueApply">조회</button></div>`;
    if (mode === "room") {
      container.innerHTML = `<h4>항목·객실별 매출</h4>${controls}${table(aggregate(list, (item) => item.target_name || "기타"), "객실·상품")}`;
    } else if (mode === "trend") {
      const trend = aggregate(list, (item) => item.transaction_date || "날짜 미상").sort((a, b) => a.key.localeCompare(b.key));
      const max = Math.max(1, ...trend.map((item) => item.gross));
      container.innerHTML = `<h4>매출 변동 추이</h4>${controls}<div class="owner-revenue-chart">${trend.map((item) => `<div title="${escapeHtml(item.key)} ${money(item.gross)}"><span style="height:${Math.max(4, item.gross / max * 100)}%"></span><small>${escapeHtml(item.key.slice(5))}</small></div>`).join("") || '<p class="owner-revenue-empty">선택한 기간의 거래가 없습니다.</p>'}</div>`;
    } else {
      const daily = aggregate(list, (item) => item.transaction_date || "날짜 미상").sort((a, b) => b.key.localeCompare(a.key));
      container.innerHTML = `<h4>${mode === "period" ? "기간별 매출 조회" : "매출 요약"}</h4>${controls}<div class="owner-revenue-summary"><strong>${list.length}건</strong><span>평균 객단가 ${money(list.length ? gross / list.length : 0)}</span></div>${table(daily, "거래일")}`;
    }
    $("#ownerRevenueApply")?.addEventListener("click", render);
  }

  async function load() {
    if (!window.motfSupabase || !window.motfCurrentBusiness || window.motfCurrentProfile?.role !== "partner") return;
    const container = $("#revenueSubContent");
    if (container) container.innerHTML = '<div class="owner-loading-state">매출 데이터를 불러오는 중입니다.</div>';
    const { data, error } = await window.motfSupabase.rpc("list_own_partner_settlements");
    if (error) { if (container) container.textContent = `매출 데이터를 불러오지 못했습니다. ${error.message}`; return; }
    rows = (data || []).filter((item) => item.business_id === window.motfCurrentBusiness.id);
    render();
  }

  window.switchRevSubMenu = function switchRevenue(modeName) {
    mode = modeName === "profit" ? "summary" : modeName;
    document.querySelectorAll(".rev-menu-btn").forEach((button) => button.classList.toggle("active", button.getAttribute("onclick")?.includes(`'${modeName}'`)));
    render();
  };
  window.addEventListener("motf:owner-panel-change", (event) => { if (event.detail?.panelId === "revenue") load(); });
  window.addEventListener("motf:partner-data-ready", load);
  const first = document.querySelector('.rev-menu-btn[onclick*="profit"]');
  if (first) first.textContent = "매출 요약";
})();
