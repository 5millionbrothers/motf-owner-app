(async function loadLaunchContent() {
  const client = window.motfSupabase;
  if (!client) return;
  const [eventsResult, cardsResult, settingsResult, popupResult] = await Promise.all([
    client.rpc("get_public_platform_events"),
    client.from("homepage_cards").select("*").order("sort_order").limit(12),
    client.from("platform_settings").select("setting_value").eq("setting_key", "social").maybeSingle(),
    client.from("popup_banners").select("*").order("starts_at", { ascending: false }).limit(3),
  ]);
  window.motfApplyLaunchContent?.(
    eventsResult.error ? [] : (eventsResult.data || []),
    cardsResult.error ? [] : (cardsResult.data || []),
    settingsResult.data?.setting_value || {},
  );
  if (!popupResult.error) showPopup(popupResult.data?.[0]);

  function showPopup(popup) {
    if (!popup) return;
    const key = `motf.popup.dismissed.${popup.id}`;
    const dismissedUntil = Number(localStorage.getItem(key) || 0);
    if (dismissedUntil > Date.now()) return;
    const dialog = document.createElement("dialog");
    dialog.className = "launch-popup-dialog";
    dialog.innerHTML = `${popup.image_url ? `<img src="${escapeHtml(popup.image_url)}" alt="" />` : ""}<div><strong>${escapeHtml(popup.title)}</strong>${popup.body ? `<p>${escapeHtml(popup.body)}</p>` : ""}<div class="button-row">${popup.link_url ? `<a class="primary-btn" href="${escapeHtml(popup.link_url)}">${escapeHtml(popup.link_label || "자세히 보기")}</a>` : ""}<button class="secondary-btn" type="button" data-popup-close>닫기</button></div><label><input type="checkbox" data-popup-dismiss />오늘 그만 보기</label></div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("click", (event) => {
      if (!event.target.closest("[data-popup-close]")) return;
      if (dialog.querySelector("[data-popup-dismiss]")?.checked) {
        localStorage.setItem(key, String(Date.now() + Math.max(1, Number(popup.dismiss_days || 1)) * 86400000));
      }
      dialog.close();
      dialog.remove();
    });
    dialog.showModal();
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[character]));
  }
})();
