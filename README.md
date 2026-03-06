# 小工具集合

这是一个单页网页工具，包含以下功能：

- 二维码生成
- 二维码图片解码
- 哈希值生成（MD5、SHA-1、SHA-256、SHA-384、SHA-512）
- SSH RSA 密钥对生成
- Cron 表达式生成
- UUID 生成
- 颜色值转换（HEX / RGB / HSL）与选色卡
- 计算器（加减乘除、乘方、开方）
- 键盘鼠标测试（独立页面）
- 麦克风/摄像头/扬声器测试（独立页面，含截图、录音与回放）

## 运行方式

这是一个静态网页项目，使用现代浏览器直接打开 `index.html` 即可运行。

项目支持离线使用，第三方库文件已放在 `vendor/` 目录。

页面采用左侧栏导航，每个功能独立为一个子页面视图（同一 HTML 内按导航切换显示）。

建议使用最新版 Chrome 或 Edge 以获得最佳兼容性。

## 说明

### 模块结构

- `app.js`：入口文件，只负责初始化各工具模块
- `modules/common.js`：公共能力（提示、复制、节点清理）
- `modules/qr-tool.js`：二维码生成与识别模块
- `modules/hash-tool.js`：哈希模块
- `modules/ssh-tool.js`：SSH 密钥模块
- `modules/cron-tool.js`：Cron 表达式生成模块
- `modules/uuid-tool.js`：UUID 生成模块
- `modules/color-tool.js`：颜色转换与选色卡模块
- `modules/calculator-tool.js`：计算器模块
- `modules/device-test-tool.js`：设备测试模块
- `modules/page-nav-tool.js`：侧边栏子页面导航模块

### 扩展新工具

- 在 `modules/` 下新增一个独立模块，例如 `time-tool.js`
- 在 `app.js` 中引入并调用 `initXxxTool()`
- 在 `index.html` 添加对应 UI 区块

- 二维码生成与解码依赖本地库：
- `vendor/qrcode.min.js`
- `vendor/jsQR.min.js`
- 哈希生成功能：
- `MD5` 使用 `vendor/crypto-js.min.js`
- `SHA-*` 使用 `vendor/crypto-js.min.js`
- SSH 密钥生成功能使用 `vendor/jsrsasign-all-min.js`，导出格式如下：
- 公钥：OpenSSH 格式（`ssh-rsa ...`）
- 私钥：PKCS#8 PEM 格式

## 安全提示

本工具在浏览器中运行。请勿在不受信任或共享设备上生成生产环境密钥。
