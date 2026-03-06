function notify(message) {
  window.alert(message);
}

function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

async function copyToClipboard(value, label) {
  if (!value) {
    notify(`${label}为空。`);
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    notify(`${label}已复制。`);
  } catch {
    notify(`无法复制${label}。`);
  }
}

window.ToolCommon = {
  notify,
  clearNode,
  copyToClipboard
};
