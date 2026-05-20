// popup.js —— 弹窗交互逻辑
const statusEl = document.getElementById('status');

function showStatus(msg, type = 'info', duration = 2500) {
  statusEl.textContent = msg;
  statusEl.className = `show ${type}`;
  if (duration > 0) {
    setTimeout(() => { statusEl.className = ''; }, duration);
  }
}

async function execOnPage(action) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showStatus('未找到活动标签页', 'error');
      return;
    }

    // chrome:// / edge:// / 应用商店等受限页面不能注入
    if (/^(chrome|edge|about|chrome-extension):\/\//.test(tab.url || '')) {
      showStatus('该页面不支持注入脚本', 'error', 3000);
      return;
    }

    showStatus('正在处理...', 'info', 0);

    // 注入 content script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    // 区域打印 / 整页截图需要 html2canvas + jsPDF
    // 由扩展 API 直接注入到 ISOLATED world（与 content.js 同世界），可绕过页面 CSP
    if (action === 'select-area' || action === 'full-page') {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lib/html2canvas.min.js', 'lib/jspdf.umd.min.js']
      });
    }

    // 发消息给 content script 执行具体动作
    await chrome.tabs.sendMessage(tab.id, { action });

    showStatus('已发送指令', 'success', 1500);

    // 智能打印场景关闭弹窗，避免遮挡打印对话框
    if (action === 'smart-print' || action === 'reader-print') {
      setTimeout(() => window.close(), 300);
    }
  } catch (err) {
    console.error(err);
    showStatus('执行失败: ' + (err.message || String(err)), 'error', 4000);
  }
}

document.getElementById('smartPrint').addEventListener('click', () => execOnPage('smart-print'));
document.getElementById('readerPrint').addEventListener('click', () => execOnPage('reader-print'));
document.getElementById('selectArea').addEventListener('click', () => execOnPage('select-area'));
document.getElementById('fullPage').addEventListener('click', () => execOnPage('full-page'));
