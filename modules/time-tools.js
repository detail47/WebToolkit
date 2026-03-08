function formatTime(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatDate(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const timeText = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  if (days <= 0) {
    return timeText;
  }

  return `${String(days).padStart(2, "0")}天 ${timeText}`;
}

function initTimeTools() {
  const { notify } = window.ToolCommon;

  const nowDisplay = document.getElementById("time-now-display");
  const dateDisplay = document.getElementById("time-date-display");
  const fullscreenBtn = document.getElementById("time-fullscreen-btn");
  const fullscreenView = document.getElementById("time-fullscreen-view");
  const fullscreenClock = document.getElementById("time-fullscreen-clock");

  const countdownTarget = document.getElementById("countdown-target");
  const countdownMode = document.getElementById("countdown-mode");
  const countdownTargetWrap = document.getElementById("countdown-target-wrap");
  const countdownDurationWrap = document.getElementById("countdown-duration-wrap");
  const countdownDays = document.getElementById("countdown-days");
  const countdownHours = document.getElementById("countdown-hours");
  const countdownMinutes = document.getElementById("countdown-minutes");
  const countdownSeconds = document.getElementById("countdown-seconds");
  const countdownPresetButtons = Array.from(document.querySelectorAll("[data-countdown-preset-seconds]"));
  const countdownStartBtn = document.getElementById("countdown-start-btn");
  const countdownStopBtn = document.getElementById("countdown-stop-btn");
  const countdownFullscreenBtn = document.getElementById("countdown-fullscreen-btn");
  const countdownFullscreenView = document.getElementById("countdown-fullscreen-view");
  const countdownFullscreenClock = document.getElementById("countdown-fullscreen-clock");
  const countdownSoundEnabled = document.getElementById("countdown-sound-enabled");
  const countdownDisplay = document.getElementById("countdown-display");
  const countdownStatus = document.getElementById("countdown-status");

  if (!nowDisplay || !dateDisplay || !fullscreenBtn || !fullscreenView || !fullscreenClock
    || !countdownTarget || !countdownMode || !countdownTargetWrap || !countdownDurationWrap
    || !countdownDays || !countdownHours || !countdownMinutes || !countdownSeconds
    || !countdownStartBtn || !countdownStopBtn || !countdownFullscreenBtn
    || !countdownFullscreenView || !countdownFullscreenClock
    || !countdownSoundEnabled
    || !countdownDisplay || !countdownStatus) {
    return;
  }

  let timerId = null;
  let countdownId = null;
  let fullscreenAltTheme = false;
  let countdownToneContext = null;

  function getCountdownToneContext() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    if (!countdownToneContext || countdownToneContext.state === "closed") {
      countdownToneContext = new AudioContextCtor();
    }

    return countdownToneContext;
  }

  function closeCountdownToneContext() {
    if (countdownToneContext) {
      countdownToneContext.close().catch(() => {});
      countdownToneContext = null;
    }
  }

  function playCountdownEndTone() {
    const ctx = getCountdownToneContext();
    if (!ctx) {
      return;
    }

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    const now = ctx.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);

    compressor.threshold.setValueAtTime(-18, now);
    compressor.knee.setValueAtTime(20, now);
    compressor.ratio.setValueAtTime(8, now);
    compressor.attack.setValueAtTime(0.003, now);
    compressor.release.setValueAtTime(0.2, now);

    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.82, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.56, now + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.98);

    oscillator.connect(gain);
    gain.connect(compressor);
    compressor.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 1.0);
  }

  function applyFullscreenThemeState() {
    fullscreenView.classList.toggle("fs-alt", fullscreenAltTheme);
    countdownFullscreenView.classList.toggle("fs-alt", fullscreenAltTheme);
  }

  function resetFullscreenThemeState() {
    fullscreenAltTheme = false;
    applyFullscreenThemeState();
  }

  function refreshNow() {
    const now = new Date();
    const text = formatTime(now);
    nowDisplay.textContent = text;
    fullscreenClock.textContent = text;
    dateDisplay.value = formatDate(now);
  }

  function updateCountdownModeUI() {
    const isDurationMode = countdownMode.value === "duration";
    countdownTargetWrap.classList.toggle("is-hidden", isDurationMode);
    countdownDurationWrap.classList.toggle("is-hidden", !isDurationMode);
  }

  function parseNonNegativeInt(value) {
    const num = Number.parseInt(value, 10);
    if (!Number.isFinite(num) || num < 0) {
      return 0;
    }
    return num;
  }

  function getDurationMs() {
    const days = parseNonNegativeInt(countdownDays.value);
    const hours = parseNonNegativeInt(countdownHours.value);
    const minutes = parseNonNegativeInt(countdownMinutes.value);
    const seconds = parseNonNegativeInt(countdownSeconds.value);

    const totalSeconds = (days * 86400) + (hours * 3600) + (minutes * 60) + seconds;
    return totalSeconds * 1000;
  }

  function applyDurationPreset(totalSeconds) {
    const safeSeconds = Math.max(0, Number.parseInt(totalSeconds, 10) || 0);
    const days = Math.floor(safeSeconds / 86400);
    const hours = Math.floor((safeSeconds % 86400) / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    countdownDays.value = String(days);
    countdownHours.value = String(hours);
    countdownMinutes.value = String(minutes);
    countdownSeconds.value = String(seconds);

    countdownMode.value = "duration";
    updateCountdownModeUI();
    countdownStatus.textContent = `已应用时长预设: ${formatCountdown(safeSeconds * 1000)}`;
  }

  function startCountdown() {
    let targetMs = 0;
    let statusText = "";

    if (countdownMode.value === "duration") {
      const durationMs = getDurationMs();
      if (durationMs <= 0) {
        notify("请设置有效的倒计时时长。至少需要大于 0 秒。");
        return;
      }
      targetMs = Date.now() + durationMs;
      statusText = `倒计时进行中，时长: ${formatCountdown(durationMs)}`;
    } else {
      const text = (countdownTarget.value || "").trim();
      if (!text) {
        notify("请先设置倒计时目标时间。");
        return;
      }

      const target = new Date(text);
      if (Number.isNaN(target.getTime())) {
        notify("倒计时目标时间无效。");
        return;
      }

      targetMs = target.getTime();
      statusText = `倒计时进行中，目标: ${target.toLocaleString()}`;
    }

    if (countdownId) {
      clearInterval(countdownId);
      countdownId = null;
    }

    countdownStatus.textContent = statusText;

    const tick = () => {
      const diff = targetMs - Date.now();
      if (diff <= 0) {
        countdownDisplay.textContent = "00:00:00";
        countdownFullscreenClock.textContent = "00:00:00";
        countdownStatus.textContent = "倒计时结束。";
        if (countdownSoundEnabled.checked) {
          playCountdownEndTone();
        }
        clearInterval(countdownId);
        countdownId = null;
        return;
      }

      const text = formatCountdown(diff);
      countdownDisplay.textContent = text;
      countdownFullscreenClock.textContent = text;
    };

    tick();

    countdownId = window.setInterval(tick, 250);
  }

  function stopCountdown() {
    if (countdownId) {
      clearInterval(countdownId);
      countdownId = null;
      countdownStatus.textContent = "倒计时已停止。";
    }
  }

  async function toggleFullscreen() {
    if (!document.fullscreenEnabled) {
      notify("当前浏览器不支持全屏。");
      return;
    }

    try {
      if (document.fullscreenElement === fullscreenView) {
        await document.exitFullscreen();
      } else {
        resetFullscreenThemeState();
        await fullscreenView.requestFullscreen();
      }
    } catch (error) {
      notify(`全屏切换失败：${error.message}`);
    }
  }

  async function toggleCountdownFullscreen() {
    if (!document.fullscreenEnabled) {
      notify("当前浏览器不支持全屏。");
      return;
    }

    try {
      if (document.fullscreenElement === countdownFullscreenView) {
        await document.exitFullscreen();
      } else {
        countdownFullscreenClock.textContent = countdownDisplay.textContent;
        resetFullscreenThemeState();
        await countdownFullscreenView.requestFullscreen();
      }
    } catch (error) {
      notify(`全屏切换失败：${error.message}`);
    }
  }

  fullscreenView.addEventListener("click", (event) => {
    if (event.target === fullscreenView && document.fullscreenElement === fullscreenView) {
      document.exitFullscreen().catch(() => {});
    }
  });

  countdownFullscreenView.addEventListener("click", (event) => {
    if (event.target === countdownFullscreenView && document.fullscreenElement === countdownFullscreenView) {
      document.exitFullscreen().catch(() => {});
    }
  });

  document.addEventListener("keydown", (event) => {
    const activeFullscreen = document.fullscreenElement;
    if (activeFullscreen !== fullscreenView && activeFullscreen !== countdownFullscreenView) {
      return;
    }

    if (event.code === "Space" || event.key === " ") {
      event.preventDefault();
      fullscreenAltTheme = !fullscreenAltTheme;
      applyFullscreenThemeState();
    }
  });

  document.addEventListener("fullscreenchange", () => {
    const activeFullscreen = document.fullscreenElement;
    if (activeFullscreen !== fullscreenView && activeFullscreen !== countdownFullscreenView) {
      resetFullscreenThemeState();
    }
  });

  fullscreenBtn.addEventListener("click", toggleFullscreen);
  countdownFullscreenBtn.addEventListener("click", toggleCountdownFullscreen);
  countdownMode.addEventListener("change", updateCountdownModeUI);
  countdownPresetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      applyDurationPreset(button.dataset.countdownPresetSeconds);
    });
  });
  countdownStartBtn.addEventListener("click", startCountdown);
  countdownStopBtn.addEventListener("click", stopCountdown);

  updateCountdownModeUI();
  countdownFullscreenClock.textContent = countdownDisplay.textContent;
  refreshNow();
  timerId = window.setInterval(refreshNow, 1000);

  window.addEventListener("beforeunload", () => {
    if (timerId) clearInterval(timerId);
    if (countdownId) clearInterval(countdownId);
    closeCountdownToneContext();
  });
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initTimeTools = initTimeTools;
