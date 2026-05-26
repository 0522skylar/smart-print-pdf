// 存储抽象：options 走 sync（小、跨设备同步），hideRules 走 local（容量大、避免配额超限）
import { DEFAULT_OPTIONS } from './constants.js';

// ==================== 打印选项（sync） ====================
export function loadOptions() {
  return new Promise(resolve => {
    try {
      chrome.storage.sync.get(Object.keys(DEFAULT_OPTIONS), data => resolve(data || {}));
    } catch {
      resolve({});
    }
  });
}

export function saveOptions(opts) {
  return new Promise(resolve => {
    try {
      chrome.storage.sync.set(opts, () => resolve());
    } catch {
      resolve();
    }
  });
}

// ==================== 隐藏规则（local + 一次性迁移） ====================
const HIDE_RULES_KEY = 'hideRules';
const MIGRATION_FLAG = 'hideRulesMigratedToLocal';

export async function loadHideRules() {
  // 触发一次性迁移（首次调用时检查 sync 里是否还有旧数据）
  await migrateHideRulesIfNeeded();
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(HIDE_RULES_KEY, data => {
        resolve((data && data[HIDE_RULES_KEY]) || {});
      });
    } catch {
      resolve({});
    }
  });
}

export function saveHideRules(rules) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.set({ [HIDE_RULES_KEY]: rules }, () => resolve());
    } catch {
      resolve();
    }
  });
}

// 把 sync 里的旧 hideRules 搬到 local，仅执行一次
function migrateHideRulesIfNeeded() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(MIGRATION_FLAG, flagData => {
        if (flagData && flagData[MIGRATION_FLAG]) return resolve();
        chrome.storage.sync.get(HIDE_RULES_KEY, syncData => {
          const oldRules = syncData && syncData[HIDE_RULES_KEY];
          const tasks = [];
          if (oldRules && typeof oldRules === 'object' && Object.keys(oldRules).length) {
            tasks.push(new Promise(r => chrome.storage.local.set({ [HIDE_RULES_KEY]: oldRules }, r)));
            tasks.push(new Promise(r => chrome.storage.sync.remove(HIDE_RULES_KEY, r)));
          }
          tasks.push(new Promise(r => chrome.storage.local.set({ [MIGRATION_FLAG]: true }, r)));
          Promise.all(tasks).then(() => resolve());
        });
      });
    } catch {
      resolve();
    }
  });
}

// 取该页面适用的所有选择器（当前域 + 全局），去重后返回
export async function getEffectiveSelectors() {
  const all = await loadHideRules();
  const domain = location.hostname || '*';
  const selectors = [...(all['*'] || []), ...(all[domain] || [])];
  return [...new Set(selectors.filter(s => typeof s === 'string' && s.trim()))];
}

export function getCurrentDomain() {
  return location.hostname || '*';
}
