function parseFieldToSet(value, min, max, options = {}) {
  const text = (value || "").trim();
  const allowQuestion = Boolean(options.allowQuestion);
  const transform = options.transform || ((x) => x);

  if (!text) {
    return { ok: false, any: false, ignored: false, set: new Set() };
  }

  if (text === "*") {
    return { ok: true, any: true, ignored: false, set: new Set() };
  }

  if (text === "?") {
    if (!allowQuestion) {
      return { ok: false, any: false, ignored: false, set: new Set() };
    }
    return { ok: true, any: true, ignored: true, set: new Set() };
  }

  const set = new Set();
  const segments = text.split(",");

  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (!segment) {
      return { ok: false, any: false, ignored: false, set: new Set() };
    }

    const stepParts = segment.split("/");
    if (stepParts.length > 2) {
      return { ok: false, any: false, ignored: false, set: new Set() };
    }

    const hasStep = stepParts.length === 2;
    const base = stepParts[0];
    const step = hasStep ? Number(stepParts[1]) : 1;
    if (!Number.isInteger(step) || step <= 0) {
      return { ok: false, any: false, ignored: false, set: new Set() };
    }

    let start = min;
    let end = max;

    if (base === "*") {
      start = min;
      end = max;
    } else if (base.includes("-")) {
      const [aText, bText] = base.split("-");
      const a = Number(aText);
      const b = Number(bText);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a > b) {
        return { ok: false, any: false, ignored: false, set: new Set() };
      }
      start = a;
      end = b;
    } else {
      const one = Number(base);
      if (!Number.isInteger(one)) {
        return { ok: false, any: false, ignored: false, set: new Set() };
      }
      start = one;
      end = one;
    }

    if (start < min || end > max) {
      return { ok: false, any: false, ignored: false, set: new Set() };
    }

    for (let n = start; n <= end; n += step) {
      set.add(transform(n));
    }
  }

  return { ok: true, any: false, ignored: false, set };
}

function matchesSimple(field, value) {
  if (field.any) {
    return true;
  }
  return field.set.has(value);
}

function toWeekdayForMode(jsDay, mode) {
  if (mode === "5") {
    return jsDay;
  }
  return jsDay === 0 ? 1 : jsDay + 1;
}

function isDomDowMatch(date, spec) {
  const dayOfMonth = date.getDate();
  const dayOfWeek = toWeekdayForMode(date.getDay(), spec.mode);
  const domMatch = matchesSimple(spec.day, dayOfMonth);
  const dowMatch = matchesSimple(spec.weekday, dayOfWeek);

  if (spec.mode === "5") {
    if (spec.day.any && spec.weekday.any) {
      return true;
    }
    if (spec.day.any) {
      return dowMatch;
    }
    if (spec.weekday.any) {
      return domMatch;
    }
    return domMatch || dowMatch;
  }

  const domIgnored = spec.day.ignored;
  const dowIgnored = spec.weekday.ignored;

  if (domIgnored && dowIgnored) {
    return true;
  }
  if (domIgnored) {
    return dowMatch;
  }
  if (dowIgnored) {
    return domMatch;
  }
  return domMatch && dowMatch;
}

function isMatch(date, spec) {
  const secondValue = date.getSeconds();
  const minuteValue = date.getMinutes();
  const hourValue = date.getHours();
  const monthValue = date.getMonth() + 1;
  const yearValue = date.getFullYear();

  if (!matchesSimple(spec.second, secondValue)) {
    return false;
  }
  if (!matchesSimple(spec.minute, minuteValue)) {
    return false;
  }
  if (!matchesSimple(spec.hour, hourValue)) {
    return false;
  }
  if (!matchesSimple(spec.month, monthValue)) {
    return false;
  }
  if (!matchesSimple(spec.year, yearValue)) {
    return false;
  }
  return isDomDowMatch(date, spec);
}

function addOneStep(date, mode) {
  if (mode === "5") {
    date.setMinutes(date.getMinutes() + 1, 0, 0);
    return;
  }
  date.setSeconds(date.getSeconds() + 1, 0);
}

