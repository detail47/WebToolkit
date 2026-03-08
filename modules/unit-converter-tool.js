function roundSmart(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return String(Number(value.toFixed(10)));
}

function initUnitConverterTool() {
  const { copyToClipboard, notify } = window.ToolCommon;

  const categorySelect = document.getElementById("unit-category");
  const inputValue = document.getElementById("unit-input-value");
  const fromSelect = document.getElementById("unit-from");
  const toSelect = document.getElementById("unit-to");
  const convertBtn = document.getElementById("unit-convert-btn");
  const outputValue = document.getElementById("unit-output-value");
  const outputDetail = document.getElementById("unit-output-detail");
  const copyBtn = document.getElementById("copy-unit-output-btn");

  const categories = {
    length: {
      units: { m: 1, km: 1000, cm: 0.01, mm: 0.001, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
      labels: { m: "米", km: "千米", cm: "厘米", mm: "毫米", in: "英寸", ft: "英尺", yd: "码", mi: "英里" }
    },
    weight: {
      units: { kg: 1, g: 0.001, mg: 0.000001, lb: 0.45359237, oz: 0.028349523125 },
      labels: { kg: "千克", g: "克", mg: "毫克", lb: "磅", oz: "盎司" }
    },
    area: {
      units: { sqm: 1, sqkm: 1000000, sqft: 0.09290304, acre: 4046.8564224, ha: 10000 },
      labels: { sqm: "平方米", sqkm: "平方千米", sqft: "平方英尺", acre: "英亩", ha: "公顷" }
    },
    speed: {
      units: { ms: 1, kmh: 0.2777777778, mph: 0.44704, knot: 0.5144444444 },
      labels: { ms: "米/秒", kmh: "千米/小时", mph: "英里/小时", knot: "节" }
    },
    temperature: {
      units: { c: "摄氏度", f: "华氏度", k: "开尔文" }
    }
  };

  function updateUnitSelects() {
    const category = categorySelect.value;
    const config = categories[category];

    fromSelect.innerHTML = "";
    toSelect.innerHTML = "";

    if (category === "temperature") {
      Object.entries(config.units).forEach(([key, label]) => {
        fromSelect.add(new Option(label, key));
        toSelect.add(new Option(label, key));
      });
    } else {
      Object.keys(config.units).forEach((key) => {
        fromSelect.add(new Option(config.labels[key], key));
        toSelect.add(new Option(config.labels[key], key));
      });
    }

    if (toSelect.options.length > 1) {
      toSelect.selectedIndex = 1;
    }
  }

  function convertTemperature(value, from, to) {
    let celsius = value;
    if (from === "f") {
      celsius = (value - 32) * (5 / 9);
    } else if (from === "k") {
      celsius = value - 273.15;
    }

    if (to === "f") {
      return celsius * (9 / 5) + 32;
    }
    if (to === "k") {
      return celsius + 273.15;
    }
    return celsius;
  }

  function convert() {
    const category = categorySelect.value;
    const from = fromSelect.value;
    const to = toSelect.value;
    const raw = Number(inputValue.value);

    if (!Number.isFinite(raw)) {
      notify("请输入有效数值。");
      return;
    }

    let result = 0;
    if (category === "temperature") {
      result = convertTemperature(raw, from, to);
    } else {
      const config = categories[category];
      const fromFactor = config.units[from];
      const toFactor = config.units[to];
      result = (raw * fromFactor) / toFactor;
    }

    outputValue.value = roundSmart(result);
    outputDetail.value = `${raw} ${fromSelect.options[fromSelect.selectedIndex].text} = ${roundSmart(result)} ${toSelect.options[toSelect.selectedIndex].text}`;
  }

  categorySelect.addEventListener("change", updateUnitSelects);
  convertBtn.addEventListener("click", convert);
  copyBtn.addEventListener("click", () => copyToClipboard(outputDetail.value || outputValue.value, "单位转换结果"));

  updateUnitSelects();
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initUnitConverterTool = initUnitConverterTool;
