function utf8ToBase64(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

function base64ToUtf8(text) {
  return decodeURIComponent(escape(atob(text)));
}

function encodeUnicodeEscape(text) {
  return Array.from(text).map((ch) => {
    const code = ch.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${code}`;
  }).join("");
}

function decodeUnicodeEscape(text) {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function encodeHtmlEntity(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function decodeHtmlEntity(text) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

function runEncoding(mode, input) {
  if (mode === "url-encode") {
    return encodeURIComponent(input);
  }
  if (mode === "url-decode") {
    return decodeURIComponent(input);
  }
  if (mode === "base64-encode") {
    return utf8ToBase64(input);
  }
  if (mode === "base64-decode") {
    return base64ToUtf8(input.trim());
  }
  if (mode === "unicode-escape-encode") {
    return encodeUnicodeEscape(input);
  }
  if (mode === "unicode-escape-decode") {
    return decodeUnicodeEscape(input);
  }
  if (mode === "html-encode") {
    return encodeHtmlEntity(input);
  }
  if (mode === "html-decode") {
    return decodeHtmlEntity(input);
  }
  throw new Error("不支持的转换模式。");
}

function initEncodingTool() {
  const { copyToClipboard, notify } = window.ToolCommon;

  const modeSelect = document.getElementById("encode-mode");
  const input = document.getElementById("encode-input");
  const output = document.getElementById("encode-output");
  const runBtn = document.getElementById("run-encode-btn");
  const copyBtn = document.getElementById("copy-encode-output-btn");

  function run() {
    const value = input.value;
    if (!value) {
      notify("请输入要转换的内容。");
      return;
    }

    try {
      output.value = runEncoding(modeSelect.value, value);
    } catch (error) {
      output.value = "";
      notify(`转换失败：${error.message}`);
    }
  }

  runBtn.addEventListener("click", run);
  copyBtn.addEventListener("click", () => copyToClipboard(output.value, "编码转换结果"));
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initEncodingTool = initEncodingTool;
