function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeAlpha(value) {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return clamp(value, 0, 1);
}

function alphaToByte(alpha) {
  return Math.round(normalizeAlpha(alpha) * 255);
}

function rgbToHex(r, g, b, alpha = 1) {
  const toHex = (n) => n.toString(16).padStart(2, "0");
  const base = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  if (normalizeAlpha(alpha) < 1) {
    return `${base}${toHex(alphaToByte(alpha))}`;
  }
  return base;
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }

    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  const s = max === 0 ? 0 : delta / max;
  const v = max;

  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    v: Math.round(v * 100)
  };
}

function hsvToRgb(h, s, v) {
  const hh = ((h % 360) + 360) % 360;
  const sn = clamp(s, 0, 100) / 100;
  const vn = clamp(v, 0, 100) / 100;

  const c = vn * sn;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vn - c;
  let rn = 0;
  let gn = 0;
  let bn = 0;

  if (hh < 60) {
    rn = c;
    gn = x;
  } else if (hh < 120) {
    rn = x;
    gn = c;
  } else if (hh < 180) {
    gn = c;
    bn = x;
  } else if (hh < 240) {
    gn = x;
    bn = c;
  } else if (hh < 300) {
    rn = x;
    bn = c;
  } else {
    rn = c;
    bn = x;
  }

  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255)
  };
}

function hslToRgb(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ln - c / 2;
  let rn = 0;
  let gn = 0;
  let bn = 0;

  if (hh < 60) {
    rn = c;
    gn = x;
  } else if (hh < 120) {
    rn = x;
    gn = c;
  } else if (hh < 180) {
    gn = c;
    bn = x;
  } else if (hh < 240) {
    gn = x;
    bn = c;
  } else if (hh < 300) {
    rn = x;
    bn = c;
  } else {
    rn = c;
    bn = x;
  }

  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255)
  };
}

function rgbToCmyk(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);

  if (k >= 1) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }

  const c = (1 - rn - k) / (1 - k);
  const m = (1 - gn - k) / (1 - k);
  const y = (1 - bn - k) / (1 - k);

  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100)
  };
}

function cmykToRgb(c, m, y, k) {
  const cn = clamp(c, 0, 100) / 100;
  const mn = clamp(m, 0, 100) / 100;
  const yn = clamp(y, 0, 100) / 100;
  const kn = clamp(k, 0, 100) / 100;

  return {
    r: Math.round(255 * (1 - cn) * (1 - kn)),
    g: Math.round(255 * (1 - mn) * (1 - kn)),
    b: Math.round(255 * (1 - yn) * (1 - kn))
  };
}

function parseNumericToken(token) {
  const text = String(token || "").trim();
  if (!text) {
    return { ok: false, value: 0, isPercent: false };
  }

  const isPercent = text.endsWith("%");
  const valueText = isPercent ? text.slice(0, -1).trim() : text;
  const value = Number(valueText);

  if (!Number.isFinite(value)) {
    return { ok: false, value: 0, isPercent: false };
  }

  return { ok: true, value, isPercent };
}

function parseRgbComponent(token) {
  const parsed = parseNumericToken(token);
  if (!parsed.ok) {
    return null;
  }
  if (parsed.isPercent) {
    return clamp(Math.round((parsed.value / 100) * 255), 0, 255);
  }
  return clamp(Math.round(parsed.value), 0, 255);
}

function parseAlphaComponent(token) {
  const parsed = parseNumericToken(token);
  if (!parsed.ok) {
    return null;
  }
  if (parsed.isPercent) {
    return normalizeAlpha(parsed.value / 100);
  }
  return normalizeAlpha(parsed.value);
}

function parsePercentOrNumber(token, maxIfNumber) {
  const parsed = parseNumericToken(token);
  if (!parsed.ok) {
    return null;
  }
  if (parsed.isPercent) {
    return clamp(parsed.value, 0, 100);
  }
  return clamp(parsed.value, 0, maxIfNumber);
}

function parseNamedColor(raw) {
  const probe = document.createElement("span");
  probe.style.color = "";
  probe.style.color = raw;

  if (!probe.style.color) {
    return null;
  }

  probe.style.display = "none";
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();

  const match = computed.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!match) {
    return null;
  }

  return {
    r: clamp(Number(match[1]), 0, 255),
    g: clamp(Number(match[2]), 0, 255),
    b: clamp(Number(match[3]), 0, 255),
    a: normalizeAlpha(match[4] === undefined ? 1 : Number(match[4]))
  };
}

