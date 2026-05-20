// content.js —— 注入到页面的核心脚本
// 防重复注入
(function () {
  if (window.__smartPrintInjected) return;
  window.__smartPrintInjected = true;

  // ==================== 默认设置 ====================
  const DEFAULT_OPTIONS = {
    paperSize: 'a4',          // a4 | a3 | a5 | letter
    orientation: 'portrait',  // portrait | landscape
    margin: 10,               // mm，5/10/20
    scale: 'auto',            // auto | 1 | 1.5 | 2 | 3（截图模式用）
    headerTitle: true,        // 页眉显示标题（截图模式用）
    headerUrl: false,         // 页眉显示 URL
    footerDate: true,         // 页脚显示日期
    footerPageNum: true,      // 页脚显示页码
    showLinkUrl: false,       // 链接后显示 URL（智能/阅读模式用）
    forceLight: true,         // 强制白底黑字
    skipPanel: false,         // 下次不再询问
  };

  // 纸张尺寸（毫米）
  const PAPER_SIZES = {
    a4: [210, 297],
    a3: [297, 420],
    a5: [148, 210],
    letter: [216, 279],
  };

  // ==================== 消息分发 ====================
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    handleAction(msg).catch(err => console.error('[smart-print]', err));
    sendResponse({ ok: true });
    return true;
  });

  async function handleAction(msg) {
    // 独立入口：管理本站隐藏规则
    if (msg.action === 'manage-rules') {
      openRulesManager();
      return;
    }

    const stored = await loadOptions();
    const baseOptions = { ...DEFAULT_OPTIONS, ...stored };

    let options = baseOptions;
    if (msg.showPanel) {
      const result = await openSettingsPanel(msg.action, baseOptions);
      if (!result) return; // 用户取消
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

  // ==================== 设置存储 ====================
  function loadOptions() {
    return new Promise(resolve => {
      try {
        chrome.storage.sync.get(Object.keys(DEFAULT_OPTIONS), data => resolve(data || {}));
      } catch {
        resolve({});
      }
    });
  }
  function saveOptions(opts) {
    return new Promise(resolve => {
      try {
        chrome.storage.sync.set(opts, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  // ==================== 隐藏规则（per-domain） ====================
  // 存储结构：{ hideRules: { 'zhihu.com': ['.AppHeader', '#xx'], '*': [...] } }
  function getCurrentDomain() {
    return location.hostname || '*';
  }

  function loadHideRules() {
    return new Promise(resolve => {
      try {
        chrome.storage.sync.get('hideRules', data => resolve((data && data.hideRules) || {}));
      } catch {
        resolve({});
      }
    });
  }
  function saveHideRules(rules) {
    return new Promise(resolve => {
      try {
        chrome.storage.sync.set({ hideRules: rules }, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  // 取该页面适用的所有选择器（当前域 + 全局）
  async function getEffectiveSelectors() {
    const all = await loadHideRules();
    const domain = getCurrentDomain();
    const selectors = [
      ...((all['*'] || [])),
      ...((all[domain] || [])),
    ];
    return [...new Set(selectors.filter(s => typeof s === 'string' && s.trim()))];
  }

  // 把选择器写入 print 媒介隐藏样式（用于智能/阅读模式）
  function buildHideRulesCss(selectors) {
    if (!selectors || !selectors.length) return '';
    // 注意：用户输入需要校验，逐条 try 防止整段无效
    const valid = selectors.filter(sel => {
      try { document.querySelector(sel); return true; } catch { return false; }
    });
    if (!valid.length) return '';
    return `${valid.join(',\n')} { display: none !important; visibility: hidden !important; }`;
  }

  // 截图模式：临时给匹配元素加内联 hidden，截完恢复
  function applyHideRulesForCanvas(selectors) {
    const restored = [];
    if (!selectors || !selectors.length) return restored;
    selectors.forEach(sel => {
      let nodes;
      try { nodes = document.querySelectorAll(sel); } catch { return; }
      nodes.forEach(el => {
        restored.push({ el, original: el.getAttribute('style') });
        el.style.setProperty('display', 'none', 'important');
      });
    });
    return restored;
  }
  function restoreHidden(restored) {
    restored.forEach(({ el, original }) => {
      if (original === null) el.removeAttribute('style');
      else el.setAttribute('style', original);
    });
  }

  // 生成元素的最佳 CSS 选择器（用于可视化拾取器）
  function bestSelectorOf(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) {
      const sel = `#${el.id}`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    // 1. 单类名足够唯一
    const classes = (el.className && typeof el.className === 'string')
      ? el.className.trim().split(/\s+/).filter(c => c && !/^(active|hover|focus|sp-|__)/.test(c))
      : [];
    for (const c of classes) {
      const sel = `.${CSS.escape(c)}`;
      try {
        if (document.querySelectorAll(sel).length === 1) return sel;
      } catch { /* ignore */ }
    }
    // 2. 类名组合
    if (classes.length >= 2) {
      const combo = '.' + classes.slice(0, 3).map(c => CSS.escape(c)).join('.');
      try {
        if (document.querySelectorAll(combo).length === 1) return combo;
      } catch { /* ignore */ }
    }
    // 3. 标签 + 类名
    const tag = el.tagName.toLowerCase();
    if (classes.length) {
      const combo = `${tag}.${CSS.escape(classes[0])}`;
      try {
        if (document.querySelectorAll(combo).length === 1) return combo;
      } catch { /* ignore */ }
    }
    // 4. 父级降级（最多向上 3 级）
    let cur = el, path = [];
    for (let i = 0; cur && cur.nodeType === 1 && i < 4; i++) {
      let part = cur.tagName.toLowerCase();
      const cls = (cur.className && typeof cur.className === 'string')
        ? cur.className.trim().split(/\s+/).filter(c => c && !/^(active|hover|focus|sp-|__)/.test(c))[0] : '';
      if (cls) part += '.' + CSS.escape(cls);
      else if (cur.parentElement) {
        const idx = Array.from(cur.parentElement.children).indexOf(cur) + 1;
        part += `:nth-child(${idx})`;
      }
      path.unshift(part);
      try {
        if (document.querySelectorAll(path.join(' > ')).length === 1) return path.join(' > ');
      } catch { /* ignore */ }
      cur = cur.parentElement;
    }
    return path.join(' > ') || tag;
  }

  // ==================== 浮动设置面板 ====================
  function openSettingsPanel(action, opts) {
    return new Promise(resolve => {
      // 移除旧面板（如有）
      document.getElementById('__smart_print_panel')?.remove();

      const isCanvasMode = action === 'full-page' || action === 'select-area';
      const modeLabel = {
        'smart-print': '🚀 智能打印',
        'reader-print': '📖 阅读模式',
        'select-area': '🎯 选择区域',
        'full-page': '📋 整页截图',
      }[action] || '打印';

      const panel = document.createElement('div');
      panel.id = '__smart_print_panel';
      panel.className = '__smart_print_overlay __sp-modal';
      panel.setAttribute('data-html2canvas-ignore', 'true');
      panel.innerHTML = `
        <div class="sp-panel-mask"></div>
        <div class="sp-panel">
          <div class="sp-panel-head">
            <span class="sp-panel-title">${modeLabel}・打印设置</span>
            <button class="sp-panel-close" type="button" title="关闭">×</button>
          </div>
          <div class="sp-panel-body">

            <div class="sp-row">
              <label>纸张</label>
              <div class="sp-seg" data-key="paperSize">
                ${segOptions([
                  ['a4', 'A4'], ['a3', 'A3'], ['a5', 'A5'], ['letter', 'Letter']
                ], opts.paperSize)}
              </div>
            </div>

            <div class="sp-row">
              <label>方向</label>
              <div class="sp-seg" data-key="orientation">
                ${segOptions([
                  ['portrait', '纵向'], ['landscape', '横向']
                ], opts.orientation)}
              </div>
            </div>

            <div class="sp-row">
              <label>边距</label>
              <div class="sp-seg" data-key="margin">
                ${segOptions([
                  [5, '窄'], [10, '标准'], [20, '宽']
                ], opts.margin)}
              </div>
            </div>

            ${isCanvasMode ? `
            <div class="sp-row">
              <label>清晰度</label>
              <div class="sp-seg" data-key="scale">
                ${segOptions([
                  ['auto', '自动'], [1, '1x'], [1.5, '1.5x'], [2, '2x'], [3, '3x']
                ], opts.scale)}
              </div>
            </div>
            ` : ''}

            <div class="sp-row sp-row-checks">
              <label>页眉页脚</label>
              <div class="sp-checks">
                <label class="sp-check"><input type="checkbox" data-key="headerTitle" ${opts.headerTitle ? 'checked' : ''}> 标题</label>
                <label class="sp-check"><input type="checkbox" data-key="headerUrl" ${opts.headerUrl ? 'checked' : ''}> URL</label>
                <label class="sp-check"><input type="checkbox" data-key="footerDate" ${opts.footerDate ? 'checked' : ''}> 日期</label>
                <label class="sp-check"><input type="checkbox" data-key="footerPageNum" ${opts.footerPageNum ? 'checked' : ''}> 页码</label>
              </div>
            </div>

            <div class="sp-row sp-row-checks">
              <label>更多</label>
              <div class="sp-checks">
                ${!isCanvasMode ? `<label class="sp-check"><input type="checkbox" data-key="showLinkUrl" ${opts.showLinkUrl ? 'checked' : ''}> 链接显示 URL</label>` : ''}
                <label class="sp-check"><input type="checkbox" data-key="forceLight" ${opts.forceLight ? 'checked' : ''}> 强制白底黑字</label>
              </div>
            </div>

          </div>
          <div class="sp-panel-foot">
            <label class="sp-check sp-skip"><input type="checkbox" data-key="skipPanel" ${opts.skipPanel ? 'checked' : ''}> 下次不再询问</label>
            <div class="sp-actions">
              <button class="sp-btn sp-btn-rules" type="button" title="管理本站隐藏规则">📌 隐藏规则</button>
              <button class="sp-btn sp-btn-cancel" type="button">取消</button>
              <button class="sp-btn sp-btn-ok" type="button">开始打印</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(panel);
      injectPanelStyles();

      // —— 交互绑定 ——
      const result = { ...opts };

      // 分段控件
      panel.querySelectorAll('.sp-seg').forEach(seg => {
        const key = seg.dataset.key;
        seg.addEventListener('click', e => {
          const btn = e.target.closest('button');
          if (!btn) return;
          seg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          let val = btn.dataset.value;
          // 数字类型还原
          if (key === 'margin' || key === 'scale') {
            const n = Number(val);
            if (!Number.isNaN(n)) val = n;
          }
          result[key] = val;
        });
      });

      // 复选框
      panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          result[cb.dataset.key] = cb.checked;
        });
      });

      const close = (resolved) => {
        document.removeEventListener('keydown', onKey, true);
        panel.remove();
        resolve(resolved);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close(null);
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) close(result);
      };

      panel.querySelector('.sp-panel-close').addEventListener('click', () => close(null));
      panel.querySelector('.sp-btn-cancel').addEventListener('click', () => close(null));
      panel.querySelector('.sp-panel-mask').addEventListener('click', () => close(null));
      panel.querySelector('.sp-btn-ok').addEventListener('click', () => close(result));
      panel.querySelector('.sp-btn-rules').addEventListener('click', () => {
        close(null);
        setTimeout(() => openRulesManager(), 50);
      });
      document.addEventListener('keydown', onKey, true);

      // 自动聚焦确定按钮
      panel.querySelector('.sp-btn-ok').focus();
    });
  }

  function segOptions(items, current) {
    return items.map(([val, label]) => {
      const active = String(val) === String(current) ? ' active' : '';
      return `<button type="button" class="sp-seg-btn${active}" data-value="${val}">${label}</button>`;
    }).join('');
  }

  function injectPanelStyles() {
    if (document.getElementById('__smart_print_panel_style')) return;
    const style = document.createElement('style');
    style.id = '__smart_print_panel_style';
    style.textContent = `
      .__sp-modal {
        position: fixed; inset: 0; z-index: 2147483647;
        font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
        color: #111;
      }
      .__sp-modal .sp-panel-mask {
        position: absolute; inset: 0; background: rgba(0,0,0,0.35);
        animation: sp-fade 0.15s ease;
      }
      .__sp-modal .sp-panel {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 420px; max-width: calc(100vw - 32px); max-height: calc(100vh - 64px);
        background: #fff; border-radius: 12px; overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,0.25);
        display: flex; flex-direction: column;
        animation: sp-pop 0.18s ease;
      }
      @keyframes sp-fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes sp-pop {
        from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
      .__sp-modal .sp-panel-head {
        padding: 14px 18px; border-bottom: 1px solid #eee;
        display: flex; align-items: center; justify-content: space-between;
      }
      .__sp-modal .sp-panel-title { font-size: 15px; font-weight: 600; }
      .__sp-modal .sp-panel-close {
        width: 28px; height: 28px; border: none; background: transparent;
        font-size: 22px; line-height: 1; color: #888; cursor: pointer; border-radius: 6px;
      }
      .__sp-modal .sp-panel-close:hover { background: #f3f4f6; color: #111; }
      .__sp-modal .sp-panel-body {
        padding: 16px 18px; overflow-y: auto; flex: 1;
      }
      .__sp-modal .sp-row {
        display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
      }
      .__sp-modal .sp-row > label {
        width: 72px; flex-shrink: 0; font-size: 13px; color: #555;
      }
      .__sp-modal .sp-row-checks { align-items: flex-start; }
      .__sp-modal .sp-row-checks > label { padding-top: 4px; }
      .__sp-modal .sp-seg {
        display: inline-flex; flex-wrap: wrap; gap: 4px;
        background: #f3f4f6; padding: 3px; border-radius: 8px;
      }
      .__sp-modal .sp-seg-btn {
        border: none; background: transparent; padding: 5px 12px;
        font-size: 12px; color: #444; border-radius: 6px; cursor: pointer;
        transition: all 0.12s;
      }
      .__sp-modal .sp-seg-btn:hover { background: #e5e7eb; }
      .__sp-modal .sp-seg-btn.active {
        background: #fff; color: #2563eb; font-weight: 600;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      .__sp-modal .sp-checks {
        display: flex; flex-wrap: wrap; gap: 6px 14px; flex: 1;
      }
      .__sp-modal .sp-check {
        display: inline-flex; align-items: center; gap: 5px;
        font-size: 13px; color: #333; cursor: pointer; user-select: none;
      }
      .__sp-modal .sp-check input { margin: 0; cursor: pointer; }
      .__sp-modal .sp-panel-foot {
        padding: 12px 18px; border-top: 1px solid #eee;
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; background: #fafafa;
      }
      .__sp-modal .sp-skip { font-size: 12px; color: #666; }
      .__sp-modal .sp-actions { display: flex; gap: 8px; }
      .__sp-modal .sp-btn {
        padding: 7px 16px; font-size: 13px; border-radius: 6px;
        border: 1px solid #d1d5db; background: #fff; color: #333;
        cursor: pointer; transition: all 0.12s;
      }
      .__sp-modal .sp-btn:hover { background: #f3f4f6; }
      .__sp-modal .sp-btn-ok {
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        border-color: #1d4ed8; color: #fff;
      }
      .__sp-modal .sp-btn-ok:hover {
        background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
      }
    `;
    document.head.appendChild(style);
  }

  // ==================== 模式 1: 智能打印 ====================
  async function smartPrint(options) {
    const stylesheetURL = chrome.runtime.getURL('styles/print-optimize.css');

    // 1. 注入打印样式表
    if (!document.getElementById('__smart_print_style')) {
      const link = document.createElement('link');
      link.id = '__smart_print_style';
      link.rel = 'stylesheet';
      link.href = stylesheetURL;
      link.media = 'print';
      document.head.appendChild(link);
    }

    // 2. 注入运行时动态样式（页面方向 / 边距 / 链接URL / 强制亮色 / 自定义隐藏规则）
    const selectors = await getEffectiveSelectors();
    applyRuntimePrintStyle(options, selectors);

    // 3. JS 兜底：清理 fixed/sticky 元素
    const cleaned = cleanFixedElements();

    // 4. 等样式应用后唤起打印
    setTimeout(() => {
      window.print();
      const restore = () => {
        cleaned.forEach(({ el, original }) => {
          if (original === null) el.removeAttribute('style');
          else el.setAttribute('style', original);
        });
        document.getElementById('__smart_print_runtime_style')?.remove();
        window.removeEventListener('afterprint', restore);
      };
      window.addEventListener('afterprint', restore);
    }, 300);
  }

  function applyRuntimePrintStyle(options, hideSelectors = []) {
    document.getElementById('__smart_print_runtime_style')?.remove();
    const [w, h] = PAPER_SIZES[options.paperSize] || PAPER_SIZES.a4;
    const sizeMm = options.orientation === 'landscape' ? `${h}mm ${w}mm` : `${w}mm ${h}mm`;
    const marginMm = `${options.margin}mm`;

    const hideCss = buildHideRulesCss(hideSelectors);

    const css = `
      @media print {
        @page { size: ${sizeMm}; margin: ${marginMm}; }
        ${hideCss}
        ${options.forceLight ? `
          html, body, * {
            background: #fff !important;
            color: #111 !important;
          }
          img, video { filter: none !important; }
        ` : ''}
        ${options.showLinkUrl ? `
          a[href]:not([href^="#"])::after {
            content: " (" attr(href) ")";
            font-size: 0.85em;
            color: #555;
            word-break: break-all;
          }
        ` : ''}
      }
    `;
    const style = document.createElement('style');
    style.id = '__smart_print_runtime_style';
    style.media = 'print';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function cleanFixedElements() {
    const cleaned = [];
    document.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'sticky') {
        cleaned.push({ el, original: el.getAttribute('style') });
        el.style.setProperty('position', 'static', 'important');
        el.style.setProperty('top', 'auto', 'important');
        el.style.setProperty('z-index', 'auto', 'important');
      }
    });
    return cleaned;
  }

  // ==================== 模式 2: 阅读模式打印 ====================
  async function readerPrint(options) {
    const article = pickArticleNode();
    if (!article) {
      alert('未识别到正文区域，请尝试"智能打印"或"选择区域打印"');
      return;
    }

    // 提前应用隐藏规则到正文克隆体（在源 DOM 不动的前提下）
    const hideSelectors = await getEffectiveSelectors();

    const title = document.title || 'Untitled';
    const win = window.open('', '_blank');
    if (!win) {
      alert('弹窗被浏览器拦截，请允许本站弹窗后重试');
      return;
    }

    const [pw, ph] = PAPER_SIZES[options.paperSize] || PAPER_SIZES.a4;
    const sizeMm = options.orientation === 'landscape' ? `${ph}mm ${pw}mm` : `${pw}mm ${ph}mm`;
    const marginMm = `${options.margin}mm`;

    const linkUrlCss = options.showLinkUrl ? `
      a[href]:not([href^="#"])::after {
        content: " (" attr(href) ")";
        font-size: 0.85em;
        color: #555;
        word-break: break-all;
      }
    ` : '';

    const doc = win.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
      <style>
      body {
            max-width: 720px;
            margin: 40px auto;
            padding: 20px;
            font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif;
            font-size: 16px;
            line-height: 1.75;
            color: #222;
            background: #fff;
          }
          h1 { font-size: 24px; margin-bottom: 8px; line-height: 1.3; }
          h2 { font-size: 20px; margin-top: 24px; }
          h3 { font-size: 17px; margin-top: 18px; }
          p { margin: 10px 0; }
          img, video { max-width: 100%; height: auto; display: block; margin: 12px auto; }
          pre, code {
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            background: #f6f8fa;
            border-radius: 4px;
          }
          pre { padding: 12px; overflow-x: auto; white-space: pre-wrap; }
          code { padding: 2px 6px; font-size: 0.9em; }
          blockquote {
            margin: 12px 0;
            padding: 8px 14px;
            border-left: 4px solid #e5e7eb;
            color: #555;
            background: #fafafa;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 12px 0;
          }
          th, td { border: 1px solid #e5e7eb; padding: 8px; }
          th { background: #f9fafb; }
          .meta {
            color: #888;
            font-size: 13px;
            margin-bottom: 24px;
            padding-bottom: 12px;
            border-bottom: 1px solid #e5e7eb;
          }
          @page { margin: ${marginMm}; size: ${sizeMm}; }
          @media print {
            body { margin: 0; padding: 0; }
            p, li, blockquote, pre, table, figure, img {
              page-break-inside: avoid;
            }
            h1, h2, h3 { page-break-after: avoid; }
            ${linkUrlCss}
          }
      </style>
      </head><body>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">来源：${escapeHtml(location.href)}<br>导出时间：${new Date().toLocaleString('zh-CN')}</div>
        <div id="article-body"></div>
      </body></html>`);
    doc.close();

    const bodyDiv = doc.getElementById('article-body');
    bodyDiv.innerHTML = article.innerHTML;

    doc.querySelectorAll('script, .share, .ad, .ads, .related, [class*="share"], [class*="recommend"]')
       .forEach(n => n.remove());

    // 应用用户自定义隐藏规则（在子窗口内）
    hideSelectors.forEach(sel => {
      try { doc.querySelectorAll(sel).forEach(n => n.remove()); } catch { /* invalid selector */ }
    });

    const waitImages = () => {
      const imgs = Array.from(doc.images);
      return Promise.all(imgs.map(img =>
        img.complete ? Promise.resolve() :
          new Promise(res => { img.onload = img.onerror = res; })
      ));
    };

    if (doc.readyState === 'complete') {
      waitImages().then(() => setTimeout(() => win.print(), 300));
    } else {
      win.addEventListener('load', () => {
        waitImages().then(() => setTimeout(() => win.print(), 300));
      });
    }
  }

  function pickArticleNode() {
    const candidates = [
      'article',
      'main article',
      '[role="article"]',
      'main',
      '[role="main"]',
      '.article-content', '.article-body', '.article',
      '.post-content', '.post-body', '.post',
      '.entry-content', '.entry',
      '.markdown-body',
      '.content', '#content', '.main-content', '#main',
      '.rich_media_content',
      '.note-content',
    ];
    for (const sel of candidates) {
      const node = document.querySelector(sel);
      if (node && node.innerText.trim().length > 200) return node;
    }
    let best = null, bestLen = 0;
    document.querySelectorAll('div, section').forEach(el => {
      const len = el.innerText.length;
      if (len > bestLen && len > 500) { best = el; bestLen = len; }
    });
    return best;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ==================== 模式 3: 区域选择 ====================
  function selectArea(options) {
    const tip = document.createElement('div');
    tip.className = '__smart_print_overlay';
    tip.setAttribute('data-html2canvas-ignore', 'true');
    tip.style.cssText = `
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647; background: #2563eb; color: white;
      padding: 8px 16px; border-radius: 6px; font-size: 13px;
      font-family: -apple-system, sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      pointer-events: none;
    `;
    tip.textContent = '👆 点击要导出的内容区域（按 ESC 取消）';
    document.body.appendChild(tip);

    let lastEl = null;
    const onMove = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === tip) return;
      if (lastEl && lastEl !== el) lastEl.style.outline = '';
      el.style.outline = '3px solid #2563eb';
      el.style.outlineOffset = '-3px';
      lastEl = el;
    };

    const cleanup = () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      tip.remove();
      if (lastEl) lastEl.style.outline = '';
    };

    const onClick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = lastEl;
      cleanup();
      if (target) await captureAndExport(target, false, options);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') cleanup();
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }

  // ==================== 模式 4: 整页截图导出 ====================
  async function fullPagePrint(options) {
    await captureAndExport(document.documentElement, true, options);
  }

  // ==================== 截图 + PDF 导出（共用） ====================
  async function captureAndExport(el, isFullPage, options) {
    showLoading('正在生成 PDF...');
    await waitForPaint();
    let hiddenRestored = [];
    try {
      if (!window.html2canvas || !window.jspdf) {
        throw new Error('PDF 依赖库未加载，请重新点击按钮再试一次');
      }

      const html2canvas = window.html2canvas;
      const { jsPDF } = window.jspdf;

      // —— 应用自定义隐藏规则（截图前临时 hide，截完恢复） ——
      const hideSelectors = await getEffectiveSelectors();
      hiddenRestored = applyHideRulesForCanvas(hideSelectors);

      await sleep(150);

      // —— 缩放 ——
      const scale = options.scale === 'auto'
        ? (window.devicePixelRatio > 1 ? 2 : 1.5)
        : Number(options.scale) || 1.5;

      // —— 强制白底（forceLight）——
      let lightStyle = null;
      if (options.forceLight) {
        lightStyle = document.createElement('style');
        lightStyle.id = '__smart_print_light_tmp';
        lightStyle.textContent = `
          html, body { background: #fff !important; }
        `;
        document.head.appendChild(lightStyle);
      }

      const canvas = await html2canvas(el, {
        scale,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: isFullPage ? document.documentElement.scrollWidth : undefined,
        windowHeight: isFullPage ? document.documentElement.scrollHeight : undefined,
      });

      lightStyle?.remove();

      // —— PDF 参数 ——
      const [paperW, paperH] = PAPER_SIZES[options.paperSize] || PAPER_SIZES.a4;
      const orientation = options.orientation === 'landscape' ? 'l' : 'p';
      const pageW = orientation === 'l' ? paperH : paperW;
      const pageH = orientation === 'l' ? paperW : paperH;
      const margin = options.margin || 10;

      // 页眉/页脚预留高度（mm）
      const hasHeader = options.headerTitle || options.headerUrl;
      const hasFooter = options.footerDate || options.footerPageNum;
      const headerH = hasHeader ? 8 : 0;
      const footerH = hasFooter ? 8 : 0;

      const contentW = pageW - margin * 2;
      const contentTop = margin + headerH;
      const contentH = pageH - margin * 2 - headerH - footerH;

      const pdf = new jsPDF({ orientation, unit: 'mm', format: options.paperSize, compress: true });

      const imgWmm = contentW;
      const imgHmm = (canvas.height * imgWmm) / canvas.width;

      // 单页装得下
      if (imgHmm <= contentH) {
        pdf.addImage(canvas, 'JPEG', margin, contentTop, imgWmm, imgHmm, undefined, 'FAST');
        drawHeaderFooter(pdf, options, 1, 1, pageW, pageH, margin);
      } else {
        // 多页拼接
        const pxPerMm = canvas.width / imgWmm;
        const pageContentHpx = Math.floor(contentH * pxPerMm);
        const totalPages = Math.ceil(canvas.height / pageContentHpx);

        let renderedPx = 0;
        let pageNum = 0;
        while (renderedPx < canvas.height) {
          const sliceH = Math.min(pageContentHpx, canvas.height - renderedPx);
          const slice = document.createElement('canvas');
          slice.width = canvas.width;
          slice.height = sliceH;
          const ctx = slice.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, slice.width, slice.height);
          ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

          const sliceHmm = sliceH / pxPerMm;
          if (pageNum > 0) pdf.addPage();
          pdf.addImage(slice, 'JPEG', margin, contentTop, imgWmm, sliceHmm, undefined, 'FAST');
          drawHeaderFooter(pdf, options, pageNum + 1, totalPages, pageW, pageH, margin);
          renderedPx += sliceH;
          pageNum++;
        }
      }

      const filename = (document.title || 'page').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) + '.pdf';
      pdf.save(filename);
      hideLoading();
      toast('✅ PDF 已生成');
    } catch (err) {
      console.error(err);
      hideLoading();
      toast('❌ 生成失败：' + (err.message || err), 4000);
    } finally {
      restoreHidden(hiddenRestored);
    }
  }

  // 页眉/页脚绘制（截图 PDF 用）
  function drawHeaderFooter(pdf, options, pageNum, totalPages, pageW, pageH, margin) {
    pdf.setFontSize(9);
    pdf.setTextColor(120);

    // 页眉
    const headerParts = [];
    if (options.headerTitle && document.title) headerParts.push(document.title);
    if (options.headerUrl) headerParts.push(location.href);
    if (headerParts.length) {
      const headerText = clipText(headerParts.join('  ·  '), 95);
      pdf.text(headerText, margin, margin + 4);
    }

    // 页脚
    const footerLeft = options.footerDate ? new Date().toLocaleDateString('zh-CN') : '';
    const footerRight = options.footerPageNum ? `${pageNum} / ${totalPages}` : '';
    if (footerLeft) pdf.text(footerLeft, margin, pageH - margin - 1);
    if (footerRight) {
      const w = pdf.getTextWidth(footerRight);
      pdf.text(footerRight, pageW - margin - w, pageH - margin - 1);
    }

    // 还原
    pdf.setTextColor(0);
  }

  function clipText(s, max) {
    if (!s) return '';
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  // ==================== 工具函数 ====================
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function waitForPaint() {
    return new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  let loadingEl = null;
  function showLoading(msg) {
    if (loadingEl) loadingEl.remove();
    loadingEl = document.createElement('div');
    loadingEl.className = '__smart_print_overlay';
    loadingEl.setAttribute('data-html2canvas-ignore', 'true');
    loadingEl.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 2147483647; background: rgba(0,0,0,0.85); color: white;
      padding: 16px 24px; border-radius: 10px; font-size: 14px;
      font-family: -apple-system, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    `;
    loadingEl.textContent = msg;
    document.body.appendChild(loadingEl);
  }
  function hideLoading() {
    if (loadingEl) { loadingEl.remove(); loadingEl = null; }
  }
  function toast(msg, duration = 2000) {
    const el = document.createElement('div');
    el.className = '__smart_print_overlay';
    el.setAttribute('data-html2canvas-ignore', 'true');
    el.style.cssText = `
      position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647; background: #111; color: white;
      padding: 10px 20px; border-radius: 8px; font-size: 13px;
      font-family: -apple-system, sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  // ==================== 隐藏规则管理面板 ====================
  async function openRulesManager() {
    document.getElementById('__smart_print_rules_panel')?.remove();
    injectPanelStyles();
    injectRulesStyles();

    const allRules = await loadHideRules();
    const domain = getCurrentDomain();
    // 工作副本
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
        li.querySelector('.sp-rule-flash').addEventListener('click', () => flashSelector(sel));
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

    // —— 事件绑定 ——
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
      pickElementSelector().then(sel => {
        panel.style.display = '';
        if (sel) addSelector(sel);
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

    // 导入/导出
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

  // 短暂高亮匹配的元素，便于用户确认
  function flashSelector(sel) {
    let nodes;
    try { nodes = document.querySelectorAll(sel); } catch { return toast('选择器无效', 1500); }
    if (!nodes.length) return toast('没有匹配的元素', 1500);
    const restored = [];
    nodes.forEach(el => {
      restored.push({ el, original: el.getAttribute('style') });
      el.style.setProperty('outline', '3px dashed #f59e0b', 'important');
      el.style.setProperty('outline-offset', '-3px', 'important');
      el.style.setProperty('background-color', 'rgba(245,158,11,0.15)', 'important');
    });
    setTimeout(() => {
      restored.forEach(({ el, original }) => {
        if (original === null) el.removeAttribute('style');
        else el.setAttribute('style', original);
      });
    }, 1200);
  }

  // 可视化点选元素，返回最优选择器；ESC 取消返回 null
  function pickElementSelector() {
    return new Promise(resolve => {
      const tip = document.createElement('div');
      tip.className = '__smart_print_overlay';
      tip.setAttribute('data-html2canvas-ignore', 'true');
      tip.style.cssText = `
        position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
        z-index: 2147483647; background: #f59e0b; color: white;
        padding: 8px 16px; border-radius: 6px; font-size: 13px;
        font-family: -apple-system, sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        pointer-events: none;
      `;
      tip.textContent = '👆 点击要加入隐藏规则的元素（按 ESC 取消）';
      document.body.appendChild(tip);

      let lastEl = null;
      const onMove = (e) => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el === tip) return;
        if (lastEl && lastEl !== el) lastEl.style.outline = '';
        el.style.outline = '3px solid #f59e0b';
        el.style.outlineOffset = '-3px';
        lastEl = el;
      };
      const cleanup = () => {
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        tip.remove();
        if (lastEl) lastEl.style.outline = '';
      };
      const onClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const target = lastEl;
        cleanup();
        resolve(target ? bestSelectorOf(target) : null);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup();
          resolve(null);
        }
      };
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);
    });
  }

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
})();
