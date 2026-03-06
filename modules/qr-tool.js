function utf16ToUtf8(text) {
  return unescape(encodeURIComponent(text));
}

function normalizeMojibake(text) {
  if (!text || typeof TextDecoder === "undefined") {
    return text;
  }

  let hasHighByte = false;
  const bytes = new Uint8Array(text.length);

  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);

    if (code > 0xff) {
      return text;
    }

    if (code >= 0x80) {
      hasHighByte = true;
    }

    bytes[i] = code;
  }

  if (!hasHighByte) {
    return text;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return text;
  }
}

function decodeQrData(code) {
  if (code.binaryData && code.binaryData.length > 0 && typeof TextDecoder !== "undefined") {
    try {
      const decoded = new TextDecoder("utf-8").decode(Uint8Array.from(code.binaryData));
      return normalizeMojibake(decoded);
    } catch {
      // Fall back to code.data.
    }
  }

  if (code.data && typeof TextDecoder !== "undefined") {
    try {
      const latin1Bytes = Uint8Array.from(code.data, (ch) => ch.charCodeAt(0) & 0xff);
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(latin1Bytes);
      return normalizeMojibake(decoded);
    } catch {
      // Ignore and fall through to raw text.
    }
  }

  return normalizeMojibake(code.data);
}

function initQrTool() {
  const { clearNode, notify } = window.ToolCommon;
  const qrTextInput = document.getElementById("qr-text");
  const qrSizeInput = document.getElementById("qr-size");
  const qrOutput = document.getElementById("qr-output");
  const generateQrBtn = document.getElementById("generate-qr-btn");
  const downloadQrBtn = document.getElementById("download-qr-btn");

  const qrFileInput = document.getElementById("qr-file");
  const decodeQrBtn = document.getElementById("decode-qr-btn");
  const decodeResult = document.getElementById("decode-result");
  const qrCanvas = document.getElementById("qr-canvas");

  async function generateQrCode() {
    const text = qrTextInput.value.trim();
    const size = Number(qrSizeInput.value) || 256;

    if (!text) {
      notify("请输入要生成二维码的内容。");
      return;
    }

    try {
      clearNode(qrOutput);

      if (!window.QRCode) {
        notify("未找到本地二维码库，请确认 vendor/qrcode.min.js 存在。");
        return;
      }

      const normalizedText = utf16ToUtf8(text);
      new window.QRCode(qrOutput, {
        text: normalizedText,
        width: size,
        height: size,
        colorDark: "#0f1115",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.H
      });

      downloadQrBtn.disabled = false;
    } catch (error) {
      notify(`二维码生成失败：${error.message}`);
    }
  }

  function downloadQrPng() {
    const canvas = qrOutput.querySelector("canvas");
    const img = qrOutput.querySelector("img");

    if (canvas) {
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = "qrcode.png";
      link.click();
      return;
    }

    if (img) {
      const link = document.createElement("a");
      link.href = img.src;
      link.download = "qrcode.png";
      link.click();
      return;
    }

    notify("当前没有可下载的二维码。");
  }

  function decodeUploadedQr() {
    const file = qrFileInput.files && qrFileInput.files[0];

    if (!file) {
      notify("请先上传图片。");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const ctx = qrCanvas.getContext("2d");
        qrCanvas.width = image.width;
        qrCanvas.height = image.height;
        ctx.drawImage(image, 0, 0);

        const imageData = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
        const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth"
        });

        if (code && code.data) {
          decodeResult.textContent = decodeQrData(code);
        } else {
          decodeResult.textContent = "未在该图片中识别到二维码。";
        }
      };
      image.onerror = () => {
        decodeResult.textContent = "图片加载失败，请尝试其他文件。";
      };
      image.src = reader.result;
    };

    reader.onerror = () => {
      decodeResult.textContent = "文件读取失败，请重试。";
    };

    reader.readAsDataURL(file);
  }

  generateQrBtn.addEventListener("click", generateQrCode);
  downloadQrBtn.addEventListener("click", downloadQrPng);
  decodeQrBtn.addEventListener("click", decodeUploadedQr);
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initQrTool = initQrTool;
