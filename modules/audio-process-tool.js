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
        context.close().finally(() => resolve(buffer));
      },
      () => {
        context.close().finally(() => reject(new Error("音频解码失败，文件可能不受支持。")));
      }
    );
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dbToLinear(db) {
  return Math.pow(10, db / 20);
}

const FILTER_MIN_HZ = 20;
const FILTER_MAX_HZ = 20000;
const FILTER_SLIDER_MAX = 1000;

function formatHzLabel(hz) {
  const n = Math.round(hz);
  if (n >= 1000) {
    const k = n / 1000;
    return Number.isInteger(k) ? `${k}k Hz` : `${k.toFixed(1)}k Hz`;
  }
  return `${n} Hz`;
}

function logSliderValueToHz(raw) {
  const pos = clamp(Number.parseFloat(raw) || 0, 0, FILTER_SLIDER_MAX) / FILTER_SLIDER_MAX;
  const hz = FILTER_MIN_HZ * Math.pow(FILTER_MAX_HZ / FILTER_MIN_HZ, pos);
  return Math.round(hz);
}

function hzToLogSliderValue(hz) {
  const clampedHz = clamp(Number.parseFloat(hz) || FILTER_MIN_HZ, FILTER_MIN_HZ, FILTER_MAX_HZ);
  const ratio = Math.log(clampedHz / FILTER_MIN_HZ) / Math.log(FILTER_MAX_HZ / FILTER_MIN_HZ);
  return Math.round(ratio * FILTER_SLIDER_MAX);
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

const FFMPEG_FALLBACK_FORMATS = new Set(["mp3", "flac", "aac", "m4a"]);
const FFMPEG_SCRIPT_URL = "vendor/ffmpeg/ffmpeg.min.js";
const FFMPEG_CORE_URL = "vendor/ffmpeg/ffmpeg-core.js";

const ffmpegRuntime = {
  instance: null,
  fetchFile: null,
  loading: null,
  statusHandler: null
};

function getFfmpegCompatibilityIssue() {
  if (window.location.protocol === "file:") {
    return "当前是 file:// 环境，ffmpeg.wasm 需要通过 HTTP/HTTPS 提供资源。";
  }

  if (!window.isSecureContext) {
    return "当前不是安全上下文，ffmpeg.wasm 需要 HTTPS 或 localhost。";
  }

  if (typeof SharedArrayBuffer === "undefined") {
    return "浏览器未提供 SharedArrayBuffer，通常需要启用 COOP/COEP 响应头。";
  }

  if (!window.crossOriginIsolated) {
    return "当前页面未启用 crossOriginIsolated，需要服务端返回 COOP/COEP 响应头。";
  }

  return "";
}

function getFfmpegCompatibilityHelp() {
  return "请使用本地 HTTP 服务并返回响应头：Cross-Origin-Opener-Policy: same-origin 与 Cross-Origin-Embedder-Policy: require-corp。";
}

function emitFfmpegStatus(message) {
  if (typeof ffmpegRuntime.statusHandler === "function") {
    ffmpegRuntime.statusHandler(message);
  }
}

function resolveAssetUrl(path) {
  return new URL(path, window.location.href).href;
}

function normalizeAudioMimeType(mimeType) {
  if (mimeType === "audio/x-wav") return "audio/wav";
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
  if (!file) return { key: "", method: "none" };

  const byMime = formatKeyFromMime(file.type || "");
  if (byMime) return { key: byMime, method: "mime" };

  const byExt = formatKeyFromFilename(file.name || "");
  if (byExt) return { key: byExt, method: "extension" };

  return { key: "", method: "unknown" };
}

function supportsMediaRecorderMime(mimeType) {
  return typeof MediaRecorder !== "undefined"
    && typeof MediaRecorder.isTypeSupported === "function"
    && MediaRecorder.isTypeSupported(mimeType);
}

function resolveSupportedEncodeMime(formatKey) {
  const profile = AUDIO_FORMAT_PROFILES[formatKey] || AUDIO_FORMAT_PROFILES.wav;
  if (formatKey === "wav") return "audio/wav";
  for (let i = 0; i < profile.mimes.length; i += 1) {
    if (supportsMediaRecorderMime(profile.mimes[i])) return profile.mimes[i];
  }
  return "";
}

function mimeByFormatKey(formatKey) {
  if (formatKey === "wav") return "audio/wav";
  if (formatKey === "mp3") return "audio/mpeg";
  if (formatKey === "flac") return "audio/flac";
  if (formatKey === "aac") return "audio/aac";
  if (formatKey === "m4a") return "audio/mp4";
  if (formatKey === "webm") return "audio/webm";
  if (formatKey === "ogg") return "audio/ogg";
  return "application/octet-stream";
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-audio-ffmpeg-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`加载脚本失败: ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.audioFfmpegSrc = src;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`加载脚本失败: ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureFfmpegReady() {
  if (ffmpegRuntime.instance && ffmpegRuntime.fetchFile) {
    emitFfmpegStatus("已就绪");
    return ffmpegRuntime;
  }

  const envIssue = getFfmpegCompatibilityIssue();
  if (envIssue) {
    const message = `${envIssue} ${getFfmpegCompatibilityHelp()}`;
    emitFfmpegStatus(`不可用: ${envIssue}`);
    throw new Error(`ffmpeg.wasm 不可用: ${message}`);
  }

  if (ffmpegRuntime.loading) {
    emitFfmpegStatus("加载中...");
    return ffmpegRuntime.loading;
  }

  ffmpegRuntime.loading = (async () => {
    const scriptUrl = resolveAssetUrl(FFMPEG_SCRIPT_URL);
    const coreUrl = resolveAssetUrl(FFMPEG_CORE_URL);

    emitFfmpegStatus("加载脚本...");
    await loadScriptOnce(scriptUrl);

    if (!window.FFmpeg || typeof window.FFmpeg.createFFmpeg !== "function") {
      throw new Error("ffmpeg.wasm 组件加载失败。");
    }

    const { createFFmpeg, fetchFile } = window.FFmpeg;
    const instance = createFFmpeg({
      log: false,
      corePath: coreUrl
    });

    try {
      emitFfmpegStatus("加载核心...");
      await instance.load();
    } catch (error) {
      const detail = error && error.message ? error.message : "Failed to fetch";
      emitFfmpegStatus(`加载失败: ${detail}`);
      throw new Error(`ffmpeg.wasm 加载失败: ${detail}。${getFfmpegCompatibilityHelp()}`);
    }
    ffmpegRuntime.instance = instance;
    ffmpegRuntime.fetchFile = fetchFile;
    emitFfmpegStatus("已就绪");
    return ffmpegRuntime;
  })();

  try {
    return await ffmpegRuntime.loading;
  } finally {
    ffmpegRuntime.loading = null;
  }
}

function ffmpegArgsForFormat(formatKey, quality) {
  const clampedQuality = clamp(Number.parseInt(quality, 10) || 88, 1, 100);
  const bitrateK = Math.round(64 + (clampedQuality / 100) * 192);

  if (formatKey === "mp3") {
    const lameQ = clamp(Math.round(9 - (clampedQuality / 100) * 9), 0, 9);
    return ["-codec:a", "libmp3lame", "-q:a", String(lameQ)];
  }

  if (formatKey === "flac") {
    return ["-codec:a", "flac"];
  }

  if (formatKey === "aac" || formatKey === "m4a") {
    return ["-c:a", "aac", "-b:a", `${bitrateK}k`];
  }

  return [];
}

function buildAtempoFilterChain(value) {
  const target = clamp(Number.parseFloat(value) || 1, 0.25, 4);
  const filters = [];
  let remain = target;

  while (remain < 0.5) {
    filters.push("atempo=0.5");
    remain /= 0.5;
  }

  while (remain > 2) {
    filters.push("atempo=2.0");
    remain /= 2;
  }

  filters.push(`atempo=${remain.toFixed(6)}`);
  return filters;
}

function buildTimePitchFilterChain(mode, speedPercent, pitchSemitone, sampleRate) {
  const speed = clamp((Number.parseFloat(speedPercent) || 100) / 100, 0.5, 2);
  const pitchFactor = Math.pow(2, clamp(Number.parseFloat(pitchSemitone) || 0, -12, 12) / 12);
  const filters = [];

  if (mode === "speed-preserve-pitch") {
    return buildAtempoFilterChain(speed);
  }

  if (mode === "pitch-preserve-speed") {
    filters.push(`asetrate=${Math.round(sampleRate * pitchFactor)}`);
    filters.push(`aresample=${sampleRate}`);
    filters.push(...buildAtempoFilterChain(1 / pitchFactor));
    return filters;
  }

  if (mode === "custom") {
    filters.push(`asetrate=${Math.round(sampleRate * pitchFactor)}`);
    filters.push(`aresample=${sampleRate}`);
    filters.push(...buildAtempoFilterChain(speed / pitchFactor));
    return filters;
  }

  return [];
}

async function applyTimePitchToWavWithFfmpeg(inputWavBlob, mode, speedPercent, pitchSemitone, sampleRate) {
  const filters = buildTimePitchFilterChain(mode, speedPercent, pitchSemitone, sampleRate);
  if (!filters.length) {
    return inputWavBlob;
  }

  const ff = await ensureFfmpegReady();
  const inFile = "tp-in.wav";
  const outFile = "tp-out.wav";

  ff.instance.FS("writeFile", inFile, await ff.fetchFile(inputWavBlob));

  try {
    await ff.instance.run("-i", inFile, "-af", filters.join(","), outFile);
    const outData = ff.instance.FS("readFile", outFile);
    return new Blob([outData.buffer], { type: "audio/wav" });
  } finally {
    try { ff.instance.FS("unlink", inFile); } catch {}
    try { ff.instance.FS("unlink", outFile); } catch {}
  }
}

async function encodeAudioBufferWithFfmpeg(renderedBuffer, formatKey, quality) {
  const ff = await ensureFfmpegReady();
  const inputBlob = encodeAudioBufferToWav(renderedBuffer);
  const inFile = "input.wav";
  const outFile = `output.${getAudioExtension(formatKey)}`;

  ff.instance.FS("writeFile", inFile, await ff.fetchFile(inputBlob));
  const args = ["-i", inFile, ...ffmpegArgsForFormat(formatKey, quality), outFile];

  try {
    await ff.instance.run(...args);
    const outData = ff.instance.FS("readFile", outFile);
    return new Blob([outData.buffer], { type: mimeByFormatKey(formatKey) });
  } finally {
    try { ff.instance.FS("unlink", inFile); } catch {}
    try { ff.instance.FS("unlink", outFile); } catch {}
  }
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

function createTempAudioBuffer(channels, length, sampleRate) {
  const context = new OfflineAudioContext(Math.max(1, channels), Math.max(1, length), sampleRate);
  return context.createBuffer(Math.max(1, channels), Math.max(1, length), sampleRate);
}

function trimAudioBuffer(buffer, startSec, endSec) {
  const sampleRate = buffer.sampleRate;
  const startFrame = clamp(Math.floor(startSec * sampleRate), 0, buffer.length - 1);
  const endFrameRaw = endSec > 0 ? Math.floor(endSec * sampleRate) : buffer.length;
  const endFrame = clamp(endFrameRaw, startFrame + 1, buffer.length);
  const outLen = Math.max(1, endFrame - startFrame);
  const out = createTempAudioBuffer(buffer.numberOfChannels, outLen, sampleRate);

  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src.subarray(startFrame, endFrame));
  }

  return out;
}

function removeSilenceFromBuffer(buffer, thresholdDb, minSilenceMs) {
  const threshold = dbToLinear(thresholdDb);
  const minSilenceFrames = Math.max(1, Math.floor((minSilenceMs / 1000) * buffer.sampleRate));
  const frames = buffer.length;

  const channelViews = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    channelViews.push(buffer.getChannelData(c));
  }

  const keepRanges = [];
  let keepStart = 0;
  let i = 0;

  while (i < frames) {
    let peak = 0;
    for (let c = 0; c < channelViews.length; c += 1) {
      peak = Math.max(peak, Math.abs(channelViews[c][i]));
    }

    if (peak < threshold) {
      let j = i + 1;
      while (j < frames) {
        let p = 0;
        for (let c = 0; c < channelViews.length; c += 1) {
          p = Math.max(p, Math.abs(channelViews[c][j]));
        }
        if (p >= threshold) break;
        j += 1;
      }

      if (j - i >= minSilenceFrames) {
        if (i > keepStart) {
          keepRanges.push([keepStart, i]);
        }
        keepStart = j;
      }
      i = j;
      continue;
    }

    i += 1;
  }

  if (keepStart < frames) {
    keepRanges.push([keepStart, frames]);
  }

  if (!keepRanges.length) {
    return createTempAudioBuffer(buffer.numberOfChannels, 1, buffer.sampleRate);
  }

  let outLen = 0;
  for (let r = 0; r < keepRanges.length; r += 1) {
    outLen += keepRanges[r][1] - keepRanges[r][0];
  }

  const out = createTempAudioBuffer(buffer.numberOfChannels, outLen, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    let ptr = 0;
    for (let r = 0; r < keepRanges.length; r += 1) {
      const [s, e] = keepRanges[r];
      dst.set(src.subarray(s, e), ptr);
      ptr += e - s;
    }
  }

  return out;
}

