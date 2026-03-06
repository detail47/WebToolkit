function tokenize(expression) {
  const tokens = [];
  let i = 0;

  while (i < expression.length) {
    const ch = expression[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/\d|\./.test(ch)) {
      let start = i;
      i += 1;
      while (i < expression.length && /\d|\./.test(expression[i])) {
        i += 1;
      }
      const numText = expression.slice(start, i);
      const num = Number(numText);
      if (!Number.isFinite(num)) {
        throw new Error("数字格式不正确");
      }
      tokens.push({ type: "number", value: num });
      continue;
    }

    if (ch === "√") {
      tokens.push({ type: "fn", value: "root" });
      i += 1;
      continue;
    }

    if (/[a-z]/i.test(ch)) {
      let start = i;
      i += 1;
      while (i < expression.length && /[a-z]/i.test(expression[i])) {
        i += 1;
      }
      const word = expression.slice(start, i).toLowerCase();
      if (word !== "sqrt" && word !== "ln" && word !== "log" && word !== "ans") {
        throw new Error(`不支持的函数: ${word}`);
      }
      if (word === "ans") {
        tokens.push({ type: "ans", value: "ans" });
      } else {
        tokens.push({ type: "fn", value: (word === "ln" || word === "log") ? "ln" : "root" });
      }
      continue;
    }

    if ("+-*/^()".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }

    throw new Error(`不支持的字符: ${ch}`);
  }

  return tokens;
}

function parseExpression(tokens) {
  let index = 0;

  function peek() {
    return tokens[index];
  }

  function consume(expectedValue) {
    const token = tokens[index];
    if (!token || (expectedValue && token.value !== expectedValue)) {
      throw new Error("表达式不完整");
    }
    index += 1;
    return token;
  }

  function parsePrimary() {
    const token = peek();

    if (!token) {
      throw new Error("表达式不完整");
    }

    if (token.type === "number") {
      consume();
      return token.value;
    }

    if (token.type === "ans") {
      consume();
      throw new Error("Ans 预处理失败，请重试。");
    }

    if (token.type === "op" && token.value === "(") {
      consume("(");
      const value = parseAddSub();
      consume(")");
      return value;
    }

    throw new Error("表达式语法错误");
  }

  function parseUnary() {
    const token = peek();
    if (!token) {
      throw new Error("表达式不完整");
    }

    if (token.type === "op" && token.value === "+") {
      consume("+");
      return parseUnary();
    }

    if (token.type === "op" && token.value === "-") {
      consume("-");
      return -parseUnary();
    }

    if (token.type === "fn" && token.value === "root") {
      consume();
      const value = parseUnary();
      if (value < 0) {
        throw new Error("负数不能开平方");
      }
      return Math.sqrt(value);
    }

    if (token.type === "fn" && token.value === "ln") {
      consume();
      const value = parseUnary();
      if (value <= 0) {
        throw new Error("ln 参数必须大于 0");
      }
      return Math.log(value);
    }

    return parsePrimary();
  }

  function parsePower() {
    let left = parseUnary();
    const token = peek();

    if (token && token.type === "op" && token.value === "^") {
      consume("^");
      const right = parsePower();
      left = Math.pow(left, right);
    }

    return left;
  }

  function parseMulDiv() {
    let left = parsePower();

    while (true) {
      const token = peek();
      if (!token || token.type !== "op" || (token.value !== "*" && token.value !== "/")) {
        break;
      }

      consume();
      const right = parsePower();

      if (token.value === "*") {
        left *= right;
      } else {
        if (right === 0) {
          throw new Error("除数不能为 0");
        }
        left /= right;
      }
    }

    return left;
  }

  function parseAddSub() {
    let left = parseMulDiv();

    while (true) {
      const token = peek();
      if (!token || token.type !== "op" || (token.value !== "+" && token.value !== "-")) {
        break;
      }

      consume();
      const right = parseMulDiv();
      left = token.value === "+" ? left + right : left - right;
    }

    return left;
  }

  const value = parseAddSub();

  if (index < tokens.length) {
    throw new Error("表达式存在多余内容");
  }

  return value;
}

