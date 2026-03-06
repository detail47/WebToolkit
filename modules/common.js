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
    notify(`${label} is empty.`);
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    notify(`${label} copied.`);
  } catch {
    notify(`Could not copy ${label}.`);
  }
}

window.ToolCommon = {
  notify,
  clearNode,
  copyToClipboard
};
