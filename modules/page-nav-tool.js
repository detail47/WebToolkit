function initPageNavTool() {
  const links = Array.from(document.querySelectorAll("#sidebar-nav .nav-link"));
  const pages = Array.from(document.querySelectorAll(".tool-page"));

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

  activatePage(parseHash());
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initPageNavTool = initPageNavTool;
