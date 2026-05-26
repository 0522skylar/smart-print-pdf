// 阅读模式打印
import { PAPER_SIZES } from '../core/constants.js';
import { getEffectiveSelectors } from '../core/storage.js';
import { applyHideRulesInDocument } from '../core/hide-rules.js';
import { escapeHtml } from '../core/dom.js';

export async function readerPrint(options) {
  const article = pickArticleNode();
  if (!article) {
    alert('未识别到正文区域，请尝试"智能打印"或"选择区域打印"');
    return;
  }

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

  // 在子窗口中应用隐藏规则（CSSStyleSheet API）
  applyHideRulesInDocument(doc, hideSelectors);

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
