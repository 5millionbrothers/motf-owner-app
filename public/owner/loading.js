(() => {
  const originalFetch = window.fetch.bind(window);
  let pending = 0;
  let initialLoad = true;
  let showTimer = 0;
  let hideTimer = 0;
  let visibleSince = performance.now();

  const overlay = () => document.getElementById("motfLoadingOverlay");

  function show() {
    window.clearTimeout(hideTimer);
    const element = overlay();
    if (!element) return;
    visibleSince = performance.now();
    element.classList.remove("is-hidden");
  }

  function hide() {
    if (initialLoad || pending > 0) return;
    window.clearTimeout(showTimer);
    const delay = Math.max(0, 240 - (performance.now() - visibleSince));
    hideTimer = window.setTimeout(() => overlay()?.classList.add("is-hidden"), delay);
  }

  function begin() {
    pending += 1;
    window.clearTimeout(hideTimer);
    if (overlay()?.classList.contains("is-hidden")) {
      window.clearTimeout(showTimer);
      showTimer = window.setTimeout(show, 180);
    }
  }

  function end() {
    pending = Math.max(0, pending - 1);
    hide();
  }

  window.fetch = (...args) => {
    begin();
    try {
      return Promise.resolve(originalFetch(...args)).finally(end);
    } catch (error) {
      end();
      throw error;
    }
  };

  window.motfLoading = {
    show: begin,
    hide: end,
    wrap(promise) {
      begin();
      return Promise.resolve(promise).finally(end);
    },
  };

  const ready = () => {
    initialLoad = false;
    hide();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true });
  else queueMicrotask(ready);
})();
