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

    showStatus('正在打开设置面板...', 'info', 0);

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

    // 读取用户是否设置了"跳过设置面板"
    const { skipPanel } = await chrome.storage.sync.get('skipPanel');

    // 区域选择不弹面板（交互冲突），其他 3 种模式默认弹面板
    const showPanel = !skipPanel && action !== 'select-area';

    // 发消息给 content script
    await chrome.tabs.sendMessage(tab.id, { action, showPanel });

    showStatus('已发送指令', 'success', 1500);

    // 关闭弹窗，让出焦点（面板/打印对话框需要）
    setTimeout(() => window.close(), 200);
  } catch (err) {
    console.error(err);
    showStatus('执行失败: ' + (err.message || String(err)), 'error', 4000);
  }
}

document.getElementById('smartPrint').addEventListener('click', () => execOnPage('smart-print'));
document.getElementById('readerPrint').addEventListener('click', () => execOnPage('reader-print'));
document.getElementById('selectArea').addEventListener('click', () => execOnPage('select-area'));
document.getElementById('fullPage').addEventListener('click', () => execOnPage('full-page'));

document.getElementById('resetSkip').addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    await chrome.storage.sync.set({ skipPanel: false });
    showStatus('已重置，下次会弹出设置面板', 'success', 2000);
  } catch (err) {
    showStatus('重置失败: ' + err.message, 'error', 3000);
  }
});
