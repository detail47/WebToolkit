function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取图片文件失败。"));
    reader.readAsDataURL(file);
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取图片元数据失败。"));
    reader.readAsArrayBuffer(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片解码失败。"));
    img.src = dataUrl;
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("图片编码失败。"));
          return;
        }
        resolve(blob);
      }, mimeType, quality);
      return;
    }

    try {
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const base64 = dataUrl.split(",")[1] || "";
      const raw = atob(base64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) {
        bytes[i] = raw.charCodeAt(i);
      }
      resolve(new Blob([bytes], { type: mimeType }));
    } catch (error) {
      reject(new Error(error.message || "图片编码失败。"));
    }
  });
}

function parseExifOrientation(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
    return 1;
  }

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    offset += 2;

    if (marker === 0xffe1) {
      const segmentLength = view.getUint16(offset, false);
      offset += 2;
      if (offset + segmentLength - 2 > view.byteLength) {
        return 1;
      }

      if (view.getUint32(offset, false) !== 0x45786966) {
        return 1;
      }

      const tiffOffset = offset + 6;
      const little = view.getUint16(tiffOffset, false) === 0x4949;
      const firstIfd = view.getUint32(tiffOffset + 4, little);
      let ifdOffset = tiffOffset + firstIfd;
      if (ifdOffset + 2 > view.byteLength) {
        return 1;
      }

      const entries = view.getUint16(ifdOffset, little);
      ifdOffset += 2;

      for (let i = 0; i < entries; i += 1) {
        const entry = ifdOffset + i * 12;
        if (entry + 12 > view.byteLength) {
          break;
        }
        const tag = view.getUint16(entry, little);
        if (tag === 0x0112) {
          const orientation = view.getUint16(entry + 8, little);
          if (orientation >= 1 && orientation <= 8) {
            return orientation;
          }
          return 1;
        }
      }
      return 1;
    }

    if ((marker & 0xff00) !== 0xff00) {
      break;
    }

    const size = view.getUint16(offset, false);
    if (size < 2) {
      break;
    }
    offset += size;
  }

  return 1;
}

function drawImageWithOrientation(image, orientation) {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const swap = orientation >= 5 && orientation <= 8;
  const canvas = createCanvas(swap ? h : w, swap ? w : h);
  const ctx = canvas.getContext("2d");

  switch (orientation) {
    case 2:
      ctx.transform(-1, 0, 0, 1, w, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, w, h);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, h);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, h, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, h, w);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, w);
      break;
    default:
      break;
  }

  ctx.drawImage(image, 0, 0);
  return canvas;
}

function drawContainedSquareCanvas(sourceCanvas, size) {
  const iconCanvas = createCanvas(size, size);
  const ctx = iconCanvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  const ratio = Math.min(size / sourceCanvas.width, size / sourceCanvas.height);
  const drawW = Math.max(1, Math.round(sourceCanvas.width * ratio));
  const drawH = Math.max(1, Math.round(sourceCanvas.height * ratio));
  const dx = Math.floor((size - drawW) / 2);
  const dy = Math.floor((size - drawH) / 2);

  ctx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, dx, dy, drawW, drawH);
  return iconCanvas;
}

function buildIcoImageBytes(iconCanvas) {
  const ctx = iconCanvas.getContext("2d");
  const width = iconCanvas.width;
  const height = iconCanvas.height;
  const imageData = ctx.getImageData(0, 0, width, height).data;

  const andStride = Math.ceil(width / 32) * 4;
  const andMaskSize = andStride * height;
  const xorSize = width * height * 4;
  const bitmapInfoHeaderSize = 40;
  const imageSize = bitmapInfoHeaderSize + xorSize + andMaskSize;

  const out = new Uint8Array(imageSize);
  const view = new DataView(out.buffer);
  let ptr = 0;

  view.setUint32(ptr, bitmapInfoHeaderSize, true);
  view.setInt32(ptr + 4, width, true);
  view.setInt32(ptr + 8, height * 2, true);
  view.setUint16(ptr + 12, 1, true);
  view.setUint16(ptr + 14, 32, true);
  view.setUint32(ptr + 16, 0, true);
  view.setUint32(ptr + 20, xorSize, true);
  view.setInt32(ptr + 24, 0, true);
  view.setInt32(ptr + 28, 0, true);
  view.setUint32(ptr + 32, 0, true);
  view.setUint32(ptr + 36, 0, true);
  ptr += bitmapInfoHeaderSize;

  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 4;
      out[ptr] = imageData[src + 2];
      out[ptr + 1] = imageData[src + 1];
      out[ptr + 2] = imageData[src];
      out[ptr + 3] = imageData[src + 3];
      ptr += 4;
    }
  }

  return out;
}

function makeIcoBlobFromCanvas(sourceCanvas, sizeList) {
  const uniqSizes = Array.from(new Set(sizeList.map((x) => clamp(Number(x), 16, 256)))).sort((a, b) => a - b);
  const images = uniqSizes.map((size) => {
    const canvas = drawContainedSquareCanvas(sourceCanvas, size);
    const bytes = buildIcoImageBytes(canvas);
    return { size, bytes };
  });

  const fileHeaderSize = 6;
  const dirEntrySize = 16;
  const imageOffsetStart = fileHeaderSize + dirEntrySize * images.length;
  const totalImageBytes = images.reduce((sum, item) => sum + item.bytes.length, 0);
  const totalSize = imageOffsetStart + totalImageBytes;

  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);

  let offset = imageOffsetStart;
  images.forEach((item, idx) => {
    const entry = fileHeaderSize + idx * dirEntrySize;
    out[entry] = item.size === 256 ? 0 : item.size;
    out[entry + 1] = item.size === 256 ? 0 : item.size;
    out[entry + 2] = 0;
    out[entry + 3] = 0;
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, item.bytes.length, true);
    view.setUint32(entry + 12, offset, true);

    out.set(item.bytes, offset);
    offset += item.bytes.length;
  });

  return new Blob([out], { type: "image/x-icon" });
}

function guessExtensionByMime(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/x-icon") return "ico";
  return "png";
}

