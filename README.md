# 小工具集合

离线可用的单页 Web 工具站。默认进入欢迎页，不自动启动任何工具模块；进入具体工具页时再按需初始化。

**🚨 该项目完全由 GPT-5.3-Codex 生成。**

## 功能列表

### 识别与编码

- 二维码生成与识别
- 编码转换
- 哈希计算（MD5、SHA-1、SHA-256、SHA-384、SHA-512）
- 文本差异对比

### 身份与安全

- 密码生成器
- UUID 生成
- SSH 密钥生成

### 时间与计算

- 当前时间
- 倒计时
- 时间戳转换
- Cron 表达式生成
- 随机抽取（数字/名单权重/CSV 导入导出）
- 计算器
- BMI 计算器
- 单位转换器

### 媒体与设计

- 图片 Base64
- 图片处理
- 音频处理（含本地 ffmpeg.wasm）
- 颜色转换

### 系统检测

- 网络测试
- 键盘鼠标测试
- 音视频设备测试

## 页面行为

- 默认页面为 `#home` 欢迎页。
- 欢迎页默认收起导航栏，可通过右上角按钮显示/隐藏导航。
- 导航状态会写入 `localStorage`（键：`webtool.sidebarCollapsed`）。
- 欢迎页内会尝试展示 `README.md` 内容。

## 运行方式

这是静态项目，可直接打开 `index.html` 使用。

若你要使用 `ffmpeg.wasm`（音频工具中的 MP3/FLAC/AAC/M4A 转码、变速变调等），请使用项目内置本地服务：

```bash
node dev-server.js
```

然后访问 `http://127.0.0.1:5173`。

本地服务同样提供双模式入口：

- 普通模式：`http://127.0.0.1:5173/`（不启用 COOP/COEP）
- 隔离模式：`http://127.0.0.1:5173/isolated`（启用 COOP/COEP，满足 `SharedArrayBuffer` 条件）

### 部署到 Vercel（双页面模式）

项目根目录已提供 `vercel.json`，将提供两个入口：

- 普通模式：`/`（不启用 COOP/COEP，网络测试兼容性更好）
- 隔离模式：`/isolated`（启用 COOP/COEP，供 `ffmpeg.wasm` 使用）

部署步骤：

1. 将仓库导入 Vercel。
2. Framework 选择 `Other`（或保持自动识别），无需构建命令。
3. Output Directory 留空（根目录静态文件直接发布）。
4. 部署后使用 HTTPS 域名访问（Vercel 默认提供 HTTPS）。

验证方式（浏览器 DevTools -> Network）：

- 访问 `/` 时，请求头不应包含 COOP/COEP。
- 访问 `/isolated` 时，请求头应包含：
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Resource-Policy: same-origin`
- 在 `/isolated` 控制台应可看到 `crossOriginIsolated === true`。
- 音频工具中的 `ffmpeg.wasm` 状态应为“已就绪”或“按需加载后可用”。

注意：`/isolated` 启用 `COEP: require-corp` 后，跨站资源（第三方脚本/媒体）若未正确设置 CORS 或 CORP，浏览器会拦截加载。当前项目依赖均为同源本地资源，不受影响。

说明：部分浏览器在 `file://` 模式下会限制文件读取，欢迎页 README 可能无法加载，`ffmpeg.wasm` 也会因缺少隔离环境而不可用。若遇到该问题，请使用本地静态服务器打开。

建议使用最新版 Chrome 或 Edge。

## 项目结构

- `index.html`：页面结构与各工具容器
- `styles.css`：全局样式与响应式布局
- `app.js`：入口与工具按页懒初始化映射
- `modules/page-nav-tool.js`：页面切换、导航开关、欢迎页 README 加载
- `modules/common.js`：提示、复制等公共能力
- `modules/*.js`：各功能工具模块

## 离线依赖

- 二维码：`vendor/qrcode.min.js`、`vendor/jsQR.min.js`
- 哈希：`vendor/crypto-js.min.js`
- SSH：`vendor/jsrsasign-all-min.js`
- 音频转码：
- `vendor/ffmpeg/ffmpeg.min.js`
- `vendor/ffmpeg/ffmpeg-core.js`
- `vendor/ffmpeg/ffmpeg-core.wasm`
- `vendor/ffmpeg/ffmpeg-core.worker.js`

## 扩展新工具

- 在 `modules/` 新增 `xxx-tool.js`，导出 `initXxxTool()`。
- 在 `index.html` 新增对应 `data-page="xxx"` 的页面区块和导航入口。
- 在 `app.js` 的 `pageInitMap` 增加页面与初始化函数映射。

## 安全提示

本工具在浏览器端运行。涉及密钥、音视频设备、敏感文本时，请仅在受信任设备与环境中使用。
