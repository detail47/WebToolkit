function initThemeTool() {
  const STORAGE_KEY = "toolkit.theme.mode";

  const autoBtn = document.getElementById("theme-auto-btn");
  const lightBtn = document.getElementById("theme-light-btn");
  const darkBtn = document.getElementById("theme-dark-btn");

  if (!autoBtn || !lightBtn || !darkBtn) {
    return;
  }

  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function resolveTheme(mode) {
    if (mode === "light") {
      return "light";
    }
    if (mode === "dark") {
      return "dark";
    }
    return media.matches ? "dark" : "light";
  }

  function updateButtonState(mode) {
    const mapping = {
      auto: autoBtn,
      light: lightBtn,
      dark: darkBtn
    };

    Object.keys(mapping).forEach((key) => {
      const btn = mapping[key];
      const active = key === mode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  }

  function applyMode(mode) {
    const safeMode = mode === "light" || mode === "dark" || mode === "auto" ? mode : "auto";
    const theme = resolveTheme(safeMode);

    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-theme-mode", safeMode);
    updateButtonState(safeMode);
  }

  function setMode(mode) {
    localStorage.setItem(STORAGE_KEY, mode);
    applyMode(mode);
  }

  const saved = localStorage.getItem(STORAGE_KEY) || "auto";
  applyMode(saved);

  autoBtn.addEventListener("click", () => setMode("auto"));
  lightBtn.addEventListener("click", () => setMode("light"));
  darkBtn.addEventListener("click", () => setMode("dark"));

  media.addEventListener("change", () => {
    const mode = localStorage.getItem(STORAGE_KEY) || "auto";
    if (mode === "auto") {
      applyMode("auto");
    }
  });
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initThemeTool = initThemeTool;
