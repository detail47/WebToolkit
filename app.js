function initApp() {
  const modules = window.ToolModules || {};

  if (typeof modules.initQrTool === "function") {
    modules.initQrTool();
  }

  if (typeof modules.initHashTool === "function") {
    modules.initHashTool();
  }

  if (typeof modules.initSshTool === "function") {
    modules.initSshTool();
  }

  if (typeof modules.initCronTool === "function") {
    modules.initCronTool();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
