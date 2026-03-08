function initPageNavTool() {
  const links = Array.from(document.querySelectorAll("#sidebar-nav .nav-link"));
  const pages = Array.from(document.querySelectorAll(".tool-page"));
  const workspace = document.querySelector(".workspace");
  const sidebarToggleBtn = document.querySelector("#sidebar-toggle-btn");

  const SIDEBAR_COLLAPSE_KEY = "webtool.sidebarCollapsed";

  function setSidebarCollapsed(collapsed) {
    if (!workspace) return;
    workspace.classList.toggle("sidebar-collapsed", collapsed);
    if (sidebarToggleBtn) {
      sidebarToggleBtn.textContent = collapsed ? "显示导航" : "隐藏导航";
      sidebarToggleBtn.setAttribute("aria-expanded", String(!collapsed));
    }
  }

  function restoreSidebarState() {
    if (!workspace) return;
    const collapsed = window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1";
    setSidebarCollapsed(collapsed);
  }

  function bindSidebarToggle() {
    if (!sidebarToggleBtn || !workspace) return;
    sidebarToggleBtn.addEventListener("click", () => {
      const collapsed = !workspace.classList.contains("sidebar-collapsed");
      setSidebarCollapsed(collapsed);
      window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? "1" : "0");
    });
  }

  if (!links.length || !pages.length) {
    return;
  }

  const pageSet = new Set(pages.map((page) => page.dataset.page));

  function activatePage(pageKey) {
    const target = pageSet.has(pageKey) ? pageKey : "qr";

    links.forEach((link) => {
      link.classList.toggle("active", link.dataset.page === target);
    });

    pages.forEach((page) => {
      const isActive = page.dataset.page === target;
      page.classList.toggle("active", isActive);
      page.setAttribute("aria-hidden", String(!isActive));
    });
  }

  function parseHash() {
    const hash = window.location.hash.replace(/^#/, "").trim();
    if (hash === "device-test") {
      return "media-test";
    }
    return hash || "qr";
  }

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const pageKey = link.dataset.page;
      window.history.replaceState(null, "", `#${pageKey}`);
      activatePage(pageKey);
    });
  });

  window.addEventListener("hashchange", () => {
    activatePage(parseHash());
  });

  restoreSidebarState();
  bindSidebarToggle();
  activatePage(parseHash());
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initPageNavTool = initPageNavTool;
