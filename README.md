# 小工具集合

离线可用的单页 Web 工具站。默认进入欢迎页，不自动启动任何工具模块；进入具体工具页时再按需初始化。

该项目完全由 GPT-5.3-Codex 生成。

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

说明：部分浏览器在 `file://` 模式下会限制文件读取，欢迎页 README 可能无法加载。若遇到该问题，请使用本地静态服务器打开（如 VS Code Live Server）。

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
