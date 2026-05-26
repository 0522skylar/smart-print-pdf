// 隐藏规则管理面板
import { loadHideRules, saveHideRules, getCurrentDomain } from '../core/storage.js';
import { bestSelectorOf, escapeHtml, flashSelector, pickElement } from '../core/dom.js';
import { toast } from './notify.js';
import { injectPanelStyles } from './settings-panel.js';

function injectRulesStyles() {
  if (document.getElementById('__smart_print_rules_style')) return;
  const style = document.createElement('style');
  style.id = '__smart_print_rules_style';
  style.textContent = `
    .__sp-modal .sp-rules-panel { width: 520px; }
    .__sp-modal .sp-rules-tabs {
      display: flex; padding: 0 18px; border-bottom: 1px solid #eee; gap: 4px;
    }
    .__sp-modal .sp-tab {
      background: transparent; border: none; padding: 10px 14px;
      font-size: 13px; color: #666; cursor: pointer;
      border-bottom: 2px solid transparent; margin-bottom: -1px;
    }
    .__sp-modal .sp-tab:hover { color: #2563eb; }
    .__sp-modal .sp-tab.active {
      color: #2563eb; border-bottom-color: #2563eb; font-weight: 600;
    }
    .__sp-modal .sp-rules-body { min-height: 280px; max-height: 50vh; }
    .__sp-modal .sp-rules-toolbar {
      display: flex; gap: 6px; margin-bottom: 8px;
    }
    .__sp-modal .sp-btn-pick {
      flex: 1; padding: 10px 14px; font-size: 13px; font-weight: 600;
      background: #fef3c7; border-color: #fbbf24; color: #92400e;
    }
    .__sp-modal .sp-btn-pick:hover { background: #fde68a; }
    .__sp-modal .sp-rules-hint {
      font-size: 11px; color: #888; margin-bottom: 10px;
    }
    .__sp-modal .sp-rules-list {
      list-style: none; padding: 0; margin: 0;
    }
    .__sp-modal .sp-rule-item {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 10px; margin-bottom: 4px;
      background: #f9fafb; border: 1px solid #f1f3f5; border-radius: 6px;
    }
    .__sp-modal .sp-rule-sel {
      flex: 1; font-family: ui-monospace, Menlo, Consolas, monospace;
      font-size: 12px; color: #1f2937;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .__sp-modal .sp-rule-count {
      font-size: 11px; color: #16a34a;
      background: #dcfce7; padding: 2px 6px; border-radius: 4px;
      flex-shrink: 0;
    }
    .__sp-modal .sp-rule-count.zero {
      color: #6b7280; background: #f3f4f6;
    }
    .__sp-modal .sp-rule-count.invalid {
      color: #b91c1c; background: #fee2e2;
    }
    .__sp-modal .sp-rule-flash,
    .__sp-modal .sp-rule-del {
      width: 26px; height: 26px; border: none; background: transparent;
      cursor: pointer; border-radius: 4px; font-size: 14px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .__sp-modal .sp-rule-flash:hover { background: #fef3c7; }
    .__sp-modal .sp-rule-del:hover { background: #fee2e2; color: #b91c1c; }
    .__sp-modal .sp-rules-empty {
      padding: 24px; text-align: center; color: #9ca3af; font-size: 13px;
      background: #f9fafb; border-radius: 6px;
    }
    .__sp-modal .sp-btn-export,
    .__sp-modal .sp-btn-import {
      padding: 6px 10px; font-size: 12px;
    }
  `;
  document.head.appendChild(style);
}

