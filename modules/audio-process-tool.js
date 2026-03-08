function readAudioFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取音频文件失败。"));
    reader.readAsArrayBuffer(file);
  });
}

function decodeAudioBuffer(arrayBuffer) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("当前浏览器不支持音频解码。");
  }

  return new Promise((resolve, reject) => {
    const context = new AudioContextCtor();
    context.decodeAudioData(
      arrayBuffer.slice(0),
      (buffer) => {
        context.close().finally(() => {
          resolve(buffer);
        });
      },
      () => {
        context.close().finally(() => {
          reject(new Error("音频解码失败，文件可能不受支持。"));
        });
      }
    );
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const AUDIO_FORMAT_PROFILES = {
  wav: { label: "WAV", lossy: false, mimes: ["audio/wav"] },
  mp3: { label: "MP3", lossy: true, mimes: ["audio/mpeg", "audio/mp3"] },
  flac: { label: "FLAC", lossy: false, mimes: ["audio/flac", "audio/x-flac"] },
  aac: { label: "AAC", lossy: true, mimes: ["audio/aac", "audio/mp4;codecs=mp4a.40.2"] },
  m4a: { label: "M4A", lossy: true, mimes: ["audio/mp4;codecs=mp4a.40.2", "audio/mp4"] },
  webm: { label: "WebM", lossy: true, mimes: ["audio/webm;codecs=opus", "audio/webm"] },
  ogg: { label: "Ogg", lossy: true, mimes: ["audio/ogg;codecs=opus", "audio/ogg"] }
};

function normalizeAudioMimeType(mimeType) {
  if (mimeType === "audio/x-wav") {
    return "audio/wav";
  }
  return mimeType;
}

function formatKeyFromMime(mimeType) {
  const mime = normalizeAudioMimeType(mimeType || "").toLowerCase();
  if (mime.includes("audio/wav")) return "wav";
  if (mime.includes("audio/mpeg") || mime.includes("audio/mp3")) return "mp3";
  if (mime.includes("audio/flac") || mime.includes("audio/x-flac")) return "flac";
  if (mime.includes("audio/aac")) return "aac";
  if (mime.includes("audio/mp4")) return "m4a";
  if (mime.includes("audio/webm")) return "webm";
  if (mime.includes("audio/ogg")) return "ogg";
  return "";
}

function formatKeyFromFilename(filename) {
  const name = String(filename || "").toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  const ext = name.slice(dot + 1);
  if (ext === "wav") return "wav";
  if (ext === "mp3") return "mp3";
  if (ext === "flac") return "flac";
  if (ext === "aac") return "aac";
  if (ext === "m4a" || ext === "mp4") return "m4a";
  if (ext === "webm") return "webm";
  if (ext === "ogg" || ext === "oga") return "ogg";
  return "";
}

function detectSourceFormat(file) {
  if (!file) {
    return { key: "", method: "none" };
  }

  const byMime = formatKeyFromMime(file.type || "");
  if (byMime) {
    return { key: byMime, method: "mime" };
  }

  const byExt = formatKeyFromFilename(file.name || "");
  if (byExt) {
    return { key: byExt, method: "extension" };
  }

  return { key: "", method: "unknown" };
}

function resolveSupportedEncodeMime(formatKey) {
  const profile = AUDIO_FORMAT_PROFILES[formatKey] || AUDIO_FORMAT_PROFILES.wav;
  if (formatKey === "wav") {
    return "audio/wav";
  }

  for (let i = 0; i < profile.mimes.length; i += 1) {
    const mime = profile.mimes[i];
    if (supportsMediaRecorderMime(mime)) {
      return mime;
    }
  }

  return "";
}

function encodeAudioBufferToWav(buffer) {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const frameCount = buffer.length;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const output = new ArrayBuffer(44 + dataSize);
  const view = new DataView(output);

  function writeString(offset, text) {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const channelData = [];
  for (let c = 0; c < channels; c += 1) {
    channelData.push(buffer.getChannelData(c));
  }

  for (let i = 0; i < frameCount; i += 1) {
    for (let c = 0; c < channels; c += 1) {
      const sample = clamp(channelData[c][i], -1, 1);
      const intValue = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intValue, true);
      offset += 2;
    }
  }

  return new Blob([output], { type: "audio/wav" });
}

function supportsMediaRecorderMime(mimeType) {
  return typeof MediaRecorder !== "undefined"
    && typeof MediaRecorder.isTypeSupported === "function"
    && MediaRecorder.isTypeSupported(mimeType);
}

function encodeAudioBufferWithMediaRecorder(buffer, mimeType, qualityPercent) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return Promise.reject(new Error("当前浏览器不支持音频编码。"));
  }
  if (typeof MediaRecorder === "undefined") {
    return Promise.reject(new Error("当前浏览器不支持 WebM/Ogg 编码，请改用 WAV。"));
  }

  return new Promise((resolve, reject) => {
    const context = new AudioContextCtor();
    const destination = context.createMediaStreamDestination();
    const source = context.createBufferSource();
    source.buffer = buffer;

    source.connect(destination);

    const targetBps = Math.round(64000 + (clamp(qualityPercent, 1, 100) / 100) * 192000);
    let recorder;
    try {
      recorder = new MediaRecorder(destination.stream, {
        mimeType,
        audioBitsPerSecond: targetBps
      });
    } catch (error) {
      context.close();
      reject(new Error("当前浏览器不支持所选输出格式，请改用 WAV。"));
      return;
    }

    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = () => {
      context.close();
      reject(new Error("音频编码失败，请尝试 WAV。"));
    };

    recorder.onstop = () => {
      context.close();
      if (!chunks.length) {
        reject(new Error("编码结果为空，请尝试 WAV。"));
        return;
      }
      resolve(new Blob(chunks, { type: mimeType }));
    };

    recorder.start();
    source.start(0);
    source.onended = () => {
      setTimeout(() => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }, 150);
    };
  });
}

