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
    if (/^(chrome|edge|about|chrome-extension):\/\//.test(tab.url || '')) {
      showStatus('该页面不支持注入脚本', 'error', 3000);
      return;
    }

    showStatus(action === 'manage-rules' ? '正在打开规则管理...' : '正在打开设置面板...', 'info', 0);

    // 区域打印 / 整页截图需要 html2canvas + jsPDF（先于 content 注入，
    // 这样 content 第一次跑就能用到 window.html2canvas / window.jspdf）
    if (action === 'select-area' || action === 'full-page') {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lib/html2canvas.min.js', 'lib/jspdf.umd.min.js'],
      });
    }

    // content script 已通过 manifest content_scripts 自动注入；仍主动 sendMessage
    const { skipPanel } = await chrome.storage.sync.get('skipPanel');
    const showPanel = !skipPanel && action !== 'select-area' && action !== 'manage-rules';

    await chrome.tabs.sendMessage(tab.id, { action, showPanel });

    showStatus('已发送指令', 'success', 1500);
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
document.getElementById('manageRules').addEventListener('click', () => execOnPage('manage-rules'));

document.getElementById('resetSkip').addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    await chrome.storage.sync.set({ skipPanel: false });
    showStatus('已重置，下次会弹出设置面板', 'success', 2000);
  } catch (err) {
    showStatus('重置失败: ' + err.message, 'error', 3000);
  }
});
