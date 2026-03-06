function normalizeTargetUrl(raw) {
  const text = (raw || "").trim();
  if (!text) {
    return null;
  }

  try {
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(text)) {
      return new URL(text);
    }
    return new URL(`https://${text}`);
  } catch {
    return null;
  }
}

function getHostnameFromInput(raw) {
  const url = normalizeTargetUrl(raw);
  return url ? url.hostname : null;
}

function formatMs(value) {
  return `${Math.round(value)}ms`;
}

function parsePorts(raw) {
  const text = (raw || "").trim();
  if (!text) {
    return [];
  }

  const list = text.split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0 && n <= 65535);
  return Array.from(new Set(list));
}

async function pingOnce(url, timeoutMs) {
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const bust = `_ping=${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const sep = url.includes("?") ? "&" : "?";
    const target = `${url}${sep}${bust}`;

    await fetch(target, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal
    });

    const cost = performance.now() - start;
    return { ok: true, ms: cost };
  } catch (error) {
    const timeout = error && error.name === "AbortError";
    return {
      ok: false,
      timeout,
      message: timeout ? "超时" : (error.message || "请求失败")
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildTracertGuide(hostname) {
  return [
    `Windows: tracert ${hostname}`,
    `macOS/Linux: traceroute ${hostname}`,
    `若需要更快回显，可在 Windows 使用: tracert -d ${hostname}`,
    "说明: 浏览器安全限制无法直接获取网络跳点，以上命令请在系统终端执行。"
  ].join("\n");
}

async function runDnsLookup(hostname, recordType) {
  const endpoint = `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=${encodeURIComponent(recordType)}`;
  const resp = await fetch(endpoint, { method: "GET", cache: "no-store" });
  if (!resp.ok) {
    throw new Error(`DNS 请求失败: HTTP ${resp.status}`);
  }

  const data = await resp.json();
  const answers = Array.isArray(data.Answer) ? data.Answer : [];
  const lines = answers.map((item, idx) => {
    const ttl = item.TTL !== undefined ? ` TTL=${item.TTL}` : "";
    return `${idx + 1}. ${item.data || "(空)"}${ttl}`;
  });

  return {
    status: data.Status,
    answers,
    text: lines.length ? lines.join("\n") : "未返回解析记录。"
  };
}

async function checkSinglePort(hostname, port, timeoutMs) {
  const protocol = port === 443 || port === 8443 ? "https" : "http";
  const url = `${protocol}://${hostname}:${port}/`;

  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal
    });

    return {
      port,
      ok: true,
      latency: performance.now() - start,
      note: "可连接（HTTP 层有响应）"
    };
  } catch (error) {
    const timeout = error && error.name === "AbortError";
    return {
      port,
      ok: false,
      latency: performance.now() - start,
      note: timeout ? "超时" : "连接失败或被浏览器策略拦截"
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runHttpHealth(url, method, timeoutMs) {
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });

    const spent = performance.now() - start;
    const headers = [];
    response.headers.forEach((value, key) => {
      headers.push(`${key}: ${value}`);
    });

    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      redirected: response.redirected,
      finalUrl: response.url,
      latency: spent,
      headers
    };
  } catch (error) {
    const timeout = error && error.name === "AbortError";
    return {
      ok: false,
      message: timeout ? "请求超时" : (error.message || "请求失败")
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runCertificateCheck(url, timeoutMs) {
  if (!window.isSecureContext || typeof fetch !== "function") {
    throw new Error("当前环境不支持证书检测。");
  }

  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal
    });
    const spent = performance.now() - start;

    const security = typeof window.getSecurityInfo === "function" ? window.getSecurityInfo(url) : null;
    if (security && security.validTo) {
      const expiry = new Date(security.validTo);
      const daysLeft = Math.floor((expiry.getTime() - Date.now()) / (24 * 3600 * 1000));
      return {
        supported: true,
        text: `证书到期时间: ${expiry.toLocaleString()}\n剩余天数: ${daysLeft} 天\n检测耗时: ${formatMs(spent)}`
      };
    }

    return {
      supported: false,
      text: `浏览器未提供证书到期日期接口。\n目标连接成功，TLS 握手正常。\n检测耗时: ${formatMs(spent)}\n建议使用系统命令进一步检查: openssl s_client -connect <host>:443`
    };
  } catch (error) {
    const timeout = error && error.name === "AbortError";
    throw new Error(timeout ? "证书检测超时" : (error.message || "证书检测失败"));
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPublicIpInfo() {
  const providers = [
    "https://api64.ipify.org?format=json",
    "https://api.ip.sb/geoip"
  ];

  const results = [];

  for (const url of providers) {
    try {
      const resp = await fetch(url, { method: "GET", cache: "no-store" });
      if (!resp.ok) {
        results.push(`${url} -> HTTP ${resp.status}`);
        continue;
      }
      const data = await resp.json();
      results.push(`${url} -> ${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      results.push(`${url} -> 失败: ${error.message || error}`);
    }
  }

  return results;
}

function collectBrowserNetworkInfo() {
  const nav = navigator;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;

  const lines = [
    `UserAgent: ${nav.userAgent}`,
    `语言: ${nav.language || "未知"}`,
    `平台: ${nav.platform || "未知"}`,
    `在线状态: ${nav.onLine ? "在线" : "离线"}`,
    `时区: ${Intl.DateTimeFormat().resolvedOptions().timeZone || "未知"}`
  ];

  if (conn) {
    lines.push(`网络类型: ${conn.effectiveType || "未知"}`);
    lines.push(`下行速度(Mbps): ${conn.downlink ?? "未知"}`);
    lines.push(`往返时延(ms): ${conn.rtt ?? "未知"}`);
    lines.push(`省流模式: ${conn.saveData ? "开启" : "关闭"}`);
  }

  return lines.join("\n");
}

function initRouteTraceTool() {
  const { copyToClipboard, notify } = window.ToolCommon;

  const targetInput = document.getElementById("route-target-input");
  const pingCountInput = document.getElementById("ping-count-input");
  const pingTimeoutInput = document.getElementById("ping-timeout-input");
  const dnsTypeInput = document.getElementById("dns-type-input");
  const portListInput = document.getElementById("port-list-input");
  const httpMethodInput = document.getElementById("http-method-input");

  const runPingBtn = document.getElementById("run-ping-btn");
  const runTracertBtn = document.getElementById("run-tracert-btn");
  const runDnsBtn = document.getElementById("run-dns-btn");
  const runPortCheckBtn = document.getElementById("run-port-check-btn");
  const runHttpHealthBtn = document.getElementById("run-http-health-btn");
  const runCertCheckBtn = document.getElementById("run-cert-check-btn");
  const runPublicIpBtn = document.getElementById("run-public-ip-btn");

  const summary = document.getElementById("route-trace-summary");
  const output = document.getElementById("route-trace-output");
  const copyBtn = document.getElementById("copy-route-trace-btn");

  let isPinging = false;

  function getTimeoutMs() {
    const timeoutMs = Math.max(500, Math.min(10000, Number(pingTimeoutInput.value) || 3000));
    pingTimeoutInput.value = String(timeoutMs);
    return timeoutMs;
  }

  function getTargetUrlOrNotify() {
    const url = normalizeTargetUrl(targetInput.value);
    if (!url) {
      notify("请输入有效的目标地址。支持域名或 URL。");
      return null;
    }
    return url;
  }

  async function runPing() {
    if (isPinging) {
      notify("Ping 正在进行中，请稍候。");
      return;
    }

    const url = getTargetUrlOrNotify();
    if (!url) {
      return;
    }

    const count = Math.max(1, Math.min(10, Number(pingCountInput.value) || 4));
    const timeoutMs = getTimeoutMs();

    pingCountInput.value = String(count);

    isPinging = true;
    runPingBtn.disabled = true;
    output.value = `正在 Ping ${url.origin} ...`;
    summary.value = "Ping 进行中...";

    const lines = [];
    const successTimes = [];

    for (let i = 1; i <= count; i += 1) {
      const result = await pingOnce(url.href, timeoutMs);
      if (result.ok) {
        successTimes.push(result.ms);
        lines.push(`Reply ${i}: ${url.hostname} time=${formatMs(result.ms)}`);
      } else if (result.timeout) {
        lines.push(`Reply ${i}: Request timed out`);
      } else {
        lines.push(`Reply ${i}: Failed (${result.message})`);
      }
      output.value = lines.join("\n");
    }

    if (successTimes.length) {
      const min = Math.min(...successTimes);
      const max = Math.max(...successTimes);
      const avg = successTimes.reduce((sum, n) => sum + n, 0) / successTimes.length;
      summary.value = `Ping 成功 ${successTimes.length}/${count}，min=${formatMs(min)} max=${formatMs(max)} avg=${formatMs(avg)}`;
    } else {
      summary.value = `Ping 成功 0/${count}，全部失败或超时`;
    }

    runPingBtn.disabled = false;
    isPinging = false;
  }

  function runTracertGuide() {
    const url = getTargetUrlOrNotify();
    if (!url) {
      return;
    }

    summary.value = `Tracert 目标: ${url.hostname}`;
    output.value = buildTracertGuide(url.hostname);
  }

  async function runDns() {
    const hostname = getHostnameFromInput(targetInput.value);
    if (!hostname) {
      notify("请输入有效目标地址以提取域名。");
      return;
    }

    const type = dnsTypeInput.value;
    summary.value = `DNS 解析中: ${hostname} (${type})`;

    try {
      const result = await runDnsLookup(hostname, type);
      summary.value = `DNS 完成: status=${result.status}，记录数=${result.answers.length}`;
      output.value = result.text;
    } catch (error) {
      summary.value = "DNS 解析失败";
      output.value = String(error.message || error);
    }
  }

  async function runPortCheck() {
    const hostname = getHostnameFromInput(targetInput.value);
    if (!hostname) {
      notify("请输入有效目标地址以提取域名。");
      return;
    }

    const ports = parsePorts(portListInput.value);
    if (!ports.length) {
      notify("请输入至少一个有效端口（1-65535）。");
      return;
    }

    const timeoutMs = getTimeoutMs();
    summary.value = `端口检测中: ${hostname} (${ports.length} 个端口)`;
    output.value = "检测中...";

    const checks = await Promise.all(ports.map((port) => checkSinglePort(hostname, port, timeoutMs)));
    const success = checks.filter((x) => x.ok).length;

    summary.value = `端口连通性: 成功 ${success}/${checks.length}`;
    output.value = checks.map((item) => `:${item.port} -> ${item.ok ? "可访问" : "失败"} (${item.note}, ${formatMs(item.latency)})`).join("\n");
  }

  async function runHttpHealthCheck() {
    const url = getTargetUrlOrNotify();
    if (!url) {
      return;
    }

    const timeoutMs = getTimeoutMs();
    const method = httpMethodInput.value;

    summary.value = `HTTP 健康检查中: ${method} ${url.href}`;
    output.value = "检查中...";

    const result = await runHttpHealth(url.href, method, timeoutMs);
    if (!result.ok) {
      summary.value = "HTTP 健康检查失败";
      output.value = result.message;
      return;
    }

    summary.value = `HTTP ${result.status} ${result.statusText}，耗时 ${formatMs(result.latency)}`;
    output.value = [
      `Final URL: ${result.finalUrl}`,
      `Redirected: ${result.redirected ? "是" : "否"}`,
      "--- Headers ---",
      ...(result.headers.length ? result.headers : ["(无可读响应头)"])
    ].join("\n");
  }

  async function runCertCheck() {
    const url = getTargetUrlOrNotify();
    if (!url) {
      return;
    }

    const timeoutMs = getTimeoutMs();
    summary.value = `证书到期检查中: ${url.hostname}`;

    try {
      const result = await runCertificateCheck(url.href, timeoutMs);
      summary.value = result.supported ? "证书检查完成" : "证书检查完成（受浏览器限制）";
      output.value = result.text;
    } catch (error) {
      summary.value = "证书检查失败";
      output.value = String(error.message || error);
    }
  }

  async function runPublicIpAndNetworkInfo() {
    summary.value = "获取公网 IP 与网络信息中...";

    const localInfo = collectBrowserNetworkInfo();
    const ipInfo = await fetchPublicIpInfo();

    summary.value = "公网 IP 与网络信息获取完成";
    output.value = [
      "--- 浏览器网络信息 ---",
      localInfo,
      "",
      "--- 公网 IP 信息 ---",
      ...ipInfo
    ].join("\n");
  }

  runPingBtn.addEventListener("click", () => {
    runPing().catch((error) => {
      summary.value = "Ping 异常中断";
      output.value = String(error.message || error);
      runPingBtn.disabled = false;
      isPinging = false;
    });
  });

  runTracertBtn.addEventListener("click", runTracertGuide);
  runDnsBtn.addEventListener("click", () => {
    runDns().catch((error) => {
      summary.value = "DNS 解析异常";
      output.value = String(error.message || error);
    });
  });
  runPortCheckBtn.addEventListener("click", () => {
    runPortCheck().catch((error) => {
      summary.value = "端口连通性检测异常";
      output.value = String(error.message || error);
    });
  });
  runHttpHealthBtn.addEventListener("click", () => {
    runHttpHealthCheck().catch((error) => {
      summary.value = "HTTP 健康检查异常";
      output.value = String(error.message || error);
    });
  });
  runCertCheckBtn.addEventListener("click", () => {
    runCertCheck().catch((error) => {
      summary.value = "证书检查异常";
      output.value = String(error.message || error);
    });
  });
  runPublicIpBtn.addEventListener("click", () => {
    runPublicIpAndNetworkInfo().catch((error) => {
      summary.value = "公网 IP 信息获取异常";
      output.value = String(error.message || error);
    });
  });

  copyBtn.addEventListener("click", () => copyToClipboard(output.value, "网络测试结果"));
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initRouteTraceTool = initRouteTraceTool;