function parseColorInput(text) {
  const raw = (text || "").trim();
  if (!raw) {
    return null;
  }

  const hex3or4 = raw.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4})$/);
  if (hex3or4) {
    const expanded = hex3or4[1].split("").map((c) => c + c);
    const hasAlpha = expanded.length === 4;
    return {
      r: Number.parseInt(expanded[0], 16),
      g: Number.parseInt(expanded[1], 16),
      b: Number.parseInt(expanded[2], 16),
      a: hasAlpha ? Number.parseInt(expanded[3], 16) / 255 : 1
    };
  }

  const hex6or8 = raw.match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (hex6or8) {
    const value = hex6or8[1];
    const hasAlpha = value.length === 8;
    return {
      r: Number.parseInt(value.slice(0, 2), 16),
      g: Number.parseInt(value.slice(2, 4), 16),
      b: Number.parseInt(value.slice(4, 6), 16),
      a: hasAlpha ? Number.parseInt(value.slice(6, 8), 16) / 255 : 1
    };
  }

  const rgbExpr = raw.match(/^rgba?\((.+)\)$/i);
  if (rgbExpr) {
    const parts = rgbExpr[1].split(",").map((x) => x.trim());
    if (parts.length === 3 || parts.length === 4) {
      const r = parseRgbComponent(parts[0]);
      const g = parseRgbComponent(parts[1]);
      const b = parseRgbComponent(parts[2]);
      const a = parts.length === 4 ? parseAlphaComponent(parts[3]) : 1;

      if (r !== null && g !== null && b !== null && a !== null) {
        return { r, g, b, a };
      }
    }
  }

  const hslExpr = raw.match(/^hsla?\((.+)\)$/i);
  if (hslExpr) {
    const parts = hslExpr[1].split(",").map((x) => x.trim());
    if (parts.length === 3 || parts.length === 4) {
      const h = Number(parts[0].replace(/deg$/i, ""));
      const s = parsePercentOrNumber(parts[1], 100);
      const l = parsePercentOrNumber(parts[2], 100);
      const a = parts.length === 4 ? parseAlphaComponent(parts[3]) : 1;

      if (Number.isFinite(h) && s !== null && l !== null && a !== null) {
        const rgb = hslToRgb(h, s, l);
        return { ...rgb, a };
      }
    }
  }

  const hsvExpr = raw.match(/^hsva?\((.+)\)$/i);
  if (hsvExpr) {
    const body = raw.replace(/^hsva?\(/i, "").replace(/\)$/, "");
    const parts = body.split(",").map((x) => x.trim());
    if (parts.length === 3 || parts.length === 4) {
      const h = Number(parts[0].replace(/deg$/i, ""));
      const s = parsePercentOrNumber(parts[1], 100);
      const v = parsePercentOrNumber(parts[2], 100);
      const a = parts.length === 4 ? parseAlphaComponent(parts[3]) : 1;

      if (Number.isFinite(h) && s !== null && v !== null && a !== null) {
        const rgb = hsvToRgb(h, s, v);
        return { ...rgb, a };
      }
    }
  }

  const cmykExpr = raw.match(/^cmyk\((.+)\)$/i);
  if (cmykExpr) {
    const parts = cmykExpr[1].split(",").map((x) => x.trim());
    if (parts.length === 4) {
      const c = parsePercentOrNumber(parts[0], 100);
      const m = parsePercentOrNumber(parts[1], 100);
      const y = parsePercentOrNumber(parts[2], 100);
      const k = parsePercentOrNumber(parts[3], 100);

      if (c !== null && m !== null && y !== null && k !== null) {
        const rgb = cmykToRgb(c, m, y, k);
        return { ...rgb, a: 1 };
      }
    }
  }

  const plain = raw.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+%?))?$/);
  if (plain) {
    const r = clamp(Number(plain[1]), 0, 255);
    const g = clamp(Number(plain[2]), 0, 255);
    const b = clamp(Number(plain[3]), 0, 255);
    const a = plain[4] ? parseAlphaComponent(plain[4]) : 1;
    if (a !== null) {
      return { r, g, b, a };
    }
  }

  const named = parseNamedColor(raw);
  if (named) {
    return named;
  }

  return null;
}

