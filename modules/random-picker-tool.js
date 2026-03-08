function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取名单文件失败。"));
    reader.readAsArrayBuffer(file);
  });
}

function decodeTextFromBytes(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);

  // Prefer strict UTF-8 first. If it fails, fallback to GB18030/GBK/GB2312 family.
  try {
    const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
    return utf8Decoder.decode(bytes);
  } catch (_) {
    const candidates = ["gb18030", "gbk", "gb2312"];
    for (let i = 0; i < candidates.length; i += 1) {
      try {
        const decoder = new TextDecoder(candidates[i]);
        return decoder.decode(bytes);
      } catch (_) {
        // Continue trying other decoders.
      }
    }
  }

  // Last resort: tolerant UTF-8 decode.
  return new TextDecoder("utf-8").decode(bytes);
}

async function readTextFile(file) {
  const arrayBuffer = await readFileAsArrayBuffer(file);
  return String(decodeTextFromBytes(arrayBuffer) || "");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseDecimalPlacesStrict(value) {
  const raw = String(value || "").trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error("小数位数必须是 1-8 的整数。");
  }
  const n = Number.parseInt(raw, 10);
  if (n < 1 || n > 8) {
    throw new Error("小数位数必须在 1 到 8 之间。");
  }
  return n;
}

function isNumericToken(token) {
  return /^-?\d+(?:\.\d+)?$/.test(String(token || "").trim());
}

function parseWeightedLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return null;

  let name = "";
  let weight = 1;

  if (/[\t,;]/.test(trimmed)) {
    const parts = trimmed.split(/[\t,;]+/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return null;

    if (parts.length === 1) {
      name = parts[0];
    } else if (isNumericToken(parts[parts.length - 1])) {
      name = parts.slice(0, -1).join(" ").trim();
      weight = Number.parseFloat(parts[parts.length - 1]);
    } else if (isNumericToken(parts[0])) {
      name = parts.slice(1).join(" ").trim();
      weight = Number.parseFloat(parts[0]);
    } else {
      name = parts.join(" ").trim();
    }
  } else {
    const match = trimmed.match(/^(.+?)(?:\s+(-?\d+(?:\.\d+)?))?$/);
    if (!match) return null;
    name = String(match[1] || "").trim();
    if (match[2] !== undefined) {
      weight = Number.parseFloat(match[2]);
    }
  }

  if (!name) return null;
  if (!Number.isFinite(weight) || weight < 0) {
    weight = 0;
  }

  return { name, weight };
}

function parseWeightedText(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const items = [];

  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseWeightedLine(lines[i]);
    if (!parsed) continue;

    if (items.length === 0
      && parsed.weight === 1
      && /name|names|weight|weights|姓名|名称|权重/i.test(parsed.name)) {
      continue;
    }

    items.push(parsed);
  }

  return items;
}

function parseCsvRows(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuote = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (inQuote) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuote = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuote = true;
      continue;
    }

    if (ch === ',') {
      row.push(cell);
      cell = "";
      continue;
    }

    if (ch === '\n') {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  row.push(cell.replace(/\r$/, ""));
  rows.push(row);
  return rows;
}

function parseExportedRecordsCsv(text) {
  const rows = parseCsvRows(text).filter((r) => r.some((c) => String(c || "").trim() !== ""));
  if (!rows.length) return null;

  const header = rows[0].map((c) => String(c || "").trim());
  const numberHeader = header[0] === "数字" && header[1] === "空" && header[2] === "是否抽取";
  const listHeader = header[0] === "名字" && header[1] === "权重" && header[2] === "是否抽取";

  if (!numberHeader && !listHeader) {
    return null;
  }

  const type = numberHeader ? "number" : "list";
  const records = [];

  for (let i = 1; i < rows.length; i += 1) {
    const line = rows[i];
    const name = String((line[0] || "")).trim();
    const weightRaw = String((line[1] || "")).trim();
    const drawnRaw = String((line[2] || "")).trim();
    if (!name) continue;

    let weight = "";
    if (type === "list") {
      if (isNumericToken(weightRaw)) {
        weight = String(Number.parseFloat(weightRaw));
      } else {
        weight = "1";
      }
    }

    records.push({
      name,
      weight,
      drawn: drawnRaw === "是"
    });
  }

  return { type, records };
}

function pickRandomIntegerRange(min, max, count, unique, includeMin, includeMax) {
  let lo = Math.ceil(Math.min(min, max));
  let hi = Math.floor(Math.max(min, max));

  if (!includeMin) lo += 1;
  if (!includeMax) hi -= 1;

  const size = hi - lo + 1;
  if (size <= 0) {
    throw new Error("整数范围无可用值。请调整边界或闭区间设置。");
  }

  if (unique && count > size) {
    throw new Error("不重复抽取数量超过了整数范围总数。请减小数量或关闭不重复。");
  }

  if (unique) {
    const bucket = [];
    for (let n = lo; n <= hi; n += 1) bucket.push(n);
    for (let i = bucket.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = bucket[i];
      bucket[i] = bucket[j];
      bucket[j] = tmp;
    }
    return bucket.slice(0, count);
  }

  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(Math.floor(Math.random() * (hi - lo + 1)) + lo);
  }
  return out;
}