function normalizeBufferPeak(buffer, targetDb) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < channel.length; i += 1) {
      peak = Math.max(peak, Math.abs(channel[i]));
    }
  }

  if (peak <= 0) {
    return buffer;
  }

  const gain = clamp(dbToLinear(targetDb) / peak, 0, 8);
  if (!Number.isFinite(gain) || gain <= 0 || Math.abs(gain - 1) < 1e-6) {
    return buffer;
  }

  const out = createTempAudioBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < src.length; i += 1) {
      dst[i] = clamp(src[i] * gain, -1, 1);
    }
  }
  return out;
}

async function renderAudioBufferWithChain(sourceBuffer, options) {
  const sampleRate = options.sampleRate === "keep"
    ? sourceBuffer.sampleRate
    : clamp(Number.parseInt(options.sampleRate, 10) || sourceBuffer.sampleRate, 8000, 192000);

  let channels = sourceBuffer.numberOfChannels;
  if (options.channelMode === "mono") channels = 1;
  if (options.channelMode === "stereo") channels = 2;

  const frameCount = Math.max(1, Math.ceil(sourceBuffer.duration * sampleRate));
  const offline = new OfflineAudioContext(channels, frameCount, sampleRate);

  const source = offline.createBufferSource();
  source.buffer = sourceBuffer;

  let lastNode = source;

  let filterMode = options.filterMode || "highpass";
  const freqA = clamp(Number.parseFloat(options.filterFreqAHz) || 0, 0, sampleRate / 2);
  const freqB = clamp(Number.parseFloat(options.filterFreqBHz) || 0, 0, sampleRate / 2);
  const low = Math.min(freqA, freqB);
  const high = Math.max(freqA, freqB);

  if (filterMode === "custom") {
    if (freqA <= 0 && freqB <= 0) {
      filterMode = "off";
    } else if (freqA > 0 && freqB <= 0) {
      filterMode = "highpass";
    } else if (freqA <= 0 && freqB > 0) {
      filterMode = "lowpass";
    } else if (freqA <= freqB) {
      filterMode = "bandpass";
    } else {
      filterMode = "notch";
    }
  }

  if (filterMode === "off") {
    // No filter in off mode.
  } else if (filterMode === "highpass" && low > 0) {
    const highpass = offline.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = low;
    lastNode.connect(highpass);
    lastNode = highpass;
  } else if (filterMode === "lowpass" && high > 0) {
    const lowpass = offline.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = high;
    lastNode.connect(lowpass);
    lastNode = lowpass;
  } else if ((filterMode === "bandpass" || filterMode === "notch") && low > 0 && high > low) {
    const center = Math.sqrt(low * high);
    const bandwidth = Math.max(1, high - low);
    const q = clamp(center / bandwidth, 0.0001, 1000);
    const biquad = offline.createBiquadFilter();
    biquad.type = filterMode;
    biquad.frequency.value = center;
    biquad.Q.value = q;
    lastNode.connect(biquad);
    lastNode = biquad;
  }

  const gainNode = offline.createGain();
  const gainLinear = clamp((Number.parseFloat(options.gainPercent) || 100) / 100, 0.1, 8);
  gainNode.gain.setValueAtTime(gainLinear, 0);

  const fadeInSec = clamp((Number.parseFloat(options.fadeInMs) || 0) / 1000, 0, sourceBuffer.duration);
  const fadeOutSec = clamp((Number.parseFloat(options.fadeOutMs) || 0) / 1000, 0, sourceBuffer.duration);

  if (fadeInSec > 0) {
    gainNode.gain.setValueAtTime(0.0001, 0);
    gainNode.gain.linearRampToValueAtTime(gainLinear, fadeInSec);
  }

  if (fadeOutSec > 0) {
    const startOut = Math.max(0, sourceBuffer.duration - fadeOutSec);
    gainNode.gain.setValueAtTime(gainLinear, startOut);
    gainNode.gain.linearRampToValueAtTime(0.0001, sourceBuffer.duration);
  }

  lastNode.connect(gainNode);
  gainNode.connect(offline.destination);

  source.start(0);
  return offline.startRendering();
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

async function appendWavMetadata(wavBlob, meta) {
  const fields = [
    ["INAM", meta.title],
    ["IART", meta.artist],
    ["IPRD", meta.album],
    ["ICMT", meta.comment]
  ].filter((entry) => entry[1]);

  if (!fields.length) {
    return wavBlob;
  }

  const original = new Uint8Array(await wavBlob.arrayBuffer());

  let infoDataSize = 4;
  const subChunks = [];
  for (let i = 0; i < fields.length; i += 1) {
    const tag = fields[i][0];
    const text = String(fields[i][1]);
    const encoded = new TextEncoder().encode(`${text}\u0000`);
    const padded = encoded.length % 2 === 0 ? encoded.length : encoded.length + 1;
    subChunks.push({ tag, data: encoded, padded });
    infoDataSize += 8 + padded;
  }

  const extraSize = 8 + infoDataSize;
  const out = new Uint8Array(original.length + extraSize);
  out.set(original, 0);
  const view = new DataView(out.buffer);

  let ptr = original.length;

  out[ptr + 0] = 0x4c;
  out[ptr + 1] = 0x49;
  out[ptr + 2] = 0x53;
  out[ptr + 3] = 0x54;
  view.setUint32(ptr + 4, infoDataSize, true);
  out[ptr + 8] = 0x49;
  out[ptr + 9] = 0x4e;
  out[ptr + 10] = 0x46;
  out[ptr + 11] = 0x4f;
  ptr += 12;

  for (let i = 0; i < subChunks.length; i += 1) {
    const chunk = subChunks[i];
    const tag = chunk.tag;
    out[ptr + 0] = tag.charCodeAt(0);
    out[ptr + 1] = tag.charCodeAt(1);
    out[ptr + 2] = tag.charCodeAt(2);
    out[ptr + 3] = tag.charCodeAt(3);
    view.setUint32(ptr + 4, chunk.padded, true);
    out.set(chunk.data, ptr + 8);
    if (chunk.padded > chunk.data.length) {
      out[ptr + 8 + chunk.data.length] = 0;
    }
    ptr += 8 + chunk.padded;
  }

  view.setUint32(4, out.length - 8, true);
  return new Blob([out], { type: "audio/wav" });
}

function encodeAudioBufferWithMediaRecorder(buffer, mimeType, qualityPercent) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return Promise.reject(new Error("当前浏览器不支持音频编码。"));
  }
  if (typeof MediaRecorder === "undefined") {
    return Promise.reject(new Error("当前浏览器不支持该格式编码，请改用 WAV。"));
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
      reject(new Error("当前浏览器不支持该格式编码，请改用 WAV / WebM / Ogg。"));
      return;
    }

    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
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
        if (recorder.state !== "inactive") recorder.stop();
      }, 120);
    };
  });
}

