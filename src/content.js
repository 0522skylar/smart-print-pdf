// content.js —— 注入到页面的入口（仅做防重 + 消息分发）
import { DEFAULT_OPTIONS } from './core/constants.js';
import { loadOptions, saveOptions } from './core/storage.js';
import { openSettingsPanel } from './ui/settings-panel.js';
import { openRulesManager } from './ui/rules-manager.js';
import { smartPrint } from './modes/smart-print.js';
import { readerPrint } from './modes/reader-print.js';
import { selectArea, fullPagePrint } from './modes/capture-print.js';

(function () {
  if (window.__smartPrintInjected) return;
  window.__smartPrintInjected = true;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    handleAction(msg).catch(err => console.error('[smart-print]', err));
    sendResponse({ ok: true });
    return true;
  });

  async function handleAction(msg) {
    if (msg.action === 'manage-rules') {
      openRulesManager();
      return;
    }

    const stored = await loadOptions();
    const baseOptions = { ...DEFAULT_OPTIONS, ...stored };

    let options = baseOptions;
    if (msg.showPanel) {
      const result = await openSettingsPanel(msg.action, baseOptions, openRulesManager);
      if (!result) return;
      options = result;
      await saveOptions(options);
    }

    switch (msg.action) {
      case 'smart-print':  smartPrint(options); break;
      case 'reader-print': readerPrint(options); break;
      case 'select-area':  selectArea(options); break;
      case 'full-page':    fullPagePrint(options); break;
    }
  }
})();
