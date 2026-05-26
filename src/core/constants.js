// 集中管理常量
export const DEFAULT_OPTIONS = {
  paperSize: 'a4',          // a4 | a3 | a5 | letter
  orientation: 'portrait',  // portrait | landscape
  margin: 10,               // mm
  scale: 'auto',            // auto | 1 | 1.5 | 2 | 3
  headerTitle: true,
  headerUrl: false,
  footerDate: true,
  footerPageNum: true,
  showLinkUrl: false,
  forceLight: true,
  skipPanel: false,
};

export const PAPER_SIZES = {
  a4: [210, 297],
  a3: [297, 420],
  a5: [148, 210],
  letter: [216, 279],
};

// 等待 / 延迟相关
export const PRINT_DELAY_MS = 300;
export const HIDE_RULES_APPLY_DELAY_MS = 150;

// 页眉页脚预留高度（mm）
export const HEADER_HEIGHT_MM = 8;
export const FOOTER_HEIGHT_MM = 8;

// 截图相关
export const HEADER_TEXT_MAX_LEN = 95;
export const FILENAME_MAX_LEN = 80;
