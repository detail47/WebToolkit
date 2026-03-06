function digestWithCryptoJs(algorithm, inputText) {
  const algoMap = {
    MD5: window.CryptoJS.MD5,
    "SHA-1": window.CryptoJS.SHA1,
    "SHA-256": window.CryptoJS.SHA256,
    "SHA-384": window.CryptoJS.SHA384,
    "SHA-512": window.CryptoJS.SHA512
  };

  const hashFn = algoMap[algorithm];
  if (!hashFn) {
    throw new Error(`不支持的算法：${algorithm}`);
  }

  return hashFn(inputText).toString(window.CryptoJS.enc.Hex);
}

function initHashTool() {
  const { copyToClipboard, notify } = window.ToolCommon;
  const hashInput = document.getElementById("hash-input");
  const hashAlgo = document.getElementById("hash-algo");
  const generateHashBtn = document.getElementById("generate-hash-btn");
  const hashOutput = document.getElementById("hash-output");
  const copyHashBtn = document.getElementById("copy-hash-btn");

  function generateHash() {
    const text = hashInput.value;
    const algorithm = hashAlgo.value;

    if (!text) {
      notify("请输入要计算哈希的文本。");
      return;
    }

    try {
      hashOutput.value = digestWithCryptoJs(algorithm, text);
    } catch (error) {
      hashOutput.value = "";
      notify(`哈希生成失败：${error.message}`);
    }
  }

  generateHashBtn.addEventListener("click", generateHash);
  copyHashBtn.addEventListener("click", () => copyToClipboard(hashOutput.value, "哈希值"));
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initHashTool = initHashTool;
