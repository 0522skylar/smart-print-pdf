// 隐藏规则相关：用 CSSStyleSheet API 注入，避免字符串拼接的 CSS 注入风险，
// 且单次注入/移除一个 <style>，比逐元素改 inline style 性能好得多。

// 校验选择器是否合法（不会抛错），返回过滤后的数组
export function filterValidSelectors(selectors) {
  if (!Array.isArray(selectors) || !selectors.length) return [];
  return selectors.filter(sel => {
    if (typeof sel !== 'string' || !sel.trim()) return false;
    try {
      // querySelector 会校验语法，非法选择器抛 SyntaxError
      document.querySelector(sel);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * 在 print 媒介下隐藏匹配元素（用于智能打印模式）。
 * 使用 CSSStyleSheet.insertRule 逐条插入，杜绝 "}*{display:block}" 之类的 CSS 注入。
 * 返回清理函数。
 */
export function applyHideRulesForPrint(selectors) {
  const valid = filterValidSelectors(selectors);
  if (!valid.length) return () => {};

  const style = document.createElement('style');
  style.id = '__smart_print_hide_rules';
  style.media = 'print';
  document.head.appendChild(style);
  const sheet = style.sheet;
  if (!sheet) return () => style.remove();

  for (const sel of valid) {
    try {
      sheet.insertRule(`${sel} { display: none !important; visibility: hidden !important; }`, sheet.cssRules.length);
    } catch {
      // 单条规则失败不影响其他
    }
  }
  return () => style.remove();
}

/**
 * 在截图模式下隐藏匹配元素：注入一个普通 <style>（非 print），
 * 比逐元素改 inline style 快得多（一次 reflow vs N 次 reflow）。
 * 返回清理函数。
 */
export function applyHideRulesForCanvas(selectors) {
  const valid = filterValidSelectors(selectors);
  if (!valid.length) return () => {};

  const style = document.createElement('style');
  style.id = '__smart_print_hide_rules_canvas';
  document.head.appendChild(style);
  const sheet = style.sheet;
  if (!sheet) return () => style.remove();

  for (const sel of valid) {
    try {
      sheet.insertRule(`${sel} { display: none !important; }`, sheet.cssRules.length);
    } catch {
      // ignore
    }
  }
  return () => style.remove();
}

/**
 * 在子窗口（reader 模式）中应用隐藏规则。
 * 子窗口是另一个 document，要在其内部 head 注入 <style>。
 */
export function applyHideRulesInDocument(doc, selectors) {
  if (!doc || !doc.head) return;
  const valid = selectors.filter(sel => {
    if (typeof sel !== 'string' || !sel.trim()) return false;
    try { doc.querySelector(sel); return true; } catch { return false; }
  });
  if (!valid.length) return;
  const style = doc.createElement('style');
  doc.head.appendChild(style);
  const sheet = style.sheet;
  if (!sheet) return;
  for (const sel of valid) {
    try {
      sheet.insertRule(`${sel} { display: none !important; }`, sheet.cssRules.length);
    } catch {
      // ignore
    }
  }
}