function getAudioExtension(formatKey) {
  if (formatKey === "wav") return "wav";
  if (formatKey === "mp3") return "mp3";
  if (formatKey === "flac") return "flac";
  if (formatKey === "aac") return "aac";
  if (formatKey === "m4a") return "m4a";
  if (formatKey === "webm") return "webm";
  if (formatKey === "ogg") return "ogg";
  return "bin";
}

function replaceExt(filename, ext) {
  const normalized = filename || "audio";
  const dot = normalized.lastIndexOf(".");
  const base = dot > 0 ? normalized.slice(0, dot) : normalized;
  return `${base}.${ext}`;
}

async function renderAudioBufferWithOptions(sourceBuffer, sampleRateMode, channelMode, gainPercent) {
  const targetSampleRate = sampleRateMode === "keep"
    ? sourceBuffer.sampleRate
    : clamp(Number.parseInt(sampleRateMode, 10) || sourceBuffer.sampleRate, 8000, 192000);

  const sourceChannels = sourceBuffer.numberOfChannels;
  let targetChannels = sourceChannels;
  if (channelMode === "mono") {
    targetChannels = 1;
  } else if (channelMode === "stereo") {
    targetChannels = 2;
  }

  const frameCount = Math.ceil(sourceBuffer.duration * targetSampleRate);
  const offline = new OfflineAudioContext(targetChannels, Math.max(1, frameCount), targetSampleRate);
  const source = offline.createBufferSource();
  source.buffer = sourceBuffer;

  const gainNode = offline.createGain();
  gainNode.gain.value = clamp(gainPercent, 50, 200) / 100;

  source.connect(gainNode);
  gainNode.connect(offline.destination);
  source.start(0);

  return offline.startRendering();
}

