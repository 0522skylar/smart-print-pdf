// content.js —— 注入到页面的核心脚本
// 防重复注入
(function () {
  if (window.__smartPrintInjected) return;
  window.__smartPrintInjected = true;

  // ==================== 消息分发 ====================
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    try {
      switch (msg.action) {
        case 'smart-print': smartPrint(); break;
        case 'reader-print': readerPrint(); break;
        case 'select-area': selectArea(); break;
        case 'full-page': fullPagePrint(); break;
      }
      sendResponse({ ok: true });
    } catch (err) {
      console.error('[smart-print]', err);
      sendResponse({ ok: false, error: err.message });
    }
    return true;
  });

  // ==================== 模式 1: 智能打印 ====================
  function smartPrint() {
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

    // 2. JS 兜底：清理 fixed/sticky 元素（CSS !important 不一定盖得住内联 style）
    const cleaned = cleanFixedElements();

    // 3. 等样式应用后唤起打印
    setTimeout(() => {
      window.print();
      // 打印对话框关闭后恢复
      const restore = () => {
        cleaned.forEach(({ el, original }) => {
          if (original === null) el.removeAttribute('style');
          else el.setAttribute('style', original);
        });
        window.removeEventListener('afterprint', restore);
      };
      window.addEventListener('afterprint', restore);
    }, 300);
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
  function readerPrint() {
    const article = pickArticleNode();
    if (!article) {
      alert('未识别到正文区域，请尝试"智能打印"或"选择区域打印"');
      return;
    }
  
    const title = document.title || 'Untitled';
    const win = window.open('', '_blank');
    if (!win) {
      alert('弹窗被浏览器拦截，请允许本站弹窗后重试');
      return;
    }
  
    const doc = win.document;
    doc.open();
    // 只写纯 HTML+CSS，不含任何 <script>
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
          @page { margin: 1.5cm 1.2cm; size: A4; }
          @media print {
            body { margin: 0; padding: 0; }
            p, li, blockquote, pre, table, figure, img {
              page-break-inside: avoid;
            }
            h1, h2, h3 { page-break-after: avoid; }
          }
      </style>
      </head><body>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">来源：${escapeHtml(location.href)}<br>导出时间：${new Date().toLocaleString('zh-CN')}</div>
        <div id="article-body"></div>
      </body></html>`);
    doc.close();
  
    // 关键：在父页面（content script 上下文）里操作子窗口 DOM，不受子窗口 CSP 约束
    const bodyDiv = doc.getElementById('article-body');
    bodyDiv.innerHTML = article.innerHTML;
  
    // 清理广告/分享/脚本残留
    doc.querySelectorAll('script, .share, .ad, .ads, .related, [class*="share"], [class*="recommend"]')
       .forEach(n => n.remove());
  
    // 等图片加载完，再触发打印（在父页面执行，不需要内联 <script>）
    const waitImages = () => {
      const imgs = Array.from(doc.images);
      return Promise.all(imgs.map(img =>
        img.complete ? Promise.resolve() :
          new Promise(res => { img.onload = img.onerror = res; })
      ));
    };
  
    // 子窗口 load 后再等图片
    if (doc.readyState === 'complete') {
      waitImages().then(() => setTimeout(() => win.print(), 300));
    } else {
      win.addEventListener('load', () => {
        waitImages().then(() => setTimeout(() => win.print(), 300));
      });
    }
  }

  function pickArticleNode() {
    // 候选选择器（按优先级）
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
      '.rich_media_content', // 微信公众号
      '.note-content', // 知乎/简书
    ];
    for (const sel of candidates) {
      const node = document.querySelector(sel);
      if (node && node.innerText.trim().length > 200) return node;
    }
    // 兜底：找文字最多的 div
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
  function selectArea() {
    const tip = document.createElement('div');
    tip.className = '__smart_print_overlay';
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
      if (target) await captureAndExport(target);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') cleanup();
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }

  // ==================== 模式 4: 整页截图导出 ====================
  async function fullPagePrint() {
    await captureAndExport(document.documentElement, true);
  }

  // ==================== 截图 + PDF 导出（共用） ====================
  async function captureAndExport(el, isFullPage = false) {
    showLoading('正在生成 PDF...');
    try {
      // 库由 popup.js 通过 chrome.scripting.executeScript 预注入到 ISOLATED world
      // 这里只做兜底校验
      if (!window.html2canvas || !window.jspdf) {
        throw new Error('PDF 依赖库未加载，请重新点击按钮再试一次');
      }

      const html2canvas = window.html2canvas;
      const { jsPDF } = window.jspdf;

      // 短暂等待样式稳定
      await sleep(150);

      const canvas = await html2canvas(el, {
        scale: window.devicePixelRatio > 1 ? 2 : 1.5,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: isFullPage ? document.documentElement.scrollWidth : undefined,
        windowHeight: isFullPage ? document.documentElement.scrollHeight : undefined,
      });

      // PDF 参数（A4: 210 x 297 mm）
      const pageW = 210, pageH = 297, margin = 10;
      const contentW = pageW - margin * 2;
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });

      const imgWmm = contentW;
      const imgHmm = (canvas.height * imgWmm) / canvas.width;

      // 单页装得下
      if (imgHmm <= pageH - margin * 2) {
        pdf.addImage(canvas, 'JPEG', margin, margin, imgWmm, imgHmm, undefined, 'FAST');
      } else {
        // 多页拼接：把整张大图按页高切片
        const pageContentHmm = pageH - margin * 2;
        // 1mm 在原图中对应多少像素
        const pxPerMm = canvas.width / imgWmm;
        const pageContentHpx = Math.floor(pageContentHmm * pxPerMm);

        let renderedPx = 0;
        let pageNum = 0;
        while (renderedPx < canvas.height) {
          const sliceH = Math.min(pageContentHpx, canvas.height - renderedPx);
          // 创建临时 canvas 装这一页的切片
          const slice = document.createElement('canvas');
          slice.width = canvas.width;
          slice.height = sliceH;
          const ctx = slice.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, slice.width, slice.height);
          ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

          const sliceHmm = sliceH / pxPerMm;
          if (pageNum > 0) pdf.addPage();
          pdf.addImage(slice, 'JPEG', margin, margin, imgWmm, sliceHmm, undefined, 'FAST');
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
    }
  }

  // ==================== 工具函数 ====================
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  let loadingEl = null;
  function showLoading(msg) {
    if (loadingEl) loadingEl.remove();
    loadingEl = document.createElement('div');
    loadingEl.className = '__smart_print_overlay';
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
    el.style.cssText = `
      position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647; background: #111; color: white;
      padding: 10px 20px; border-radius: 8px; font-size: 13px;
      font-family: -apple-system, sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: __sp_fadein 0.2s ease;
    `;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }
})();
