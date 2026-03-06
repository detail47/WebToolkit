function byteArrayToBase64(bytes) {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function uint32ToBytes(value) {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff
  ]);
}

function concatUint8Arrays(...arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  arrays.forEach((arr) => {
    result.set(arr, offset);
    offset += arr.length;
  });

  return result;
}

function hexToUint8Array(hex) {
  let normalized = (hex || "").replace(/^0x/i, "").toLowerCase();
  if (normalized.length % 2 !== 0) {
    normalized = `0${normalized}`;
  }

  const output = new Uint8Array(normalized.length / 2);

  for (let i = 0; i < normalized.length; i += 2) {
    output[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }

  return output;
}

function numberLikeToHex(value) {
  if (typeof value === "number") {
    return value.toString(16);
  }

  if (typeof value === "string") {
    if (/^0x/i.test(value)) {
      return value.slice(2);
    }

    // jsrsasign exponent may be decimal string like 65537.
    if (/^\d+$/.test(value)) {
      if (value === "65537") {
        return "10001";
      }

      // Large decimal strings (unlikely for exponent) still convert safely.
      if (value.length > 7) {
        return BigInt(value).toString(16);
      }

      return Number.parseInt(value, 10).toString(16);
    }

    return value;
  }

  if (value && typeof value.toString === "function") {
    return value.toString(16);
  }

  throw new Error("Unsupported numeric format for RSA parameter.");
}

function normalizeHexBytes(value) {
  const hex = numberLikeToHex(value).replace(/^0+/, "");
  return hexToUint8Array(hex || "00");
}

function buildOpenSshPublicKeyFromRsa(pubKeyObj, comment) {
  const keyTypeBytes = new TextEncoder().encode("ssh-rsa");
  const exponent = normalizeHexBytes(pubKeyObj.e);
  const modulus = normalizeHexBytes(pubKeyObj.n);

  const keyBlob = concatUint8Arrays(
    encodeSshString(keyTypeBytes),
    encodeSshMpint(exponent),
    encodeSshMpint(modulus)
  );

  const blobBase64 = byteArrayToBase64(keyBlob);
  const suffix = comment ? ` ${comment}` : "";
  return `ssh-rsa ${blobBase64}${suffix}`;
}

function generateRsaKeyPairLocal(modulusLength) {
  if (!window.KEYUTIL) {
    throw new Error("未找到本地 jsrsasign 库，请确认 vendor/jsrsasign-all-min.js 存在。");
  }

  return window.KEYUTIL.generateKeypair("RSA", modulusLength);
}

function encodeSshString(bytes) {
  return concatUint8Arrays(uint32ToBytes(bytes.length), bytes);
}

function encodeSshMpint(bytes) {
  if (bytes.length === 0) {
    return encodeSshString(new Uint8Array([0]));
  }

  if (bytes[0] & 0x80) {
    return encodeSshString(concatUint8Arrays(new Uint8Array([0]), bytes));
  }

  return encodeSshString(bytes);
}

function initSshTool() {
  const { copyToClipboard, notify } = window.ToolCommon;
  const keySizeSelect = document.getElementById("key-size");
  const keyCommentInput = document.getElementById("key-comment");
  const generateKeysBtn = document.getElementById("generate-keys-btn");
  const publicKeyOutput = document.getElementById("public-key-output");
  const privateKeyOutput = document.getElementById("private-key-output");
  const copyPublicKeyBtn = document.getElementById("copy-public-key-btn");
  const copyPrivateKeyBtn = document.getElementById("copy-private-key-btn");

  let isGeneratingKeys = false;
  let lastGeneratedPublicKey = "";

  async function generateSshKeyPair() {
    if (isGeneratingKeys) {
      notify("SSH 密钥正在生成中，请稍候。");
      return;
    }

    const modulusLength = Number(keySizeSelect.value);
    const comment = keyCommentInput.value.trim();

    publicKeyOutput.value = "生成中...";
    privateKeyOutput.value = "生成中...";
    isGeneratingKeys = true;
    generateKeysBtn.disabled = true;

    try {
      let openSshPublic = "";
      let privatePem = "";

      for (let i = 0; i < 3; i += 1) {
        const keyPair = await new Promise((resolve) => {
          setTimeout(() => {
            resolve(generateRsaKeyPairLocal(modulusLength));
          }, 0);
        });

        privatePem = window.KEYUTIL.getPEM(keyPair.prvKeyObj, "PKCS8PRV");
        openSshPublic = buildOpenSshPublicKeyFromRsa(keyPair.pubKeyObj, comment);

        if (openSshPublic !== lastGeneratedPublicKey) {
          break;
        }
      }

      if (openSshPublic === lastGeneratedPublicKey) {
        throw new Error("重试后仍检测到重复密钥，请刷新页面后重试。");
      }

      publicKeyOutput.value = openSshPublic;
      privateKeyOutput.value = privatePem;
      lastGeneratedPublicKey = openSshPublic;
    } catch (error) {
      publicKeyOutput.value = "";
      privateKeyOutput.value = "";
      notify(`SSH 密钥对生成失败：${error.message}`);
    } finally {
      isGeneratingKeys = false;
      generateKeysBtn.disabled = false;
    }
  }

  generateKeysBtn.addEventListener("click", generateSshKeyPair);
  copyPublicKeyBtn.addEventListener("click", () => copyToClipboard(publicKeyOutput.value, "公钥"));
  copyPrivateKeyBtn.addEventListener("click", () => copyToClipboard(privateKeyOutput.value, "私钥"));
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initSshTool = initSshTool;