function detectOutputMime(formatValue, originalType) {
  if (formatValue && formatValue !== "original") {
    return formatValue;
  }
  if (originalType === "image/jpeg" || originalType === "image/png" || originalType === "image/webp") {
    return originalType;
  }
  return "image/png";
}

function hasAlphaChannel(mimeType) {
  return mimeType === "image/png" || mimeType === "image/webp" || mimeType === "image/x-icon";
}

function resolveBackgroundColor(mode, customColor) {
  if (mode === "black") {
    return "#000000";
  }
  if (mode === "custom") {
    return customColor || "#ffffff";
  }
  return "#ffffff";
}

function applyRotateFlip(inputCanvas, rotateDeg, flipH, flipV) {
  const r = ((rotateDeg % 360) + 360) % 360;
  const swap = r === 90 || r === 270;
  const out = createCanvas(swap ? inputCanvas.height : inputCanvas.width, swap ? inputCanvas.width : inputCanvas.height);
  const ctx = out.getContext("2d");

  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((r * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(inputCanvas, -inputCanvas.width / 2, -inputCanvas.height / 2);
  return out;
}

function applyOutputConstraints(width, height, maxWidth, maxHeight, maxLongEdge) {
  let ratio = 1;
  if (maxWidth > 0) ratio = Math.min(ratio, maxWidth / width);
  if (maxHeight > 0) ratio = Math.min(ratio, maxHeight / height);
  if (maxLongEdge > 0) ratio = Math.min(ratio, maxLongEdge / Math.max(width, height));

  if (ratio >= 1) {
    return { width, height };
  }

  return {
    width: Math.max(1, Math.floor(width * ratio)),
    height: Math.max(1, Math.floor(height * ratio))
  };
}

async function encodeCanvasWithOptions(canvas, mimeType, qualityValue, icoSizes) {
  if (mimeType === "image/x-icon") {
    return makeIcoBlobFromCanvas(canvas, icoSizes);
  }

  const quality = clamp(qualityValue / 100, 0.01, 1);
  if (mimeType === "image/jpeg" || mimeType === "image/webp") {
    return canvasToBlob(canvas, mimeType, quality);
  }
  return canvasToBlob(canvas, mimeType);
}

function initImageProcessTool() {
  const { notify } = window.ToolCommon;
  const EMPTY_PREVIEW_SRC = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

  const fileInput = document.getElementById("image-process-input");
  const formatInput = document.getElementById("image-process-format");
  const icoSizesWrap = document.getElementById("image-process-ico-sizes-wrap");
  const icoSizeInputs = Array.from(document.querySelectorAll(".image-process-ico-size"));
  const icoPresetButtons = Array.from(document.querySelectorAll("[data-image-process-ico-preset]"));
  const scalePresetButtons = Array.from(document.querySelectorAll("[data-image-process-scale-percent]"));
  const qualityPresetMarks = Array.from(document.querySelectorAll("[data-image-process-quality]"));
  const originalLossyStatus = document.getElementById("image-process-original-lossy-status");
  const qualityWrap = document.getElementById("image-process-quality-wrap");
  const qualityInput = document.getElementById("image-process-quality");
  const qualityValue = document.getElementById("image-process-quality-value");

  const rotateInput = document.getElementById("image-process-rotate");
  const flipHInput = document.getElementById("image-process-flip-h");
  const flipVInput = document.getElementById("image-process-flip-v");

  const alphaBgModeInput = document.getElementById("image-process-alpha-bg-mode");
  const alphaBgColorInput = document.getElementById("image-process-alpha-bg-color");

  const metadataPolicyInput = document.getElementById("image-process-metadata-policy");
  const autoOrientInput = document.getElementById("image-process-auto-orient");

  const scaleModeInput = document.getElementById("image-process-scale-mode");
  const scalePercentWrap = document.getElementById("image-process-scale-percent-wrap");
  const scalePercentSliderWrap = document.getElementById("image-process-scale-percent-slider-wrap");
  const scalePercentCustomWrap = document.getElementById("image-process-scale-percent-custom-wrap");
  const scaleFitWrap = document.getElementById("image-process-scale-fit-wrap");
  const scalePercentInput = document.getElementById("image-process-scale-percent");
  const scalePercentCustomToggleInput = document.getElementById("image-process-scale-percent-custom");
  const scalePercentCustomInput = document.getElementById("image-process-scale-percent-custom-input");
  const scalePercentValue = document.getElementById("image-process-scale-percent-value");
  const scaleWidthInput = document.getElementById("image-process-scale-width");
  const scaleHeightInput = document.getElementById("image-process-scale-height");

  const maxWidthInput = document.getElementById("image-process-max-width");
  const maxHeightInput = document.getElementById("image-process-max-height");
  const maxLongEdgeInput = document.getElementById("image-process-max-long-edge");
  const enableConstraintsInput = document.getElementById("image-process-enable-constraints");
  const constraintsWrap = document.getElementById("image-process-constraints-wrap");

  const cropXInput = document.getElementById("image-process-crop-x");
  const cropYInput = document.getElementById("image-process-crop-y");
  const cropWidthInput = document.getElementById("image-process-crop-width");
  const cropHeightInput = document.getElementById("image-process-crop-height");
  const cropLockRatioInput = document.getElementById("image-process-crop-lock-ratio");
  const cropRatioInput = document.getElementById("image-process-crop-ratio");
  const cropStage = document.getElementById("image-process-crop-stage");
  const cropCanvas = document.getElementById("image-process-crop-canvas");

  const resetCropBtn = document.getElementById("image-process-reset-crop-btn");
  const runBtn = document.getElementById("image-process-run-btn");
  const downloadBtn = document.getElementById("image-process-download-btn");

  const sourcePreview = document.getElementById("image-process-source-preview");
  const resultPreview = document.getElementById("image-process-result-preview");
  const infoOutput = document.getElementById("image-process-info");

  if (!fileInput || !formatInput || !icoSizesWrap || !icoSizeInputs.length || !originalLossyStatus || !qualityWrap || !qualityInput || !qualityValue
    || !rotateInput || !flipHInput || !flipVInput
    || !alphaBgModeInput || !alphaBgColorInput
    || !metadataPolicyInput || !autoOrientInput
    || !scaleModeInput || !scalePercentWrap || !scalePercentSliderWrap || !scalePercentCustomWrap || !scaleFitWrap
    || !scalePercentInput || !scalePercentCustomToggleInput || !scalePercentCustomInput || !scalePercentValue || !scaleWidthInput || !scaleHeightInput
    || !maxWidthInput || !maxHeightInput || !maxLongEdgeInput || !enableConstraintsInput || !constraintsWrap
    || !cropXInput || !cropYInput || !cropWidthInput || !cropHeightInput || !cropLockRatioInput || !cropRatioInput
    || !cropStage || !cropCanvas
    || !resetCropBtn || !runBtn || !downloadBtn
    || !sourcePreview || !resultPreview || !infoOutput) {
    return;
  }

  let sourceFile = null;
  let sourceImage = null;
  let sourceOrientation = 1;
  let baseCanvas = null;

  let resultBlob = null;
  let resultUrl = "";
  let resultFilename = "";
  let lastNonIcoScaleMode = "none";

  let cropRect = null;
  let viewport = null;
  let dragState = null;

  const cropCtx = cropCanvas.getContext("2d");
  const HANDLE_SIZE = 8;
  const MIN_CROP_SIZE = 8;
  const SCALE_PERCENT_MIN = 10;
  const SCALE_PERCENT_MAX = 500;
  const SCALE_SLIDER_STEPS = 1000;

  function revokeResultUrl() {
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      resultUrl = "";
    }
  }

  function updateFormatUI() {
    const sourceMimeType = (() => {
      if (!sourceFile) return "";
      const mime = (sourceFile.type || "").toLowerCase();
      if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp" || mime === "image/x-icon") {
        return mime;
      }

      const name = String(sourceFile.name || "").toLowerCase();
      if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
      if (name.endsWith(".png")) return "image/png";
      if (name.endsWith(".webp")) return "image/webp";
      if (name.endsWith(".ico")) return "image/x-icon";
      return "";
    })();

    const isIco = formatInput.value === "image/x-icon";
    const outputMime = detectOutputMime(formatInput.value, sourceMimeType);
    const isLossyQualityType = outputMime === "image/jpeg" || outputMime === "image/webp";

    if (formatInput.value === "original") {
      if (!sourceFile) {
        originalLossyStatus.textContent = "保持原格式检测: 等待上传文件";
      } else if (!sourceMimeType) {
        originalLossyStatus.textContent = "保持原格式检测: 未识别格式，请选择具体输出格式";
      } else {
        const labelMap = {
          "image/jpeg": "JPEG",
          "image/png": "PNG",
          "image/webp": "WebP",
          "image/x-icon": "ICO"
        };
        const formatLabel = labelMap[sourceMimeType] || sourceMimeType;
        const kind = (sourceMimeType === "image/jpeg" || sourceMimeType === "image/webp") ? "有损" : "无损";
        originalLossyStatus.textContent = `保持原格式检测: ${formatLabel}（${kind}）`;
      }
    } else {
      originalLossyStatus.textContent = "";
    }

    qualityWrap.classList.toggle("is-hidden", !isLossyQualityType);
    qualityInput.disabled = !isLossyQualityType;
    qualityPresetMarks.forEach((mark) => {
      mark.style.pointerEvents = isLossyQualityType ? "" : "none";
    });

    icoSizesWrap.classList.toggle("is-hidden", !isIco);

    if (isIco) {
      if (scaleModeInput.value !== "none") {
        lastNonIcoScaleMode = scaleModeInput.value;
      }
      scaleModeInput.value = "none";
      scaleModeInput.disabled = true;
      scalePercentCustomToggleInput.disabled = true;
      scalePercentInput.disabled = true;
      scalePercentCustomInput.disabled = true;
      scaleWidthInput.disabled = true;
      scaleHeightInput.disabled = true;
      scalePercentWrap.classList.add("is-hidden");
      scaleFitWrap.classList.add("is-hidden");
      return;
    }

    scaleModeInput.disabled = false;
    scaleModeInput.value = lastNonIcoScaleMode || "none";
    updateScaleModeUI();
  }

  function updateAlphaBgUI() {
    alphaBgColorInput.disabled = alphaBgModeInput.value !== "custom";
  }

  function updateScaleModeUI() {
    if (scaleModeInput.disabled) {
      scalePercentWrap.classList.add("is-hidden");
      scaleFitWrap.classList.add("is-hidden");
      scalePercentCustomToggleInput.disabled = true;
      scalePercentInput.disabled = true;
      scalePercentCustomInput.disabled = true;
      scaleWidthInput.disabled = true;
      scaleHeightInput.disabled = true;
      return;
    }

    const mode = scaleModeInput.value;
    scalePercentWrap.classList.toggle("is-hidden", mode !== "percent");
    scaleFitWrap.classList.toggle("is-hidden", mode !== "fit");
    scalePercentCustomToggleInput.disabled = mode !== "percent";
    scaleWidthInput.disabled = mode !== "fit";
    scaleHeightInput.disabled = mode !== "fit";
    updateScalePercentUI();
    updateScalePercentInputModeUI();
  }

  function sliderRawToPercent(raw) {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      return 100;
    }
    const r = clamp(parsed, 0, SCALE_SLIDER_STEPS);
    if (r <= 0) {
      return SCALE_PERCENT_MIN;
    }
    if (r >= SCALE_SLIDER_STEPS) {
      return SCALE_PERCENT_MAX;
    }
    const t = r / SCALE_SLIDER_STEPS;
    const value = Math.exp(Math.log(SCALE_PERCENT_MIN) + t * (Math.log(SCALE_PERCENT_MAX) - Math.log(SCALE_PERCENT_MIN)));
    return clamp(Math.round(value), SCALE_PERCENT_MIN, SCALE_PERCENT_MAX);
  }

  function percentToSliderRaw(percent) {
    const p = clamp(Number.parseFloat(percent) || 100, SCALE_PERCENT_MIN, SCALE_PERCENT_MAX);
    const t = (Math.log(p) - Math.log(SCALE_PERCENT_MIN)) / (Math.log(SCALE_PERCENT_MAX) - Math.log(SCALE_PERCENT_MIN));
    return clamp(Math.round(t * SCALE_SLIDER_STEPS), 0, SCALE_SLIDER_STEPS);
  }

  function updateScalePercentUI() {
    let percent = 100;
    if (scalePercentCustomToggleInput.checked) {
      percent = clamp(normalizePositiveInt(scalePercentCustomInput.value, 100), SCALE_PERCENT_MIN, SCALE_PERCENT_MAX);
      scalePercentCustomInput.value = String(percent);
      scalePercentInput.value = String(percentToSliderRaw(percent));
    } else {
      const raw = clamp(Number.parseFloat(scalePercentInput.value) || 0, 0, SCALE_SLIDER_STEPS);
      if (raw >= SCALE_SLIDER_STEPS - 1) {
        scalePercentInput.value = String(SCALE_SLIDER_STEPS);
      }
      percent = sliderRawToPercent(scalePercentInput.value);
      // Keep the user's drag position untouched to avoid end-position sticking.
      scalePercentCustomInput.value = String(percent);
    }
    scalePercentValue.textContent = `${percent}%`;
    scalePercentInput.setAttribute("aria-valuetext", `${percent}%`);
    return percent;
  }

  function updateScalePercentInputModeUI() {
    const useCustomInput = scalePercentCustomToggleInput.checked;
    scalePercentSliderWrap.classList.toggle("is-hidden", useCustomInput);
    scalePercentCustomWrap.classList.toggle("is-hidden", !useCustomInput);

    if (scaleModeInput.disabled || scaleModeInput.value !== "percent") {
      scalePercentInput.disabled = true;
      scalePercentCustomInput.disabled = true;
      return;
    }

    scalePercentInput.disabled = useCustomInput;
    scalePercentCustomInput.disabled = !useCustomInput;
  }

  function updateConstraintsUI() {
    const enabled = enableConstraintsInput.checked;
    constraintsWrap.classList.toggle("is-hidden", !enabled);
    maxWidthInput.disabled = !enabled;
    maxHeightInput.disabled = !enabled;
    maxLongEdgeInput.disabled = !enabled;
  }

  function updateQualityUI() {
    const v = clamp(normalizePositiveInt(qualityInput.value, 88), 1, 100);
    qualityInput.value = String(v);
    qualityValue.textContent = `${v}%`;
    return v;
  }

  function applyQualityPreset(quality) {
    const value = clamp(normalizePositiveInt(quality, 88), 1, 100);
    qualityInput.value = String(value);
    updateQualityUI();
  }

  function setCropStageEmpty(isEmpty) {
    cropStage.classList.toggle("is-empty", isEmpty);
  }

  function syncCropInputsFromRect() {
    if (!cropRect) return;
    cropXInput.value = String(Math.round(cropRect.x));
    cropYInput.value = String(Math.round(cropRect.y));
    cropWidthInput.value = String(Math.round(cropRect.w));
    cropHeightInput.value = String(Math.round(cropRect.h));
  }

  function getActiveRatio() {
    if (cropRatioInput.value === "current") {
      if (cropRect && cropRect.h > 0) return cropRect.w / cropRect.h;
      if (baseCanvas && baseCanvas.height > 0) return baseCanvas.width / baseCanvas.height;
      return 1;
    }
    const parts = String(cropRatioInput.value).split(":");
    const rw = Number.parseFloat(parts[0]);
    const rh = Number.parseFloat(parts[1]);
    if (!Number.isFinite(rw) || !Number.isFinite(rh) || rw <= 0 || rh <= 0) return 1;
    return rw / rh;
  }

  function syncCropRectFromInputs() {
    if (!baseCanvas) return;

    const width = baseCanvas.width;
    const height = baseCanvas.height;
    let x = clamp(Number.parseInt(cropXInput.value, 10) || 0, 0, width - 1);
    let y = clamp(Number.parseInt(cropYInput.value, 10) || 0, 0, height - 1);
    let w = clamp(Number.parseInt(cropWidthInput.value, 10) || width, 1, width - x);
    let h = clamp(Number.parseInt(cropHeightInput.value, 10) || height, 1, height - y);

    if (cropLockRatioInput.checked) {
      const ratio = getActiveRatio();
      h = clamp(Math.max(1, Math.round(w / ratio)), 1, height - y);
      w = clamp(Math.max(1, Math.round(h * ratio)), 1, width - x);
    }

    cropRect = { x, y, w, h };
    syncCropInputsFromRect();
    renderCropCanvas();
  }

  function setCropToWholeImage() {
    if (!baseCanvas) return;
    cropRect = { x: 0, y: 0, w: baseCanvas.width, h: baseCanvas.height };
    syncCropInputsFromRect();
    renderCropCanvas();
  }

  function applyRatioByWidth() {
    if (!cropRect || !baseCanvas || !cropLockRatioInput.checked) return;
    const ratio = getActiveRatio();
    const maxH = baseCanvas.height - cropRect.y;
    let h = clamp(Math.max(1, Math.round(cropRect.w / ratio)), 1, maxH);
    let w = clamp(Math.max(1, Math.round(h * ratio)), 1, baseCanvas.width - cropRect.x);
    h = clamp(Math.max(1, Math.round(w / ratio)), 1, maxH);
    cropRect = { x: cropRect.x, y: cropRect.y, w, h };
    syncCropInputsFromRect();
    renderCropCanvas();
  }

  function imageToCanvasPoint(x, y) {
    if (!viewport) return { x: 0, y: 0 };
    return {
      x: viewport.drawX + x * viewport.scale,
      y: viewport.drawY + y * viewport.scale
    };
  }

  function canvasToImagePoint(clientX, clientY) {
    if (!viewport || !baseCanvas) return { x: 0, y: 0 };
    const rect = cropCanvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const imgX = (cx - viewport.drawX) / viewport.scale;
    const imgY = (cy - viewport.drawY) / viewport.scale;
    return {
      x: clamp(imgX, 0, baseCanvas.width),
      y: clamp(imgY, 0, baseCanvas.height)
    };
  }

  function getCropHandlesInCanvas() {
    if (!cropRect) return null;
    const p1 = imageToCanvasPoint(cropRect.x, cropRect.y);
    const p2 = imageToCanvasPoint(cropRect.x + cropRect.w, cropRect.y + cropRect.h);
    return { left: p1.x, top: p1.y, right: p2.x, bottom: p2.y };
  }

  function hitTestCropHandle(clientX, clientY) {
    const handles = getCropHandlesInCanvas();
    if (!handles) return "none";

    const rect = cropCanvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    function near(px, py) {
      return Math.abs(x - px) <= HANDLE_SIZE && Math.abs(y - py) <= HANDLE_SIZE;
    }

    if (near(handles.left, handles.top)) return "nw";
    if (near(handles.right, handles.top)) return "ne";
    if (near(handles.left, handles.bottom)) return "sw";
    if (near(handles.right, handles.bottom)) return "se";
    if (x >= handles.left && x <= handles.right && y >= handles.top && y <= handles.bottom) return "move";
    return "new";
  }

  function renderCropCanvas() {
    if (!baseCanvas || !cropRect) {
      setCropStageEmpty(true);
      return;
    }

    setCropStageEmpty(false);
    const stageWidth = Math.max(240, Math.floor(cropStage.clientWidth));
    const maxHeight = 420;
    const imageRatio = baseCanvas.width / baseCanvas.height;

    let canvasWidth = stageWidth;
    let canvasHeight = Math.floor(canvasWidth / imageRatio);
    if (canvasHeight > maxHeight) {
      canvasHeight = maxHeight;
      canvasWidth = Math.floor(canvasHeight * imageRatio);
    }

    cropCanvas.width = canvasWidth;
    cropCanvas.height = canvasHeight;

    const drawScale = Math.min(canvasWidth / baseCanvas.width, canvasHeight / baseCanvas.height);
    const drawW = Math.round(baseCanvas.width * drawScale);
    const drawH = Math.round(baseCanvas.height * drawScale);
    const drawX = Math.floor((canvasWidth - drawW) / 2);
    const drawY = Math.floor((canvasHeight - drawH) / 2);

    viewport = { scale: drawScale, drawX, drawY, drawW, drawH };

    cropCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    cropCtx.drawImage(baseCanvas, 0, 0, baseCanvas.width, baseCanvas.height, drawX, drawY, drawW, drawH);

    const tl = imageToCanvasPoint(cropRect.x, cropRect.y);
    const br = imageToCanvasPoint(cropRect.x + cropRect.w, cropRect.y + cropRect.h);
    const cw = Math.max(1, br.x - tl.x);
    const ch = Math.max(1, br.y - tl.y);

    cropCtx.save();
    cropCtx.fillStyle = "rgba(0, 0, 0, 0.5)";
    cropCtx.fillRect(drawX, drawY, drawW, drawH);
    cropCtx.restore();

    cropCtx.drawImage(baseCanvas, cropRect.x, cropRect.y, cropRect.w, cropRect.h, tl.x, tl.y, cw, ch);

    cropCtx.strokeStyle = "#ff6a3d";
    cropCtx.lineWidth = 2;
    cropCtx.strokeRect(tl.x, tl.y, cw, ch);
  }

  function updateCursor(clientX, clientY) {
    if (!baseCanvas || !cropRect) {
      cropCanvas.style.cursor = "crosshair";
      return;
    }
    const hit = hitTestCropHandle(clientX, clientY);
    if (hit === "move") cropCanvas.style.cursor = "move";
    else if (hit === "nw" || hit === "se") cropCanvas.style.cursor = "nwse-resize";
    else if (hit === "ne" || hit === "sw") cropCanvas.style.cursor = "nesw-resize";
    else cropCanvas.style.cursor = "crosshair";
  }

  function applyDrag(clientX, clientY) {
    if (!dragState || !baseCanvas) return;

    const point = canvasToImagePoint(clientX, clientY);
    const dx = point.x - dragState.startPoint.x;
    const dy = point.y - dragState.startPoint.y;
    const maxW = baseCanvas.width;
    const maxH = baseCanvas.height;
    const next = {
      x: dragState.startRect.x,
      y: dragState.startRect.y,
      w: dragState.startRect.w,
      h: dragState.startRect.h
    };

    if (dragState.mode === "move") {
      next.x = clamp(dragState.startRect.x + dx, 0, maxW - next.w);
      next.y = clamp(dragState.startRect.y + dy, 0, maxH - next.h);
    } else if (dragState.mode === "new") {
      const x1 = clamp(dragState.startPoint.x, 0, maxW - 1);
      const y1 = clamp(dragState.startPoint.y, 0, maxH - 1);
      const x2 = clamp(point.x, 0, maxW);
      const y2 = clamp(point.y, 0, maxH);
      const dirX = x2 >= x1 ? 1 : -1;
      const dirY = y2 >= y1 ? 1 : -1;
      let w = Math.max(MIN_CROP_SIZE, Math.abs(x2 - x1));
      let h = Math.max(MIN_CROP_SIZE, Math.abs(y2 - y1));

      if (cropLockRatioInput.checked) {
        const ratio = getActiveRatio();
        if (w / h >= ratio) h = Math.max(MIN_CROP_SIZE, Math.round(w / ratio));
        else w = Math.max(MIN_CROP_SIZE, Math.round(h * ratio));
      }

      const availW = dirX > 0 ? (maxW - x1) : x1;
      const availH = dirY > 0 ? (maxH - y1) : y1;
      const fitScale = Math.min(1, availW / w, availH / h);
      w = Math.max(1, Math.floor(w * fitScale));
      h = Math.max(1, Math.floor(h * fitScale));

      next.x = dirX > 0 ? x1 : x1 - w;
      next.y = dirY > 0 ? y1 : y1 - h;
      next.w = w;
      next.h = h;
    } else {
      let left = dragState.startRect.x;
      let top = dragState.startRect.y;
      let right = dragState.startRect.x + dragState.startRect.w;
      let bottom = dragState.startRect.y + dragState.startRect.h;

      if (cropLockRatioInput.checked) {
        const ratio = getActiveRatio();
        const anchorX = (dragState.mode === "nw" || dragState.mode === "sw") ? right : left;
        const anchorY = (dragState.mode === "nw" || dragState.mode === "ne") ? bottom : top;
        const dirX = (dragState.mode === "nw" || dragState.mode === "sw") ? -1 : 1;
        const dirY = (dragState.mode === "nw" || dragState.mode === "ne") ? -1 : 1;

        let w = Math.max(MIN_CROP_SIZE, Math.abs(point.x - anchorX));
        let h = Math.max(MIN_CROP_SIZE, Math.abs(point.y - anchorY));

        if (w / h >= ratio) h = Math.max(MIN_CROP_SIZE, Math.round(w / ratio));
        else w = Math.max(MIN_CROP_SIZE, Math.round(h * ratio));

        const availW = dirX > 0 ? (maxW - anchorX) : anchorX;
        const availH = dirY > 0 ? (maxH - anchorY) : anchorY;
        const fitScale = Math.min(1, availW / w, availH / h);
        w = Math.max(1, Math.floor(w * fitScale));
        h = Math.max(1, Math.floor(h * fitScale));

        if (dirX > 0) {
          left = anchorX;
          right = anchorX + w;
        } else {
          left = anchorX - w;
          right = anchorX;
        }

        if (dirY > 0) {
          top = anchorY;
          bottom = anchorY + h;
        } else {
          top = anchorY - h;
          bottom = anchorY;
        }
      } else {
        if (dragState.mode === "nw" || dragState.mode === "sw") {
          left = clamp(dragState.startRect.x + dx, 0, right - MIN_CROP_SIZE);
        }
        if (dragState.mode === "ne" || dragState.mode === "se") {
          right = clamp(dragState.startRect.x + dragState.startRect.w + dx, left + MIN_CROP_SIZE, maxW);
        }
        if (dragState.mode === "nw" || dragState.mode === "ne") {
          top = clamp(dragState.startRect.y + dy, 0, bottom - MIN_CROP_SIZE);
        }
        if (dragState.mode === "sw" || dragState.mode === "se") {
          bottom = clamp(dragState.startRect.y + dragState.startRect.h + dy, top + MIN_CROP_SIZE, maxH);
        }
      }

      next.x = left;
      next.y = top;
      next.w = right - left;
      next.h = bottom - top;
    }

    cropRect = next;
    syncCropInputsFromRect();
    renderCropCanvas();
  }

  function rebuildBaseCanvas(resetCrop) {
    if (!sourceImage) {
      baseCanvas = null;
      cropRect = null;
      setCropStageEmpty(true);
      return;
    }

    const orient = autoOrientInput.checked ? sourceOrientation : 1;
    if (orient === 1) {
      baseCanvas = createCanvas(sourceImage.naturalWidth, sourceImage.naturalHeight);
      baseCanvas.getContext("2d").drawImage(sourceImage, 0, 0);
    } else {
      baseCanvas = drawImageWithOrientation(sourceImage, orient);
    }

    if (!cropRect || resetCrop) {
      setCropToWholeImage();
      return;
    }

    cropRect = {
      x: clamp(cropRect.x, 0, Math.max(0, baseCanvas.width - 1)),
      y: clamp(cropRect.y, 0, Math.max(0, baseCanvas.height - 1)),
      w: clamp(cropRect.w, 1, Math.max(1, baseCanvas.width - cropRect.x)),
      h: clamp(cropRect.h, 1, Math.max(1, baseCanvas.height - cropRect.y))
    };
    syncCropInputsFromRect();
    renderCropCanvas();
  }

  function clearResultState() {
    resultBlob = null;
    resultFilename = "";
    revokeResultUrl();
    resultPreview.src = EMPTY_PREVIEW_SRC;
    resultPreview.classList.add("is-empty");
    downloadBtn.disabled = true;
  }

  function getSelectedIcoSizes() {
    const list = icoSizeInputs.filter((input) => input.checked).map((input) => Number.parseInt(input.value, 10)).filter((n) => Number.isFinite(n));
    return list;
  }

  function applyIcoPreset(preset) {
    const maps = {
      small: [16, 24, 32, 48],
      large: [64, 128, 256],
      none: [],
      all: [16, 32, 48, 64, 128, 256]
    };

    const target = maps[preset] || maps.all;
    icoSizeInputs.forEach((input) => {
      const size = Number.parseInt(input.value, 10);
      input.checked = target.includes(size);
    });
  }

  function applyScalePercentPreset(rawPercent) {
    const percent = clamp(Number.parseInt(rawPercent, 10) || 100, SCALE_PERCENT_MIN, SCALE_PERCENT_MAX);
    if (scaleModeInput.disabled) {
      return;
    }

    scaleModeInput.value = "percent";
    scalePercentCustomToggleInput.checked = false;
    scalePercentCustomInput.value = String(percent);
    scalePercentInput.value = String(percentToSliderRaw(percent));
    updateScalePercentUI();
    updateScaleModeUI();
  }

  function resolveOutputSize(width, height) {
    const mode = scaleModeInput.value;
    if (mode === "percent") {
      const percent = updateScalePercentUI();
      return {
        width: Math.max(1, Math.round(width * percent / 100)),
        height: Math.max(1, Math.round(height * percent / 100))
      };
    }

    if (mode === "fit") {
      const targetW = Number.parseInt(scaleWidthInput.value, 10);
      const targetH = Number.parseInt(scaleHeightInput.value, 10);

      if (!targetW && !targetH) {
        return { width, height };
      }
      if (targetW && targetH) {
        return { width: Math.max(1, targetW), height: Math.max(1, targetH) };
      }
      if (targetW) {
        return { width: Math.max(1, targetW), height: Math.max(1, Math.round((height * targetW) / width)) };
      }
      return { width: Math.max(1, Math.round((width * targetH) / height)), height: Math.max(1, targetH) };
    }

    return { width, height };
  }

  function isFullCrop() {
    if (!cropRect || !baseCanvas) return false;
    return cropRect.x === 0 && cropRect.y === 0 && cropRect.w === baseCanvas.width && cropRect.h === baseCanvas.height;
  }

  function getNoConstraint() {
    if (!enableConstraintsInput.checked) {
      return true;
    }

    const maxW = Number.parseInt(maxWidthInput.value, 10);
    const maxH = Number.parseInt(maxHeightInput.value, 10);
    const maxL = Number.parseInt(maxLongEdgeInput.value, 10);
    return !maxW && !maxH && !maxL;
  }

  function canKeepOriginalWithoutReencode() {
    if (!sourceFile || !baseCanvas) return false;

    const rotate = Number.parseInt(rotateInput.value, 10) || 0;
    const formatOriginal = formatInput.value === "original";
    const keepMeta = metadataPolicyInput.value === "keep-when-possible";
    const orientationNoChange = !autoOrientInput.checked || sourceOrientation === 1;

    return formatOriginal
      && keepMeta
      && orientationNoChange
      && isFullCrop()
      && rotate % 360 === 0
      && !flipHInput.checked
      && !flipVInput.checked
      && scaleModeInput.value === "none"
      && getNoConstraint();
  }

  async function handleFileChange() {
    const file = fileInput.files && fileInput.files[0];
    sourceFile = file || null;
    sourceImage = null;
    sourceOrientation = 1;
    clearResultState();

    if (!file) {
      sourcePreview.src = EMPTY_PREVIEW_SRC;
      sourcePreview.classList.add("is-empty");
      baseCanvas = null;
      cropRect = null;
      setCropStageEmpty(true);
      infoOutput.value = "";
      updateFormatUI();
      return;
    }

    try {
      if (file.type === "image/jpeg") {
        const buf = await readFileAsArrayBuffer(file);
        sourceOrientation = parseExifOrientation(buf);
      }

      const dataUrl = await readFileAsDataUrl(file);
      sourceImage = await loadImageFromDataUrl(dataUrl);
      sourcePreview.src = dataUrl;
      sourcePreview.classList.remove("is-empty");

      rebuildBaseCanvas(true);
      updateFormatUI();

      infoOutput.value = [
        `文件名: ${file.name}`,
        `原始类型: ${file.type || "未知"}`,
        `原始尺寸: ${sourceImage.naturalWidth} x ${sourceImage.naturalHeight}`,
        `EXIF 方向: ${sourceOrientation}`,
        `当前编辑基底尺寸: ${baseCanvas.width} x ${baseCanvas.height}`,
        `原始体积: ${(file.size / 1024).toFixed(1)} KB`
      ].join("\n");
    } catch (error) {
      notify(error.message || "加载图片失败。");
      sourcePreview.src = EMPTY_PREVIEW_SRC;
      sourcePreview.classList.add("is-empty");
      baseCanvas = null;
      cropRect = null;
      setCropStageEmpty(true);
      infoOutput.value = "";
      updateFormatUI();
    }
  }

  async function runImageProcess() {
    if (!sourceFile || !sourceImage || !baseCanvas) {
      notify("请先上传图片。");
      return;
    }

    syncCropRectFromInputs();
    const crop = { x: cropRect.x, y: cropRect.y, w: cropRect.w, h: cropRect.h };
    const outputMime = detectOutputMime(formatInput.value, sourceFile.type);
    const selectedIcoSizes = outputMime === "image/x-icon" ? getSelectedIcoSizes() : [];

    if (outputMime === "image/x-icon" && selectedIcoSizes.length === 0) {
      notify("请至少选择一个 ICO 尺寸。\n可使用“小图标/大图标/全选”快速选择。");
      return;
    }

    if (canKeepOriginalWithoutReencode()) {
      resultBlob = sourceFile;
      revokeResultUrl();
      resultUrl = URL.createObjectURL(sourceFile);
      resultPreview.src = resultUrl;
      resultPreview.classList.remove("is-empty");
      downloadBtn.disabled = false;
      const sourceName = sourceFile.name.replace(/\.[^.]*$/, "") || "processed";
      resultFilename = `${sourceName}-processed${sourceFile.name.match(/\.[^.]+$/)?.[0] || ""}`;

      infoOutput.value = [
        `文件名: ${sourceFile.name}`,
        `输出类型: ${sourceFile.type || "未知"}`,
        `输出体积: ${(sourceFile.size / 1024).toFixed(1)} KB`,
        "元数据策略: 已保留（未发生像素变换）"
      ].join("\n");
      return;
    }

    const cropCanvasData = createCanvas(crop.w, crop.h);
    cropCanvasData.getContext("2d").drawImage(baseCanvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

    const rotate = Number.parseInt(rotateInput.value, 10) || 0;
    const transformedCanvas = applyRotateFlip(cropCanvasData, rotate, flipHInput.checked, flipVInput.checked);

    const scaledSize = resolveOutputSize(transformedCanvas.width, transformedCanvas.height);
    const maxW = enableConstraintsInput.checked ? normalizePositiveInt(maxWidthInput.value, 0) : 0;
    const maxH = enableConstraintsInput.checked ? normalizePositiveInt(maxHeightInput.value, 0) : 0;
    const maxLong = enableConstraintsInput.checked ? normalizePositiveInt(maxLongEdgeInput.value, 0) : 0;
    const constrainedSize = applyOutputConstraints(scaledSize.width, scaledSize.height, maxW, maxH, maxLong);

    const outputCanvas = createCanvas(constrainedSize.width, constrainedSize.height);
    const outCtx = outputCanvas.getContext("2d");
    outCtx.imageSmoothingQuality = "high";

    if (!hasAlphaChannel(outputMime)) {
      outCtx.fillStyle = resolveBackgroundColor(alphaBgModeInput.value, alphaBgColorInput.value);
      outCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
    }

    outCtx.drawImage(transformedCanvas, 0, 0, transformedCanvas.width, transformedCanvas.height, 0, 0, outputCanvas.width, outputCanvas.height);

    const quality = updateQualityUI();

    try {
      const blob = await encodeCanvasWithOptions(outputCanvas, outputMime, quality, selectedIcoSizes);
      resultBlob = blob;
      revokeResultUrl();
      resultUrl = URL.createObjectURL(blob);
      resultPreview.src = resultUrl;
      resultPreview.classList.remove("is-empty");
      downloadBtn.disabled = false;

      const sourceName = sourceFile.name.replace(/\.[^.]*$/, "") || "processed";
      const ext = guessExtensionByMime(outputMime);
      resultFilename = `${sourceName}-processed.${ext}`;

      const metaNote = metadataPolicyInput.value === "keep-when-possible"
        ? "元数据策略: 已请求保留，但发生像素处理后将被移除。"
        : "元数据策略: 已移除。";

      infoOutput.value = [
        `文件名: ${sourceFile.name}`,
        `编辑基底尺寸: ${baseCanvas.width} x ${baseCanvas.height}`,
        `裁剪区域: x=${crop.x}, y=${crop.y}, w=${crop.w}, h=${crop.h}`,
        `旋转: ${rotate}°，水平翻转=${flipHInput.checked ? "是" : "否"}，垂直翻转=${flipVInput.checked ? "是" : "否"}`,
        `缩放结果: ${scaledSize.width} x ${scaledSize.height}`,
        `约束后尺寸: ${constrainedSize.width} x ${constrainedSize.height}`,
        `输出类型: ${outputMime}`,
        `输出体积: ${(blob.size / 1024).toFixed(1)} KB`,
        `质量参数: ${quality}`,
        !hasAlphaChannel(outputMime) ? `透明背景策略: ${resolveBackgroundColor(alphaBgModeInput.value, alphaBgColorInput.value)}` : "透明背景策略: 保留透明通道",
        outputMime === "image/x-icon" ? `ICO 尺寸: ${selectedIcoSizes.join(", ")}` : "",
        `EXIF 自动纠正: ${autoOrientInput.checked ? "开启" : "关闭"} (原方向=${sourceOrientation})`,
        metaNote
      ].filter(Boolean).join("\n");
    } catch (error) {
      notify(error.message || "图片处理失败。");
    }
  }

  function downloadResult() {
    if (!resultBlob || !resultUrl) {
      notify("暂无处理结果可下载。");
      return;
    }
    const link = document.createElement("a");
    link.href = resultUrl;
    link.download = resultFilename || "processed-image";
    link.click();
  }

  fileInput.addEventListener("change", () => {
    handleFileChange().catch((error) => {
      notify(error.message || "读取图片失败。");
    });
  });

  formatInput.addEventListener("change", updateFormatUI);
  icoPresetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      applyIcoPreset(button.dataset.imageProcessIcoPreset || "all");
    });
  });
  scalePresetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      applyScalePercentPreset(button.dataset.imageProcessScalePercent);
    });
  });
  qualityPresetMarks.forEach((mark) => {
    mark.addEventListener("click", () => {
      applyQualityPreset(mark.dataset.imageProcessQuality);
    });
  });
  alphaBgModeInput.addEventListener("change", updateAlphaBgUI);
  autoOrientInput.addEventListener("change", () => rebuildBaseCanvas(true));
  qualityInput.addEventListener("input", updateQualityUI);
  qualityInput.addEventListener("change", updateQualityUI);
  enableConstraintsInput.addEventListener("change", updateConstraintsUI);

  scaleModeInput.addEventListener("change", updateScaleModeUI);
  scalePercentInput.addEventListener("input", updateScalePercentUI);
  scalePercentInput.addEventListener("change", updateScalePercentUI);
  scalePercentCustomToggleInput.addEventListener("change", () => {
    updateScalePercentUI();
    updateScalePercentInputModeUI();
  });
  scalePercentCustomInput.addEventListener("input", updateScalePercentUI);
  scalePercentCustomInput.addEventListener("change", updateScalePercentUI);
  [cropXInput, cropYInput, cropWidthInput, cropHeightInput].forEach((input) => {
    input.addEventListener("change", syncCropRectFromInputs);
  });
  cropWidthInput.addEventListener("input", syncCropRectFromInputs);
  cropHeightInput.addEventListener("input", syncCropRectFromInputs);
  cropLockRatioInput.addEventListener("change", applyRatioByWidth);
  cropRatioInput.addEventListener("change", applyRatioByWidth);

  cropCanvas.addEventListener("pointerdown", (event) => {
    if (!baseCanvas || !cropRect) {
      return;
    }
    cropCanvas.setPointerCapture(event.pointerId);
    const mode = hitTestCropHandle(event.clientX, event.clientY);
    const startPoint = canvasToImagePoint(event.clientX, event.clientY);
    dragState = {
      mode,
      startPoint,
      startRect: { ...cropRect },
      pointerId: event.pointerId
    };
    updateCursor(event.clientX, event.clientY);
  });

  cropCanvas.addEventListener("pointermove", (event) => {
    if (dragState && dragState.pointerId === event.pointerId) {
      applyDrag(event.clientX, event.clientY);
      return;
    }
    updateCursor(event.clientX, event.clientY);
  });

  cropCanvas.addEventListener("pointerup", (event) => {
    if (dragState && dragState.pointerId === event.pointerId) {
      cropCanvas.releasePointerCapture(event.pointerId);
      dragState = null;
    }
    updateCursor(event.clientX, event.clientY);
  });

  cropCanvas.addEventListener("pointerleave", () => {
    if (!dragState) {
      cropCanvas.style.cursor = "crosshair";
    }
  });

  window.addEventListener("resize", () => {
    if (baseCanvas && cropRect) {
      renderCropCanvas();
    }
  });

  resetCropBtn.addEventListener("click", setCropToWholeImage);
  runBtn.addEventListener("click", () => {
    runImageProcess().catch((error) => {
      notify(error.message || "图片处理失败。");
    });
  });
  downloadBtn.addEventListener("click", downloadResult);

  window.addEventListener("beforeunload", revokeResultUrl);

  updateFormatUI();
  updateAlphaBgUI();
  updateScaleModeUI();
  updateScalePercentUI();
  updateQualityUI();
  updateConstraintsUI();
  setCropStageEmpty(true);
  sourcePreview.src = EMPTY_PREVIEW_SRC;
  sourcePreview.classList.add("is-empty");
  resultPreview.src = EMPTY_PREVIEW_SRC;
  resultPreview.classList.add("is-empty");
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initImageProcessTool = initImageProcessTool;