function pushToUnitStart(date, unit) {
  if (unit === "day") {
    date.setHours(0, 0, 0, 0);
  } else if (unit === "hour") {
    date.setMinutes(0, 0, 0);
  } else if (unit === "minute") {
    date.setSeconds(0, 0);
  }
}

function findNextTriggers(spec, count) {
  const out = [];
  const cursor = new Date();
  cursor.setMilliseconds(0);
  addOneStep(cursor, spec.mode);

  let guard = 0;
  const maxGuard = 800000;

  while (out.length < count && guard < maxGuard) {
    guard += 1;

    if (!matchesSimple(spec.year, cursor.getFullYear())) {
      cursor.setFullYear(cursor.getFullYear() + 1, 0, 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    if (!matchesSimple(spec.month, cursor.getMonth() + 1)) {
      cursor.setMonth(cursor.getMonth() + 1, 1);
      pushToUnitStart(cursor, "day");
      continue;
    }

    if (!isDomDowMatch(cursor, spec)) {
      cursor.setDate(cursor.getDate() + 1);
      pushToUnitStart(cursor, "day");
      continue;
    }

    if (!matchesSimple(spec.hour, cursor.getHours())) {
      cursor.setHours(cursor.getHours() + 1);
      pushToUnitStart(cursor, "hour");
      continue;
    }

    if (!matchesSimple(spec.minute, cursor.getMinutes())) {
      cursor.setMinutes(cursor.getMinutes() + 1);
      pushToUnitStart(cursor, "minute");
      continue;
    }

    if (!matchesSimple(spec.second, cursor.getSeconds())) {
      cursor.setSeconds(cursor.getSeconds() + 1, 0);
      continue;
    }

    if (isMatch(cursor, spec)) {
      out.push(new Date(cursor.getTime()));
      addOneStep(cursor, spec.mode);
      continue;
    }

    addOneStep(cursor, spec.mode);
  }

  return out;
}

function presetToFields(preset, mode) {
  const weekdayForMode = mode === "5" ? "1" : "2";
  const map = {
    "every-minute": { second: "0", minute: "*", hour: "*", day: "*", month: "*", weekday: "*", year: "*" },
    hourly: { second: "0", minute: "0", hour: "*", day: "*", month: "*", weekday: "*", year: "*" },
    "daily-midnight": { second: "0", minute: "0", hour: "0", day: "*", month: "*", weekday: mode === "5" ? "*" : "?", year: "*" },
    "weekly-monday-9": { second: "0", minute: "0", hour: "9", day: mode === "5" ? "*" : "?", month: "*", weekday: weekdayForMode, year: "*" },
    "monthly-first-9": { second: "0", minute: "0", hour: "9", day: "1", month: "*", weekday: mode === "5" ? "*" : "?", year: "*" },
    "workday-930": { second: "0", minute: "30", hour: "9", day: mode === "5" ? "*" : "?", month: "*", weekday: mode === "5" ? "1-5" : "2-6", year: "*" }
  };

  return map[preset] || { second: "0", minute: "*", hour: "*", day: "*", month: "*", weekday: "*", year: "*" };
}

function buildCronExpression(fields, mode) {
  if (mode === "5") {
    return `${fields.minute} ${fields.hour} ${fields.day} ${fields.month} ${fields.weekday}`;
  }
  if (mode === "6") {
    return `${fields.second} ${fields.minute} ${fields.hour} ${fields.day} ${fields.month} ${fields.weekday}`;
  }
  return `${fields.second} ${fields.minute} ${fields.hour} ${fields.day} ${fields.month} ${fields.weekday} ${fields.year}`;
}

function buildDescription(fields, mode) {
  if (mode === "5") {
    return `5 段 Cron：分 时 日 月 周\n当前：${fields.minute} ${fields.hour} ${fields.day} ${fields.month} ${fields.weekday}`;
  }
  if (mode === "6") {
    return `Quartz 6 段：秒 分 时 日 月 周\n当前：${fields.second} ${fields.minute} ${fields.hour} ${fields.day} ${fields.month} ${fields.weekday}`;
  }
  return `Quartz 7 段：秒 分 时 日 月 周 年\n当前：${fields.second} ${fields.minute} ${fields.hour} ${fields.day} ${fields.month} ${fields.weekday} ${fields.year}`;
}

function formatDateTime(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function initCronTool() {
  const { copyToClipboard, notify } = window.ToolCommon;

  const modeSelect = document.getElementById("cron-mode");
  const importInput = document.getElementById("cron-import");
  const parseBtn = document.getElementById("parse-cron-btn");
  const presetSelect = document.getElementById("cron-preset");
  const secondWrap = document.getElementById("cron-second-wrap");
  const secondInput = document.getElementById("cron-second");
  const minuteInput = document.getElementById("cron-minute");
  const hourInput = document.getElementById("cron-hour");
  const dayInput = document.getElementById("cron-day");
  const monthInput = document.getElementById("cron-month");
  const weekdayInput = document.getElementById("cron-weekday");
  const weekdayLabel = document.getElementById("cron-weekday-label");
  const yearWrap = document.getElementById("cron-year-wrap");
  const yearInput = document.getElementById("cron-year");
  const output = document.getElementById("cron-output");
  const desc = document.getElementById("cron-desc");
  const nextTimes = document.getElementById("cron-next-times");
  const generateBtn = document.getElementById("generate-cron-btn");
  const copyBtn = document.getElementById("copy-cron-btn");

  function refreshModeUi() {
    const mode = modeSelect.value;
    const showSecond = mode !== "5";
    const showYear = mode === "7";

    secondWrap.classList.toggle("is-hidden", !showSecond);
    yearWrap.classList.toggle("is-hidden", !showYear);
    weekdayLabel.textContent = mode === "5" ? "周 (0-6, 0=周日)" : "周 (1-7, 1=周日)";
  }

  function applyPreset() {
    if (presetSelect.value === "custom") {
      return;
    }

    const mode = modeSelect.value;
    const fields = presetToFields(presetSelect.value, mode);
    secondInput.value = fields.second;
    minuteInput.value = fields.minute;
    hourInput.value = fields.hour;
    dayInput.value = fields.day;
    monthInput.value = fields.month;
    weekdayInput.value = fields.weekday;
    yearInput.value = fields.year;
  }

  function parseAndFillCron() {
    const raw = (importInput.value || "").trim();
    if (!raw) {
      notify("请先输入要解析的表达式。");
      return;
    }

    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length !== 5 && parts.length !== 6 && parts.length !== 7) {
      notify("仅支持 5/6/7 段表达式。请检查空格分段。");
      return;
    }

    if (parts.length === 5) {
      modeSelect.value = "5";
      refreshModeUi();

      minuteInput.value = parts[0];
      hourInput.value = parts[1];
      dayInput.value = parts[2];
      monthInput.value = parts[3];
      weekdayInput.value = parts[4];
      secondInput.value = "0";
      yearInput.value = "*";
    } else if (parts.length === 6) {
      modeSelect.value = "6";
      refreshModeUi();

      secondInput.value = parts[0];
      minuteInput.value = parts[1];
      hourInput.value = parts[2];
      dayInput.value = parts[3];
      monthInput.value = parts[4];
      weekdayInput.value = parts[5];
      yearInput.value = "*";
    } else {
      modeSelect.value = "7";
      refreshModeUi();

      secondInput.value = parts[0];
      minuteInput.value = parts[1];
      hourInput.value = parts[2];
      dayInput.value = parts[3];
      monthInput.value = parts[4];
      weekdayInput.value = parts[5];
      yearInput.value = parts[6];
    }

    presetSelect.value = "custom";
    generateCron();
  }

  function readAndValidate() {
    const mode = modeSelect.value;
    const fields = {
      second: secondInput.value.trim() || "0",
      minute: minuteInput.value.trim(),
      hour: hourInput.value.trim(),
      day: dayInput.value.trim(),
      month: monthInput.value.trim(),
      weekday: weekdayInput.value.trim(),
      year: yearInput.value.trim() || "*"
    };

    const weekdayMax = mode === "5" ? 7 : 7;
    const weekdayTransform = mode === "5"
      ? (v) => (v === 7 ? 0 : v)
      : (v) => {
        if (v === 0) {
          return 1;
        }
        if (v === 7) {
          return 7;
        }
        return v;
      };

    const checks = [
      { key: "second", min: 0, max: 59, label: "秒", enabled: mode !== "5", allowQuestion: false },
      { key: "minute", min: 0, max: 59, label: "分钟", enabled: true, allowQuestion: false },
      { key: "hour", min: 0, max: 23, label: "小时", enabled: true, allowQuestion: false },
      { key: "day", min: 1, max: 31, label: "日", enabled: true, allowQuestion: mode !== "5" },
      { key: "month", min: 1, max: 12, label: "月", enabled: true, allowQuestion: false },
      { key: "weekday", min: mode === "5" ? 0 : 1, max: weekdayMax, label: "周", enabled: true, allowQuestion: mode !== "5", transform: weekdayTransform },
      { key: "year", min: 1970, max: 2099, label: "年", enabled: mode === "7", allowQuestion: false }
    ];

    const parsed = {};

    for (const item of checks) {
      if (!item.enabled) {
        parsed[item.key] = { ok: true, any: true, ignored: false, set: new Set() };
        continue;
      }

      const parsedField = parseFieldToSet(fields[item.key], item.min, item.max, {
        allowQuestion: item.allowQuestion,
        transform: item.transform
      });

      if (!parsedField.ok) {
        notify(`${item.label}字段格式不正确。`);
        return null;
      }

      parsed[item.key] = parsedField;
    }

    if (mode === "5") {
      parsed.second = parseFieldToSet("0", 0, 59);
      parsed.year = { ok: true, any: true, ignored: false, set: new Set() };
      fields.second = "0";
      fields.year = "*";
    }

    if (mode === "6") {
      parsed.year = { ok: true, any: true, ignored: false, set: new Set() };
      fields.year = "*";
    }

    if (mode !== "5" && fields.day === "?" && fields.weekday === "?") {
      notify("Quartz 模式下，日和周不能同时为 ?。");
      return null;
    }

    return { mode, fields, parsed };
  }

  function renderNextTimes(list) {
    nextTimes.innerHTML = "";

    if (!list.length) {
      const li = document.createElement("li");
      li.textContent = "在可计算范围内未找到触发时间。";
      nextTimes.appendChild(li);
      return;
    }

    list.forEach((d) => {
      const li = document.createElement("li");
      li.textContent = formatDateTime(d);
      nextTimes.appendChild(li);
    });
  }

  function generateCron() {
    const state = readAndValidate();
    if (!state) {
      return;
    }

    const cron = buildCronExpression(state.fields, state.mode);
    output.value = cron;
    desc.value = buildDescription(state.fields, state.mode);

    const spec = {
      mode: state.mode,
      second: state.parsed.second,
      minute: state.parsed.minute,
      hour: state.parsed.hour,
      day: state.parsed.day,
      month: state.parsed.month,
      weekday: state.parsed.weekday,
      year: state.parsed.year
    };

    const times = findNextTriggers(spec, 5);
    renderNextTimes(times);
  }

  refreshModeUi();
  applyPreset();

  modeSelect.addEventListener("change", () => {
    refreshModeUi();
    applyPreset();
  });
  presetSelect.addEventListener("change", applyPreset);
  parseBtn.addEventListener("click", parseAndFillCron);
  generateBtn.addEventListener("click", generateCron);
  copyBtn.addEventListener("click", () => copyToClipboard(output.value, "Cron 表达式"));
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initCronTool = initCronTool;
