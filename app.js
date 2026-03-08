function initApp() {
  const modules = window.ToolModules || {};

  const pageInitMap = {
    qr: "initQrTool",
    hash: "initHashTool",
    ssh: "initSshTool",
    cron: "initCronTool",
    "unit-converter": "initUnitConverterTool",
    password: "initPasswordTool",
    uuid: "initUuidTool",
    timestamp: "initTimestampTool",
    "time-now": "initTimeTools",
    countdown: "initTimeTools",
    bmi: "initBmiTool",
    encode: "initEncodingTool",
    "image-base64": "initImageBase64Tool",
    "image-process": "initImageProcessTool",
    "audio-process": "initAudioProcessTool",
    color: "initColorTool",
    diff: "initDiffTool",
    "route-trace": "initRouteTraceTool",
    calculator: "initCalculatorTool",
    "random-picker": "initRandomPickerTool",
    "input-test": "initDeviceTestTool",
    "media-test": "initDeviceTestTool"
  };

  const initialized = new Set();

  function ensureToolInitialized(pageKey) {
    const initName = pageInitMap[pageKey];
    if (!initName || initialized.has(initName)) {
      return;
    }

    if (typeof modules[initName] === "function") {
      modules[initName]();
      initialized.add(initName);
    }
  }

  modules.ensureToolInitialized = ensureToolInitialized;

  if (typeof modules.initThemeTool === "function") {
    modules.initThemeTool();
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
