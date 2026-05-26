// DOM 工具：选择器生成、可视化点选

// 生成元素的最佳 CSS 选择器
export function bestSelectorOf(el) {
  if (!el || el.nodeType !== 1) return '';
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) {
    const sel = `#${el.id}`;
    if (document.querySelectorAll(sel).length === 1) return sel;
  }
  const classes = (el.className && typeof el.className === 'string')
    ? el.className.trim().split(/\s+/).filter(c => c && !/^(active|hover|focus|sp-|__)/.test(c))
    : [];
  // 1. 单类名
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

/**
 * 通用元素点选器：返回 Promise<targetElement | null>
 * @param {object} opts { color, tipText }
 */
export function pickElement({ color = '#2563eb', tipText = '👆 点击要选择的元素（按 ESC 取消）' } = {}) {
  return new Promise(resolve => {
    const tip = document.createElement('div');
    tip.className = '__smart_print_overlay';
    tip.setAttribute('data-html2canvas-ignore', 'true');
    tip.style.cssText = `
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647; background: ${color}; color: white;
      padding: 8px 16px; border-radius: 6px; font-size: 13px;
      font-family: -apple-system, sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      pointer-events: none;
    `;
    tip.textContent = tipText;
    document.body.appendChild(tip);

    let lastEl = null;
    const onMove = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === tip) return;
      if (lastEl && lastEl !== el) lastEl.style.outline = '';
      el.style.outline = `3px solid ${color}`;
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
      resolve(target || null);
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

// 短暂高亮匹配的元素，便于用户确认
export function flashSelector(sel, onError) {
  let nodes;
  try { nodes = document.querySelectorAll(sel); } catch { return onError && onError('选择器无效'); }
  if (!nodes.length) return onError && onError('没有匹配的元素');
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

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
