# Smart Print to PDF —— Chrome 智能打印插件

> 解决 Chrome 自带打印的头部冗余、内容缺失问题。一键打印干净的 PDF。

## ✨ 功能

| 模式                | 说明                                                             | 适用场景             |
| ------------------- | ---------------------------------------------------------------- | -------------------- |
| 🚀 **智能打印**     | 注入打印优化 CSS，调用浏览器原生打印                             | 大多数网页（首选）   |
| 📖 **阅读模式打印** | 提取正文，新窗口纯净渲染后打印                                   | 长文章、公众号、博客 |
| 🎯 **选择区域打印** | 鼠标点选要导出的元素，html2canvas 截图 → jsPDF 拼页              | 局部内容、复杂页面   |
| 📋 **整页截图导出** | 整页转图片，多页拼接成 PDF                                       | 任何页面（兜底）     |

## 📦 开发与构建

本项目使用 [Vite](https://vitejs.dev/) + [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin) 构建。

```bash
# 安装依赖
npm install

# 开发模式（HMR）
npm run dev

# 生产构建
npm run build
```

构建产物在 `dist/`，加载到 Chrome 时选择该目录。

## 📦 安装到 Chrome（开发者模式）

1. 执行 `npm install && npm run build`
2. 打开 Chrome，访问 `chrome://extensions/`
3. 右上角打开 **"开发者模式"** 开关
4. 点击 **"加载已解压的扩展程序"**
5. 选择项目下的 `dist/` 目录
6. 工具栏会出现 📄 图标，点击使用

> 💡 建议把图标 **固定到工具栏**（点击右上角拼图图标 → 找到 "Smart Print to PDF" → 点图钉）

## 🎯 使用方法

### 场景 A：普通网页（推荐"智能打印"）

1. 打开要打印的网页
2. 点击插件图标 → **🚀 智能打印**
3. 在弹出的打印对话框选 **"另存为 PDF"** → 保存

### 场景 B：长文章/公众号（推荐"阅读模式"）

1. 打开文章页
2. 点击插件 → **📖 阅读模式打印**
3. 新窗口自动渲染净化后的版面，自动唤起打印

### 场景 C：只要某一块内容（用"选择区域"）

1. 点击插件 → **🎯 选择区域打印**
2. 鼠标移到目标元素上，会出现蓝色高亮边框
3. 点击确认 → 自动生成 PDF 下载（按 ESC 取消）

### 场景 D：复杂页面打印失败（用"整页截图"）

1. 点击插件 → **📋 整页截图导出**
2. 等待几秒，PDF 自动下载

---

## 📂 项目结构

```
smart-print-pdf/
├── manifest.json              ← 扩展清单（MV3）
├── popup.html                 ← 弹窗 UI
├── vite.config.js             ← Vite 构建配置
├── package.json
├── src/                       ← 源码
│   ├── content.js             ← 内容脚本入口（消息分发）
│   ├── popup.js               ← popup 入口
│   ├── core/
│   │   ├── constants.js       ← 默认设置 / 纸张尺寸 / 常量
│   │   ├── storage.js         ← options(sync) + hideRules(local) + 一次性迁移
│   │   ├── hide-rules.js      ← CSSStyleSheet 注入式隐藏（防注入）
│   │   └── dom.js             ← bestSelectorOf / pickElement / flashSelector
│   ├── modes/
│   │   ├── smart-print.js     ← 智能打印
│   │   ├── reader-print.js    ← 阅读模式
│   │   └── capture-print.js   ← 区域选择 + 整页截图（共用 captureAndExport）
│   └── ui/
│       ├── notify.js          ← toast / loading
│       ├── settings-panel.js  ← 打印前设置面板
│       └── rules-manager.js   ← 隐藏规则管理面板
├── public/                    ← 静态资源（构建时直接拷贝）
│   ├── styles/print-optimize.css
│   ├── lib/html2canvas.min.js
│   ├── lib/jspdf.umd.min.js
│   └── icons/                 ← 4 种尺寸图标
├── gen-icons.ps1              ← 图标生成脚本
└── README.md
```

---

## 🛠 自定义和调试

### 想隐藏更多元素？

推荐：插件内 → **📌 管理本站隐藏规则** → 点选要隐藏的元素，自动保存到本地。

也可编辑 `public/styles/print-optimize.css` 在 §1 节添加 CSS 选择器。

### 阅读模式识别不出正文？

编辑 `src/modes/reader-print.js` 里的 `pickArticleNode()` 函数，添加目标网站的选择器。

### 截图模糊？

设置面板里把"清晰度"调到 `2x` 或 `3x`，或编辑 `src/modes/capture-print.js` 修改默认逻辑。

⚠️ scale 越高画质越好但耗内存越大，超长页面可能崩溃。

---

## 🔄 v1.2.0 更新

- 引入 Vite 构建，源码模块化（`src/`），告别 1300 行单文件 `content.js`
- 移除 `cleanFixedElements()` 全树遍历，完全依赖 CSS `@media print` 兜底，**首屏卡顿从 1~3s 降至 ~0ms**
- 隐藏规则迁移到 `chrome.storage.local`（5MB 容量，告别 `sync` 8KB/100KB 配额限制），首次启动自动迁移
- 隐藏规则用 `CSSStyleSheet.insertRule` 而非字符串拼接，杜绝 `}*{...}` 之类的 CSS 注入风险
- 截图模式隐藏元素改为单 `<style>` 注入，单次 reflow，规则多/节点多时显著提速

## ⚠️ 已知限制

| 限制                                         | 说明                                           |
| -------------------------------------------- | ---------------------------------------------- |
| Chrome 内置页（`chrome://`、扩展页）无法注入 | Chrome 安全策略，无解                          |
| 跨域图片可能截不到                           | 图片服务器需返回 CORS 头；可改用"智能打印"模式 |
| iframe 内容截图为空                          | html2canvas 限制；用"智能打印"或 Puppeteer     |
| 超长页面（>15000px）可能爆内存               | 用"智能打印"代替"整页截图"                     |
| 非 JPEG 图片在 jsPDF 中体积大                | 已默认用 JPEG 压缩                             |

---

## 🔧 故障排查

| 问题                     | 原因 / 解决                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------- |
| 点了没反应               | F12 看 Console 报错；某些页面（如 chrome://）禁止注入                                  |
| 头部还是占满首页         | 该网站用了内联 `style="position:fixed"`，CSS `* { position: static !important }` 应能覆盖；如仍有问题，给我 URL 加专用规则 |
| 阅读模式提示"未识别正文" | 改用智能打印，或在 `pickArticleNode` 里加选择器                                        |
| 截图导出的 PDF 有黑边    | 降低 scale，或改用智能打印                                                             |
| 打印对话框被弹窗拦截     | 在地址栏右侧的拦截图标里允许本站弹窗                                                   |

---

## 📜 License

MIT
