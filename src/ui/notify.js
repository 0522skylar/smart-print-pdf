// 通用 UI 工具：toast / loading / waitForPaint
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function waitForPaint() {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

let loadingEl = null;
export function showLoading(msg) {
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

export function hideLoading() {
  if (loadingEl) { loadingEl.remove(); loadingEl = null; }
}

export function toast(msg, duration = 2000) {
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