function pickRandomDecimalRange(min, max, count, unique, decimals, includeMin, includeMax) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const scale = Math.pow(10, decimals);

  let start = Math.ceil(lo * scale - 1e-8);
  let end = Math.floor(hi * scale + 1e-8);
  if (!includeMin) start += 1;
  if (!includeMax) end -= 1;

  const size = end - start + 1;
  if (size <= 0) {
    throw new Error("小数范围无可用值。请调整边界、闭区间设置或小数位数。");
  }

  if (unique && count > size) {
    throw new Error("不重复抽取数量超过了小数范围离散总数。请减小数量、提高小数位或关闭不重复。");
  }

  const toNumber = (scaled) => Number((scaled / scale).toFixed(decimals));

  if (unique) {
    const bucket = [];
    for (let n = start; n <= end; n += 1) bucket.push(n);
    for (let i = bucket.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = bucket[i];
      bucket[i] = bucket[j];
      bucket[j] = tmp;
    }
    return bucket.slice(0, count).map(toNumber);
  }

  const out = [];
  for (let i = 0; i < count; i += 1) {
    const scaled = Math.floor(Math.random() * (end - start + 1)) + start;
    out.push(toNumber(scaled));
  }
  return out;
}

function weightedPickIndex(pool) {
  let total = 0;
  for (let i = 0; i < pool.length; i += 1) {
    total += Math.max(0, pool[i].weight);
  }

  if (total <= 0) {
    return Math.floor(Math.random() * pool.length);
  }

  let threshold = Math.random() * total;
  for (let i = 0; i < pool.length; i += 1) {
    threshold -= Math.max(0, pool[i].weight);
    if (threshold <= 0) {
      return i;
    }
  }

  return pool.length - 1;
}

function pickWeightedItems(items, count, unique) {
  if (!items.length) {
    throw new Error("名单为空，请先输入或上传名单。");
  }

  if (unique && count > items.length) {
    throw new Error("不重复抽取数量超过名单条目总数。请减小数量或关闭不重复。");
  }

  const pool = items.map((item) => ({ ...item }));
  const out = [];

  for (let i = 0; i < count; i += 1) {
    if (!pool.length) break;
    const idx = weightedPickIndex(pool);
    const picked = pool[idx];
    out.push(picked);
    if (unique) {
      pool.splice(idx, 1);
    }
  }

  return out;
}