function initColorTool() {
  const { copyToClipboard } = window.ToolCommon;

  const input = document.getElementById("color-input");
  const picker = document.getElementById("color-picker");
  const hexOut = document.getElementById("color-hex");
  const rgbOut = document.getElementById("color-rgb");
  const rgbaOut = document.getElementById("color-rgba");
  const hslOut = document.getElementById("color-hsl");
  const hsvOut = document.getElementById("color-hsv");
  const cmykOut = document.getElementById("color-cmyk");

  const copyHexBtn = document.getElementById("copy-color-hex-btn");
  const copyRgbBtn = document.getElementById("copy-color-rgb-btn");
  const copyRgbaBtn = document.getElementById("copy-color-rgba-btn");
  const copyHslBtn = document.getElementById("copy-color-hsl-btn");
  const copyHsvBtn = document.getElementById("copy-color-hsv-btn");
  const copyCmykBtn = document.getElementById("copy-color-cmyk-btn");
  const status = document.getElementById("color-status");

  function setStatus(message, isError = false) {
    if (!status) {
      return;
    }
    status.textContent = message || "";
    status.classList.toggle("error", Boolean(message) && isError);
  }

  function formatAlpha(alpha) {
    return String(roundTo(normalizeAlpha(alpha), 3));
  }

  function applyColor(color, options = {}) {
    const updateInput = Boolean(options.updateInput);
    const r = clamp(Math.round(color.r), 0, 255);
    const g = clamp(Math.round(color.g), 0, 255);
    const b = clamp(Math.round(color.b), 0, 255);
    const a = normalizeAlpha(color.a);

    const hex = rgbToHex(r, g, b, a);
    const hsl = rgbToHsl(r, g, b);
    const hsv = rgbToHsv(r, g, b);
    const cmyk = rgbToCmyk(r, g, b);

    picker.value = rgbToHex(r, g, b).toUpperCase();
    hexOut.value = hex.toUpperCase();
    rgbOut.value = `rgb(${r}, ${g}, ${b})`;
    rgbaOut.value = `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;
    hslOut.value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    hsvOut.value = `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`;
    cmykOut.value = `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`;

    if (updateInput) {
      input.value = hex.toUpperCase();
    }
  }

  function convertFromText(options = {}) {
    const { reportError = false } = options;
    const raw = input.value.trim();

    if (!raw) {
      setStatus("");
      return;
    }

    const parsed = parseColorInput(raw);
    if (!parsed) {
      if (reportError) {
        setStatus("颜色格式不正确。支持 HEX、RGB/RGBA、HSL/HSLA、HSV/HSVA、CMYK、颜色名。", true);
      }
      return;
    }

    setStatus("");
    applyColor(parsed, { updateInput: false });
  }

  picker.addEventListener("input", () => {
    const parsed = parseColorInput(picker.value);
    if (parsed) {
      applyColor(parsed, { updateInput: true });
    }
  });

  input.addEventListener("input", () => {
    convertFromText({ reportError: false });
  });

  input.addEventListener("blur", () => {
    convertFromText({ reportError: false });
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      convertFromText({ reportError: true });
    }
  });

  copyHexBtn.addEventListener("click", () => copyToClipboard(hexOut.value, "HEX 颜色值"));
  copyRgbBtn.addEventListener("click", () => copyToClipboard(rgbOut.value, "RGB 颜色值"));
  copyRgbaBtn.addEventListener("click", () => copyToClipboard(rgbaOut.value, "RGBA 颜色值"));
  copyHslBtn.addEventListener("click", () => copyToClipboard(hslOut.value, "HSL 颜色值"));
  copyHsvBtn.addEventListener("click", () => copyToClipboard(hsvOut.value, "HSV 颜色值"));
  copyCmykBtn.addEventListener("click", () => copyToClipboard(cmykOut.value, "CMYK 颜色值"));

  // init view
  const initial = parseColorInput(picker.value) || { r: 255, g: 106, b: 61, a: 1 };
  applyColor(initial, { updateInput: true });
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initColorTool = initColorTool;