function initAudioProcessTool() {
  const { notify } = window.ToolCommon;

  const fileInput = document.getElementById("audio-process-input");
  const formatInput = document.getElementById("audio-process-format");
  const originalLossyStatus = document.getElementById("audio-process-original-lossy-status");
  const qualityWrap = document.getElementById("audio-process-quality-wrap");
  const qualityInput = document.getElementById("audio-process-quality");
  const qualityValue = document.getElementById("audio-process-quality-value");
  const sampleRateInput = document.getElementById("audio-process-sample-rate");
  const channelModeInput = document.getElementById("audio-process-channel-mode");
  const gainInput = document.getElementById("audio-process-gain");
  const gainValue = document.getElementById("audio-process-gain-value");
  const runBtn = document.getElementById("audio-process-run-btn");
  const resetBtn = document.getElementById("audio-process-reset-btn");
  const sourcePreview = document.getElementById("audio-process-source-preview");
  const resultPreview = document.getElementById("audio-process-result-preview");
  const infoOutput = document.getElementById("audio-process-info");
  const downloadBtn = document.getElementById("audio-process-download-btn");

  if (!fileInput || !formatInput || !originalLossyStatus || !qualityWrap || !qualityInput || !qualityValue
    || !sampleRateInput || !channelModeInput || !gainInput || !gainValue
    || !runBtn || !resetBtn || !sourcePreview || !resultPreview || !infoOutput || !downloadBtn) {
    return;
  }

  let sourceFile = null;
  let sourceBuffer = null;
  let sourcePreviewUrl = "";
  let resultBlob = null;
  let resultUrl = "";
  let resultFilename = "";

  function revokeSourcePreviewUrl() {
    if (sourcePreviewUrl) {
      URL.revokeObjectURL(sourcePreviewUrl);
      sourcePreviewUrl = "";
    }
  }

  function revokeResultUrl() {
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      resultUrl = "";
    }
  }

  function clearResult() {
    resultBlob = null;
    resultFilename = "";
    revokeResultUrl();
    resultPreview.removeAttribute("src");
    infoOutput.value = "";
    downloadBtn.disabled = true;
  }

  function updateQualityUI() {
    const q = clamp(Number.parseInt(qualityInput.value, 10) || 88, 1, 100);
    qualityInput.value = String(q);
    qualityValue.textContent = `${q}%`;
    return q;
  }

  function updateGainUI() {
    const g = clamp(Number.parseInt(gainInput.value, 10) || 100, 50, 200);
    gainInput.value = String(g);
    gainValue.textContent = `${g}%`;
    return g;
  }

  function updateFormatUI() {
    const detected = detectSourceFormat(sourceFile);
    const formatKey = formatInput.value === "original"
      ? (detected.key || "wav")
      : formatInput.value;
    const profile = AUDIO_FORMAT_PROFILES[formatKey] || AUDIO_FORMAT_PROFILES.wav;
    const lossy = profile.lossy;

    if (formatInput.value === "original") {
      if (!sourceFile) {
        originalLossyStatus.textContent = "保持原格式检测: 等待上传文件";
      } else if (!detected.key) {
        originalLossyStatus.textContent = "保持原格式检测: 未识别格式，请选择目标输出格式";
      } else {
        const kind = profile.lossy ? "有损" : "无损";
        const by = detected.method === "mime" ? "MIME" : "扩展名";
        originalLossyStatus.textContent = `保持原格式检测: ${profile.label}（${kind}，来源: ${by}）`;
      }
    } else {
      originalLossyStatus.textContent = "";
    }

    qualityWrap.classList.toggle("is-hidden", !lossy);
    qualityInput.disabled = !lossy;
  }

  function resolveOutputFormatKey() {
    if (!sourceFile) {
      return "wav";
    }

    if (formatInput.value !== "original") {
      return formatInput.value;
    }

    const detected = detectSourceFormat(sourceFile);
    if (!detected.key) {
      throw new Error("无法识别源音频格式。使用“保持原格式”时，请上传带正确扩展名的音频，或直接选择目标输出格式。");
    }
    return detected.key;
  }

  async function handleFileChange() {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      sourceFile = null;
      sourceBuffer = null;
      revokeSourcePreviewUrl();
      sourcePreview.removeAttribute("src");
      clearResult();
      return;
    }

    sourceFile = file;
    revokeSourcePreviewUrl();
    sourcePreviewUrl = URL.createObjectURL(file);
    sourcePreview.src = sourcePreviewUrl;

    const arrayBuffer = await readAudioFileAsArrayBuffer(file);
    sourceBuffer = await decodeAudioBuffer(arrayBuffer);

    clearResult();
    updateFormatUI();
    const detected = detectSourceFormat(file);
    const detectedProfile = AUDIO_FORMAT_PROFILES[detected.key] || null;
    const detectNote = detectedProfile
      ? `检测格式: ${detectedProfile.label}（${detected.method === "mime" ? "MIME" : "扩展名"}）`
      : "检测格式: 未识别（保持原格式可能不可用）";
    infoOutput.value = [
      `源文件: ${file.name}`,
      `源类型: ${file.type || "未知"}`,
      detectNote,
      `源时长: ${sourceBuffer.duration.toFixed(2)} s`,
      `源采样率: ${sourceBuffer.sampleRate} Hz`,
      `源声道: ${sourceBuffer.numberOfChannels}`
    ].join("\n");
  }

  async function runConversion() {
    if (!sourceFile || !sourceBuffer) {
      notify("请先上传音频文件。");
      return;
    }

    const gainPercent = updateGainUI();
    const quality = updateQualityUI();
    const outputFormatKey = resolveOutputFormatKey();
    const outputProfile = AUDIO_FORMAT_PROFILES[outputFormatKey] || AUDIO_FORMAT_PROFILES.wav;

    const rendered = await renderAudioBufferWithOptions(
      sourceBuffer,
      sampleRateInput.value,
      channelModeInput.value,
      gainPercent
    );

    let blob;
    let outputMimeType = "audio/wav";
    if (outputFormatKey === "wav") {
      blob = encodeAudioBufferToWav(rendered);
    } else {
      outputMimeType = resolveSupportedEncodeMime(outputFormatKey);
      if (!outputMimeType) {
        const selectedText = formatInput.value === "original" ? "保持原格式" : outputProfile.label;
        throw new Error(`当前浏览器不支持 ${selectedText} 的编码输出，请改用 WAV / WebM / Ogg。`);
      }
      blob = await encodeAudioBufferWithMediaRecorder(rendered, outputMimeType, quality);
    }

    revokeResultUrl();
    resultBlob = blob;
    resultUrl = URL.createObjectURL(blob);
    resultPreview.src = resultUrl;
    downloadBtn.disabled = false;

    const ext = getAudioExtension(outputFormatKey);
    resultFilename = replaceExt(sourceFile.name, ext);

    infoOutput.value = [
      `源文件: ${sourceFile.name}`,
      `源类型: ${sourceFile.type || "未知"}`,
      `输出格式: ${outputProfile.label}`,
      `输出类型: ${outputMimeType}`,
      `输出文件名: ${resultFilename}`,
      `输出体积: ${(blob.size / 1024).toFixed(1)} KB`,
      `输出时长: ${rendered.duration.toFixed(2)} s`,
      `输出采样率: ${rendered.sampleRate} Hz`,
      `输出声道: ${rendered.numberOfChannels}`,
      `音量增益: ${gainPercent}%`,
      outputProfile.lossy ? `有损质量: ${quality}%` : `有损质量: 不适用（${outputProfile.label} 无损）`
    ].join("\n");
  }

  function downloadResult() {
    if (!resultBlob || !resultUrl) {
      notify("暂无可下载的结果。");
      return;
    }

    const link = document.createElement("a");
    link.href = resultUrl;
    link.download = resultFilename || "converted-audio";
    link.click();
  }

  fileInput.addEventListener("change", () => {
    handleFileChange().catch((error) => {
      notify(error.message || "读取音频失败。");
    });
  });
  formatInput.addEventListener("change", updateFormatUI);
  qualityInput.addEventListener("input", updateQualityUI);
  qualityInput.addEventListener("change", updateQualityUI);
  gainInput.addEventListener("input", updateGainUI);
  gainInput.addEventListener("change", updateGainUI);
  runBtn.addEventListener("click", () => {
    runConversion().catch((error) => {
      notify(error.message || "音频转换失败。");
    });
  });
  resetBtn.addEventListener("click", clearResult);
  downloadBtn.addEventListener("click", downloadResult);
  window.addEventListener("beforeunload", () => {
    revokeSourcePreviewUrl();
    revokeResultUrl();
  });

  updateFormatUI();
  updateQualityUI();
  updateGainUI();
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initAudioProcessTool = initAudioProcessTool;
