// 区域选择 / 整页截图 + PDF 导出（共用 captureAndExport）
import {
  PAPER_SIZES, HEADER_HEIGHT_MM, FOOTER_HEIGHT_MM,
  HEADER_TEXT_MAX_LEN, FILENAME_MAX_LEN, HIDE_RULES_APPLY_DELAY_MS
} from '../core/constants.js';
import { getEffectiveSelectors } from '../core/storage.js';
import { applyHideRulesForCanvas } from '../core/hide-rules.js';
import { pickElement } from '../core/dom.js';
import { showLoading, hideLoading, toast, sleep, waitForPaint } from '../ui/notify.js';

export async function selectArea(options) {
  const target = await pickElement({
    color: '#2563eb',
    tipText: '👆 点击要导出的内容区域（按 ESC 取消）',
  });
  if (target) await captureAndExport(target, false, options);
}

export async function fullPagePrint(options) {
  await captureAndExport(document.documentElement, true, options);
}

async function captureAndExport(el, isFullPage, options) {
  const isPng = options.outputFormat === 'png';
  showLoading(isPng ? '正在生成 PNG...' : '正在生成 PDF...');
  await waitForPaint();
  let cleanupHideRules = () => {};
  let lightStyle = null;

  try {
    if (!window.html2canvas) {
      throw new Error('截图依赖库未加载，请重新点击按钮再试一次');
    }
    if (!isPng && !window.jspdf) {
      throw new Error('PDF 依赖库未加载，请重新点击按钮再试一次');
    }
    const html2canvas = window.html2canvas;

    // 用 CSSStyleSheet 注入式隐藏，单次 reflow（性能远优于逐元素 inline style）
    const hideSelectors = await getEffectiveSelectors();
    cleanupHideRules = applyHideRulesForCanvas(hideSelectors);

    await sleep(HIDE_RULES_APPLY_DELAY_MS);

    const scale = options.scale === 'auto'
      ? (window.devicePixelRatio > 1 ? 2 : 1.5)
      : Number(options.scale) || 1.5;

    if (options.forceLight) {
      lightStyle = document.createElement('style');
      lightStyle.id = '__smart_print_light_tmp';
      lightStyle.textContent = `html, body { background: #fff !important; }`;
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
      // 在克隆好的 DOM 上做最后清理，避免触发扩展 CSP 拦截外链脚本
      onclone: (clonedDoc) => {
        // 1. 删掉所有 script / link[rel=preload as=script] / noscript
        //    它们对截图毫无视觉贡献，但克隆后浏览器会重新发起加载
        clonedDoc.querySelectorAll(
          'script, noscript, link[rel="preload"][as="script"], link[rel="modulepreload"], link[rel="prefetch"]'
        ).forEach(n => n.remove());
        // 2. 移除明确标记不参与截图的节点（包括我们自己的设置面板）
        clonedDoc.querySelectorAll('[data-html2canvas-ignore]').forEach(n => n.remove());
      },
    });

    lightStyle?.remove();
    lightStyle = null;

    const baseName = (document.title || 'page')
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, FILENAME_MAX_LEN);

    if (isPng) {
      await exportPng(canvas, baseName + '.png');
      hideLoading();
      toast('✅ PNG 已生成');
      return;
    }

    const { jsPDF } = window.jspdf;
    const [paperW, paperH] = PAPER_SIZES[options.paperSize] || PAPER_SIZES.a4;
    const orientation = options.orientation === 'landscape' ? 'l' : 'p';
    const pageW = orientation === 'l' ? paperH : paperW;
    const pageH = orientation === 'l' ? paperW : paperH;
    const margin = options.margin || 10;

    const hasHeader = options.headerTitle || options.headerUrl;
    const hasFooter = options.footerDate || options.footerPageNum;
    const headerH = hasHeader ? HEADER_HEIGHT_MM : 0;
    const footerH = hasFooter ? FOOTER_HEIGHT_MM : 0;

    const contentW = pageW - margin * 2;
    const contentTop = margin + headerH;
    const contentH = pageH - margin * 2 - headerH - footerH;

    const pdf = new jsPDF({ orientation, unit: 'mm', format: options.paperSize, compress: true });

    const imgWmm = contentW;
    const imgHmm = (canvas.height * imgWmm) / canvas.width;

    if (imgHmm <= contentH) {
      pdf.addImage(canvas, 'JPEG', margin, contentTop, imgWmm, imgHmm, undefined, 'FAST');
      drawHeaderFooter(pdf, options, 1, 1, pageW, pageH, margin);
    } else {
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

    pdf.save(baseName + '.pdf');
    hideLoading();
    toast('✅ PDF 已生成');
  } catch (err) {
    console.error(err);
    hideLoading();
    toast('❌ 生成失败：' + (err.message || err), 4000);
  } finally {
    cleanupHideRules();
    lightStyle?.remove();
  }
}

function exportPng(canvas, filename) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Canvas toBlob 返回空'));
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // 释放（稍延迟避免 Chrome 取消下载）
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        resolve();
      }, 'image/png');
    } catch (e) {
      reject(e);
    }
  });
}

function drawHeaderFooter(pdf, options, pageNum, totalPages, pageW, pageH, margin) {
  pdf.setFontSize(9);
  pdf.setTextColor(120);

  const headerParts = [];
  if (options.headerTitle && document.title) headerParts.push(document.title);
  if (options.headerUrl) headerParts.push(location.href);
  if (headerParts.length) {
    const headerText = clipText(headerParts.join('  ·  '), HEADER_TEXT_MAX_LEN);
    pdf.text(headerText, margin, margin + 4);
  }

  const footerLeft = options.footerDate ? new Date().toLocaleDateString('zh-CN') : '';
  const footerRight = options.footerPageNum ? `${pageNum} / ${totalPages}` : '';
  if (footerLeft) pdf.text(footerLeft, margin, pageH - margin - 1);
  if (footerRight) {
    const w = pdf.getTextWidth(footerRight);
    pdf.text(footerRight, pageW - margin - w, pageH - margin - 1);
  }

  pdf.setTextColor(0);
}

function clipText(s, max) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
