// 设置面板（打印前弹窗）
import { PAPER_SIZES } from '../core/constants.js';

function segOptions(items, current) {
  return items.map(([val, label]) => {
    const active = String(val) === String(current) ? ' active' : '';
    return `<button type="button" class="sp-seg-btn${active}" data-value="${val}">${label}</button>`;
  }).join('');
}

export function injectPanelStyles() {
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

export function openSettingsPanel(action, opts, onOpenRules) {
  return new Promise(resolve => {
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

    const result = { ...opts };

    panel.querySelectorAll('.sp-seg').forEach(seg => {
      const key = seg.dataset.key;
      seg.addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        seg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        let val = btn.dataset.value;
        if (key === 'margin' || key === 'scale') {
          const n = Number(val);
          if (!Number.isNaN(n)) val = n;
        }
        result[key] = val;
      });
    });

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
      setTimeout(() => onOpenRules && onOpenRules(), 50);
    });
    document.addEventListener('keydown', onKey, true);

    panel.querySelector('.sp-btn-ok').focus();
  });
}