function drawWaveform(canvas, audioBuffer) {
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = Math.max(260, canvas.clientWidth || 260);
  const cssHeight = Math.max(84, canvas.clientHeight || 84);

  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = "rgba(30, 36, 48, 0.08)";
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  if (!audioBuffer) {
    ctx.fillStyle = "rgba(85, 96, 112, 0.9)";
    ctx.font = "12px Segoe UI, PingFang SC, Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("暂无波形", cssWidth / 2, cssHeight / 2 + 4);
    return;
  }

  const channel = audioBuffer.getChannelData(0);
  const step = Math.max(1, Math.floor(channel.length / cssWidth));
  const mid = cssHeight / 2;

  ctx.strokeStyle = "rgba(255,106,61,0.85)";
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let x = 0; x < cssWidth; x += 1) {
    const start = x * step;
    const end = Math.min(channel.length, start + step);
    let min = 1;
    let max = -1;
    for (let i = start; i < end; i += 1) {
      const v = channel[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    ctx.moveTo(x, mid + min * mid * 0.9);
    ctx.lineTo(x, mid + max * mid * 0.9);
  }

  ctx.stroke();
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
  const trimStartInput = document.getElementById("audio-process-trim-start");
  const trimEndInput = document.getElementById("audio-process-trim-end");

  const normalizeEnableInput = document.getElementById("audio-process-normalize-enable");
  const normalizeWrap = document.getElementById("audio-process-normalize-wrap");
  const normalizeTargetDbInput = document.getElementById("audio-process-normalize-target-db");

  const silenceEnableInput = document.getElementById("audio-process-silence-enable");
  const silenceWrap = document.getElementById("audio-process-silence-wrap");
  const silenceThresholdDbInput = document.getElementById("audio-process-silence-threshold-db");
  const silenceMinMsInput = document.getElementById("audio-process-silence-min-ms");

  const fadeInMsInput = document.getElementById("audio-process-fade-in-ms");
  const fadeOutMsInput = document.getElementById("audio-process-fade-out-ms");
  const filterTypeInput = document.getElementById("audio-process-filter-type");
  const bandWrap = document.getElementById("audio-process-band-wrap");
  const bandVisualWrap = document.getElementById("audio-process-band-visual-wrap");
  const bandTextWrap = document.getElementById("audio-process-band-text-wrap");
  const bandSliderWrap = document.getElementById("audio-process-band-slider-wrap");
  const bandRangeLeft = document.getElementById("audio-process-band-range-left");
  const bandRangeMiddle = document.getElementById("audio-process-band-range");
  const bandRangeRight = document.getElementById("audio-process-band-range-right");
  const bandMinSliderInput = document.getElementById("audio-process-band-min-slider");
  const bandMaxSliderInput = document.getElementById("audio-process-band-max-slider");
  const bandValueOutput = document.getElementById("audio-process-band-value");
  const bandMarksWrap = document.getElementById("audio-process-band-marks");
  const filterFreqAHzInput = document.getElementById("audio-process-filter-freq-a-hz");
  const filterFreqBHzInput = document.getElementById("audio-process-filter-freq-b-hz");

  const timePitchModeInput = document.getElementById("audio-process-time-pitch-mode");
  const timePitchControlsWrap = document.getElementById("audio-process-time-pitch-controls-wrap");
  const speedWrap = document.getElementById("audio-process-speed-wrap");
  const pitchWrap = document.getElementById("audio-process-pitch-wrap");
  const speedPercentInput = document.getElementById("audio-process-speed-percent");
  const pitchSemitoneInput = document.getElementById("audio-process-pitch-semitone");
  const timePitchNote = document.getElementById("audio-process-time-pitch-note");

  const metaTitleInput = document.getElementById("audio-process-meta-title");
  const metaArtistInput = document.getElementById("audio-process-meta-artist");
  const metaAlbumInput = document.getElementById("audio-process-meta-album");
  const metaCommentInput = document.getElementById("audio-process-meta-comment");

  const gainInput = document.getElementById("audio-process-gain");
  const gainValue = document.getElementById("audio-process-gain-value");

  const runBtn = document.getElementById("audio-process-run-btn");
  const runBatchBtn = document.getElementById("audio-process-run-batch-btn");
  const stopBatchBtn = document.getElementById("audio-process-stop-batch-btn");
  const resetBtn = document.getElementById("audio-process-reset-btn");

  const sourceWaveform = document.getElementById("audio-process-source-waveform");
  const resultWaveform = document.getElementById("audio-process-result-waveform");

  const sourcePreview = document.getElementById("audio-process-source-preview");
  const resultPreview = document.getElementById("audio-process-result-preview");
  const abSourceBtn = document.getElementById("audio-process-ab-source-btn");
  const abResultBtn = document.getElementById("audio-process-ab-result-btn");
  const abPauseBtn = document.getElementById("audio-process-ab-pause-btn");

  const infoOutput = document.getElementById("audio-process-info");
  const ffmpegStatusOutput = document.getElementById("audio-process-ffmpeg-status");
  const downloadBtn = document.getElementById("audio-process-download-btn");
  const downloadAllBtn = document.getElementById("audio-process-download-all-btn");

  if (!fileInput || !formatInput || !originalLossyStatus
    || !qualityWrap || !qualityInput || !qualityValue
    || !sampleRateInput || !channelModeInput || !trimStartInput || !trimEndInput
    || !normalizeEnableInput || !normalizeWrap || !normalizeTargetDbInput
    || !silenceEnableInput || !silenceWrap || !silenceThresholdDbInput || !silenceMinMsInput
    || !fadeInMsInput || !fadeOutMsInput
    || !filterTypeInput || !bandWrap || !bandVisualWrap || !bandTextWrap || !bandSliderWrap
    || !bandRangeLeft || !bandRangeMiddle || !bandRangeRight
    || !bandMinSliderInput || !bandMaxSliderInput || !bandValueOutput
    || !bandMarksWrap || !filterFreqAHzInput || !filterFreqBHzInput
    || !timePitchModeInput || !timePitchControlsWrap || !speedWrap || !pitchWrap || !speedPercentInput || !pitchSemitoneInput || !timePitchNote
    || !metaTitleInput || !metaArtistInput || !metaAlbumInput || !metaCommentInput
    || !gainInput || !gainValue || !runBtn || !runBatchBtn || !stopBatchBtn || !resetBtn
    || !sourceWaveform || !resultWaveform || !sourcePreview || !resultPreview
    || !abSourceBtn || !abResultBtn || !abPauseBtn || !infoOutput || !ffmpegStatusOutput || !downloadBtn || !downloadAllBtn) {
    return;
  }

  let sourceFiles = [];
  let sourceFile = null;
  let sourceBuffer = null;
  let sourcePreviewUrl = "";
  const encodeSupportMap = {};
  let ffmpegPrewarmStarted = false;

  let resultItems = [];
  let activeResultUrl = "";
  let customDerivedMode = "custom";
  let batchAbortRequested = false;
  let batchRunning = false;

  function revokeSourcePreviewUrl() {
    if (sourcePreviewUrl) {
      URL.revokeObjectURL(sourcePreviewUrl);
      sourcePreviewUrl = "";
    }
  }

  ffmpegRuntime.statusHandler = setFfmpegStatus;
  const initialFfmpegIssue = getFfmpegCompatibilityIssue();
  setFfmpegStatus(
    ffmpegRuntime.instance
      ? "已就绪"
      : (initialFfmpegIssue ? `不可用: ${initialFfmpegIssue}` : "未加载（按需）")
  );

  function revokeActiveResultUrl() {
    if (activeResultUrl) {
      URL.revokeObjectURL(activeResultUrl);
      activeResultUrl = "";
    }
  }

  function revokeAllResultUrls() {
    revokeActiveResultUrl();
    for (let i = 0; i < resultItems.length; i += 1) {
      if (resultItems[i].url && resultItems[i].url !== activeResultUrl) {
        URL.revokeObjectURL(resultItems[i].url);
      }
    }
  }

  function clearResultState() {
    revokeAllResultUrls();
    resultItems = [];
    resultPreview.pause();
    resultPreview.removeAttribute("src");
    downloadBtn.disabled = true;
    downloadAllBtn.disabled = true;
    drawWaveform(resultWaveform, null);
  }

  function updateGainUI() {
    const g = clamp(Number.parseInt(gainInput.value, 10) || 100, 50, 200);
    gainInput.value = String(g);
    gainValue.textContent = `${g}%`;
    const min = Number.parseFloat(gainInput.min) || 50;
    const max = Number.parseFloat(gainInput.max) || 200;
    const ratio = max > min ? (g - min) / (max - min) : 0;
    gainInput.style.setProperty("--gain-fill", `${(ratio * 100).toFixed(2)}%`);
    return g;
  }

  function updateQualityUI() {
    const q = clamp(Number.parseInt(qualityInput.value, 10) || 88, 1, 100);
    qualityInput.value = String(q);
    qualityValue.textContent = `${q}%`;
    return q;
  }

  function updateExtraUI() {
    normalizeWrap.classList.toggle("is-hidden", !normalizeEnableInput.checked);
    silenceWrap.classList.toggle("is-hidden", !silenceEnableInput.checked);
  }

  function setFfmpegStatus(message) {
    ffmpegStatusOutput.textContent = `ffmpeg.wasm: ${message}`;
  }

  function setBatchRunningState(running) {
    batchRunning = running;
    runBtn.disabled = running;
    runBatchBtn.disabled = running;
    stopBatchBtn.disabled = !running;
    if (!running) {
      batchAbortRequested = false;
    }
  }

  function setBandRangeSegment(element, start, end) {
    const s = clamp(start, 0, 100);
    const e = clamp(end, 0, 100);
    if (e <= s) {
      element.classList.add("is-hidden");
      return;
    }
    element.classList.remove("is-hidden");
    element.style.left = `${s}%`;
    element.style.right = `${100 - e}%`;
  }

  function updateBandRangeFill() {
    const minRaw = clamp(Number.parseFloat(bandMinSliderInput.value) || 0, 0, FILTER_SLIDER_MAX);
    const maxRaw = clamp(Number.parseFloat(bandMaxSliderInput.value) || FILTER_SLIDER_MAX, 0, FILTER_SLIDER_MAX);
    const p1 = Math.round((Math.min(minRaw, maxRaw) / FILTER_SLIDER_MAX) * 1000) / 10;
    const p2 = Math.round((Math.max(minRaw, maxRaw) / FILTER_SLIDER_MAX) * 1000) / 10;
    const mode = filterTypeInput.value;

    if (mode === "highpass") {
      setBandRangeSegment(bandRangeLeft, 0, 0);
      setBandRangeSegment(bandRangeMiddle, p1, 100);
      setBandRangeSegment(bandRangeRight, 0, 0);
      return;
    }

    if (mode === "lowpass") {
      setBandRangeSegment(bandRangeLeft, 0, 0);
      setBandRangeSegment(bandRangeMiddle, 0, p1);
      setBandRangeSegment(bandRangeRight, 0, 0);
      return;
    }

    if (mode === "notch") {
      setBandRangeSegment(bandRangeLeft, 0, p1);
      setBandRangeSegment(bandRangeMiddle, 0, 0);
      setBandRangeSegment(bandRangeRight, p2, 100);
      return;
    }

    setBandRangeSegment(bandRangeLeft, 0, 0);
    setBandRangeSegment(bandRangeMiddle, p1, p2);
    setBandRangeSegment(bandRangeRight, 0, 0);
  }

  function setBandRangeDefaultLabel() {
    bandValueOutput.textContent = `${formatHzLabel(FILTER_MIN_HZ)} - ${formatHzLabel(FILTER_MAX_HZ)}`;
  }

  function syncFilterVisualLabels() {
    const mode = filterTypeInput.value;
    const displayMode = mode === "custom" ? customDerivedMode : mode;
    const minHz = logSliderValueToHz(bandMinSliderInput.value);
    const maxHz = logSliderValueToHz(bandMaxSliderInput.value);
    const lowHz = Math.min(minHz, maxHz);
    const highHz = Math.max(minHz, maxHz);

    if (displayMode === "off") {
      setBandRangeDefaultLabel();
    } else if (displayMode === "highpass") {
      bandValueOutput.textContent = formatHzLabel(lowHz);
    } else if (displayMode === "lowpass") {
      bandValueOutput.textContent = formatHzLabel(highHz);
    } else if (displayMode === "notch") {
      bandValueOutput.textContent = `0 - ${formatHzLabel(lowHz)}, ${formatHzLabel(highHz)} - ∞`;
    } else {
      bandValueOutput.textContent = `${formatHzLabel(lowHz)} - ${formatHzLabel(highHz)}`;
    }

    updateBandRangeFill();
  }

  function syncFilterTextFromVisual() {
    const a = logSliderValueToHz(bandMinSliderInput.value);
    const b = logSliderValueToHz(bandMaxSliderInput.value);
    filterFreqAHzInput.value = String(Math.min(a, b));
    filterFreqBHzInput.value = String(Math.max(a, b));
  }

  function syncFilterVisualFromText() {
    const a = clamp(Number.parseFloat(filterFreqAHzInput.value) || FILTER_MIN_HZ, FILTER_MIN_HZ, FILTER_MAX_HZ);
    const b = clamp(Number.parseFloat(filterFreqBHzInput.value) || FILTER_MAX_HZ, FILTER_MIN_HZ, FILTER_MAX_HZ);
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    bandMinSliderInput.value = String(hzToLogSliderValue(low));
    bandMaxSliderInput.value = String(hzToLogSliderValue(high));
    syncFilterVisualLabels();
  }

  function normalizeBandSliderOrder(changed) {
    const mode = filterTypeInput.value;
    if (mode === "highpass" || mode === "lowpass") {
      const singleRaw = clamp(Number.parseFloat(bandMinSliderInput.value) || 0, 0, FILTER_SLIDER_MAX);
      bandMinSliderInput.value = String(singleRaw);
      bandMaxSliderInput.value = String(singleRaw);
      return;
    }

    let minRaw = Number.parseFloat(bandMinSliderInput.value) || 0;
    let maxRaw = Number.parseFloat(bandMaxSliderInput.value) || FILTER_SLIDER_MAX;

    if (changed === "min" && minRaw > maxRaw) {
      maxRaw = minRaw;
      bandMaxSliderInput.value = String(maxRaw);
    }
    if (changed === "max" && maxRaw < minRaw) {
      minRaw = maxRaw;
      bandMinSliderInput.value = String(minRaw);
    }
  }

  function updateFilterModeUI() {
    const mode = filterTypeInput.value;
    const isOff = mode === "off";
    const customTextMode = mode === "custom";
    const singleSliderMode = mode === "highpass" || mode === "lowpass";

    bandWrap.classList.toggle("is-hidden", isOff);
    bandVisualWrap.classList.toggle("is-hidden", customTextMode || isOff);
    bandTextWrap.classList.toggle("is-hidden", !customTextMode || isOff);
    bandMaxSliderInput.classList.toggle("is-hidden", singleSliderMode);

    if (isOff) {
      setBandRangeDefaultLabel();
      return;
    }

    if (customTextMode) {
      normalizeCustomFilterInputs();
      filterFreqAHzInput.value = String(Math.max(0, Number.parseFloat(filterFreqAHzInput.value) || 0));
      filterFreqBHzInput.value = String(Math.max(0, Number.parseFloat(filterFreqBHzInput.value) || 0));
      syncCustomFilterTextLabel();
      return;
    }

    if (singleSliderMode) {
      bandMaxSliderInput.value = bandMinSliderInput.value;
    }

    syncFilterVisualFromText();
    syncFilterTextFromVisual();
  }

  function normalizeCustomFilterInputs() {
    if (filterTypeInput.value !== "custom") {
      customDerivedMode = "custom";
      return;
    }

    const rawA = Math.max(0, Number.parseFloat(filterFreqAHzInput.value) || 0);
    const rawB = Math.max(0, Number.parseFloat(filterFreqBHzInput.value) || 0);

    if (rawA <= 0 && rawB <= 0) {
      customDerivedMode = "off";
    } else if (rawA > 0 && rawB <= 0) {
      customDerivedMode = "highpass";
    } else if (rawA <= 0 && rawB > 0) {
      customDerivedMode = "lowpass";
    } else if (rawA > rawB) {
      customDerivedMode = "notch";
    } else {
      customDerivedMode = "bandpass";
    }

    filterFreqAHzInput.value = String(rawA);
    filterFreqBHzInput.value = String(rawB);
  }

  function syncCustomFilterTextLabel() {
    const a = Math.max(0, Number.parseFloat(filterFreqAHzInput.value) || 0);
    const b = Math.max(0, Number.parseFloat(filterFreqBHzInput.value) || 0);
    const low = Math.min(a, b);
    const high = Math.max(a, b);

    if (customDerivedMode === "off") {
      setBandRangeDefaultLabel();
      return;
    }

    if (customDerivedMode === "highpass") {
      bandValueOutput.textContent = formatHzLabel(a);
      return;
    }

    if (customDerivedMode === "lowpass") {
      bandValueOutput.textContent = formatHzLabel(b);
      return;
    }

    if (customDerivedMode === "notch" && low > 0 && high > 0) {
      bandValueOutput.textContent = `0 - ${formatHzLabel(low)}, ${formatHzLabel(high)} - ∞`;
      return;
    }

    bandValueOutput.textContent = `${formatHzLabel(low)} - ${formatHzLabel(high)}`;
  }

  function bindFilterMarks() {
    const marks = bandMarksWrap.querySelectorAll("span[data-hz]");
    marks.forEach((mark) => {
      mark.addEventListener("click", () => {
        const hz = clamp(Number.parseFloat(mark.dataset.hz) || FILTER_MIN_HZ, FILTER_MIN_HZ, FILTER_MAX_HZ);
        const targetRaw = hzToLogSliderValue(hz);
        if (filterTypeInput.value === "highpass" || filterTypeInput.value === "lowpass") {
          bandMinSliderInput.value = String(targetRaw);
          bandMaxSliderInput.value = String(targetRaw);
          syncFilterVisualLabels();
          syncFilterTextFromVisual();
          return;
        }

        const minRaw = Number.parseFloat(bandMinSliderInput.value) || 0;
        const maxRaw = Number.parseFloat(bandMaxSliderInput.value) || FILTER_SLIDER_MAX;
        if (Math.abs(targetRaw - minRaw) <= Math.abs(targetRaw - maxRaw)) {
          bandMinSliderInput.value = String(targetRaw);
          normalizeBandSliderOrder("min");
        } else {
          bandMaxSliderInput.value = String(targetRaw);
          normalizeBandSliderOrder("max");
        }
        syncFilterVisualLabels();
        syncFilterTextFromVisual();
      });
    });
  }

  function updateTimePitchNote() {
    if (timePitchModeInput.value === "off") {
      timePitchNote.textContent = "正式功能：已关闭。";
      return;
    }
    if (timePitchModeInput.value === "speed-preserve-pitch") {
      timePitchNote.textContent = "正式功能：变速不变调（导出时生效）。";
      return;
    }
    if (timePitchModeInput.value === "pitch-preserve-speed") {
      timePitchNote.textContent = "正式功能：变调不变速（导出时生效）。";
      return;
    }
    timePitchNote.textContent = "正式功能：自定义模式（同时应用变速和变调，导出时生效）。";
  }

  function updateTimePitchUI() {
    const mode = timePitchModeInput.value;
    const showSpeed = mode === "speed-preserve-pitch" || mode === "custom";
    const showPitch = mode === "pitch-preserve-speed" || mode === "custom";
    const showControls = mode !== "off";

    timePitchControlsWrap.classList.toggle("is-hidden", !showControls);
    speedWrap.classList.toggle("is-hidden", !showSpeed);
    pitchWrap.classList.toggle("is-hidden", !showPitch);
    speedPercentInput.disabled = !showSpeed;
    pitchSemitoneInput.disabled = !showPitch;
  }

  function getEncodeSupport(formatKey) {
    if (encodeSupportMap[formatKey] !== undefined) {
      return encodeSupportMap[formatKey];
    }
    const canUseFfmpeg = !getFfmpegCompatibilityIssue();
    const supported = Boolean(resolveSupportedEncodeMime(formatKey))
      || (FFMPEG_FALLBACK_FORMATS.has(formatKey) && canUseFfmpeg);
    encodeSupportMap[formatKey] = supported;
    return supported;
  }

  function maybePrewarmFfmpeg(formatKey) {
    if (!FFMPEG_FALLBACK_FORMATS.has(formatKey)) {
      return;
    }

    if (resolveSupportedEncodeMime(formatKey)) {
      return;
    }

    const envIssue = getFfmpegCompatibilityIssue();
    if (envIssue) {
      setFfmpegStatus(`不可用: ${envIssue}`);
      return;
    }

    if (ffmpegRuntime.instance || ffmpegRuntime.loading || ffmpegPrewarmStarted) {
      return;
    }

    ffmpegPrewarmStarted = true;
    ensureFfmpegReady().catch(() => {
      ffmpegPrewarmStarted = false;
    });
  }

  function updateFormatSupportUI() {
    const options = Array.from(formatInput.options || []);
    options.forEach((option) => {
      const value = option.value;
      if (!value || value === "original") {
        return;
      }

      if (!option.dataset.baseText) {
        option.dataset.baseText = option.textContent || value;
      }

      const supported = getEncodeSupport(value);
      option.disabled = !supported;
      option.textContent = supported
        ? option.dataset.baseText
        : `${option.dataset.baseText}（当前浏览器不支持编码）`;
    });

    if (formatInput.value !== "original" && !getEncodeSupport(formatInput.value)) {
      formatInput.value = "wav";
      notify("当前浏览器不支持该输出格式编码，已自动切换为 WAV。");
    }
  }

  function updateFormatUI() {
    updateFormatSupportUI();

    const detected = detectSourceFormat(sourceFile);
    const formatKey = formatInput.value === "original"
      ? (detected.key || "wav")
      : formatInput.value;

    maybePrewarmFfmpeg(formatKey);

    const profile = AUDIO_FORMAT_PROFILES[formatKey] || AUDIO_FORMAT_PROFILES.wav;
    qualityWrap.classList.toggle("is-hidden", !profile.lossy);
    qualityInput.disabled = !profile.lossy;

    if (formatInput.value === "original") {
      if (!sourceFile) {
        originalLossyStatus.textContent = "保持原格式检测: 等待上传文件";
      } else if (!detected.key) {
        originalLossyStatus.textContent = "保持原格式检测: 未识别格式，请选择目标输出格式";
      } else {
        const kind = profile.lossy ? "有损" : "无损";
        const by = detected.method === "mime" ? "MIME" : "扩展名";
        const supportNote = getEncodeSupport(formatKey) ? "可编码" : "当前浏览器不支持编码";
        originalLossyStatus.textContent = `保持原格式检测: ${profile.label}（${kind}，来源: ${by}，${supportNote}）`;
      }
    } else {
      originalLossyStatus.textContent = "";
    }
  }

  function getProcessingOptions() {
    normalizeCustomFilterInputs();

    const trimStart = Math.max(0, Number.parseFloat(trimStartInput.value) || 0);
    const trimEnd = Math.max(0, Number.parseFloat(trimEndInput.value) || 0);

    const customTextMode = filterTypeInput.value === "custom";
    const resolvedFilterMode = customTextMode ? customDerivedMode : filterTypeInput.value;
    const visualA = logSliderValueToHz(bandMinSliderInput.value);
    const visualB = logSliderValueToHz(bandMaxSliderInput.value);
    const textA = Math.max(0, Number.parseFloat(filterFreqAHzInput.value) || 0);
    const textB = Math.max(0, Number.parseFloat(filterFreqBHzInput.value) || 0);

    return {
      formatSelection: formatInput.value,
      quality: updateQualityUI(),
      sampleRate: sampleRateInput.value,
      channelMode: channelModeInput.value,
      gainPercent: updateGainUI(),
      trimStart,
      trimEnd,
      normalizeEnable: normalizeEnableInput.checked,
      normalizeTargetDb: Number.parseFloat(normalizeTargetDbInput.value) || -1,
      silenceEnable: silenceEnableInput.checked,
      silenceThresholdDb: Number.parseFloat(silenceThresholdDbInput.value) || -45,
      silenceMinMs: Math.max(10, Number.parseInt(silenceMinMsInput.value, 10) || 300),
      fadeInMs: Math.max(0, Number.parseFloat(fadeInMsInput.value) || 0),
      fadeOutMs: Math.max(0, Number.parseFloat(fadeOutMsInput.value) || 0),
      filterMode: resolvedFilterMode,
      filterFreqAHz: customTextMode ? textA : visualA,
      filterFreqBHz: customTextMode ? textB : visualB,
      timePitchMode: timePitchModeInput.value,
      speedPercent: clamp(Number.parseFloat(speedPercentInput.value) || 100, 50, 200),
      pitchSemitone: clamp(Number.parseFloat(pitchSemitoneInput.value) || 0, -12, 12),
      meta: {
        title: metaTitleInput.value.trim(),
        artist: metaArtistInput.value.trim(),
        album: metaAlbumInput.value.trim(),
        comment: metaCommentInput.value.trim()
      }
    };
  }

  function formatEffectiveFilterTrace(options) {
    const a = Math.max(0, Number.parseFloat(options.filterFreqAHz) || 0);
    const b = Math.max(0, Number.parseFloat(options.filterFreqBHz) || 0);
    const low = Math.min(a, b);
    const high = Math.max(a, b);

    if (options.filterMode === "off") {
      return "滤波生效: 关闭";
    }
    if (options.filterMode === "highpass") {
      return `滤波生效: 高通 @ ${formatHzLabel(a || low)}`;
    }
    if (options.filterMode === "lowpass") {
      return `滤波生效: 低通 @ ${formatHzLabel(b || high)}`;
    }
    if (options.filterMode === "notch") {
      return `滤波生效: 带阻（0 - ${formatHzLabel(low)}, ${formatHzLabel(high)} - ∞）`;
    }
    return `滤波生效: 带通（${formatHzLabel(low)} - ${formatHzLabel(high)}）`;
  }

  function formatEffectiveTimePitchTrace(options) {
    if (options.timePitchMode === "off") {
      return "变速/变调生效: 关闭";
    }
    return `变速/变调生效: ${options.timePitchMode}（速度 ${options.speedPercent}%，音高 ${options.pitchSemitone} 半音）`;
  }

  function resolveOutputFormat(file, options) {
    if (options.formatSelection !== "original") {
      return options.formatSelection;
    }

    const detected = detectSourceFormat(file);
    if (!detected.key) {
      throw new Error("无法识别源音频格式。使用“保持原格式”时，请上传带正确扩展名的音频，或直接选择目标输出格式。");
    }
    return detected.key;
  }

  async function processOneFile(file, options) {
    const arrayBuffer = await readAudioFileAsArrayBuffer(file);
    const decoded = await decodeAudioBuffer(arrayBuffer);

    let working = decoded;

    const trimEndResolved = options.trimEnd > 0 ? options.trimEnd : decoded.duration;
    if (options.trimStart > 0 || trimEndResolved < decoded.duration) {
      if (trimEndResolved <= options.trimStart) {
        throw new Error(`文件 ${file.name} 裁剪范围无效。`);
      }
      working = trimAudioBuffer(working, options.trimStart, trimEndResolved);
    }

    if (options.silenceEnable) {
      working = removeSilenceFromBuffer(working, options.silenceThresholdDb, options.silenceMinMs);
    }

    let rendered = await renderAudioBufferWithChain(working, {
      sampleRate: options.sampleRate,
      channelMode: options.channelMode,
      gainPercent: options.gainPercent,
      fadeInMs: options.fadeInMs,
      fadeOutMs: options.fadeOutMs,
      filterMode: options.filterMode,
      filterFreqAHz: options.filterFreqAHz,
      filterFreqBHz: options.filterFreqBHz
    });

    if (options.normalizeEnable) {
      rendered = normalizeBufferPeak(rendered, options.normalizeTargetDb);
    }

    if (options.timePitchMode !== "off") {
      const wavForTimePitch = encodeAudioBufferToWav(rendered);
      const processedWav = await applyTimePitchToWavWithFfmpeg(
        wavForTimePitch,
        options.timePitchMode,
        options.speedPercent,
        options.pitchSemitone,
        rendered.sampleRate
      );
      rendered = await decodeAudioBuffer(await processedWav.arrayBuffer());
    }

    const requestedFormatKey = resolveOutputFormat(file, options);
    const encodeMime = resolveSupportedEncodeMime(requestedFormatKey);
    const canUseFfmpeg = !getFfmpegCompatibilityIssue();

    if (!encodeMime && !FFMPEG_FALLBACK_FORMATS.has(requestedFormatKey)) {
      throw new Error(`当前浏览器不支持 ${requestedFormatKey.toUpperCase()} 编码输出，请改用 WAV / WebM / Ogg。`);
    }

    if (!encodeMime && FFMPEG_FALLBACK_FORMATS.has(requestedFormatKey) && !canUseFfmpeg) {
      throw new Error(
        `当前环境无法使用 ffmpeg.wasm（${getFfmpegCompatibilityIssue()}），请改用 WAV / WebM / Ogg，或按要求配置服务器响应头后再导出 ${requestedFormatKey.toUpperCase()}。`
      );
    }

    let blob;
    let outputMime = encodeMime || mimeByFormatKey(requestedFormatKey);
    let encodeEngine = "MediaRecorder";
    if (requestedFormatKey === "wav") {
      blob = encodeAudioBufferToWav(rendered);
      blob = await appendWavMetadata(blob, options.meta);
      outputMime = "audio/wav";
      encodeEngine = "WAV-PCM";
    } else if (encodeMime) {
      blob = await encodeAudioBufferWithMediaRecorder(rendered, encodeMime, options.quality);
      encodeEngine = "MediaRecorder";
    } else {
      blob = await encodeAudioBufferWithFfmpeg(rendered, requestedFormatKey, options.quality);
      outputMime = mimeByFormatKey(requestedFormatKey);
      encodeEngine = "ffmpeg.wasm";
    }

    const formatProfile = AUDIO_FORMAT_PROFILES[requestedFormatKey] || AUDIO_FORMAT_PROFILES.wav;
    const extension = getAudioExtension(requestedFormatKey);
    const filename = replaceExt(file.name, extension);

    return {
      sourceFile: file,
      rendered,
      blob,
      filename,
      formatKey: requestedFormatKey,
      mime: outputMime,
      formatProfile,
      encodeEngine
    };
  }

  function applyPreviewTimePitch(audioElement) {
    const mode = timePitchModeInput.value;
    const speed = clamp(Number.parseFloat(speedPercentInput.value) || 100, 50, 200) / 100;
    const pitch = clamp(Number.parseFloat(pitchSemitoneInput.value) || 0, -12, 12);
    const pitchFactor = Math.pow(2, pitch / 12);

    function setPreservePitch(target, enabled) {
      if (typeof target.preservesPitch === "boolean") target.preservesPitch = enabled;
      if (typeof target.mozPreservesPitch === "boolean") target.mozPreservesPitch = enabled;
      if (typeof target.webkitPreservesPitch === "boolean") target.webkitPreservesPitch = enabled;
    }

    audioElement.playbackRate = 1;
    setPreservePitch(audioElement, true);

    if (mode === "speed-preserve-pitch") {
      audioElement.playbackRate = speed;
      setPreservePitch(audioElement, true);
      return;
    }

    if (mode === "pitch-preserve-speed") {
      setPreservePitch(audioElement, false);
      audioElement.playbackRate = pitchFactor;
      return;
    }

    if (mode === "custom") {
      setPreservePitch(audioElement, false);
      audioElement.playbackRate = clamp(speed * pitchFactor, 0.5, 4);
    }
  }

  function applyResultToUI(result, isBatchSummary) {
    revokeActiveResultUrl();
    activeResultUrl = result.url;
    resultPreview.src = result.url;
    applyPreviewTimePitch(resultPreview);

    drawWaveform(resultWaveform, result.rendered);

    const options = getProcessingOptions();
    const filterTraceLine = formatEffectiveFilterTrace(options);
    const timePitchTraceLine = formatEffectiveTimePitchTrace(options);

    infoOutput.value = [
      `源文件: ${result.sourceFile.name}`,
      `源类型: ${result.sourceFile.type || "未知"}`,
      `输出格式: ${result.formatProfile.label}`,
      `输出类型: ${result.mime}`,
      `编码引擎: ${result.encodeEngine}`,
      `输出文件名: ${result.filename}`,
      `输出体积: ${(result.blob.size / 1024).toFixed(1)} KB`,
      `输出时长: ${result.rendered.duration.toFixed(2)} s`,
      `输出采样率: ${result.rendered.sampleRate} Hz`,
      `输出声道: ${result.rendered.numberOfChannels}`,
      `音量增益: ${options.gainPercent}%`,
      options.normalizeEnable ? `标准化: 开启（目标 ${options.normalizeTargetDb} dBFS）` : "标准化: 关闭",
      options.silenceEnable ? `静音删除: 开启（阈值 ${options.silenceThresholdDb} dB, 最小 ${options.silenceMinMs} ms）` : "静音删除: 关闭",
      filterTraceLine,
      options.formatSelection === "original" ? "保持原格式: 开启" : `保持原格式: 关闭（固定输出 ${options.formatSelection.toUpperCase()}）`,
      options.formatSelection === "original" ? `原格式检测: ${detectSourceFormat(result.sourceFile).key || "未识别"}` : "原格式检测: 已忽略",
      timePitchTraceLine,
      ffmpegStatusOutput.textContent,
      options.meta.title || options.meta.artist || options.meta.album || options.meta.comment
        ? `元数据: ${result.formatKey === "wav" ? "已写入 WAV INFO" : "仅 WAV 可写入，当前格式未写入"}`
        : "元数据: 未填写",
      isBatchSummary ? `批量结果: 共 ${resultItems.length} 个文件已转换` : ""
    ].filter(Boolean).join("\n");
  }

  async function handleFileChange() {
    const files = Array.from(fileInput.files || []);
    sourceFiles = files;
    sourceFile = files[0] || null;
    sourceBuffer = null;

    clearResultState();

    if (!sourceFile) {
      revokeSourcePreviewUrl();
      sourcePreview.removeAttribute("src");
      drawWaveform(sourceWaveform, null);
      infoOutput.value = "";
      updateFormatUI();
      return;
    }

    revokeSourcePreviewUrl();
    sourcePreviewUrl = URL.createObjectURL(sourceFile);
    sourcePreview.src = sourcePreviewUrl;
    applyPreviewTimePitch(sourcePreview);

    const buf = await readAudioFileAsArrayBuffer(sourceFile);
    sourceBuffer = await decodeAudioBuffer(buf);
    drawWaveform(sourceWaveform, sourceBuffer);

    updateFormatUI();
    const detected = detectSourceFormat(sourceFile);
    const profile = AUDIO_FORMAT_PROFILES[detected.key] || null;
    infoOutput.value = [
      `已上传文件数: ${sourceFiles.length}`,
      `当前文件: ${sourceFile.name}`,
      `源类型: ${sourceFile.type || "未知"}`,
      profile ? `检测格式: ${profile.label}（${detected.method === "mime" ? "MIME" : "扩展名"}）` : "检测格式: 未识别",
      `源时长: ${sourceBuffer.duration.toFixed(2)} s`,
      `源采样率: ${sourceBuffer.sampleRate} Hz`,
      `源声道: ${sourceBuffer.numberOfChannels}`
    ].join("\n");
  }

  async function runSingleConversion() {
    if (!sourceFile) {
      notify("请先上传音频文件。");
      return;
    }

    const options = getProcessingOptions();
    const result = await processOneFile(sourceFile, options);

    clearResultState();
    const url = URL.createObjectURL(result.blob);
    resultItems = [{ ...result, url }];
    downloadBtn.disabled = false;
    downloadAllBtn.disabled = false;
    applyResultToUI(resultItems[0], false);
  }

  async function runBatchConversion() {
    if (!sourceFiles.length) {
      notify("请先上传至少一个音频文件。");
      return;
    }

    const options = getProcessingOptions();
    clearResultState();
    batchAbortRequested = false;
    setBatchRunningState(true);

    const results = [];
    const failed = [];
    const total = sourceFiles.length;
    let interrupted = false;

    try {
      for (let i = 0; i < sourceFiles.length; i += 1) {
        if (batchAbortRequested) {
          interrupted = true;
          break;
        }

        const file = sourceFiles[i];
        infoOutput.value = `批量转换中: ${i + 1}/${total}\n当前文件: ${file.name}`;
        try {
          const result = await processOneFile(file, options);
          const url = URL.createObjectURL(result.blob);
          results.push({ ...result, url });
        } catch (error) {
          failed.push(`${file.name}: ${error.message || "转换失败"}`);
        }
      }

      resultItems = results;
      downloadBtn.disabled = !resultItems.length;
      downloadAllBtn.disabled = !resultItems.length;

      if (resultItems.length) {
        applyResultToUI(resultItems[0], true);
        if (failed.length) {
          infoOutput.value += `\n失败 ${failed.length} 个:\n${failed.join("\n")}`;
        }
        if (interrupted) {
          infoOutput.value += "\n批量任务已由用户中止。";
        }
        return;
      }

      if (interrupted) {
        throw new Error("批量任务已中止。没有可用输出。");
      }

      throw new Error(failed.length ? failed.join("\n") : "批量转换失败。");
    } finally {
      setBatchRunningState(false);
    }
  }

  function downloadCurrent() {
    if (!resultItems.length) {
      notify("暂无可下载结果。");
      return;
    }
    const current = resultItems[0];
    const link = document.createElement("a");
    link.href = current.url;
    link.download = current.filename;
    link.click();
  }

  function downloadAll() {
    if (!resultItems.length) {
      notify("暂无可下载结果。");
      return;
    }

    for (let i = 0; i < resultItems.length; i += 1) {
      const item = resultItems[i];
      const link = document.createElement("a");
      link.href = item.url;
      link.download = item.filename;
      link.click();
    }
  }

  function playA() {
    if (!sourcePreview.src) return;
    if (resultPreview.currentTime > 0 && Number.isFinite(resultPreview.currentTime)) {
      sourcePreview.currentTime = resultPreview.currentTime;
    }
    applyPreviewTimePitch(sourcePreview);
    resultPreview.pause();
    sourcePreview.play().catch(() => {});
  }

  function playB() {
    if (!resultPreview.src) {
      notify("请先转换音频后再试听 B。");
      return;
    }
    if (sourcePreview.currentTime > 0 && Number.isFinite(sourcePreview.currentTime)) {
      resultPreview.currentTime = sourcePreview.currentTime;
    }
    applyPreviewTimePitch(resultPreview);
    sourcePreview.pause();
    resultPreview.play().catch(() => {});
  }

  function pausePreview() {
    sourcePreview.pause();
    resultPreview.pause();
  }

  fileInput.addEventListener("change", () => {
    handleFileChange().catch((error) => notify(error.message || "读取音频失败。"));
  });

  formatInput.addEventListener("change", updateFormatUI);
  qualityInput.addEventListener("input", updateQualityUI);
  qualityInput.addEventListener("change", updateQualityUI);
  gainInput.addEventListener("input", updateGainUI);
  gainInput.addEventListener("change", updateGainUI);

  normalizeEnableInput.addEventListener("change", updateExtraUI);
  silenceEnableInput.addEventListener("change", updateExtraUI);
  filterTypeInput.addEventListener("change", () => {
    updateFilterModeUI();
    syncFilterVisualLabels();
    syncFilterTextFromVisual();
  });

  bandMinSliderInput.addEventListener("input", () => {
    normalizeBandSliderOrder("min");
    syncFilterVisualLabels();
    syncFilterTextFromVisual();
  });

  bandMaxSliderInput.addEventListener("input", () => {
    normalizeBandSliderOrder("max");
    syncFilterVisualLabels();
    syncFilterTextFromVisual();
  });

  filterFreqAHzInput.addEventListener("input", () => {
    normalizeCustomFilterInputs();
    if (filterTypeInput.value === "custom") {
      syncCustomFilterTextLabel();
      return;
    }
    if (filterTypeInput.value !== "custom") {
      syncFilterVisualFromText();
      syncFilterTextFromVisual();
    }
  });

  filterFreqBHzInput.addEventListener("input", () => {
    normalizeCustomFilterInputs();
    if (filterTypeInput.value === "custom") {
      syncCustomFilterTextLabel();
      return;
    }
    if (filterTypeInput.value !== "custom") {
      syncFilterVisualFromText();
      syncFilterTextFromVisual();
    }
  });

  bindFilterMarks();

  timePitchModeInput.addEventListener("change", () => {
    updateTimePitchUI();
    updateTimePitchNote();
    applyPreviewTimePitch(sourcePreview);
    applyPreviewTimePitch(resultPreview);
  });

  speedPercentInput.addEventListener("input", () => {
    applyPreviewTimePitch(sourcePreview);
    applyPreviewTimePitch(resultPreview);
  });

  pitchSemitoneInput.addEventListener("input", () => {
    applyPreviewTimePitch(sourcePreview);
    applyPreviewTimePitch(resultPreview);
  });

  runBtn.addEventListener("click", () => {
    if (batchRunning) {
      notify("批量任务执行中，请先停止或等待完成。");
      return;
    }
    runSingleConversion().catch((error) => notify(error.message || "音频转换失败。"));
  });

  runBatchBtn.addEventListener("click", () => {
    runBatchConversion().catch((error) => notify(error.message || "批量转换失败。"));
  });

  stopBatchBtn.addEventListener("click", () => {
    if (!batchRunning) return;
    batchAbortRequested = true;
    infoOutput.value += "\n收到中止请求，正在结束当前文件...";
  });

  resetBtn.addEventListener("click", () => {
    if (batchRunning) {
      batchAbortRequested = true;
    }
    sourceFiles = [];
    sourceFile = null;
    sourceBuffer = null;
    fileInput.value = "";
    revokeSourcePreviewUrl();
    sourcePreview.pause();
    sourcePreview.removeAttribute("src");
    drawWaveform(sourceWaveform, null);
    clearResultState();
    infoOutput.value = "";
    filterTypeInput.value = "off";
    filterFreqAHzInput.value = "200";
    filterFreqBHzInput.value = "10000";
    syncFilterVisualFromText();
    syncFilterTextFromVisual();
    updateFilterModeUI();
    updateFormatUI();
  });

  downloadBtn.addEventListener("click", downloadCurrent);
  downloadAllBtn.addEventListener("click", downloadAll);

  abSourceBtn.addEventListener("click", playA);
  abResultBtn.addEventListener("click", playB);
  abPauseBtn.addEventListener("click", pausePreview);

  sourcePreview.addEventListener("play", () => {
    applyPreviewTimePitch(sourcePreview);
  });
  resultPreview.addEventListener("play", () => {
    applyPreviewTimePitch(resultPreview);
  });

  window.addEventListener("beforeunload", () => {
    revokeSourcePreviewUrl();
    revokeAllResultUrls();
  });

  updateFormatUI();
  updateExtraUI();
  filterTypeInput.value = "off";
  filterFreqAHzInput.value = "200";
  filterFreqBHzInput.value = "10000";
  syncFilterVisualFromText();
  syncFilterTextFromVisual();
  updateFilterModeUI();
  updateTimePitchUI();
  updateGainUI();
  updateQualityUI();
  updateTimePitchNote();
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initAudioProcessTool = initAudioProcessTool;
