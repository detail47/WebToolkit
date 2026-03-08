function initPageNavTool() {
  const links = Array.from(document.querySelectorAll("#sidebar-nav .nav-link"));
  const pages = Array.from(document.querySelectorAll(".tool-page"));
  const workspace = document.querySelector(".workspace");
  const sidebarToggleBtn = document.querySelector("#sidebar-toggle-btn");
  const homeReadmeOutput = document.querySelector("#home-readme-content");

  const SIDEBAR_COLLAPSE_KEY = "webtool.sidebarCollapsed";

  function setSidebarCollapsed(collapsed) {
    if (!workspace) return;
    workspace.classList.toggle("sidebar-collapsed", collapsed);
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    if (sidebarToggleBtn) {
      sidebarToggleBtn.textContent = collapsed ? "显示导航" : "隐藏导航";
      sidebarToggleBtn.setAttribute("aria-expanded", String(!collapsed));
    }
  }

  async function loadHomeReadme() {
    if (!homeReadmeOutput || homeReadmeOutput.dataset.loaded === "1") {
      return;
    }

    function loadByXhr() {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "README.md", true);
        xhr.onload = () => {
          if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
            resolve(xhr.responseText || "");
          } else {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error("XHR failed"));
        xhr.send();
      });
    }

    try {
      const res = await fetch("README.md", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const text = await res.text();
      homeReadmeOutput.textContent = text.trim() || "README.md 为空。";
      homeReadmeOutput.dataset.loaded = "1";
    } catch (_err) {
      try {
        const text = await loadByXhr();
        homeReadmeOutput.textContent = text.trim() || "README.md 为空。";
        homeReadmeOutput.dataset.loaded = "1";
      } catch (_xhrErr) {
        homeReadmeOutput.textContent = "未能读取 README.md。请确认文件存在，或在本地服务器环境中打开页面。";
      }
    }
  }

  function restoreSidebarState() {
    if (!workspace) return;
    const saved = window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
    const collapsed = saved === null ? true : saved === "1";
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
    const target = pageSet.has(pageKey) ? pageKey : "home";
    document.body.classList.toggle("home-mode", target === "home");

    if (typeof window.ToolModules?.ensureToolInitialized === "function") {
      window.ToolModules.ensureToolInitialized(target);
    }

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
    return hash || "home";
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
  loadHomeReadme();
  activatePage(parseHash());
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initPageNavTool = initPageNavTool;