function csvEscape(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsvFile(filename, rows) {
  const csvText = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function initRandomPickerTool() {
  const { notify, copyToClipboard } = window.ToolCommon;

  const modeInput = document.getElementById("random-picker-mode");
  const numberWrap = document.getElementById("random-picker-number-wrap");
  const listWrap = document.getElementById("random-picker-list-wrap");

  const numberMinInput = document.getElementById("random-picker-number-min");
  const numberMaxInput = document.getElementById("random-picker-number-max");
  const numberKindInput = document.getElementById("random-picker-number-kind");
  const numberDecimalsWrap = document.getElementById("random-picker-number-decimals-wrap");
  const numberDecimalsInput = document.getElementById("random-picker-number-decimals");
  const numberCountInput = document.getElementById("random-picker-number-count");
  const numberUniqueInput = document.getElementById("random-picker-number-unique");
  const numberIncludeMinInput = document.getElementById("random-picker-number-include-min");
  const numberIncludeMaxInput = document.getElementById("random-picker-number-include-max");
  const numberPresetButtons = Array.from(document.querySelectorAll("button[data-random-number-preset]"));

  const fileInput = document.getElementById("random-picker-file");
  const textInput = document.getElementById("random-picker-text");
  const listCountInput = document.getElementById("random-picker-list-count");
  const listUniqueInput = document.getElementById("random-picker-list-unique");
  const listSummary = document.getElementById("random-picker-list-summary");

  const drawBtn = document.getElementById("random-picker-draw-btn");
  const clearBtn = document.getElementById("random-picker-clear-btn");
  const copyBtn = document.getElementById("random-picker-copy-btn");
  const exportCsvBtn = document.getElementById("random-picker-export-csv-btn");

  const infoOutput = document.getElementById("random-picker-info");
  const resultList = document.getElementById("random-picker-result-list");

  if (!modeInput || !numberWrap || !listWrap
    || !numberMinInput || !numberMaxInput || !numberKindInput || !numberDecimalsWrap || !numberDecimalsInput
    || !numberCountInput || !numberUniqueInput || !numberIncludeMinInput || !numberIncludeMaxInput
    || !fileInput || !textInput || !listCountInput || !listUniqueInput || !listSummary
    || !drawBtn || !clearBtn || !copyBtn || !exportCsvBtn || !infoOutput || !resultList) {
    return;
  }

  let parsedItems = [];
  const drawnListKeySet = new Set();
  const historyRows = [];

  function itemKey(name, weight) {
    return `${name}\u0000${weight}`;
  }

  function updateModeUI() {
    const listMode = modeInput.value === "list";
    numberWrap.classList.toggle("is-hidden", listMode);
    listWrap.classList.toggle("is-hidden", !listMode);
  }

  function updateNumberKindUI() {
    const decimalMode = numberKindInput.value === "decimal";
    numberDecimalsWrap.classList.toggle("is-hidden", !decimalMode);
    numberMinInput.step = decimalMode ? "0.0001" : "1";
    numberMaxInput.step = decimalMode ? "0.0001" : "1";
  }

  function formatRangeNotation(min, max, includeMin, includeMax) {
    const left = includeMin ? "[" : "(";
    const right = includeMax ? "]" : ")";
    return `${left}${Math.min(min, max)}, ${Math.max(min, max)}${right}`;
  }

  function applyNumberPreset(key) {
    if (key === "int-1-100") {
      numberKindInput.value = "integer";
      numberMinInput.value = "1";
      numberMaxInput.value = "100";
      numberIncludeMinInput.checked = true;
      numberIncludeMaxInput.checked = true;
    } else if (key === "dec-0-1-open") {
      numberKindInput.value = "decimal";
      numberMinInput.value = "0";
      numberMaxInput.value = "1";
      numberDecimalsInput.value = "4";
      numberIncludeMinInput.checked = true;
      numberIncludeMaxInput.checked = false;
    }

    updateNumberKindUI();
  }

  function updateListSummary() {
    parsedItems = parseWeightedText(textInput.value);
    const zeroWeight = parsedItems.filter((item) => item.weight <= 0).length;
    const positiveWeight = parsedItems.length - zeroWeight;
    listSummary.textContent = `名单统计: ${parsedItems.length} 条（有效权重 ${positiveWeight}，零权重 ${zeroWeight}）`;
  }

  function renderResultLines(lines) {
    lines.forEach((line) => {
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.className = "random-picker-result-text";
      text.textContent = line;
      li.appendChild(text);
      resultList.appendChild(li);
    });
  }

  function restoreFromExportedCsv(parsed) {
    if (!parsed || !parsed.records || !parsed.records.length) {
      throw new Error("导入的记录 CSV 为空。");
    }

    clearResult();

    if (parsed.type === "number") {
      modeInput.value = "number";
      updateModeUI();

      const drawnValues = [];
      parsed.records.forEach((record) => {
        if (record.drawn) {
          historyRows.push({ name: record.name, weight: "", drawn: "是" });
          drawnValues.push(record.name);
        }
      });

      renderResultLines(drawnValues);
      infoOutput.value = [
        "模式: 数字范围（CSV 导入）",
        `导入总数: ${parsed.records.length}`,
        `已抽取: ${drawnValues.length}`
      ].join("\n");
      return;
    }

    modeInput.value = "list";
    updateModeUI();

    const lines = parsed.records.map((record) => `${record.name} ${record.weight || "1"}`);
    textInput.value = lines.join("\n");
    updateListSummary();

    const drawnLines = [];
    parsed.records.forEach((record) => {
      if (!record.drawn) return;
      const w = record.weight || "1";
      drawnListKeySet.add(itemKey(record.name, w));
      historyRows.push({ name: record.name, weight: w, drawn: "是" });
      drawnLines.push(`${record.name} (权重: ${w})`);
    });

    renderResultLines(drawnLines);
    infoOutput.value = [
      "模式: 名单权重抽取（CSV 导入）",
      `导入总数: ${parsed.records.length}`,
      `已抽取: ${drawnLines.length}`
    ].join("\n");
  }

  async function handleFileChange() {
    const file = (fileInput.files || [])[0];
    if (!file) return;

    const content = await readTextFile(file);

    const imported = parseExportedRecordsCsv(content);
    if (imported) {
      restoreFromExportedCsv(imported);
      notify(`已导入记录 CSV: ${file.name}`);
      return;
    }

    textInput.value = content;
    updateListSummary();
    notify(`已载入 ${file.name}`);
  }

  function runDraw() {
    if (modeInput.value === "number") {
      const min = Number.parseFloat(numberMinInput.value);
      const max = Number.parseFloat(numberMaxInput.value);
      const count = Math.max(1, Number.parseInt(numberCountInput.value, 10) || 1);
      const unique = Boolean(numberUniqueInput.checked);
      const includeMin = Boolean(numberIncludeMinInput.checked);
      const includeMax = Boolean(numberIncludeMaxInput.checked);

      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new Error("请填写有效的最小值和最大值。");
      }

      const numberKind = numberKindInput.value;
      const decimals = numberKind === "decimal"
        ? parseDecimalPlacesStrict(numberDecimalsInput.value)
        : 0;

      const result = numberKind === "decimal"
        ? pickRandomDecimalRange(min, max, count, unique, decimals, includeMin, includeMax)
        : pickRandomIntegerRange(min, max, count, unique, includeMin, includeMax);

      const lines = result.map((n) => String(n));
      renderResultLines(lines);
      result.forEach((n) => {
        historyRows.push({ name: String(n), weight: "", drawn: "是" });
      });
      infoOutput.value = [
        `模式: 数字范围（${numberKind === "decimal" ? "小数" : "整数"}）`,
        `范围: ${formatRangeNotation(min, max, includeMin, includeMax)}`,
        numberKind === "decimal" ? `小数位数: ${decimals}` : "小数位数: 不适用",
        `抽取数量: ${count}`,
        `不重复: ${unique ? "是" : "否"}`
      ].join("\n");
      return;
    }

    updateListSummary();
    if (!parsedItems.length) {
      notify("名单为空，请先输入或上传名单。");
      return;
    }

    const count = Math.max(1, Number.parseInt(listCountInput.value, 10) || 1);
    let unique = Boolean(listUniqueInput.checked);
    let pickSource = parsedItems;

    if (unique) {
      pickSource = parsedItems.filter((item) => !drawnListKeySet.has(itemKey(item.name, String(item.weight))));
      if (count > pickSource.length) {
        unique = false;
        listUniqueInput.checked = false;
        notify("可用未抽取名单不足，已自动切换为可重复抽取。");
        pickSource = parsedItems;
      }
    }

    const picked = pickWeightedItems(pickSource, count, unique);

    const lines = picked.map((item) => `${item.name} (权重: ${item.weight})`);
    renderResultLines(lines);
    picked.forEach((item) => {
      drawnListKeySet.add(itemKey(item.name, item.weight));
      historyRows.push({ name: item.name, weight: String(item.weight), drawn: "是" });
    });

    infoOutput.value = [
      "模式: 名单权重抽取",
      `名单总数: ${parsedItems.length}`,
      `历史已抽取: ${drawnListKeySet.size}`,
      `抽取数量: ${count}`,
      `不重复: ${unique ? "是" : "否"}`,
      `权重规则: 权重<=0 视为不参与权重加成`
    ].join("\n");
  }

  function clearResult() {
    resultList.innerHTML = "";
    infoOutput.value = "";
    drawnListKeySet.clear();
    historyRows.length = 0;
  }

  function copyResult() {
    const lines = Array.from(resultList.querySelectorAll("li")).map((li) => li.textContent || "").filter(Boolean);
    if (!lines.length) {
      notify("暂无可复制的抽取结果。");
      return;
    }
    copyToClipboard(lines.join("\n"), "随机抽取结果");
  }

  function exportCsv() {
    updateListSummary();

    const numberMode = modeInput.value === "number";
    const rows = [numberMode
      ? ["数字", "空", "是否抽取"]
      : ["名字", "权重", "是否抽取"]
    ];

    if (parsedItems.length) {
      parsedItems.forEach((item) => {
        const drawn = drawnListKeySet.has(itemKey(item.name, item.weight)) ? "是" : "否";
        rows.push([item.name, String(item.weight), drawn]);
      });
    } else if (historyRows.length) {
      historyRows.forEach((row) => {
        rows.push([row.name, row.weight, row.drawn]);
      });
    } else {
      notify("暂无可导出的记录。");
      return;
    }

    const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
    downloadCsvFile(`random-picker-records-${stamp}.csv`, rows);
    notify("CSV 已生成。");
  }

  modeInput.addEventListener("change", updateModeUI);
  numberKindInput.addEventListener("change", updateNumberKindUI);
  numberPresetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      applyNumberPreset(button.dataset.randomNumberPreset || "");
    });
  });
  fileInput.addEventListener("change", () => {
    handleFileChange().catch((error) => notify(error.message || "读取名单失败。"));
  });
  textInput.addEventListener("input", updateListSummary);

  drawBtn.addEventListener("click", () => {
    try {
      runDraw();
    } catch (error) {
      notify(error.message || "抽取失败。");
    }
  });
  clearBtn.addEventListener("click", clearResult);
  copyBtn.addEventListener("click", copyResult);
  exportCsvBtn.addEventListener("click", exportCsv);

  updateModeUI();
  updateNumberKindUI();
  updateListSummary();
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initRandomPickerTool = initRandomPickerTool;
