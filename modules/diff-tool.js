function normalizeDiffLine(line, options) {
  let out = line;
  if (options.ignoreTrim) {
    out = out.trim();
  }
  if (options.ignoreCase) {
    out = out.toLowerCase();
  }
  return out;
}

function buildPreparedLines(lines, options) {
  const prepared = [];

  lines.forEach((line, index) => {
    const normalized = normalizeDiffLine(line, options);

    // "Ignore leading/trailing spaces" also ignores pure blank lines.
    if (options.ignoreTrim && normalized === "") {
      return;
    }

    prepared.push({
      text: line,
      originalIndex: index,
      normalized
    });
  });

  return prepared;
}

function buildLcsTable(leftNorm, rightNorm) {
  const n = leftNorm.length;
  const m = rightNorm.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (leftNorm[i] === rightNorm[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  return dp;
}

function buildOperationsFromLcs(leftLines, rightLines, leftNorm, rightNorm, dp) {
  const ops = [];
  let i = 0;
  let j = 0;

  while (i < leftLines.length && j < rightLines.length) {
    if (leftNorm[i] === rightNorm[j]) {
      ops.push({
        type: "same",
        leftIndex: i,
        rightIndex: j,
        leftText: leftLines[i],
        rightText: rightLines[j]
      });
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({
        type: "remove",
        leftIndex: i,
        leftText: leftLines[i]
      });
      i += 1;
    } else {
      ops.push({
        type: "add",
        rightIndex: j,
        rightText: rightLines[j]
      });
      j += 1;
    }
  }

  while (i < leftLines.length) {
    ops.push({
      type: "remove",
      leftIndex: i,
      leftText: leftLines[i]
    });
    i += 1;
  }

  while (j < rightLines.length) {
    ops.push({
      type: "add",
      rightIndex: j,
      rightText: rightLines[j]
    });
    j += 1;
  }

  return ops;
}

function convertOpsToRows(ops) {
  const rows = [];
  const plainRows = [];
  let sameCount = 0;
  let addCount = 0;
  let removeCount = 0;
  let changeCount = 0;

  let cursor = 0;
  while (cursor < ops.length) {
    const op = ops[cursor];

    if (op.type === "same") {
      const text = `  [${op.leftIndex + 1}] ${op.leftText}`;
      rows.push({ type: "same", text });
      plainRows.push(text);
      sameCount += 1;
      cursor += 1;
      continue;
    }

    const chunk = [];
    while (cursor < ops.length && ops[cursor].type !== "same") {
      chunk.push(ops[cursor]);
      cursor += 1;
    }

    const removes = chunk.filter((item) => item.type === "remove");
    const adds = chunk.filter((item) => item.type === "add");
    const pairCount = Math.min(removes.length, adds.length);

    for (let i = 0; i < pairCount; i += 1) {
      const leftOp = removes[i];
      const rightOp = adds[i];
      const textA = `~ [${leftOp.leftIndex + 1}] A: ${leftOp.leftText}`;
      const textB = `~ [${rightOp.rightIndex + 1}] B: ${rightOp.rightText}`;
      rows.push({ type: "change", text: textA });
      rows.push({ type: "change", text: textB });
      plainRows.push(textA, textB);
      changeCount += 1;
    }

    for (let i = pairCount; i < removes.length; i += 1) {
      const leftOp = removes[i];
      const text = `- [${leftOp.leftIndex + 1}] ${leftOp.leftText}`;
      rows.push({ type: "remove", text });
      plainRows.push(text);
      removeCount += 1;
    }

    for (let i = pairCount; i < adds.length; i += 1) {
      const rightOp = adds[i];
      const text = `+ [${rightOp.rightIndex + 1}] ${rightOp.rightText}`;
      rows.push({ type: "add", text });
      plainRows.push(text);
      addCount += 1;
    }
  }

  return {
    rows,
    plainRows,
    sameCount,
    addCount,
    removeCount,
    changeCount
  };
}

function buildLineDiff(leftLines, rightLines, options) {
  const leftPrepared = buildPreparedLines(leftLines, options);
  const rightPrepared = buildPreparedLines(rightLines, options);

  const leftTexts = leftPrepared.map((item) => item.text);
  const rightTexts = rightPrepared.map((item) => item.text);
  const leftNorm = leftPrepared.map((item) => item.normalized);
  const rightNorm = rightPrepared.map((item) => item.normalized);

  const dp = buildLcsTable(leftNorm, rightNorm);
  const ops = buildOperationsFromLcs(leftTexts, rightTexts, leftNorm, rightNorm, dp);

  // Restore original line numbers for display after optional blank-line filtering.
  ops.forEach((op) => {
    if (op.leftIndex !== undefined) {
      op.leftIndex = leftPrepared[op.leftIndex].originalIndex;
    }
    if (op.rightIndex !== undefined) {
      op.rightIndex = rightPrepared[op.rightIndex].originalIndex;
    }
  });

  return convertOpsToRows(ops);
}

function initDiffTool() {
  const { copyToClipboard, notify } = window.ToolCommon;

  const leftInput = document.getElementById("diff-left");
  const rightInput = document.getElementById("diff-right");
  const ignoreSpace = document.getElementById("diff-ignore-space");
  const ignoreCase = document.getElementById("diff-ignore-case");
  const runBtn = document.getElementById("run-diff-btn");

  const summary = document.getElementById("diff-summary");
  const outputView = document.getElementById("diff-output-view");
  const output = document.getElementById("diff-output");
  const copyBtn = document.getElementById("copy-diff-output-btn");

  function renderRows(rows) {
    outputView.innerHTML = "";

    rows.forEach((row) => {
      const line = document.createElement("div");
      line.className = `diff-line ${row.type}`;
      line.textContent = row.text;
      outputView.appendChild(line);
    });
  }

  function runDiff() {
    const leftText = leftInput.value;
    const rightText = rightInput.value;

    if (!leftText && !rightText) {
      notify("请至少输入一侧文本。");
      return;
    }

    const leftLines = leftText.split(/\r?\n/);
    const rightLines = rightText.split(/\r?\n/);

    const result = buildLineDiff(leftLines, rightLines, {
      ignoreTrim: ignoreSpace.checked,
      ignoreCase: ignoreCase.checked
    });

    summary.value = `相同 ${result.sameCount} 行，新增 ${result.addCount} 行，删除 ${result.removeCount} 行，修改 ${result.changeCount} 行`;
    renderRows(result.rows);
    output.value = result.plainRows.join("\n");
  }

  function rerunIfHasResult() {
    if (!output.value && !outputView.childElementCount) {
      return;
    }
    runDiff();
  }

  runBtn.addEventListener("click", runDiff);
  ignoreSpace.addEventListener("change", rerunIfHasResult);
  ignoreCase.addEventListener("change", rerunIfHasResult);
  copyBtn.addEventListener("click", () => copyToClipboard(output.value, "差异结果"));
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initDiffTool = initDiffTool;