function normalizeExpression(text) {
  return (text || "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/sqrt/gi, "√")
    .replace(/log/gi, "ln");
}

function splitForImplicitMultiplication(expression) {
  const tokens = [];
  let i = 0;

  while (i < expression.length) {
    const ch = expression[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/\d|\./.test(ch)) {
      let start = i;
      i += 1;
      while (i < expression.length && /\d|\./.test(expression[i])) {
        i += 1;
      }
      tokens.push(expression.slice(start, i));
      continue;
    }

    if (ch === "√" || "()+-*/^".includes(ch)) {
      tokens.push(ch);
      i += 1;
      continue;
    }

    if (/[a-z]/i.test(ch)) {
      let start = i;
      i += 1;
      while (i < expression.length && /[a-z]/i.test(expression[i])) {
        i += 1;
      }
      tokens.push(expression.slice(start, i));
      continue;
    }

    tokens.push(ch);
    i += 1;
  }

  return tokens;
}

function isOperandEnd(token) {
  if (!token) {
    return false;
  }
  return /^\d+(\.\d+)?$/.test(token) || token === ")" || /^ans$/i.test(token);
}

function isOperandStart(token) {
  if (!token) {
    return false;
  }
  return /^\d+(\.\d+)?$/.test(token) || token === "(" || token === "√" || /^ln$/i.test(token) || /^ans$/i.test(token);
}

function insertImplicitMultiplication(expression) {
  const tokens = splitForImplicitMultiplication(expression);
  if (!tokens.length) {
    return expression;
  }

  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const current = tokens[i];
    const previous = out.length ? out[out.length - 1] : null;

    if (isOperandEnd(previous) && isOperandStart(current)) {
      out.push("*");
    }

    out.push(current);
  }

  return out.join("");
}

function injectAns(expression, lastResult) {
  if (!/ans/i.test(expression)) {
    return expression;
  }

  if (lastResult === null || !Number.isFinite(lastResult)) {
    throw new Error("当前没有可用的 Ans 结果");
  }

  return expression.replace(/ans/gi, `(${lastResult})`);
}

function autoCompleteRightParentheses(expression) {
  let balance = 0;

  for (const ch of expression) {
    if (ch === "(") {
      balance += 1;
    } else if (ch === ")") {
      if (balance > 0) {
        balance -= 1;
      }
    }
  }

  if (balance <= 0) {
    return expression;
  }

  return expression + ")".repeat(balance);
}

function formatResult(value) {
  if (!Number.isFinite(value)) {
    throw new Error("计算结果无效");
  }

  if (Math.abs(value) < 1e15 && Number.isInteger(value)) {
    return String(value);
  }

  return String(Number(value.toFixed(12)));
}

function initCalculatorTool() {
  const { copyToClipboard, notify } = window.ToolCommon;

  const expressionInput = document.getElementById("calc-expression");
  const resultOutput = document.getElementById("calc-result");
  const calcPad = document.getElementById("calc-pad");
  const calculateBtn = document.getElementById("calculate-btn");
  const copyBtn = document.getElementById("copy-calc-btn");
  let lastResult = null;

  function smartBackspace(text) {
    if (!text) {
      return "";
    }

    if (text.endsWith("Ans")) {
      return text.slice(0, -3);
    }

    if (text.endsWith("ln")) {
      return text.slice(0, -2);
    }

    return text.slice(0, -1);
  }

  function calculate() {
    const normalized = normalizeExpression(expressionInput.value.trim());

    if (!normalized) {
      notify("请输入表达式");
      return;
    }

    try {
      const expressionWithAns = injectAns(normalized, lastResult);
      const expression = autoCompleteRightParentheses(insertImplicitMultiplication(expressionWithAns));
      const tokens = tokenize(expression);
      const value = parseExpression(tokens);
      resultOutput.value = formatResult(value);
      expressionInput.value = expression.replace(/\((-?\d+(?:\.\d+)?)\)/g, "$1");
      lastResult = value;
    } catch (error) {
      resultOutput.value = "";
      notify(`计算失败: ${error.message}`);
    }
  }

  calcPad.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const action = target.dataset.action;
    const value = target.dataset.value;

    if (action === "clear") {
      expressionInput.value = "";
      resultOutput.value = "";
      return;
    }

    if (action === "backspace") {
      expressionInput.value = smartBackspace(expressionInput.value);
      return;
    }

    if (action === "equals") {
      calculate();
      return;
    }

    if (action === "root") {
      expressionInput.value += "√";
      return;
    }

    if (action === "ln") {
      expressionInput.value += "ln";
      return;
    }

    if (action === "ans") {
      expressionInput.value += "Ans";
      return;
    }

    if (value) {
      expressionInput.value += value;
    }
  });

  expressionInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      calculate();
    }
  });

  if (calculateBtn) {
    calculateBtn.addEventListener("click", calculate);
  }
  copyBtn.addEventListener("click", () => copyToClipboard(resultOutput.value, "计算结果"));
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initCalculatorTool = initCalculatorTool;
