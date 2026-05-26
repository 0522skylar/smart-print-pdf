// 智能打印模式
import { PAPER_SIZES, PRINT_DELAY_MS } from '../core/constants.js';
import { getEffectiveSelectors } from '../core/storage.js';
import { applyHideRulesForPrint } from '../core/hide-rules.js';

export async function smartPrint(options) {
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

  // 2. 注入运行时动态样式
  const selectors = await getEffectiveSelectors();
  applyRuntimePrintStyle(options);
  // 自定义隐藏规则用 CSSStyleSheet API 安全地注入
  const cleanupHideRules = applyHideRulesForPrint(selectors);

  // 3. 等样式应用后唤起打印
  // 注意：fixed/sticky 清理已完全交由 print-optimize.css（@media print 下 *{position:static!important}），
  // 不再做 JS 全树遍历，性能显著提升
  setTimeout(() => {
    window.print();
    const restore = () => {
      document.getElementById('__smart_print_runtime_style')?.remove();
      cleanupHideRules();
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
  }, PRINT_DELAY_MS);
}

function applyRuntimePrintStyle(options) {
  document.getElementById('__smart_print_runtime_style')?.remove();
  const [w, h] = PAPER_SIZES[options.paperSize] || PAPER_SIZES.a4;
  const sizeMm = options.orientation === 'landscape' ? `${h}mm ${w}mm` : `${w}mm ${h}mm`;
  const marginMm = `${options.margin}mm`;

  const css = `
    @media print {
      @page { size: ${sizeMm}; margin: ${marginMm}; }
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
