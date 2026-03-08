function randomInt(max) {
  if (window.crypto && window.crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return arr[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function estimateStrength(password) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return "弱";
  if (score <= 4) return "中";
  if (score <= 5) return "强";
  return "很强";
}

function initPasswordTool() {
  const { copyToClipboard, notify } = window.ToolCommon;

  const lengthInput = document.getElementById("password-length");
  const lower = document.getElementById("pwd-lowercase");
  const upper = document.getElementById("pwd-uppercase");
  const numbers = document.getElementById("pwd-numbers");
  const symbols = document.getElementById("pwd-symbols");
  const excludeAmbiguous = document.getElementById("pwd-exclude-ambiguous");

  const generateBtn = document.getElementById("generate-password-btn");
  const output = document.getElementById("password-output");
  const strength = document.getElementById("password-strength");
  const copyBtn = document.getElementById("copy-password-btn");

  const pools = {
    lower: "abcdefghijklmnopqrstuvwxyz",
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    numbers: "0123456789",
    symbols: "!@#$%^&*()-_=+[]{};:,.?/|~"
  };

  function buildPool() {
    let pool = "";
    if (lower.checked) pool += pools.lower;
    if (upper.checked) pool += pools.upper;
    if (numbers.checked) pool += pools.numbers;
    if (symbols.checked) pool += pools.symbols;

    if (excludeAmbiguous.checked) {
      pool = pool.replace(/[0O1lI]/g, "");
    }

    return Array.from(new Set(pool.split(""))).join("");
  }

  function generate() {
    const len = Math.max(4, Math.min(128, Number(lengthInput.value) || 16));
    lengthInput.value = String(len);

    const pool = buildPool();
    if (!pool) {
      notify("请至少选择一种字符类型。");
      return;
    }

    let pwd = "";
    for (let i = 0; i < len; i += 1) {
      pwd += pool[randomInt(pool.length)];
    }

    output.value = pwd;
    strength.value = estimateStrength(pwd);
  }

  generateBtn.addEventListener("click", generate);
  copyBtn.addEventListener("click", () => copyToClipboard(output.value, "密码"));
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initPasswordTool = initPasswordTool;
