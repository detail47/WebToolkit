function initPageNavTool() {
  const links = Array.from(document.querySelectorAll("#sidebar-nav .nav-link"));
  const pages = Array.from(document.querySelectorAll(".tool-page"));
  const workspace = document.querySelector(".workspace");
  const sidebarToggleBtn = document.querySelector("#sidebar-toggle-btn");
  const homeReadmeOutput = document.querySelector("#home-readme-content");

  const SIDEBAR_COLLAPSE_KEY = "webtool.sidebarCollapsed";

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizeUrl(url) {
    const value = (url || "").trim();
    if (!value) {
      return "";
    }

    if (/^(https?:|mailto:)/i.test(value) || value.startsWith("#") || value.startsWith("./") || value.startsWith("../") || value.startsWith("/")) {
      return value;
    }

    return "";
  }

  function renderInlineMarkdown(rawText) {
    const parts = String(rawText).split(/(`[^`]+`)/g);
    return parts
      .map((part) => {
        if (!part) {
          return "";
        }

        if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
          return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
        }

        let escaped = escapeHtml(part);
        escaped = escaped.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, text, url) => {
          const safeUrl = sanitizeUrl(url);
          if (!safeUrl) {
            return text;
          }
          return `<a href=\"${escapeHtml(safeUrl)}\" target=\"_blank\" rel=\"noopener noreferrer\">${text}</a>`;
        });
        escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        escaped = escaped.replace(/\*([^*]+)\*/g, "<em>$1</em>");
        return escaped;
      })
      .join("");
  }

  function renderMarkdown(markdownText) {
    const source = String(markdownText || "").replace(/\r\n/g, "\n");
    const lines = source.split("\n");
    const html = [];
    const paragraph = [];
    let listType = "";
    let inCodeBlock = false;
    const codeLines = [];

    function flushParagraph() {
      if (!paragraph.length) {
        return;
      }
      html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph.length = 0;
    }

    function closeList() {
      if (listType) {
        html.push(`</${listType}>`);
        listType = "";
      }
    }

    function flushCodeBlock() {
      if (!inCodeBlock) {
        return;
      }
      html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      codeLines.length = 0;
      inCodeBlock = false;
    }

    lines.forEach((line) => {
      const trimmed = line.trim();

      if (/^```/.test(trimmed)) {
        flushParagraph();
        closeList();
        if (inCodeBlock) {
          flushCodeBlock();
        } else {
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        return;
      }

      if (!trimmed) {
        flushParagraph();
        closeList();
        return;
      }

      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        closeList();
        const level = heading[1].length;
        html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
        return;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        flushParagraph();
        closeList();
        html.push("<hr />");
        return;
      }

      const listMatch = trimmed.match(/^([-*+]|\d+\.)\s+(.+)$/);
      if (listMatch) {
        flushParagraph();
        const nextType = /\d+\./.test(listMatch[1]) ? "ol" : "ul";
        if (listType !== nextType) {
          closeList();
          listType = nextType;
          html.push(`<${listType}>`);
        }
        html.push(`<li>${renderInlineMarkdown(listMatch[2])}</li>`);
        return;
      }

      const quoteMatch = trimmed.match(/^>\s?(.*)$/);
      if (quoteMatch) {
        flushParagraph();
        closeList();
        html.push(`<blockquote>${renderInlineMarkdown(quoteMatch[1])}</blockquote>`);
        return;
      }

      paragraph.push(trimmed);
    });

    if (inCodeBlock) {
      flushCodeBlock();
    }
    flushParagraph();
    closeList();

    return html.join("\n");
  }

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
      const rendered = renderMarkdown(text);
      homeReadmeOutput.innerHTML = rendered || "README.md 为空。";
      homeReadmeOutput.dataset.loaded = "1";
    } catch (_err) {
      try {
        const text = await loadByXhr();
        const rendered = renderMarkdown(text);
        homeReadmeOutput.innerHTML = rendered || "README.md 为空。";
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
