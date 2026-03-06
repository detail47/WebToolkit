function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatLocalDateTime(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function formatDateTimeLocalValue(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function parseTimestampToMs(raw, unit) {
  const text = (raw || "").trim();
  if (!text || !/^-?\d+$/.test(text)) {
    return null;
  }

  const num = Number(text);
  if (!Number.isFinite(num)) {
    return null;
  }

  if (unit === "s") {
    return num * 1000;
  }

  if (unit === "ms") {
    return num;
  }

  if (text.length <= 10) {
    return num * 1000;
  }

  return num;
}

function initTimestampTool() {
  const { copyToClipboard, notify } = window.ToolCommon;

  const timestampInput = document.getElementById("timestamp-input");
  const timestampUnit = document.getElementById("timestamp-unit");
  const timestampToDateBtn = document.getElementById("timestamp-to-date-btn");
  const datetimeInput = document.getElementById("datetime-input");
  const dateToTimestampBtn = document.getElementById("date-to-timestamp-btn");

  const outputLocal = document.getElementById("timestamp-output-local");
  const outputUtc = document.getElementById("timestamp-output-utc");
  const outputSeconds = document.getElementById("timestamp-output-seconds");
  const outputMilliseconds = document.getElementById("timestamp-output-milliseconds");

  const copySecondsBtn = document.getElementById("copy-timestamp-seconds-btn");
  const copyMillisecondsBtn = document.getElementById("copy-timestamp-milliseconds-btn");

  function setOutputsByDate(date) {
    const ms = date.getTime();
    const sec = Math.floor(ms / 1000);

    outputLocal.value = formatLocalDateTime(date);
    outputUtc.value = date.toUTCString();
    outputSeconds.value = String(sec);
    outputMilliseconds.value = String(ms);
  }

  function convertTimestampToDate() {
    const ms = parseTimestampToMs(timestampInput.value, timestampUnit.value);
    if (ms === null) {
      notify("请输入有效的时间戳（整数）。");
      return;
    }

    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) {
      notify("时间戳无法解析为有效时间。");
      return;
    }

    datetimeInput.value = formatDateTimeLocalValue(date);
    setOutputsByDate(date);
  }

  function convertDateToTimestamp() {
    const text = (datetimeInput.value || "").trim();
    if (!text) {
      notify("请先选择日期时间。");
      return;
    }

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
      notify("日期时间格式无效。");
      return;
    }

    timestampInput.value = String(Math.floor(date.getTime() / 1000));
    timestampUnit.value = "s";
    setOutputsByDate(date);
  }

  timestampToDateBtn.addEventListener("click", convertTimestampToDate);
  dateToTimestampBtn.addEventListener("click", convertDateToTimestamp);

  copySecondsBtn.addEventListener("click", () => copyToClipboard(outputSeconds.value, "秒时间戳"));
  copyMillisecondsBtn.addEventListener("click", () => copyToClipboard(outputMilliseconds.value, "毫秒时间戳"));

  const now = new Date();
  datetimeInput.value = formatDateTimeLocalValue(now);
  setOutputsByDate(now);
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initTimestampTool = initTimestampTool;
