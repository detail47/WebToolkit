function normalizeImageBase64Input(raw) {
  const text = (raw || "").trim();
  if (!text) {
    return null;
  }

  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(text)) {
    return text;
  }

  const compact = text.replace(/\s+/g, "");
  return `data:image/png;base64,${compact}`;
}

function initImageBase64Tool() {
  const { copyToClipboard, notify } = window.ToolCommon;
  const EMPTY_PREVIEW_SRC = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

  const fileInput = document.getElementById("image-to-base64-file");
  const base64Output = document.getElementById("image-base64-output");
  const copyBase64Btn = document.getElementById("copy-image-base64-btn");

  const base64Input = document.getElementById("base64-to-image-input");
  const toImageBtn = document.getElementById("base64-to-image-btn");
  const downloadBtn = document.getElementById("download-base64-image-btn");
  const preview = document.getElementById("base64-image-preview");
  let currentPreviewDataUrl = "";

  function resetPreviewToEmpty() {
    currentPreviewDataUrl = "";
    preview.src = EMPTY_PREVIEW_SRC;
    preview.classList.add("is-empty");
  }

  function handleImageToBase64() {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      notify("请先选择图片文件。");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      base64Output.value = String(reader.result || "");
    };
    reader.onerror = () => {
      notify("图片读取失败，请重试。");
    };
    reader.readAsDataURL(file);
  }

  function renderPreviewFromBase64() {
    const dataUrl = normalizeImageBase64Input(base64Input.value);
    if (!dataUrl) {
      notify("请先输入 Base64 内容。");
      resetPreviewToEmpty();
      return;
    }

    preview.onload = () => {
      currentPreviewDataUrl = dataUrl;
      preview.classList.remove("is-empty");
    };

    preview.onerror = () => {
      notify("Base64 内容无法解析为图片。");
      resetPreviewToEmpty();
    };

    preview.src = dataUrl;
  }

  function downloadImage() {
    if (!currentPreviewDataUrl) {
      notify("请先生成图片预览。");
      return;
    }

    const link = document.createElement("a");
    link.href = currentPreviewDataUrl;
    link.download = `base64-image-${Date.now()}.png`;
    link.click();
  }

  fileInput.addEventListener("change", handleImageToBase64);
  copyBase64Btn.addEventListener("click", () => copyToClipboard(base64Output.value, "图片 Base64"));
  toImageBtn.addEventListener("click", renderPreviewFromBase64);
  downloadBtn.addEventListener("click", downloadImage);

  resetPreviewToEmpty();
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initImageBase64Tool = initImageBase64Tool;