export async function openRulesManager() {
  document.getElementById('__smart_print_rules_panel')?.remove();
  injectPanelStyles();
  injectRulesStyles();

  const allRules = await loadHideRules();
  const domain = getCurrentDomain();
  const draft = {
    domain: [...(allRules[domain] || [])],
    global: [...(allRules['*'] || [])],
  };

  const panel = document.createElement('div');
  panel.id = '__smart_print_rules_panel';
  panel.className = '__smart_print_overlay __sp-modal';
  panel.setAttribute('data-html2canvas-ignore', 'true');
  panel.innerHTML = `
    <div class="sp-panel-mask"></div>
    <div class="sp-panel sp-rules-panel">
      <div class="sp-panel-head">
        <span class="sp-panel-title">📌 隐藏规则管理</span>
        <button class="sp-panel-close" type="button" title="关闭">×</button>
      </div>

      <div class="sp-rules-tabs">
        <button class="sp-tab active" data-tab="domain">本站规则 (${escapeHtml(domain)})</button>
        <button class="sp-tab" data-tab="global">全局规则（所有网站）</button>
      </div>

      <div class="sp-panel-body sp-rules-body">
        <div class="sp-rules-toolbar">
          <button class="sp-btn sp-btn-pick" type="button">🎯 点选要隐藏的元素</button>
        </div>
        <div class="sp-rules-hint">点上面的按钮，然后在页面上点击任意要隐藏的内容（广告、侧栏、横幅等），下次打印会自动跳过它们。</div>

        <ul class="sp-rules-list" id="sp-rules-list"></ul>
        <div class="sp-rules-empty" id="sp-rules-empty" style="display:none;">暂无规则。点上方按钮选择要隐藏的内容即可。</div>
      </div>

      <div class="sp-panel-foot">
        <button class="sp-btn sp-btn-export" type="button" title="导出全部规则到剪贴板">导出</button>
        <button class="sp-btn sp-btn-import" type="button" title="从剪贴板导入">导入</button>
        <div class="sp-actions">
          <button class="sp-btn sp-btn-cancel" type="button">取消</button>
          <button class="sp-btn sp-btn-ok" type="button">保存</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  let activeTab = 'domain';
  const listEl = panel.querySelector('#sp-rules-list');
  const emptyEl = panel.querySelector('#sp-rules-empty');

  const currentList = () => activeTab === 'domain' ? draft.domain : draft.global;
  const setList = (arr) => {
    if (activeTab === 'domain') draft.domain = arr;
    else draft.global = arr;
  };

  function render() {
    const list = currentList();
    listEl.innerHTML = '';
    if (!list.length) {
      emptyEl.style.display = 'block';
      return;
    }
    emptyEl.style.display = 'none';
    list.forEach((sel, idx) => {
      let matchCount = 0;
      try { matchCount = document.querySelectorAll(sel).length; } catch { matchCount = -1; }
      const li = document.createElement('li');
      li.className = 'sp-rule-item';
      li.innerHTML = `
        <span class="sp-rule-sel" title="${escapeHtml(sel)}">${escapeHtml(sel)}</span>
        <span class="sp-rule-count ${matchCount === -1 ? 'invalid' : matchCount === 0 ? 'zero' : ''}">
          ${matchCount === -1 ? '⚠ 失效' : matchCount === 0 ? '页面已无' : `命中 ${matchCount} 处`}
        </span>
        <button class="sp-rule-flash" type="button" title="在页面上定位查看">👁</button>
        <button class="sp-rule-del" type="button" title="移除此规则">×</button>
      `;
      li.querySelector('.sp-rule-flash').addEventListener('click',
        () => flashSelector(sel, msg => toast(msg, 1500)));
      li.querySelector('.sp-rule-del').addEventListener('click', () => {
        const arr = currentList().filter((_, i) => i !== idx);
        setList(arr);
        render();
      });
      listEl.appendChild(li);
    });
  }

  function addSelector(sel) {
    sel = (sel || '').trim();
    if (!sel) return;
    try { document.querySelector(sel); } catch {
      toast('❌ 无法识别该元素', 2000);
      return;
    }
    const list = currentList();
    if (list.includes(sel)) {
      toast('该元素已在规则中', 1500);
      return;
    }
    list.push(sel);
    setList(list);
    render();
  }

  panel.querySelectorAll('.sp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.sp-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      render();
    });
  });

  panel.querySelector('.sp-btn-pick').addEventListener('click', () => {
    panel.style.display = 'none';
    pickElement({ color: '#f59e0b', tipText: '👆 点击要加入隐藏规则的元素（按 ESC 取消）' })
      .then(target => {
        panel.style.display = '';
        if (target) addSelector(bestSelectorOf(target));
      });
  });

  const close = (save) => {
    document.removeEventListener('keydown', onKey, true);
    panel.remove();
    if (save) {
      const merged = { ...allRules };
      if (draft.domain.length) merged[domain] = draft.domain;
      else delete merged[domain];
      if (draft.global.length) merged['*'] = draft.global;
      else delete merged['*'];
      saveHideRules(merged).then(() => toast('✅ 规则已保存'));
    }
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(false);
    }
  };
  document.addEventListener('keydown', onKey, true);
  panel.querySelector('.sp-panel-close').addEventListener('click', () => close(false));
  panel.querySelector('.sp-btn-cancel').addEventListener('click', () => close(false));
  panel.querySelector('.sp-panel-mask').addEventListener('click', () => close(false));
  panel.querySelector('.sp-btn-ok').addEventListener('click', () => close(true));

  panel.querySelector('.sp-btn-export').addEventListener('click', async () => {
    const text = JSON.stringify({ [domain]: draft.domain, '*': draft.global }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      toast('✅ 已复制到剪贴板');
    } catch {
      toast('❌ 复制失败，请手动选择', 3000);
    }
  });
  panel.querySelector('.sp-btn-import').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object') {
        if (Array.isArray(obj[domain])) draft.domain = obj[domain].filter(s => typeof s === 'string');
        if (Array.isArray(obj['*'])) draft.global = obj['*'].filter(s => typeof s === 'string');
        render();
        toast('✅ 已导入');
      } else {
        toast('❌ 剪贴板内容格式错误', 3000);
      }
    } catch (err) {
      toast('❌ 导入失败：' + err.message, 3000);
    }
  });

  render();
}
