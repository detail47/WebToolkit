function initApp() {
  const modules = window.ToolModules || {};

  if (typeof modules.initThemeTool === "function") {
    modules.initThemeTool();
  }

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

  if (typeof modules.initUnitConverterTool === "function") {
    modules.initUnitConverterTool();
  }

  if (typeof modules.initPasswordTool === "function") {
    modules.initPasswordTool();
  }

  if (typeof modules.initUuidTool === "function") {
    modules.initUuidTool();
  }

  if (typeof modules.initTimestampTool === "function") {
    modules.initTimestampTool();
  }

  if (typeof modules.initTimeTools === "function") {
    modules.initTimeTools();
  }

  if (typeof modules.initBmiTool === "function") {
    modules.initBmiTool();
  }

  if (typeof modules.initEncodingTool === "function") {
    modules.initEncodingTool();
  }

  if (typeof modules.initImageBase64Tool === "function") {
    modules.initImageBase64Tool();
  }

  if (typeof modules.initImageProcessTool === "function") {
    modules.initImageProcessTool();
  }

  if (typeof modules.initAudioProcessTool === "function") {
    modules.initAudioProcessTool();
  }

  if (typeof modules.initColorTool === "function") {
    modules.initColorTool();
  }

  if (typeof modules.initDiffTool === "function") {
    modules.initDiffTool();
  }

  if (typeof modules.initRouteTraceTool === "function") {
    modules.initRouteTraceTool();
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
