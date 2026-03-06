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

  if (typeof modules.initUuidTool === "function") {
    modules.initUuidTool();
  }

  if (typeof modules.initColorTool === "function") {
    modules.initColorTool();
  }

  if (typeof modules.initCalculatorTool === "function") {
    modules.initCalculatorTool();
  }

  if (typeof modules.initDeviceTestTool === "function") {
    modules.initDeviceTestTool();
  }

  if (typeof modules.initPageNavTool === "function") {
    modules.initPageNavTool();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
