function createRandomHexByte() {
  return Math.floor(Math.random() * 256)
    .toString(16)
    .padStart(2, "0");
}

function generateUuidV4() {
  const bytes = [];
  for (let i = 0; i < 16; i += 1) {
    bytes.push(createRandomHexByte());
  }

  // RFC4122 version 4
  const b6 = Number.parseInt(bytes[6], 16);
  bytes[6] = ((b6 & 0x0f) | 0x40).toString(16).padStart(2, "0");

  // RFC4122 variant 10xx
  const b8 = Number.parseInt(bytes[8], 16);
  bytes[8] = ((b8 & 0x3f) | 0x80).toString(16).padStart(2, "0");

  return [
    bytes.slice(0, 4).join(""),
    bytes.slice(4, 6).join(""),
    bytes.slice(6, 8).join(""),
    bytes.slice(8, 10).join(""),
    bytes.slice(10, 16).join("")
  ].join("-");
}

function formatUuid(uuid, mode) {
  if (mode === "upper") {
    return uuid.toUpperCase();
  }

  if (mode === "no-hyphen") {
    return uuid.replace(/-/g, "");
  }

  return uuid;
}

function initUuidTool() {
  const { copyToClipboard, notify } = window.ToolCommon;

  const countInput = document.getElementById("uuid-count");
  const modeSelect = document.getElementById("uuid-options");
  const output = document.getElementById("uuid-output");
  const generateBtn = document.getElementById("generate-uuid-btn");
  const copyBtn = document.getElementById("copy-uuid-btn");

  function generate() {
    const count = Number(countInput.value);
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      notify("生成数量必须在 1 到 20 之间。");
      return;
    }

    const mode = modeSelect.value;
    const list = [];
    for (let i = 0; i < count; i += 1) {
      list.push(formatUuid(generateUuidV4(), mode));
    }

    output.value = list.join("\n");
  }

  generateBtn.addEventListener("click", generate);
  copyBtn.addEventListener("click", () => copyToClipboard(output.value, "UUID 结果"));
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initUuidTool = initUuidTool;
