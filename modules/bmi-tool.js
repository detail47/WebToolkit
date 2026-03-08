function bmiCategory(value) {
  if (value < 18.5) {
    return { category: "偏瘦", advice: "建议均衡饮食并结合力量训练，逐步增加体重。" };
  }
  if (value < 24) {
    return { category: "正常", advice: "体重范围正常，建议保持当前生活习惯。" };
  }
  if (value < 28) {
    return { category: "超重", advice: "建议控制热量摄入并增加有氧运动。" };
  }
  return { category: "肥胖", advice: "建议制定减重计划，必要时咨询专业医生。" };
}

function initBmiTool() {
  const { notify } = window.ToolCommon;

  const heightInput = document.getElementById("bmi-height");
  const weightInput = document.getElementById("bmi-weight");
  const calcBtn = document.getElementById("bmi-calc-btn");

  const bmiValue = document.getElementById("bmi-value");
  const bmiCat = document.getElementById("bmi-category");
  const bmiAdvice = document.getElementById("bmi-advice");

  function calc() {
    const hCm = Number(heightInput.value);
    const wKg = Number(weightInput.value);

    if (!Number.isFinite(hCm) || !Number.isFinite(wKg) || hCm <= 0 || wKg <= 0) {
      notify("请输入有效的身高和体重。");
      return;
    }

    const hM = hCm / 100;
    const bmi = wKg / (hM * hM);
    const result = bmiCategory(bmi);

    bmiValue.value = Number(bmi.toFixed(2)).toString();
    bmiCat.value = result.category;
    bmiAdvice.value = result.advice;
  }

  calcBtn.addEventListener("click", calc);
  calc();
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initBmiTool = initBmiTool;
